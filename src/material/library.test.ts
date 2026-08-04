import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import Directory from '../utf/directory.js'
import File from '../utf/file.js'
import BufferView from '../utility/bufferview.js'
import { getMaterial, readMaterials, writeMaterials } from './library.js'
import { readMaterial, writeMaterial } from './material.js'
import { TextureFlags, type Material } from './types.js'

/** Builds a material directory from `name -> file contents` in the given order. */
const entry = (name: string, files: Record<string, File>) =>
  new Directory(
    name,
    Object.entries(files).map(([key, file]) => ((file.name = key), file)),
  )

const string = (value: string) => new File('').writeStrings(value)
const float = (...values: number[]) => new File('').writeFloats(...values)
const integer = (...values: number[]) => new File('').writeIntegers(...values)

const names = (directory: Directory) => directory.files.map(({ name }) => name)

const contents = (directory: Directory) =>
  Object.fromEntries(
    directory.files.map((file) => [
      file.name,
      [...new Uint8Array(file.buffer, file.byteOffset, file.byteLength)],
    ]),
  )

describe('readMaterial', () => {
  it('reads a plain diffuse material', () => {
    const material = readMaterial(
      entry('hull', {
        Type: string('DcDt'),
        Dt_name: string('hull.tga'),
        Dt_flags: integer(TextureFlags.Unknown1),
      }),
    )

    strictEqual(material.name, 'hull')
    strictEqual(material.type, 'DcDt')
    deepStrictEqual(material.diffuseTexture, { name: 'hull.tga', flags: 64 })
  })

  it('omits absent properties rather than defaulting them or setting them undefined', () => {
    const material = readMaterial(entry('bare', { Type: string('DcDt') }))

    deepStrictEqual(material, { name: 'bare', type: 'DcDt' })
  })

  it('reads colours as vectors and scalars as numbers', () => {
    const material = readMaterial(
      entry('glow', {
        Type: string('DcDtEcOcOt'),
        Ac: float(0.1, 0.2, 0.3),
        Dc: float(1, 0.5, 0.25),
        Ec: float(0, 1, 0),
        Oc: float(0.75),
      }),
    )

    deepStrictEqual(material.ambient, {
      x: 0.10000000149011612,
      y: 0.20000000298023224,
      z: 0.30000001192092896,
    })
    deepStrictEqual(material.diffuse, { x: 1, y: 0.5, z: 0.25 })
    deepStrictEqual(material.emission, { x: 0, y: 1, z: 0 })
    strictEqual(material.opacity, 0.75)
  })

  it('reads flip u and flip v as booleans', () => {
    const material = readMaterial(
      entry('detail', {
        Type: string('DetailMapMaterial'),
        'flip u': integer(0),
        'flip v': integer(1),
      }),
    )

    strictEqual(material.flipU, false)
    strictEqual(material.flipV, true)
  })

  it('reads every texture slot', () => {
    const slots = ['Dt', 'Et', 'Bt', 'Nt', 'Dm', 'Dm0', 'Dm1']

    const material = readMaterial(
      entry('every', {
        Type: string('DcDt'),
        ...Object.fromEntries(
          slots.flatMap((slot) => [
            [`${slot}_name`, string(`${slot}.tga`)],
            [`${slot}_flags`, integer(TextureFlags.ClampU | TextureFlags.ClampV)],
          ]),
        ),
      }),
    )

    deepStrictEqual(
      [
        material.diffuseTexture,
        material.emissionTexture,
        material.detailTexture,
        material.nomadTexture,
        material.maskTexture,
        material.maskTexture0,
        material.maskTexture1,
      ].map((slot) => slot?.name),
      slots.map((slot) => `${slot}.tga`),
    )
  })

  it('does not mistake Dm0 or Dm1 for Dm', () => {
    const material = readMaterial(
      entry('masks', {
        Type: string('Masked2DetailMapMaterial'),
        Dm0_name: string('mask0.tga'),
        Dm0_flags: integer(64),
        Dm1_name: string('mask1.tga'),
        Dm1_flags: integer(64),
      }),
    )

    strictEqual(material.maskTexture, undefined)
    strictEqual(material.maskTexture0?.name, 'mask0.tga')
    strictEqual(material.maskTexture1?.name, 'mask1.tga')
  })

  it('drops a texture slot carrying flags but no name', () => {
    const material = readMaterial(entry('orphan', { Type: string('DcDt'), Dt_flags: integer(64) }))

    strictEqual(material.diffuseTexture, undefined)
  })

  it('defaults missing slot flags to none', () => {
    const material = readMaterial(
      entry('orphan', { Type: string('DcDt'), Dt_name: string('a.tga') }),
    )

    deepStrictEqual(material.diffuseTexture, { name: 'a.tga', flags: TextureFlags.None })
  })

  it('reads an empty type as an empty string', () => {
    strictEqual(readMaterial(new Directory('untyped')).type, '')
  })
})

describe('writeMaterial', () => {
  it('writes Type first, then each slot name beside its flags', () => {
    const directory = writeMaterial({
      name: 'hull',
      type: 'DcDtEc',
      diffuse: { x: 1, y: 1, z: 1 },
      emission: { x: 0, y: 0, z: 0 },
      diffuseTexture: { name: 'hull.tga', flags: 64 },
    })

    deepStrictEqual(names(directory), ['Type', 'Dc', 'Dt_name', 'Dt_flags', 'Ec'])
  })

  it('omits every property the material does not carry', () => {
    deepStrictEqual(names(writeMaterial({ name: 'bare', type: 'DcDt' })), ['Type'])
  })

  it('writes a zero scalar rather than treating it as absent', () => {
    const directory = writeMaterial({ name: 'clear', type: 'DcDtOcOt', opacity: 0 })

    deepStrictEqual(names(directory), ['Type', 'Oc'])
    deepStrictEqual([...directory.getFile('Oc')!.readFloats()], [0])
  })

  it('writes a false flag rather than treating it as absent', () => {
    const directory = writeMaterial({ name: 'detail', type: 'DetailMapMaterial', flipU: false })

    deepStrictEqual(names(directory), ['Type', 'flip u'])
    deepStrictEqual([...directory.getFile('flip u')!.readIntegers()], [0])
  })

  it('round-trips a fully populated material', () => {
    const material: Material = {
      name: 'everything',
      type: 'DetailMap2Dm1Msk2PassMaterial',
      ambient: { x: 0.25, y: 0.5, z: 0.75 },
      diffuse: { x: 1, y: 1, z: 1 },
      emission: { x: 0.5, y: 0, z: 0 },
      specular: { x: 0, y: 0, z: 0.5 },
      power: 32,
      opacity: 0.5,
      diffuseTexture: { name: 'dt.tga', flags: TextureFlags.Unknown1 },
      emissionTexture: { name: 'et.tga', flags: TextureFlags.Unknown1 | TextureFlags.Unknown0 },
      detailTexture: { name: 'bt.tga', flags: TextureFlags.Unknown1 | TextureFlags.ClampU },
      nomadTexture: { name: 'nt.tga', flags: TextureFlags.MirrorU | TextureFlags.MirrorV },
      maskTexture: { name: 'dm', flags: TextureFlags.Unknown1 },
      maskTexture0: { name: 'dm0', flags: TextureFlags.Unknown1 },
      maskTexture1: { name: 'dm1', flags: TextureFlags.Unknown1 },
      tileRate: 4,
      tileRate0: 10,
      tileRate1: 30,
      alpha: 0.5,
      fade: 1.25,
      scale: 1.5,
      flipU: true,
      flipV: false,
    }

    deepStrictEqual(readMaterial(writeMaterial(material)), material)
  })

  it('is a fixed point over a material read back out of sorted-order files', () => {
    // The 956 retail materials stored in name order come back in authored order and stay there.
    const sorted = entry('sorted', {
      Dc: float(1, 1, 1),
      Dt_flags: integer(64),
      Dt_name: string('hull.tga'),
      Type: string('DcDt'),
    })

    const once = writeMaterial(readMaterial(sorted))
    const twice = writeMaterial(readMaterial(once))

    deepStrictEqual(names(once), ['Type', 'Dc', 'Dt_name', 'Dt_flags'])
    deepStrictEqual(names(twice), names(once))
    deepStrictEqual(contents(twice), contents(once))
    deepStrictEqual(contents(once), contents(sorted))
  })
})

describe('readMaterials', () => {
  it('yields nothing when there is no library', () => {
    deepStrictEqual([...readMaterials(new Directory())], [])
  })

  it('reads every material and ignores the count file', () => {
    const root = new Directory('\\', [
      new Directory('Material library', [
        new File('Material count').writeIntegers(99),
        entry('a', { Type: string('DcDt') }),
        entry('b', { Type: string('DcDtTwo') }),
      ]),
    ])

    deepStrictEqual(
      [...readMaterials(root)],
      [
        { name: 'a', type: 'DcDt' },
        { name: 'b', type: 'DcDtTwo' },
      ],
    )
  })

  it('does not reach a library nested below the root', () => {
    const root = new Directory('\\', [
      new Directory('openFLAME 3D N-mesh', [
        new Directory('Material library', [entry('a', { Type: string('DcDt') })]),
      ]),
    ])

    deepStrictEqual([...readMaterials(root)], [])
  })
})

describe('writeMaterials', () => {
  it('leads with a derived Material count', () => {
    const library = writeMaterials([
      { name: 'a', type: 'DcDt' },
      { name: 'b', type: 'DcDt' },
      { name: 'c', type: 'DcDt' },
    ])

    strictEqual(library.name, 'Material library')

    const [first] = library.children
    ok(first instanceof File)
    strictEqual(first.name, 'Material count')
    strictEqual(BufferView.from(first.data).readInt32(), 3)
    strictEqual(library.directories.length, 3)
  })

  it('writes a count of zero for an empty library', () => {
    const library = writeMaterials([])

    strictEqual(BufferView.from(library.getFile('Material count')!.data).readInt32(), 0)
  })

  it('round-trips through a library', () => {
    const materials: Material[] = [
      { name: 'hull', type: 'DcDt', diffuseTexture: { name: 'hull.tga', flags: 64 } },
      { name: 'glass', type: 'DcDtOcOt', opacity: 0.625 },
    ]

    deepStrictEqual([...readMaterials(new Directory('\\', [writeMaterials(materials)]))], materials)
  })
})

describe('getMaterial', () => {
  const materials: Material[] = [
    { name: 'Hull', type: 'DcDt' },
    { name: 'Glass', type: 'DcDtOcOt' },
  ]

  it('finds a material by name, ignoring case', () => {
    strictEqual(getMaterial(materials, 'hull'), materials[0])
    strictEqual(getMaterial(materials, 'GLASS'), materials[1])
  })

  it('returns undefined for a name no material carries', () => {
    strictEqual(getMaterial(materials, 'missing'), undefined)
  })
})
