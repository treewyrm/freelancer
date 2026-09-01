import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { list, load, skip } from '#/corpus.js'
import type Directory from '#/utf/directory.js'
import type File from '#/utf/file.js'
import { getResourceId } from '#/hash.js'
import { VertexFormat, Primitive, readVMeshData, vertexByteLength } from './data.js'
import { getMesh, getMeshDraw, readVMeshLibrary, writeVMeshLibrary } from './library.js'
import { readMultiLevel } from './multilevel.js'
import { readVMeshPart, writeVMeshPart } from './part.js'
import { readVMeshWire, writeVMeshWire } from './wireframe.js'

/** Every UTF container that can hold mesh data. `.sph` are planets, `.dfm` are characters. */
const extensions = ['3db', 'cmp', 'sph', 'dfm', 'vms']

const assets = () => load(...extensions)

function* walk(directory: Directory): Generator<Directory> {
  yield directory
  for (const child of directory.directories) yield* walk(child)
}

const bytes = (file: File) => new Uint8Array(file.buffer, file.byteOffset, file.byteLength)

describe('retail asset corpus', { skip }, () => {
  it('finds assets to read', () => {
    const paths = list(...extensions)

    ok(paths.length > 1000, `expected a full DATA tree, found ${paths.length} files`)
    strictEqual(assets().length, paths.length)
  })

  describe('VMeshData', () => {
    it('reads every mesh in every library', () => {
      let meshes = 0

      for (const { path, root } of assets())
        for (const directory of root.getDirectory('VMeshLibrary')?.directories ?? []) {
          const data = readVMeshData(directory)
          ok(data.name.length > 0, `${path}: unnamed mesh`)
          meshes++
        }

      ok(meshes > 2000, `expected the full mesh corpus, read ${meshes}`)
    })

    it('re-serialises every mesh byte for byte', () => {
      for (const { path, root } of assets()) {
        const library = root.getDirectory('VMeshLibrary')
        if (!library) continue

        const written = writeVMeshLibrary(readVMeshLibrary(root))

        for (const directory of library.directories) {
          const original = directory.getFile('VMeshData')
          const result = written.getDirectory(directory.name)?.getFile('VMeshData')

          ok(original && result, `${path}/${directory.name}: mesh went missing`)
          deepStrictEqual(bytes(result), bytes(original), `${path}/${directory.name}`)
        }
      }
    })

    it('consumes each VMeshData file exactly, leaving no trailing bytes', () => {
      for (const { path, root } of assets())
        for (const directory of root.getDirectory('VMeshLibrary')?.directories ?? []) {
          const data = readVMeshData(directory)
          const consumed =
            16 + data.groups.length * 12 + data.indices.byteLength + data.vertices.byteLength

          strictEqual(consumed, directory.getFile('VMeshData')?.byteLength, `${path}/${data.name}`)
        }
    })

    it('only ever uses triangle lists', () => {
      for (const { path, root } of assets())
        for (const data of readVMeshLibrary(root))
          strictEqual(data.primitive, Primitive.TriangleList, `${path}/${data.name}`)
    })

    it('only uses vertex formats that always include a position', () => {
      const seen = new Set<number>()

      for (const { path, root } of assets())
        for (const { name, format } of readVMeshLibrary(root)) {
          ok(format & VertexFormat.Position, `${path}/${name}: format 0x${format.toString(16)}`)
          ok(!(format & (VertexFormat.PointSize | VertexFormat.Specular)), `${path}/${name}: unexpected flag`)
          seen.add(format)
        }

      // Retail never authored more than two UV sets or a specular colour.
      for (const format of seen)
        ok(vertexByteLength(format) <= 44, `format 0x${format.toString(16)}`)
    })

    it('keeps every index inside the vertex buffer', () => {
      for (const { path, root } of assets())
        for (const data of readVMeshLibrary(root)) {
          const count = data.vertices.byteLength / vertexByteLength(data.format)

          for (const index of data.indices)
            ok(index < count, `${path}/${data.name}: index ${index} of ${count}`)
        }
    })

    it('partitions the index buffer exactly across the group element counts', () => {
      for (const { path, root } of assets())
        for (const data of readVMeshLibrary(root)) {
          const total = data.groups.reduce((sum, { elementCount }) => sum + elementCount, 0)

          strictEqual(total, data.indices.length, `${path}/${data.name}`)
        }
    })

    // The invariant that pins down both halves of the group vertex range: indices are
    // relative to vertexStart, and vertexEnd is the last vertex of the group rather
    // than one past it. It holds for every group in the retail data without exception,
    // so a group covers vertexEnd - vertexStart + 1 vertices.
    it('ends every group exactly at vertexStart plus its highest index', () => {
      for (const { path, root } of assets())
        for (const data of readVMeshLibrary(root)) {
          let base = 0

          for (const group of data.groups) {
            const elements = data.indices.subarray(base, base + group.elementCount)
            base += group.elementCount
            if (!elements.length) continue

            const highest = elements.reduce((max, index) => (index > max ? index : max), 0)

            strictEqual(group.vertexStart + highest, group.vertexEnd, `${path}/${data.name}`)
          }
        }
    })

    it('keeps every group vertex range inside the vertex buffer', () => {
      for (const { path, root } of assets())
        for (const data of readVMeshLibrary(root)) {
          const count = data.vertices.byteLength / vertexByteLength(data.format)

          for (const { vertexStart, vertexEnd } of data.groups) {
            ok(vertexStart <= vertexEnd, `${path}/${data.name}: ${vertexStart} > ${vertexEnd}`)
            ok(vertexEnd < count, `${path}/${data.name}: ${vertexEnd} of ${count}`)
          }
        }
    })
  })

  describe('VMeshRef', () => {
    it('re-serialises every reference byte for byte', () => {
      let refs = 0

      for (const { path, root } of assets())
        for (const directory of walk(root)) {
          const part = readVMeshPart(directory)
          if (!part) continue

          const original = directory.getDirectory('VMeshPart')?.getFile('VMeshRef')
          const result = writeVMeshPart(part).getFile('VMeshRef')

          ok(original && result, `${path}/${directory.name}`)
          deepStrictEqual(bytes(result), bytes(original), `${path}/${directory.name}`)
          refs++
        }

      ok(refs > 9000, `expected the full reference corpus, read ${refs}`)
    })

    it('reads bounding boxes with the minimum on or below the maximum', () => {
      for (const { path, root } of assets())
        for (const directory of walk(root)) {
          const part = readVMeshPart(directory)
          if (!part) continue

          const { a, b } = part.reference.boundingBox
          ok(a.x <= b.x && a.y <= b.y && a.z <= b.z, `${path}/${directory.name}: box inverted`)
        }
    })

    // A VMeshRef names its mesh by CRC alone; the game resolves it against every library
    // loaded, not against the file the reference came from. Retail exercises that exactly
    // once — see 'the shared interface library' below.
    it('resolves against the library in the same file, or reports the mesh as absent', () => {
      let resolved = 0
      let external = 0

      for (const { root } of assets()) {
        const library = readVMeshLibrary(root)

        for (const directory of walk(root)) {
          const part = readVMeshPart(directory)
          if (!part) continue

          const data = getMesh(library, part.reference.meshId)

          if (!data) {
            external++
            continue
          }

          const draws = [...getMeshDraw(data, part.reference)]
          strictEqual(draws.length, part.reference.groupCount)
          resolved++
        }
      }

      // Interface models keep their geometry in a shared library file.
      ok(resolved > 8000, `resolved ${resolved}`)
      ok(external < resolved / 4, `unresolved ${external} of ${resolved + external}`)
    })

    // Both fields are derived rather than authored, so a reader that drifts on either one
    // disagrees with the reference itself rather than merely drawing the wrong thing.
    it('carries the index and vertex extents its own groups add up to', () => {
      let checked = 0

      for (const { path, root } of assets()) {
        const library = readVMeshLibrary(root)

        for (const directory of walk(root)) {
          const part = readVMeshPart(directory)
          if (!part) continue

          const { reference } = part
          const data = getMesh(library, reference.meshId)
          if (!data) continue

          const draws = [...getMeshDraw(data, reference)]
          if (!draws.length) continue

          const prior = data.groups
            .slice(0, reference.groupStart)
            .reduce((sum, { elementCount }) => sum + elementCount, 0)

          strictEqual(reference.indexStart, prior, `${path}/${directory.name}: indexStart`)

          const total = draws.reduce((sum, { elementCount }) => sum + elementCount, 0)
          strictEqual(reference.indexCount, total, `${path}/${directory.name}: indexCount`)

          // baseVertex carries ref.vertexStart, which cancels across the span.
          const lowest = Math.min(...draws.map(({ baseVertex }) => baseVertex))
          const highest = Math.max(...draws.map((d) => d.baseVertex + d.numVertices - 1))

          strictEqual(reference.vertexCount, highest - lowest + 1, `${path}/${directory.name}`)
          checked++
        }
      }

      ok(checked > 8000, `checked ${checked}`)
    })
  })

  // `interface.generic.vms` is a bare UTF tree holding nothing but a VMeshLibrary. The game
  // loads it unprompted — no INI names it — so interface models reference its two meshes
  // without declaring a library of their own.
  describe('the shared interface library', () => {
    const shared = () => assets().find(({ path }) => /\.vms$/i.test(path))

    it('is the only .vms in the data, and holds only a library', () => {
      strictEqual(list('vms').length, 1)

      const asset = shared()
      ok(asset, 'expected INTERFACE/interface.generic.vms')
      deepStrictEqual(
        asset.root.children.map(({ name }) => name),
        ['VMeshLibrary'],
      )
      strictEqual(readVMeshLibrary(asset.root).length, 2)
    })

    // Pins the claim in VMESH.md down: every reference retail cannot satisfy locally is
    // satisfied here, so nothing in the game is genuinely dangling.
    it('accounts for every mesh reference no local library can satisfy', () => {
      const asset = shared()
      ok(asset)

      const ids = new Set(readVMeshLibrary(asset.root).map(({ name }) => getResourceId(name)))
      const consumers = new Set<string>()
      let external = 0

      for (const { path, root } of assets()) {
        const local = new Set(readVMeshLibrary(root).map(({ name }) => getResourceId(name)))

        for (const directory of walk(root)) {
          const part = readVMeshPart(directory)
          if (!part || local.has(part.reference.meshId)) continue

          ok(ids.has(part.reference.meshId), `${path}: mesh ${part.reference.meshId} is nowhere`)
          consumers.add(path)
          external++
        }
      }

      ok(external > 500, `expected the full interface corpus, found ${external}`)
      for (const path of consumers) ok(/^interface/i.test(path), `unexpected consumer ${path}`)
    })
  })

  describe('VMeshWire', () => {
    it('re-serialises every wireframe byte for byte', () => {
      let wires = 0

      for (const { path, root } of assets())
        for (const directory of walk(root)) {
          const wire = readVMeshWire(directory)
          if (!wire) continue

          const original = directory.getDirectory('VMeshWire')?.getFile('VWireData')
          const result = writeVMeshWire(wire).getFile('VWireData')

          ok(original && result, `${path}/${directory.name}`)
          deepStrictEqual(bytes(result), bytes(original), `${path}/${directory.name}`)
          wires++
        }

      ok(wires > 4000, `expected the full wireframe corpus, read ${wires}`)
    })

    it('holds an even number of indices, since wireframes are line lists', () => {
      for (const { path, root } of assets())
        for (const directory of walk(root)) {
          const wire = readVMeshWire(directory)
          if (!wire) continue

          strictEqual(wire.data.indices.length % 2, 0, `${path}/${directory.name}`)
        }
    })
  })

  describe('MultiLevel', () => {
    it('carries one more breakpoint than it has levels', () => {
      let found = 0

      for (const { path, root } of assets())
        for (const directory of walk(root)) {
          const level = readMultiLevel(directory)
          if (!level?.levels.length) continue

          strictEqual(level.ranges.length, level.levels.length + 1, `${path}/${directory.name}`)
          found++
        }

      ok(found > 1000, `expected the full LOD corpus, read ${found}`)
    })

    it('always starts its breakpoints at zero', () => {
      for (const { path, root } of assets())
        for (const directory of walk(root)) {
          const level = readMultiLevel(directory)
          if (!level?.levels.length) continue

          strictEqual(level.ranges[0], 0, `${path}/${directory.name}`)
        }
    })

    // Four capital ships carry denormal junk in the middle of Switch2. The reader
    // hands the breakpoints back verbatim rather than sorting or repairing them,
    // so those files still round-trip.
    it('passes non-ascending breakpoints through unrepaired', () => {
      const junk = new Set<string>()

      for (const { path, root } of assets())
        for (const directory of walk(root)) {
          const level = readMultiLevel(directory)
          if (!level?.levels.length) continue

          for (let i = 1; i < level.ranges.length; i++)
            if (!(level.ranges[i]! > level.ranges[i - 1]!)) junk.add(path)
        }

      ok(junk.size > 0, 'expected the known capital ship Switch2 defects')
      ok(junk.size < 10, `unexpectedly widespread: ${[...junk]}`)
    })
  })

  // Five retail files hold geometry no VMesh reader can touch. Reading them must degrade,
  // not throw. They come from two unrelated places, so the grouping is about the required
  // behaviour, not a shared origin:
  //
  // Four files under EQUIPMENT/MODELS/HARDWARE hold an "openFLAME 3D N-mesh" tree left over
  // from Conquest: Frontier Wars, which Freelancer neither supports nor uses.
  //
  // FX/MISC/tlrtube.3db is Freelancer's own. Its "Mesh" tree uses the deformable vocabulary,
  // it carries no openFLAME marker, and EXE/dacom.ini has a [MaterialMap] rule for its sole
  // material. It is residue of FxMeshAppearance, an unfinished feature that crashes the game
  // on particle spawn — so there is nothing working to model. See docs/RIGID.md.
  describe('pre-VMesh assets', () => {
    const legacy = () =>
      assets().filter(
        ({ root }) =>
          root.getDirectory('openFLAME 3D N-mesh') !== undefined ||
          root.getDirectory('Mesh') !== undefined,
      )

    it('finds the four openFLAME leftovers and the one Freelancer mesh', () => {
      const paths = legacy().map(({ path }) => path)

      deepStrictEqual(
        paths.filter((path) => /equipment/i.test(path)).length,
        4,
        `openFLAME models: ${paths}`,
      )
      deepStrictEqual(
        paths.filter((path) => !/equipment/i.test(path)),
        ['FX/MISC/tlrtube.3db'],
      )
    })

    it('reads them as an empty library instead of throwing', () => {
      for (const { path, root } of legacy()) {
        deepStrictEqual(readVMeshLibrary(root), [], path)
        strictEqual(readVMeshPart(root), undefined, path)
        strictEqual(readVMeshWire(root), undefined, path)
      }
    })

    // Their Sphere directory is the openFLAME bounding sphere, unrelated to the
    // Sphere that planet .sph files use, and neither is modelled yet.
    it('leaves their unsupported Sphere directory untouched', () => {
      for (const { path, root } of legacy()) {
        const openFLAME = root.getDirectory('openFLAME 3D N-mesh')
        if (!openFLAME) continue

        ok(openFLAME.getDirectory('Sphere'), `${path}: expected a Sphere`)
      }
    })
  })

  // Planet and sun .sph models hold no geometry at all — see rigid/sphere.test.ts for what
  // they do hold. Here they only have to leave the VMesh readers unbothered.
  describe('planet spheres', () => {
    const spheres = () => assets().filter(({ path }) => /\.sph$/i.test(path))

    it('finds sphere models, all of which carry a Sphere directory', () => {
      const found = spheres()

      ok(found.length > 0, 'expected planet .sph models')
      for (const { path, root } of found) ok(root.getDirectory('Sphere'), `${path}: no Sphere`)
    })

    it('reads them as empty rather than throwing, since they hold no VMesh at all', () => {
      for (const { path, root } of spheres()) {
        strictEqual(root.getDirectory('VMeshLibrary'), undefined, path)
        deepStrictEqual(readVMeshLibrary(root), [], path)
        strictEqual(readVMeshPart(root), undefined, path)
        strictEqual(readVMeshWire(root), undefined, path)
      }
    })
  })
})
