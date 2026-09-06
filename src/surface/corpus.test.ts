import { deepStrictEqual, ok, strictEqual, throws } from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { raw, root as dataRoot, skip } from '#/corpus.js'
import Directory from '#/utf/directory.js'
import { getResourceId } from '#/hash.js'
import { generateConvexHull } from '#/math/convexhull.js'
import Vector3 from '#/math/vector3.js'
import { readHardpoints } from '#/compound/hardpoint.js'
import BufferView from '#/utility/bufferview.js'
import { createHull, getIndices, HullType } from './hull.js'
import { readSurfaceLibrary, writeSurfaceLibrary } from './library.js'
import type { Node } from './node.js'
import type { Part } from './part.js'
import { getHulls, getMassProperties, getNodes } from './surface.js'
import { createNode } from './node.js'
import type { TriangleIndices } from './face.js'

const SIGNATURE = 0x73726576 // 'vers'

/** Quantization steps shared by `Node.boxSizes` and `Surface.surfaceDeviation`. */
const STEPS = 0xfa

const signature = ({ data }: { data: Uint8Array }) => BufferView.from(data).readUint32()

/** Files carrying the `vers` signature, which is every `.sur` the reader accepts. */
const surfaces = () => raw('sur').filter((asset) => signature(asset) === SIGNATURE)

/** Everything else. See the `pre-vers surfaces` suite for what these are. */
const legacy = () => raw('sur').filter((asset) => signature(asset) !== SIGNATURE)

/** Every part in the corpus, paired with the file it came from. */
function* parts(): Generator<{ path: string; part: Part }> {
  for (const { path, data } of surfaces())
    for (const part of readSurfaceLibrary(BufferView.from(data))) yield { path, part }
}

/** Every hull in the corpus, paired with the asset path it came from. */
function* hulls(): Generator<{ path: string; hull: NonNullable<Node['hull']> }> {
  for (const { path, part } of parts()) for (const hull of getHulls(part.root)) yield { path, hull }
}

/** The same sweep, keeping the part each hull indexes its points into. */
function* hullsInParts(): Generator<{ part: Part; hull: NonNullable<Node['hull']> }> {
  for (const { part } of parts()) for (const hull of getHulls(part.root)) yield { part, hull }
}

const axes = ['x', 'y', 'z'] as const

const terminal = (part: Part) =>
  [...getHulls(part.root)].filter(({ type }) => type === HullType.Enabled)

const bytes = (view: ArrayBufferView) =>
  new Uint8Array(view.buffer, view.byteOffset, view.byteLength)

/**
 * A type 5 hull's id is a byte offset back to the node that owns it, which `writeSurface`
 * recomputes from wherever the node tree lands. Clear it before comparing two libraries.
 */
function strip(library: Part[]): Part[] {
  for (const part of library)
    for (const hull of getHulls(part.root)) if (hull.type === HullType.Skip) hull.id = 0

  return library
}

/**
 * Walks the chunk list of every part without going through `readPart`, so the tag set and the
 * order they appear in can be checked against what `writePart` emits.
 */
function* chunks(data: Uint8Array): Generator<{ tags: string[]; surfaceSizes: [number, number] }> {
  const view = BufferView.from(data)

  view.readUint32() // Signature.
  view.readFloat32() // Version.

  while (view.byteRemain) {
    view.readInt32() // Part id.

    const tags: string[] = []
    let surfaceSizes: [number, number] = [0, 0]

    for (let i = 0, l = view.readUint32(); i < l; i++) {
      const tag = view.readUint32()
      tags.push(
        String.fromCharCode(tag & 0xff, (tag >> 8) & 0xff, (tag >> 16) & 0xff, (tag >> 24) & 0xff),
      )

      switch (tags.at(-1)) {
        case '!fxd':
          break
        case 'exts':
          view.offset += Float32Array.BYTES_PER_ELEMENT * 6
          break
        case 'surf': {
          const start = view.offset
          const size = view.readUint32()

          // `byte_size` occupies the upper 24 bits of the word 28 bytes into the block header.
          surfaceSizes = [size, view.getUint32(start + 4 + 28, view.littleEndian) >>> 8]
          view.offset = start + Uint32Array.BYTES_PER_ELEMENT + size
          break
        }
        case 'hpid': {
          const count = view.readUint32()
          view.offset += count * Int32Array.BYTES_PER_ELEMENT
          break
        }
        default:
          throw new Error(`unhandled chunk ${tags.at(-1)}`)
      }
    }

    yield { tags, surfaceSizes }
  }
}

/** The `.cmp` or `.3db` sitting next to a `.sur`, which the surface's ids refer into. */
function model(path: string): Directory | undefined {
  const base = join(dataRoot, path).replace(/\.sur$/i, '')
  const found = ['.cmp', '.3db'].map((extension) => base + extension).find(existsSync)

  return found ? Directory.read(readFileSync(found)) : undefined
}

/**
 * Part names of a compound model, read straight out of `Cmpnd` rather than through `readModel`,
 * which also parses the constraint list — a failure here should be about the surface.
 */
function partNames(root: Directory): string[] | undefined {
  const compound = root.getDirectory('Cmpnd')
  if (!compound) return undefined

  return compound.directories.flatMap((directory) => [
    ...(directory.getFile('Object name')?.readStrings() ?? []),
  ])
}

function hardpointNames(root: Directory): string[] {
  const names = [...readHardpoints(root)].map(({ name }) => name)
  for (const directory of root.directories) names.push(...hardpointNames(directory))

  return names
}

describe('retail asset corpus', { skip }, () => {
  it('finds surfaces to read', () => {
    ok(raw('sur').length > 700, `expected a full DATA tree, found ${raw('sur').length} files`)
    ok(surfaces().length > 700, `only ${surfaces().length} carry the vers signature`)
  })

  it('reads every part of every library', () => {
    let count = 0

    for (const { path, part } of parts()) {
      ok(getHulls(part.root).next().value, `${path}: part with no hulls`)
      count++
    }

    ok(count > 1300, `expected the full part corpus, read ${count}`)
  })

  // 17 files predate the `vers` container: they open with the bounding box, then a
  // length-prefixed part *name* where the modern format puts a CRC, then the chunk list.
  // Nothing in the layout after that is shared, so the reader has to reject them outright.
  describe('pre-vers surfaces', () => {
    it('finds them, as a small minority', () => {
      ok(legacy().length > 0, 'expected the known pre-vers files')
      ok(legacy().length < 25, `unexpectedly widespread: ${legacy().length} files`)
    })

    it('rejects them instead of misreading them', () => {
      for (const { path, data } of legacy())
        throws(() => readSurfaceLibrary(BufferView.from(data)), /Invalid SUR header/, path)
    })

    it('opens with a bounding box and a named part, not a signature', () => {
      for (const { path, data } of legacy()) {
        const view = BufferView.from(data)
        view.offset = Float32Array.BYTES_PER_ELEMENT * 6

        const name = view.readString(view.readUint32())
        ok(/^[\x20-\x7e]*$/.test(name), `${path}: ${JSON.stringify(name)} is not a part name`)
        ok(['surf', 'ledg'].includes(view.readString(4)), `${path}: no chunk after the name`)
      }
    })
  })

  describe('chunks', () => {
    it('uses only the four known tags, in the order writePart emits them', () => {
      const orders = new Set<string>()

      for (const { path, data } of surfaces())
        for (const { tags } of chunks(data)) {
          deepStrictEqual(
            tags,
            ['!fxd', 'exts', 'surf', 'hpid'].filter((tag) => tags.includes(tag)),
            `${path}: ${tags.join(',')}`,
          )

          orders.add(tags.join(','))
        }

      deepStrictEqual([...orders].sort(), [
        '!fxd,exts,surf',
        '!fxd,exts,surf,hpid',
        'exts,surf',
        'exts,surf,hpid',
      ])
    })

    // The surf chunk states its size twice: once as the leading word and once inside the
    // IVP header. `writeSurface` derives both from the same number, so the two must agree.
    it('states the same surface block size in the chunk and in the IVP header', () => {
      for (const { path, data } of surfaces())
        for (const { surfaceSizes } of chunks(data)) {
          const [chunk, header] = surfaceSizes

          ok(chunk > 0, `${path}: empty surf chunk`)
          strictEqual(header, chunk, `${path}: header says ${header}, chunk says ${chunk}`)
        }
    })
  })

  describe('parts', () => {
    it('gives every part in a file a distinct id', () => {
      for (const { path, data } of surfaces()) {
        const library = readSurfaceLibrary(BufferView.from(data))
        const ids = new Set(library.map(({ id }) => id))

        strictEqual(ids.size, library.length, `${path}: duplicate part id`)
      }
    })

    it('lists each hardpoint at most once per part', () => {
      for (const { path, part } of parts())
        strictEqual(new Set(part.hardpoints).size, part.hardpoints.length, `${path}: duplicate id`)
    })

    it('resolves every hardpoint id against the model the surface pairs with', () => {
      let resolved = 0

      for (const { path, data } of surfaces()) {
        const root = model(path)
        if (!root) continue

        const ids = new Set(hardpointNames(root).map((name) => getResourceId(name) | 0))

        for (const part of readSurfaceLibrary(BufferView.from(data)))
          for (const id of part.hardpoints) {
            ok(ids.has(id | 0), `${path}: hardpoint ${(id >>> 0).toString(16)} is not in the model`)
            resolved++
          }
      }

      ok(resolved > 1000, `expected the full hardpoint corpus, resolved ${resolved}`)
    })

    // A single-part model has no `Cmpnd`, so its surface has no part name to key on and uses 0
    // instead — bar tlr_shield_bubble, which spells the implicit part name out. Compound
    // surfaces key on the CRC of an `Object name`, bar a handful of renamed parts.
    it('keys parts by model part name, or by zero for a single-part model', () => {
      let named = 0
      let zero = 0
      let unknown = 0

      for (const { path, data } of surfaces()) {
        const root = model(path)
        if (!root) continue

        const names = partNames(root)
        const ids = new Set((names ?? ['Root']).map((name) => getResourceId(name) | 0))

        for (const { id } of readSurfaceLibrary(BufferView.from(data))) {
          if (!names) {
            ok(
              id === 0 || ids.has(id | 0),
              `${path}: single-part surface keyed by ${(id >>> 0).toString(16)}`,
            )

            id === 0 ? zero++ : named++
          } else if (ids.has(id | 0)) named++
          else unknown++
        }
      }

      ok(zero > 500, `expected the single-part corpus, read ${zero}`)
      ok(named > 700, `expected the compound corpus, matched ${named}`)
      ok(unknown < named / 50, `${unknown} of ${named + unknown} compound parts went unmatched`)
    })
  })

  describe('surface block', () => {
    it('encloses every point in the bounding sphere around the mass centre', () => {
      for (const { path, part } of parts())
        for (const { x, y, z } of part.points) {
          const { massCenter: centre, radius } = part
          const distance = Math.hypot(x - centre.x, y - centre.y, z - centre.z)

          ok(radius > 0, `${path}: zero radius`)
          ok(distance <= radius * 1.0001, `${path}: point at ${distance} outside ${radius}`)
        }
    })

    it('leaves the trailing padding zero', () => {
      for (const { path, part } of parts())
        deepStrictEqual(part.padding, { x: 0, y: 0, z: 0 }, path)
    })

    // Stored as a single byte over 250, so it round-trips exactly — and, since the byte is
    // free to exceed 250, the decoded factor is free to exceed one.
    it('quantises the surface deviation to whole steps of 1/250', () => {
      let above = 0

      for (const { path, part } of parts()) {
        const steps = part.surfaceDeviation * STEPS

        strictEqual(steps, Math.round(steps), `${path}: ${part.surfaceDeviation}`)
        ok(steps >= 0 && steps <= 0xff, `${path}: ${steps} does not fit a byte`)
        if (steps > STEPS) above++
      }

      ok(above > 0, 'expected the deviation byte to run past 250 somewhere')
    })
  })

  describe('bounding volume hierarchy', () => {
    it('is a full binary tree, one terminal hull per leaf', () => {
      for (const { path, part } of parts())
        strictEqual([...getNodes(part.root)].length, terminal(part).length * 2 - 1, path)
    })

    it('gives leaves a terminal hull, and inner nodes either none or a subtree hull', () => {
      for (const { path, part } of parts())
        for (const node of getNodes(part.root))
          if (!node.left && !node.right)
            strictEqual(node.hull?.type, HullType.Enabled, `${path}: leaf without a terminal hull`)
          else if (node.hull)
            strictEqual(node.hull.type, HullType.Skip, `${path}: inner node holds a terminal hull`)
    })

    // The root is the one node that always carries a hull: the whole part when it is a single
    // convex shape, otherwise a subtree hull bounding everything below.
    it('always puts a hull on the root, of the type its children imply', () => {
      for (const { path, part } of parts())
        strictEqual(
          part.root.hull?.type,
          terminal(part).length > 1 ? HullType.Skip : HullType.Enabled,
          path,
        )
    })

    it('encloses every point below a node in its sphere and its quantised box', () => {
      for (const { path, part } of parts())
        for (const node of getNodes(part.root)) {
          const { center, radius, boxSizes } = node

          for (const hull of getHulls(node))
            for (const face of hull.faces)
              for (const index of face.points) {
                const point = part.points[index]!
                const [x, y, z] = [point.x - center.x, point.y - center.y, point.z - center.z]

                ok(Math.hypot(x, y, z) <= radius * 1.0001 + 1e-4, `${path}: point outside sphere`)
                ok(
                  Math.abs(x) <= boxSizes.x * radius + 1e-3 &&
                    Math.abs(y) <= boxSizes.y * radius + 1e-3 &&
                    Math.abs(z) <= boxSizes.z * radius + 1e-3,
                  `${path}: point outside box`,
                )
              }
        }
    })

    it('quantises box sizes to whole steps of 1/250, and leaves node padding zero', () => {
      for (const { path, part } of parts())
        for (const { boxSizes, padding } of getNodes(part.root)) {
          strictEqual(padding, 0, path)

          for (const size of [boxSizes.x, boxSizes.y, boxSizes.z])
            strictEqual(size * STEPS, Math.round(size * STEPS), `${path}: ${size}`)
        }
    })
  })

  describe('hulls', () => {
    // What `getIndexCount` bets the ledge size on. A closed convex polyhedron has V = 2 + F / 2,
    // which also forces the face count even — the flattest hulls in the corpus are two faces
    // over three points, a triangle sealed against itself.
    it('satisfies Euler for a closed convex polyhedron', () => {
      let flat = 0

      for (const { path, hull } of hulls()) {
        strictEqual(hull.faces.length % 2, 0, `${path}: odd face count`)
        strictEqual(getIndices(hull.faces).length, 2 + hull.faces.length / 2, `${path}: V != 2+F/2`)

        if (hull.faces.length === 2) flat++
      }

      ok(flat > 0, 'expected the two-face hulls the corpus is full of')
    })

    it('leaves the material index and the reserved field zero', () => {
      for (const { path, hull } of hulls()) {
        strictEqual(hull.reserved, 0, path)
        for (const { material } of hull.faces) strictEqual(material, 0, path)
      }
    })

    it('marks faces and their edges virtual exactly when the hull bounds a subtree', () => {
      for (const { path, hull } of hulls()) {
        const virtual = hull.type === HullType.Skip

        for (const face of hull.faces) {
          strictEqual(face.virtual, virtual, `${path}: face virtual flag disagrees with hull type`)
          deepStrictEqual(face.virtualEdges, [virtual, virtual, virtual], `${path}: edge flags`)
        }
      }
    })

    // Half-edge adjacency: opposites is an involution over the flat edge index, so following it
    // twice comes back to where it started. This is what pins down `toEdgeIndex`/`toSlot`.
    it('pairs every half-edge with exactly one opposite', () => {
      for (const { path, hull } of hulls()) {
        const edges = hull.faces.flatMap(({ opposites }) => opposites)

        for (const [edge, opposite] of edges.entries()) {
          ok(opposite >= 0 && opposite < edges.length, `${path}: edge ${opposite} out of range`)
          strictEqual(edges[opposite], edge, `${path}: edge ${edge} is not paired`)
        }
      }
    })

    it('keeps pierce indices inside the face list, never pointing at their own face', () => {
      for (const { path, hull } of hulls())
        for (const [index, face] of hull.faces.entries()) {
          ok(face.pierce < hull.faces.length, `${path}: pierce ${face.pierce} out of range`)
          ok(face.pierce !== index, `${path}: face ${index} pierces itself`)
        }
    })
  })

  describe('points', () => {
    it('indexes only points the part holds, and holds no point no face indexes', () => {
      for (const { path, part } of parts()) {
        const used = new Set<number>()

        for (const hull of getHulls(part.root))
          for (const face of hull.faces)
            for (const index of face.points) {
              ok(index < part.points.length, `${path}: index ${index} of ${part.points.length}`)
              used.add(index)
            }

        strictEqual(
          used.size,
          part.points.length,
          `${path}: ${part.points.length - used.size} unused`,
        )
      }
    })

    // The trailing word is IVP's `hesse_val` slot; Freelancer reuses it and does put data there.
    it('carries client data on most points', () => {
      let total = 0
      let filled = 0

      for (const { part } of parts())
        for (const { clientData } of part.points) {
          if (clientData !== 0) filled++
          total++
        }

      ok(filled > total / 2, `only ${filled} of ${total} points carry client data`)
    })
  })

  describe('construction', () => {
    // Derived from the triangles alone, so a reader that agrees here has the winding right too.
    it('rebuilds the half-edge adjacency of every face in the corpus', () => {
      let total = 0

      for (const { part, hull } of hullsInParts()) {
        const rebuilt = createHull(
          hull.id,
          part.points,
          hull.faces.map(({ points }) => [...points] as TriangleIndices),
          hull.type,
        )

        for (const [index, face] of hull.faces.entries()) {
          deepStrictEqual(rebuilt.faces[index]?.opposites, face.opposites, `face ${index}`)
          total++
        }
      }

      strictEqual(total, 177824)
    })

    // IVP pairs each face with the one facing most nearly the other way, walking its own triangle
    // list in order — an order the file does not record, so the ties it broke are not recoverable.
    it('reproduces 151,761 of the 177,824 pierce indices, the rest being ties', () => {
      let matched = 0

      for (const { part, hull } of hullsInParts()) {
        const rebuilt = createHull(
          hull.id,
          part.points,
          hull.faces.map(({ points }) => [...points] as TriangleIndices),
          hull.type,
        )

        for (const [index, face] of hull.faces.entries())
          if (rebuilt.faces[index]?.pierce === face.pierce) matched++
      }

      strictEqual(matched, 151761)
    })

    it('derives the mass centre and radius of all 1,365 parts', () => {
      let total = 0

      for (const { path, part } of parts()) {
        const { massCenter, radius } = getMassProperties(getHulls(part.root), part.points)

        ok(
          Math.hypot(
            massCenter.x - part.massCenter.x,
            massCenter.y - part.massCenter.y,
            massCenter.z - part.massCenter.z,
          ) <=
            part.radius * 1e-4,
          `${path}: mass centre`,
        )

        ok(Math.abs(radius - part.radius) <= part.radius * 1e-4, `${path}: radius ${radius}`)
        total++
      }

      strictEqual(total, 1365)
    })

    // `int(1 + deviation / (radius / 250))` truncates, so a value sitting on a step comes out
    // either side of it depending on how the sum was rounded.
    it('derives the surface deviation byte of 1,349 of them exactly', () => {
      let matched = 0

      for (const { part } of parts()) {
        const { surfaceDeviation } = getMassProperties(getHulls(part.root), part.points)

        if (Math.round(surfaceDeviation * STEPS) === Math.round(part.surfaceDeviation * STEPS))
          matched++
      }

      strictEqual(matched, 1349)
    })

    // Retail disagrees on rotation inertia far too often for the hulls in the file to be what it
    // was measured from — see SURFACE.md.
    it('derives a rotation inertia that agrees on 2,067 of 4,095 components', () => {
      let matched = 0

      for (const { part } of parts()) {
        const { rotationInertia } = getMassProperties(getHulls(part.root), part.points)

        for (const axis of ['x', 'y', 'z'] as const)
          if (
            Math.abs(rotationInertia[axis] - part.rotationInertia[axis]) <=
            Math.abs(part.rotationInertia[axis]) * 1e-3
          )
            matched++
      }

      strictEqual(matched, 2067)
    })

    // A hull enclosing no volume has nothing to integrate, and IVP estimates from the bounding
    // sphere instead — uniform across the three axes, which is what those parts ship.
    it('derives the rotation inertia of all 84 parts whose hulls enclose no volume', () => {
      let uniform = 0
      let fallback = 0
      let matched = 0

      for (const { part } of parts()) {
        const stored = axes.map((axis) => part.rotationInertia[axis])
        const { rotationInertia } = getMassProperties(getHulls(part.root), part.points)
        const derived = axes.map((axis) => rotationInertia[axis])

        if (Math.max(...stored) <= Math.min(...stored) * 1.0001) uniform++
        if (Math.max(...derived) > Math.min(...derived) * 1.0001) continue

        fallback++
        if (Math.abs(derived[0]! - stored[0]!) <= Math.abs(stored[0]!) * 1e-3) matched++
      }

      strictEqual(uniform, 92, 'retail parts shipping a uniform inertia')
      strictEqual(fallback, 84)
      strictEqual(matched, 84)
    })

    it('derives the sphere and box of all 9,111 leaf nodes, one box size aside', () => {
      let total = 0
      let boxes = 0

      for (const { path, part } of parts())
        for (const node of getNodes(part.root)) {
          if (node.left || node.right || !node.hull) continue

          const { center, radius, boxSizes } = createNode(node.hull, part.points)

          ok(
            Math.hypot(
              center.x - node.center.x,
              center.y - node.center.y,
              center.z - node.center.z,
            ) <=
              node.radius * 1e-4,
            `${path}: node centre`,
          )

          ok(Math.abs(radius - node.radius) <= node.radius * 1e-4, `${path}: node radius`)

          if (
            (['x', 'y', 'z'] as const).every(
              (axis) =>
                Math.round(boxSizes[axis] * STEPS) === Math.round(node.boxSizes[axis] * STEPS),
            )
          )
            boxes++

          total++
        }

      strictEqual(total, 9111)
      strictEqual(boxes, 9110)
    })

    /**
     * Retail hulls are the adversarial case for a hull generator. They are already decimated, so
     * they carry near-coplanar faces in quantity, and each one is a convex polyhedron given as
     * exactly its own vertices — which makes rebuilding one from those vertices a fixed point the
     * algorithm either reaches or visibly misses.
     */
    it('rebuilds every hull that holds a tetrahedron, 5,234 of 9,111', () => {
      let few = 0
      let flat = 0
      let rebuilt = 0
      let convex = 0
      let contains = 0

      for (const { part, hull } of hullsInParts()) {
        if (hull.type !== HullType.Enabled) continue

        const points = [...getIndices(hull.faces)].map((index) => part.points[index]!)

        let result

        try {
          result = generateConvexHull(points)
        } catch (error) {
          if (/at least four/.test(String(error))) few++
          else flat++

          continue
        }

        rebuilt++

        // The tolerance is relative because a hull sits wherever its model does, and the corpus
        // spans four orders of magnitude in size.
        let scale = 0
        for (const { x, y, z } of points)
          scale = Math.max(scale, Math.abs(x), Math.abs(y), Math.abs(z))

        const tolerance = Math.max(scale, 1) * 1e-5

        let own = -Infinity
        let all = -Infinity

        for (const [x, y, z] of result.triangles) {
          const a = result.points[x]!

          const normal = Vector3.normalize(
            Vector3.cross(
              Vector3.subtract(result.points[y]!, a),
              Vector3.subtract(result.points[z]!, a),
            ),
          )

          for (const point of result.points)
            own = Math.max(own, Vector3.dot(normal, Vector3.subtract(point, a)))

          for (const point of points)
            all = Math.max(all, Vector3.dot(normal, Vector3.subtract(point, a)))
        }

        if (own <= tolerance) convex++
        if (all <= tolerance) contains++
      }

      strictEqual(few, 3843, 'hulls of fewer than four points, which have no tetrahedron in them')
      strictEqual(flat, 34, 'hulls whose points share one plane')
      strictEqual(rebuilt, 5234)

      // Both are the whole of `rebuilt`: no hull comes back dented, and none loses a point it was
      // given. A generator that drifts fails here long before it fails `createFaces`.
      strictEqual(convex, 5234, 'every rebuilt hull is convex')
      strictEqual(contains, 5234, 'every rebuilt hull contains the points it was built from')
    })

    it('reproduces the exact vertex count of 4,925 of them, and never exceeds one', () => {
      let same = 0
      let fewer = 0
      let more = 0

      for (const { part, hull } of hullsInParts()) {
        if (hull.type !== HullType.Enabled) continue

        const points = [...getIndices(hull.faces)].map((index) => part.points[index]!)

        let result

        try {
          result = generateConvexHull(points)
        } catch {
          continue
        }

        if (result.points.length === points.length) same++
        else if (result.points.length < points.length) fewer++
        else more++
      }

      strictEqual(same, 4925)

      // Retail keeps vertices that lie on the plane of a face they do not corner; this drops them,
      // so the hulls that differ are always the smaller. None is ever larger, which would mean a
      // point invented or an interior one kept.
      strictEqual(fewer, 309)
      strictEqual(more, 0)
    })
  })

  describe('round-trip', () => {
    it('re-reads what it writes as the same structure', () => {
      for (const { path, data } of surfaces()) {
        const original = readSurfaceLibrary(BufferView.from(data))
        const back = readSurfaceLibrary(BufferView.from(writeSurfaceLibrary(original)))

        deepStrictEqual(strip(back), strip(original), path)
      }
    })

    it('reaches a fixed point on the second write', () => {
      for (const { path, data } of surfaces()) {
        const once = writeSurfaceLibrary(readSurfaceLibrary(BufferView.from(data)))
        const twice = writeSurfaceLibrary(readSurfaceLibrary(BufferView.from(once)))

        deepStrictEqual(bytes(twice), bytes(once), path)
      }
    })

    // IVP's builder emits terminal ledges before subtree ledges; this writer emits them in tree
    // order, so files whose two orders disagree come back reordered but equivalent.
    it('reproduces most retail files byte for byte', () => {
      let identical = 0
      let reordered = 0

      for (const { data } of surfaces()) {
        const written = writeSurfaceLibrary(readSurfaceLibrary(BufferView.from(data)))
        const a = bytes(written)

        if (a.byteLength === data.byteLength && a.every((value, i) => value === data[i]))
          identical++
        else {
          strictEqual(a.byteLength, data.byteLength)
          reordered++
        }
      }

      ok(identical > 500, `only ${identical} files re-encoded byte for byte`)
      ok(reordered > 0, 'expected the hull ordering difference to show somewhere')
    })
  })
})
