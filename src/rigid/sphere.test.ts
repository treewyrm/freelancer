import { deepStrictEqual, ok, strictEqual, throws } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { load, skip } from '../corpus.js'
import Directory from '../utf/directory.js'
import File from '../utf/file.js'
import BufferView from '../utility/bufferview.js'
import { readRigidModel, writeRigidModel } from './rigid.js'
import { isSphere, readSphere, writeSphere, type Sphere } from './sphere.js'

/** A fully skinned planet: four equatorial faces, two caps, one atmosphere shell. */
const sample = (): Sphere => ({
  type: 'sphere',
  sides: [
    'planet_earth_side1',
    'planet_earth_side2',
    'planet_earth_side1',
    'planet_earth_side2',
    'planet_earth_cap',
    'planet_earth_cap',
    'planet_earth_atmosphere',
  ],
  radius: 3000,
})

const wrap = (sphere: Sphere) => new Directory('\\', [writeSphere(sphere)])

/** Rewrites Sides to a value writeSphere would never derive, to exercise the reader against it. */
function claimSides(directory: Directory, count: number): Directory {
  directory.delete('Sides')
  directory.setFile('Sides').writeIntegers(count)

  return new Directory('\\', [directory])
}

describe('isSphere', () => {
  it('recognises a directory holding a Sphere', () => {
    strictEqual(isSphere(wrap(sample())), true)
  })

  it('rejects a directory without one', () => {
    strictEqual(isSphere(new Directory('\\')), false)
  })
})

describe('writeSphere', () => {
  it('names the directory Sphere', () => {
    strictEqual(writeSphere(sample()).name, 'Sphere')
  })

  it('numbers the material files from M0 and adds Radius and Sides', () => {
    const directory = writeSphere(sample())

    deepStrictEqual(
      directory.files.map(({ name }) => name),
      ['M0', 'M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'Radius', 'Sides'],
    )
  })

  it('derives Sides from the number of materials', () => {
    const sphere = sample()
    sphere.sides = sphere.sides.slice(0, 6)

    deepStrictEqual([...writeSphere(sphere).getFile('Sides')!.readIntegers()], [6])
  })

  it('writes the radius as a single float32', () => {
    const file = writeSphere(sample()).getFile('Radius')

    strictEqual(file?.byteLength, 4)
    deepStrictEqual([...file.readFloats()], [3000])
  })

  it('NUL-terminates each material name', () => {
    const file = writeSphere(sample()).getFile('M0')!

    strictEqual(file.byteLength, 'planet_earth_side1'.length + 1)
    deepStrictEqual([...file.readStrings()], ['planet_earth_side1'])
  })

  it('rejects a side count outside one to seven', () => {
    throws(() => writeSphere({ ...sample(), sides: [] }), RangeError)
    throws(() => writeSphere({ ...sample(), sides: new Array(8).fill('m') }), RangeError)
  })
})

describe('readSphere', () => {
  it('round-trips materials and radius', () => {
    const sphere = sample()

    deepStrictEqual(readSphere(wrap(sphere)), sphere)
  })

  it('reads a star, which has a single material and no caps', () => {
    const sphere: Sphere = { type: 'sphere', sides: ['none'], radius: 1000 }

    deepStrictEqual(readSphere(wrap(sphere)), sphere)
  })

  // sun.sph stores M0 as exactly the four bytes "none", with no room for a terminator.
  it('accepts a material name with no NUL terminator', () => {
    const directory = new Directory('Sphere', [new File('M0', BufferView.from('none'))])
    directory.setFile('Radius').writeFloats(1000)
    directory.setFile('Sides').writeIntegers(1)

    deepStrictEqual(readSphere(new Directory('\\', [directory])).sides, ['none'])
  })

  it('reads only as many materials as Sides announces', () => {
    strictEqual(readSphere(claimSides(writeSphere(sample()), 6)).sides.length, 6)
  })

  it('throws when the parent has no Sphere directory', () => {
    throws(() => readSphere(new Directory('\\')), /Missing Sphere/)
  })

  it('throws when Sides or Radius is missing', () => {
    const noSides = writeSphere(sample())
    noSides.delete('Sides')
    throws(() => readSphere(new Directory('\\', [noSides])), /Missing Sides/)

    const noRadius = writeSphere(sample())
    noRadius.delete('Radius')
    throws(() => readSphere(new Directory('\\', [noRadius])), /Missing Radius/)
  })

  it('throws when Sides announces a material that is not there', () => {
    const directory = writeSphere({ ...sample(), sides: ['a', 'b'] })

    throws(() => readSphere(claimSides(directory, 3)), /Missing M2/)
  })

  it('throws RangeError on a side count outside one to seven', () => {
    for (const count of [0, 8])
      throws(() => readSphere(claimSides(writeSphere(sample()), count)), RangeError)
  })
})

describe('sphere as a rigid model part', () => {
  it('is what readRigidModel returns for a sphere document', () => {
    const model = readRigidModel(wrap(sample()))

    strictEqual(model.type, 'sphere')
    deepStrictEqual(model, sample())
  })

  it('round-trips back into a document with a Sphere directory', () => {
    const document = writeRigidModel(sample())

    ok(isSphere(document))
    deepStrictEqual(readRigidModel(document), sample())
  })

  it('is preferred over an empty rigid part, which a sphere would otherwise read as', () => {
    strictEqual(readRigidModel(new Directory('\\')).type, 'rigid')
    strictEqual(readRigidModel(wrap(sample())).type, 'sphere')
  })
})

describe('retail sphere corpus', { skip }, () => {
  const spheres = () => load('sph')

  it('finds the retail sphere models', () => {
    ok(spheres().length > 50, `expected the planet and sun models, found ${spheres().length}`)
  })

  it('reads every one of them', () => {
    for (const { path, root } of spheres()) {
      const sphere = readSphere(root)

      ok(sphere.radius > 0, `${path}: radius ${sphere.radius}`)
      for (const name of sphere.sides) ok(name.length > 0, `${path}: empty material name`)
    }
  })

  it('re-serialises every one of them byte for byte', () => {
    for (const { path, root } of spheres()) {
      const original = root.getDirectory('Sphere')
      const result = writeSphere(readSphere(root))

      ok(original)
      deepStrictEqual(
        result.files.map(({ name }) => name.toLowerCase()),
        original.files.map(({ name }) => name.toLowerCase()),
        path,
      )

      for (const file of original.files) {
        const made = result.getFile(file.name)
        ok(made, `${path}: ${file.name} went missing`)

        // sun.sph writes "none" unterminated; everything else matches byte for byte.
        if (file.byteLength !== made.byteLength) {
          strictEqual(made.byteLength, file.byteLength + 1, `${path}/${file.name}`)
          continue
        }

        deepStrictEqual(
          new Uint8Array(made.buffer, made.byteOffset, made.byteLength),
          new Uint8Array(file.buffer, file.byteOffset, file.byteLength),
          `${path}/${file.name}`,
        )
      }
    }
  })

  it('is reached through readRigidModel, since .sph is a model document', () => {
    for (const { path, root } of spheres()) strictEqual(readRigidModel(root).type, 'sphere', path)
  })

  // 84 planets carry an atmosphere shell, one has only the six body faces, and the sun
  // is a single untextured shell.
  it('uses seven sides for planets, and fewer only for the known exceptions', () => {
    const counts = new Map<number, number>()

    for (const { root } of spheres()) {
      const { sides } = readSphere(root)
      counts.set(sides.length, (counts.get(sides.length) ?? 0) + 1)
    }

    ok((counts.get(7) ?? 0) > 50, `expected most spheres to have an atmosphere: ${[...counts]}`)
    for (const count of counts.keys()) ok(count >= 1 && count <= 7, `side count ${count}`)
  })

  // The openFLAME leftovers under EQUIPMENT/MODELS carry their own unrelated Sphere, but it
  // sits inside their N-mesh tree rather than at the root, so detection must not reach it.
  it('does not claim any .3db or .cmp document', () => {
    for (const { path, root } of load('3db', 'cmp'))
      strictEqual(isSphere(root), false, `${path}: misdetected as a sphere`)
  })

  it('agrees with the Sides field in every file', () => {
    for (const { path, root } of spheres()) {
      const [announced] = root.getDirectory('Sphere')!.getFile('Sides')!.readIntegers()

      strictEqual(readSphere(root).sides.length, announced, path)
    }
  })
})
