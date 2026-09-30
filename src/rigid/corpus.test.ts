import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { load, skip } from '#/corpus.js'
import type Directory from '#/utf/directory.js'
import type File from '#/utf/file.js'
import { listTreeElements } from '#/utility/tree.js'
import { readConstraints, writeConstraints, type Constraint } from '#/compound/constraint.js'
import { readHardpoints, writeHardpoints } from '#/compound/hardpoint.js'
import { readMaterialAnimLibrary, writeMaterialAnim, type MaterialAnim } from './materialanim.js'
import { isCompound } from '#/compound/model.js'
import { readRigidModel, writeRigidModel } from './rigid.js'

/** Record size of each constraint file, the two 0x40-byte name fields included. */
const sizes: Record<string, number> = {
  fix: 176,
  rev: 208,
  pris: 208,
  cyl: 216,
  sphere: 212,
  loose: 176,
}

/** Rigid models. `.sph` planets and `.dfm` characters are not compounds. */
const assets = () => load('cmp', '3db').filter(({ root }) => isCompound(root))

const constraintFiles = (root: Directory) => root.getDirectory('Cmpnd', 'Cons')?.files ?? []

/** Part names a model declares, which is what a constraint has to name at both ends. */
const partNames = (root: Directory) =>
  new Set(
    (root.getDirectory('Cmpnd')?.directories ?? []).flatMap((directory) => [
      ...(directory.getFile('Object name')?.readStrings() ?? []),
    ]),
  )

const bytes = (view: File) => new Uint8Array(view.buffer, view.byteOffset, view.byteLength)

describe('retail asset corpus', { skip }, () => {
  it('finds compound models to read', () => {
    ok(assets().length > 400, `expected the full DATA tree, found ${assets().length} compounds`)
  })

  it('reads every compound model', () => {
    let constraints = 0

    for (const { path, root } of assets()) {
      const model = readRigidModel(root)

      strictEqual(model.type, 'compound', path)
      constraints += [...readConstraints(constraintFiles(root))].length
    }

    ok(constraints > 5000, `expected the full constraint corpus, read ${constraints}`)
  })

  // Cyl reads and writes, but its 216-byte layout comes from CFW rather than from anything
  // measured here — no retail model ships one, nor a joint kind outside these four.
  it('never ships a Cyl file, or any constraint file beyond these four', () => {
    const names = new Set<string>()

    for (const { root } of assets())
      for (const file of constraintFiles(root)) names.add(file.name.toLowerCase())

    deepStrictEqual([...names].sort(), ['fix', 'pris', 'rev', 'sphere'])
  })

  // Records are fixed size and the file holds nothing else, so a reader that misjudges the
  // stride runs off the end long before it reaches the last record.
  it('consumes each Cons file exactly, leaving no trailing bytes', () => {
    for (const { path, root } of assets())
      for (const file of constraintFiles(root)) {
        const size = sizes[file.name.toLowerCase()]

        ok(size, `${path}: unknown constraint file ${file.name}`)
        strictEqual(
          [...readConstraints([file])].length * size,
          file.byteLength,
          `${path}/${file.name}`,
        )
      }
  })

  // One retail constraint dangles: trade_turret01 constrains a `Barrel01` it never declares.
  // `arrangeByConstraints` drops what it cannot resolve, so the model still assembles.
  it('names a declared part at both ends of every constraint, bar one dangling child', () => {
    let dangling = 0

    for (const { path, root } of assets()) {
      const names = partNames(root)

      for (const { parent, child } of readConstraints(constraintFiles(root))) {
        ok(names.has(parent), `${path}: constraint parent ${JSON.stringify(parent)} is undeclared`)
        ok(parent !== child, `${path}: ${parent} is constrained to itself`)

        if (!names.has(child)) dangling++
      }
    }

    ok(dangling > 0, 'expected the known dangling constraint')
    ok(dangling < 5, `${dangling} constraints point at parts that were never declared`)
  })

  it('attaches every declared part to the hierarchy', () => {
    for (const { path, root } of assets()) {
      const model = readRigidModel(root)
      if (model.type !== 'compound') continue

      strictEqual([...listTreeElements(model)].length, partNames(root).size, path)
    }
  })

  // Compound or not, every model in the corpus has to come back out of the reader. `.3db` parts
  // sit at the file root, so this covers both shapes.
  it('reads every rigid model, compound or single part', () => {
    for (const { path, root } of load('cmp', '3db'))
      ok(readRigidModel(root).type, `${path} produced no part`)
  })

  // A hardpoint's Position is optional in the file, and exactly one retail hardpoint omits it —
  // in a stale fragment no `Cmpnd` part names, so the game never loads it. The reader leaves the
  // key off rather than placing it at the origin, and the writer adds no file.
  it('reads one hardpoint without a position, and writes it back without one', () => {
    const bare: string[] = []

    for (const { path, root } of load('cmp', '3db'))
      for (const fragment of [root, ...root.directories])
        for (const hardpoint of readHardpoints(fragment))
          if (!hardpoint.position) {
            bare.push(`${path}/${fragment.name}: ${hardpoint.name}`)

            const written = writeHardpoints([hardpoint])
            strictEqual(written.getFile('Fixed', hardpoint.name, 'Position'), undefined)
          }

    deepStrictEqual(bare, [
      'SHIPS/BORDER_WORLD/BW_VHEAVY_FIGHTER/bw_vheavy_fighter.cmp/bw_port_wing02_lod1020911031436.3db: HpContrail04',
    ])
  })

  // Camera fields live in a `Camera` subdirectory of the fragment, not at its root — detecting
  // them at the root read all 17 cockpit cameras back as empty rigid parts instead.
  it('reads cockpit cameras as cameras, and re-serialises them exactly', () => {
    let cameras = 0

    for (const { path, root } of assets()) {
      const model = readRigidModel(root)
      if (model.type !== 'compound') continue

      for (const { filename, part } of listTreeElements(model)) {
        if (part.type !== 'camera') continue
        cameras++

        const values = (directory: Directory) =>
          directory.files.map((file) => `${file.name}=${[...file.readFloats()]}`).sort()

        const source = root.getDirectory(filename)?.getDirectory('Camera')
        const written = writeRigidModel(part).getDirectory('Camera')

        ok(source && written, `${path}/${filename}`)
        deepStrictEqual(values(written), values(source), `${path}/${filename}`)
      }
    }

    strictEqual(cameras, 17)
  })

  // Every camera in retail data is 4:3, which is what pins Fovx and Fovy down as half-angles in
  // radians rather than full angles — the full-angle reading gives no sensible aspect at all.
  it('reads camera fields as half-angles, giving a 4:3 aspect', () => {
    for (const { path, root } of assets()) {
      const model = readRigidModel(root)
      if (model.type !== 'compound') continue

      for (const { part } of listTreeElements(model)) {
        if (part.type !== 'camera') continue

        const aspect = Math.tan(part.fovX) / Math.tan(part.fovY)

        ok(Math.abs(aspect - 4 / 3) < 0.01, `${path}: aspect ${aspect}`)
        ok(part.zNear > 0 && part.zNear < part.zFar, `${path}: ${part.zNear}..${part.zFar}`)
      }
    }
  })

  // Nodes the readers walk past. Listed so that a name outside the set — a format detail we have
  // not accounted for — fails here rather than going unnoticed.
  it('leaves only the known unread nodes in a part fragment', () => {
    const read = /^(multilevel|vmeshpart|vmeshwire|hardpoints|camera|sphere)$/i
    const names = new Set<string>()

    for (const { root } of assets()) {
      const model = readRigidModel(root)
      if (model.type !== 'compound') continue

      for (const { filename } of listTreeElements(model))
        for (const child of root.getDirectory(filename)?.children ?? [])
          if (!read.test(child.name)) names.add(child.name)
    }

    // Two `.3db` fragments carry an exporter bounding-volume tree the game never reads.
    deepStrictEqual([...names].sort(), ['Extent tree'])
  })

  describe('MaterialAnim', () => {
    const animated = () =>
      load('cmp', '3db').filter(({ root }) => root.getDirectory('MaterialAnim'))

    it('finds the material animations, always at the file root', () => {
      const found = animated()

      strictEqual(found.length, 54)
      strictEqual(
        found.reduce((total, { root }) => total + readMaterialAnimLibrary(root).length, 0),
        82,
      )
    })

    it('re-serialises every animation byte for byte', () => {
      for (const { path, root } of animated())
        for (const anim of readMaterialAnimLibrary(root)) {
          const original = root.getDirectory('MaterialAnim')?.getDirectory(anim.name)
          const written = writeMaterialAnim(anim)

          ok(original, `${path}/${anim.name}`)
          deepStrictEqual(
            written.children.map(({ name }) => name),
            original.children.map(({ name }) => name),
            `${path}/${anim.name}`,
          )

          for (const file of original.files)
            deepStrictEqual(bytes(written.getFile(file.name)!), bytes(file), `${path}/${anim.name}`)
        }
    })

    // MAKeys carries one fewer entry than MADeltas because the first segment starts from the
    // material's own untransformed UV state — which is why the file is omitted outright at a
    // single segment.
    it('starts every animation at zero, and has no MAKeys file for a single segment', () => {
      for (const { path, root } of animated())
        for (const anim of readMaterialAnimLibrary(root)) {
          deepStrictEqual(
            anim.segments[0]?.start,
            { uOffset: 0, vOffset: 0, uScale: 0, vScale: 0 },
            `${path}/${anim.name}`,
          )

          const stored = root.getDirectory('MaterialAnim', anim.name)?.getFile('MAKeys')
          strictEqual(!!stored, anim.segments.length > 1, `${path}/${anim.name}`)
        }
    })

    // Key differences and segment displacements (speed × time) are drawn from the same small
    // set of magnitudes, so the two files plainly describe one motion. They are still not
    // interchangeable: no fixed alignment between them reproduces every entry, which is why
    // the reader stores MAKeys rather than deriving it. Locked down so that a future attempt
    // to derive it has to confront the counterexamples first.
    it('does not let a single alignment derive the keys from the deltas', () => {
      const displacement = ({ segments }: MaterialAnim) =>
        segments.map(({ duration, velocity: { uOffset, vOffset, uScale, vScale } }) => [
          uOffset * duration,
          vOffset * duration,
          uScale * duration,
          vScale * duration,
        ])

      /** The stored keys: every segment's start but the first, which the file leaves implicit. */
      const keysOf = ({ segments }: MaterialAnim) => segments.slice(1).map(({ start }) => start)

      const library = animated().flatMap(({ path, root }) =>
        readMaterialAnimLibrary(root).map((anim) => ({ path, ...anim, keys: keysOf(anim) })),
      )

      const verdicts = new Map<number, string[]>()

      for (const anim of library) {
        if (anim.keys.length < 2) continue

        const deltas = displacement(anim)

        // Origin-independent: compare successive key differences against the displacements,
        // offset by each candidate alignment.
        const differences = anim.keys.slice(1).map((key, i) => {
          const previous = anim.keys[i]!
          return [
            key.uOffset - previous.uOffset,
            key.vOffset - previous.vOffset,
            key.uScale - previous.uScale,
            key.vScale - previous.vScale,
          ]
        })

        for (const shift of [0, 1, 2]) {
          const fits = differences.every((difference, i) => {
            const target = deltas[i + 1 + shift]
            return !!target && difference.every((value, c) => Math.abs(value - target[c]!) < 1e-3)
          })

          if (fits) verdicts.set(shift, [...(verdicts.get(shift) ?? []), anim.name])
        }
      }

      // Every alignment is contradicted by some entry, so none is the rule.
      for (const shift of [0, 1, 2])
        ok(
          (verdicts.get(shift)?.length ?? 0) < library.filter(({ keys }) => keys.length > 1).length,
          `alignment ${shift} unexpectedly fits every entry`,
        )

      // The two that do fit something, and disagree with each other.
      ok(verdicts.get(0)?.includes('ocean_a_256'), 'expected the ocean to fit alignment 0')
      ok(
        verdicts.get(1)?.includes('banner1021028164103'),
        'expected the Bizmark banner to fit alignment 1',
      )
    })

    it('holds no negative segment durations', () => {
      for (const { path, root } of animated())
        for (const anim of readMaterialAnimLibrary(root))
          for (const { duration } of anim.segments)
            ok(duration >= 0, `${path}/${anim.name}: ${duration}`)
    })
  })

  // Retail name fields carry heap residue past the terminator, which the reader stops at and
  // the writer replaces with zeroes — so constraints round-trip by value, not byte for byte.
  it('re-serialises every constraint by value, over identical record counts', () => {
    let residue = 0

    for (const { path, root } of assets())
      for (const file of constraintFiles(root)) {
        const original = [...readConstraints([file])]
        const written = [...writeConstraints(original)]

        strictEqual(
          written.reduce((total, { byteLength }) => total + byteLength, 0),
          file.byteLength,
          `${path}/${file.name}`,
        )

        deepStrictEqual(
          [...readConstraints(written)] satisfies Constraint[],
          original,
          `${path}/${file.name}`,
        )

        // A record whose name fields are already clean re-encodes verbatim; count the rest.
        const source = bytes(file)
        let offset = 0

        for (const value of written) {
          const encoded = bytes(value)
          if (!encoded.every((byte, i) => byte === source[offset + i])) residue++
          offset += encoded.byteLength
        }
      }

    ok(residue > 0, 'expected the exporter residue that stops a byte-for-byte round-trip')
  })
})
