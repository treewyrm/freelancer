import BufferView from '#/utility/bufferview.js'
import { generateConvexHull, type ConvexHullOptions } from '#/math/convexhull.js'
import type Vector3 from '#/math/vector3.js'
import { createBox, getExtent, readExtent, writeExtent, type Extent } from './extent.js'
import type { TriangleIndices } from './face.js'
import { createHull, HullType } from './hull.js'
import { createNode, getNodeExtent } from './node.js'
import type { Point } from './point.js'
import {
  createHierarchy,
  createSurface,
  getNodes,
  readSurface,
  writeSurface,
  type MassProperties,
  type Surface,
} from './surface.js'

const NOT_FIXED = 0x64786621 // '!fxd'
const EXTENTS = 0x73747865 // 'exts'
const SURFACES = 0x66727573 // 'surf'
const HARDPOINTS = 0x64697068 // 'hpid'

/**
 * One collidable part of a `.sur` file, identified by the CRC of the model part it collides for.
 *
 * A file holds one per moving piece, so a ship's hull and each of its animated flaps are separate
 * parts. What it carries beyond its own extent — the hierarchy, the hulls, the shared points, the
 * mass properties — comes from {@link Surface}.
 */
export interface Part extends Extent, Surface {
  id: number

  /** Part is welded to the root. False when the `!fxd` chunk is present. */
  fixed: boolean

  hardpoints: number[]
}

/**
 * One convex hull as a caller has it: its own points, and triangles indexing them. Whether two
 * hulls share a point is not the caller's problem — {@link createPart} folds them into the one
 * list a surface part holds and re-indexes the triangles, the way IVP's builder does.
 */
export interface HullGeometry {
  /** CRC32 of the model part name this hull collides for, by `getResourceId`. */
  id: number

  points: readonly (Vector3 & { clientData?: number })[]

  /** Triangles indexing {@link points}, wound counter-clockwise seen from outside. */
  triangles: Iterable<TriangleIndices>
}

/**
 * A hull's face index is twelve bits wide in `writeHull`, so a hull holds at most 4,096 faces, and
 * Euler's `V = 2 + F / 2` turns that into 2,050 points. Past it the writer masks the index and
 * emits a file that reads back as something else.
 */
const POINT_LIMIT = 2050

/** What {@link createHullGeometry} decides beyond the hull itself. */
export interface HullGeometryOptions extends ConvexHullOptions {
  /**
   * Written onto every point. Defaults to `id`, which is retail's convention — `clientData` is the
   * owning hull's id on every point of 9,085 of the 9,111 terminal hulls. Pass 0 to opt out.
   */
  clientData?: number
}

/**
 * Convex hull of a point cloud, as one {@link HullGeometry} — the bridge from a mesh's points to
 * something {@link createPart} takes.
 *
 * `maxPoints` defaults to what a hull can address rather than to the whole cloud, because a hull
 * past that limit cannot be written. Raising it is a way to produce a corrupt file; lowering it is
 * decimation, which stays the caller's, and a crude form of it — the budget stops the hull early
 * rather than choosing which detail to lose.
 * @throws RangeError by way of `generateConvexHull` on fewer than four distinct points, a
 * non-finite coordinate, or a point set with no tetrahedron in it.
 */
export function createHullGeometry(
  id: number,
  points: readonly Vector3[],
  options: HullGeometryOptions = {},
): HullGeometry {
  const { clientData = id, maxPoints = POINT_LIMIT, ...rest } = options
  const hull = generateConvexHull(points, { ...rest, maxPoints: Math.min(maxPoints, POINT_LIMIT) })

  return {
    id,
    points: hull.points.map(({ x, y, z }) => ({ x, y, z, clientData })),
    triangles: hull.triangles,
  }
}

/**
 * What {@link createPart} cannot derive, plus overrides for what it can. Every mass property is
 * optional and derived when left out.
 */
export interface PartOptions extends Partial<MassProperties> {
  /** Part is welded to the root. Defaults to true, which writes no `!fxd` chunk. */
  fixed?: boolean

  /** CRC32s of the hardpoints this part covers, by `getResourceId`. */
  hardpoints?: number[]

  /**
   * What to hang on an inner node of the hierarchy. `box` gives it the box it already bounds,
   * matching every retail file, at the cost of eight more points and twelve more faces per inner
   * node; `none` leaves it bare, which IVP reads and this reader descends through either way.
   */
  bounds?: 'box' | 'none'
}

/**
 * Builds a surface part from convex hulls — the whole path from geometry to something
 * `writeSurfaceLibrary` accepts.
 *
 * Points are merged into the single list the part shares and triangles are re-indexed onto it,
 * the hulls are folded into a bounding volume hierarchy by {@link createHierarchy}, and the mass
 * properties are derived by `getMassProperties`. Pass any of them in `options` to override what
 * is derived.
 */
export function createPart(id: number, hulls: HullGeometry[], options: PartOptions = {}): Part {
  const { fixed = true, hardpoints = [], bounds = 'box', ...overrides } = options

  const points: Point[] = []
  const indices = new Map<string, number>()

  /** Adds points to the shared list, returning where each landed. Identical points merge. */
  const share = (source: HullGeometry['points']): number[] =>
    [...source].map(({ x, y, z, clientData = 0 }) => {
      const key = `${x},${y},${z},${clientData}`
      const found = indices.get(key)

      if (found !== undefined) return found

      indices.set(key, points.length)
      return points.push({ x, y, z, clientData }) - 1
    })

  /** Rewrites triangles indexing a hull's own points to index the shared list instead. */
  const reindex = (triangles: HullGeometry['triangles'], remap: number[]): TriangleIndices[] =>
    [...triangles].map(
      (triangle) =>
        triangle.map((index) => {
          const value = remap[index]
          if (value === undefined) throw new RangeError(`A triangle indexes point ${index}`)

          return value
        }) as TriangleIndices,
    )

  const leaves = hulls.map(({ id, points: source, triangles }) => {
    const remap = share(source)

    return createNode(createHull(id, points, reindex(triangles, remap)), points)
  })

  // The extent covers the collision geometry, so it is taken before any bounding box is added.
  const extent = getExtent(points)
  const root = createHierarchy(leaves)

  if (bounds === 'box')
    for (const node of getNodes(root)) {
      const { left, right } = node
      if (!left || !right) continue

      // The box a node's sphere circumscribes, which is the union of its children's boxes
      // before it was quantised. Taking the quantised box back would put its corners outside
      // the sphere, and every retail file keeps what a node holds inside it.
      const [a, b] = [getNodeExtent(left), getNodeExtent(right)]
      const box = createBox(getExtent([a.minimum, a.maximum, b.minimum, b.maximum]))

      node.hull = createHull(0, points, reindex(box.triangles, share(box.points)), HullType.Skip)
    }

  return {
    id,
    fixed,
    hardpoints,
    ...extent,
    ...createSurface(root, points, overrides),
  }
}

function* readHardpoints(view: BufferView) {
  for (let i = 0, l = view.readUint32(); i < l; i++) yield view.readInt32()
}

function writeHardpoints(hardpoints: number[]) {
  const view = BufferView.allocate(
    Uint32Array.BYTES_PER_ELEMENT + hardpoints.length * Int32Array.BYTES_PER_ELEMENT,
  )
  view.writeUint32(hardpoints.length)
  for (const id of hardpoints) view.writeInt32(id)
  return view
}

/**
 * Reads one part: its id, its chunk count, and then that many tagged chunks.
 *
 * Only `!fxd` is an absence rather than a payload — a part with no such chunk is fixed. The others
 * fill the part in place, so the defaults here are what a part missing one of them keeps.
 * @throws RangeError on an unrecognized chunk tag, which cannot be skipped: payloads are not
 * length-prefixed, so carrying on would desynchronize the rest of the file.
 */
export function readPart(view: BufferView): Part {
  const part: Part = {
    id: view.readInt32(),
    fixed: true,
    hardpoints: [],
    minimum: { x: 0, y: 0, z: 0 },
    maximum: { x: 0, y: 0, z: 0 },
    massCenter: { x: 0, y: 0, z: 0 },
    rotationInertia: { x: 0, y: 0, z: 0 },
    radius: 0,
    surfaceDeviation: 1,
    points: [],
    root: {
      center: { x: 0, y: 0, z: 0 },
      radius: 0,
      boxSizes: { x: 0, y: 0, z: 0 },
      padding: 0,
    },
    padding: { x: 0, y: 0, z: 0 },
  }

  for (let i = 0, l = view.readUint32(); i < l; i++) {
    const tag = view.readUint32()

    switch (tag) {
      case NOT_FIXED:
        part.fixed = false
        break
      case EXTENTS:
        readExtent(view, part)
        break
      case SURFACES:
        readSurface(view, part)
        break
      case HARDPOINTS:
        part.hardpoints.push(...readHardpoints(view))
        break

      // Chunk payloads are not length-prefixed at the tag level, so an unrecognized tag cannot
      // be skipped — carrying on would silently desynchronize the rest of the file.
      default:
        throw new RangeError(`Unknown surface part chunk 0x${tag.toString(16).padStart(8, '0')}`)
    }
  }

  return part
}

const tag = (value: number): BufferView =>
  BufferView.allocate(Uint32Array.BYTES_PER_ELEMENT).writeUint32(value)

/** Chunks are written in the order Freelancer emits them: `!fxd`, `exts`, `surf`, `hpid`. */
export function writePart(part: Part): BufferView {
  const chunks: BufferView[][] = []

  if (!part.fixed) chunks.push([tag(NOT_FIXED)])

  chunks.push([tag(EXTENTS), writeExtent(part)], [tag(SURFACES), writeSurface(part)])

  if (part.hardpoints.length) chunks.push([tag(HARDPOINTS), writeHardpoints(part.hardpoints)])

  return BufferView.join(
    BufferView.allocate(Uint32Array.BYTES_PER_ELEMENT * 2)
      .writeInt32(part.id)
      .writeUint32(chunks.length),
    ...chunks.flat(),
  )
}
