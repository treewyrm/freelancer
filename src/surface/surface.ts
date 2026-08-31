import BufferView from '#/utility/bufferview.js'
import Vector3 from '#/math/vector3.js'
import { getNormal } from './face.js'
import { getExtent } from './extent.js'
import { getIndices, HullType, readHull, writeHull, type Hull } from './hull.js'
import { mergeNodes, readNode, writeNode, type Node } from './node.js'
import { readPoint, writePoint, type Point } from './point.js'

/** Header size of `IVP_Compact_Surface`, in bytes. */
const HEADER_SIZE = 48

/** Size of a single `IVP_Compact_Ledgetree_Node`, in bytes. */
const NODE_SIZE = 28

/** Size of an `IVP_Compact_Ledge` header and of one `IVP_Compact_Poly_Point`, in bytes. */
const RECORD_SIZE = 16

/** Quantization steps for {@link Surface.surfaceDeviation}. */
const DEVIATION_STEPS = 0xfa

/** Surfaces section. Corresponds to IVP's `IVP_Compact_Surface`. */
export interface Surface {
  /** Center of mass, also the bounding sphere center. Used for aiming reticle. */
  massCenter: Vector3

  /** Rotation inertia, not a drag coefficient. */
  rotationInertia: Vector3

  /** Bounding sphere radius. Must encompass all hulls of a part. */
  radius: number

  /**
   * Maximum surface deviation factor, quantized in steps of 1/250. Multiply by {@link radius}
   * to get how far the surface departs from the bounding sphere.
   */
  surfaceDeviation: number

  /** Hull points. */
  points: Point[]

  /** Root node of boundary volume hierarchy. */
  root: Node

  /** Padding to a 16-byte boundary. Zero in every file Freelancer ships. */
  padding: Vector3
}

/** Everything a {@link Surface} records about its geometry beyond the geometry itself. */
export type MassProperties = Pick<
  Surface,
  'massCenter' | 'rotationInertia' | 'radius' | 'surfaceDeviation'
>

/** Triangles of a hull list, resolved against the point list its faces index. */
function* getTriangles(hulls: Iterable<Hull>, points: readonly Vector3[]) {
  for (const hull of hulls)
    for (const face of hull.faces) {
      const [a, b, c] = face.points.map((index) => points[index])
      if (!a || !b || !c) throw new RangeError('Hull face indexes a point that is not there')

      yield [a, b, c] as const
    }
}

/**
 * Centre of mass of the volume the hulls enclose, by the divergence theorem: each face spans a
 * tetrahedron with the origin whose signed volume is `dot(normal, a) / 6` and whose centroid is
 * the mean of its four points.
 *
 * A hull enclosing no volume — the flat two-face hulls the corpus is full of — has nothing to
 * integrate, and IVP falls back to the centre of the bounding box. The threshold is IVP's:
 * the summed determinant against the summed area to the power of three halves.
 */
function getMassCenter(hulls: Iterable<Hull>, points: readonly Vector3[]) {
  let determinant = 0
  let area = 0
  let sum: Vector3 = { x: 0, y: 0, z: 0 }

  for (const [a, b, c] of getTriangles(hulls, points)) {
    const normal = getNormal(a, b, c)
    const value = Vector3.dot(normal, a)

    determinant += value
    area += Vector3.dot(normal, normal)
    sum = Vector3.add(sum, Vector3.multiplyScalar(Vector3.add(Vector3.add(a, b), c), value / 4))
  }

  const scale = Math.sqrt(area)

  if (determinant > scale * scale * scale * 1e-9)
    return { massCenter: Vector3.divideScalar(sum, determinant), estimate: 0 }

  const { minimum, maximum } = getExtent(
    [...getTriangles(hulls, points)].flatMap((triangle) => [...triangle]),
  )

  // IVP takes the geometric centre and estimates the inertia from the bounding sphere. All 84
  // retail parts that reach this path carry exactly what it produces, uniform across the three
  // axes — so a uniform inertia is what Freelancer ships and is not worth perturbing away from.
  const radius = Vector3.distance(minimum, maximum) / 2

  return { massCenter: Vector3.lerp(minimum, maximum, 0.5), estimate: radius * radius * 0.5 }
}

/**
 * IVP's `calc_radius_to_given_center`, both halves in one pass: the radius is how far the
 * farthest point sits from the centre, and the deviation is how far a point sits off the axis
 * through the centre along its own face's normal — the surface's widest departure from the
 * bounding sphere, which is what {@link Surface.surfaceDeviation} quantizes.
 */
function getRadius(hulls: Iterable<Hull>, points: readonly Vector3[], center: Vector3) {
  let radius = 0
  let deviation = 0

  for (const [a, b, c] of getTriangles(hulls, points)) {
    const normal = getNormal(a, b, c)
    const inverse = 1 / Vector3.dot(normal, normal)

    for (const point of [a, b, c]) {
      const local = Vector3.subtract(point, center)
      const across = Vector3.cross(local, normal)

      radius = Math.max(radius, Vector3.dot(local, local))
      deviation = Math.max(deviation, Vector3.dot(across, across) * inverse)
    }
  }

  return { radius: Math.sqrt(radius), deviation: Math.sqrt(deviation) }
}

/**
 * One axis permutation of IVP's `IVP_Compact_Ledge_Mass_Center_Solver`, which integrates the
 * volume face by face and returns the second moment about `z` over the volume. Ported as written,
 * down to the branch on which of the two normal components dominates.
 */
function getMoment(
  hulls: Iterable<Hull>,
  points: readonly Vector3[],
  center: Vector3,
  order: [x: 'x' | 'y' | 'z', y: 'x' | 'y' | 'z', z: 'x' | 'y' | 'z'],
): number {
  const [x, y, z] = order

  let volume = 0
  let moment = 0

  for (const triangle of getTriangles(hulls, points)) {
    const [a, b, c] = triangle
    const normal = Vector3.normalize(getNormal(a, b, c))

    // IVP's `three_edge_area`: integrate the triangle alone when the normal leans on `z` at
    // least as hard as on `y`, otherwise a triangle plus a square. Only one slope is ever used.
    const alone = Math.abs(normal[z]) >= Math.abs(normal[y])

    const fzdy = alone && Math.abs(normal[z]) > Number.EPSILON ? (-0.5 * normal[y]) / normal[z] : 0
    const fydz = alone ? 0 : (0.5 * normal[z]) / normal[y]

    const local = triangle.map((point) => Vector3.subtract(point, center))

    for (const [index, p0] of local.entries()) {
      const p1 = local[(index + 1) % 3]!
      const edge = Vector3.subtract(p1, p0)

      if (Math.abs(edge[x]) < Number.EPSILON * Vector3.magnitude(edge)) continue

      const lydx = edge[y] / edge[x]
      const ly0 = p0[y] - lydx * p0[x]

      let ka: number
      let kb: number
      let kc: number

      if (alone) {
        ka = fzdy * ly0 * ly0
        kb = fzdy * 2 * ly0 * lydx
        kc = fzdy * lydx * lydx
      } else {
        const lzdx = edge[z] / edge[x]
        const lz0 = p0[z] - lzdx * p0[x]

        ka = (ly0 + fydz * lz0) * lz0
        kb = ly0 * lzdx + lydx * lz0 + 2 * fydz * lz0 * lzdx
        kc = (lydx + fydz * lzdx) * lzdx
      }

      const [u, v] = [p0[x], p1[x]]
      const [u2, v2] = [u * u, v * v]

      const d1 = v - u
      const d2 = (v2 - u2) / 2
      const d3 = (v2 * v - u2 * u) / 3
      const d4 = (v2 * v2 - u2 * u2) / 4
      const d5 = (v2 * v2 * v - u2 * u2 * u) / 5

      volume += d1 * ka + d2 * kb + d3 * kc
      moment += d3 * ka + d4 * kb + d5 * kc
    }
  }

  return volume < Number.EPSILON ? 1 : moment / volume
}

/**
 * Derives everything a {@link Surface} records beyond its geometry, from the **terminal** hulls
 * only — a hull that merely bounds a subtree is skipped, as it is by IVP's `get_all_ledges`.
 *
 * `massCenter`, `radius` and `surfaceDeviation` reproduce every retail part, and so does
 * `rotationInertia` wherever the hull still encloses the volume it was measured from. It is read
 * by the game — a part blown off a model tumbles by it — so pass a better figure through when one
 * is at hand. See [SURFACE.md](../../docs/SURFACE.md#todo).
 */
export function getMassProperties(
  hulls: Iterable<Hull>,
  points: readonly Vector3[],
): MassProperties {
  const terminal = [...hulls].filter(({ type }) => type === HullType.Enabled)
  const { massCenter, estimate } = getMassCenter(terminal, points)
  const { radius, deviation } = getRadius(terminal, points, massCenter)

  const inertia = () => {
    // Each axis is integrated with the other two rotated into place, and the three second
    // moments are then combined pairwise, squared before the sum is rooted.
    const moment = (order: Parameters<typeof getMoment>[3]) => {
      const value = getMoment(terminal, points, massCenter, order)
      return value * value
    }

    const a = moment(['x', 'y', 'z'])
    const b = moment(['y', 'z', 'x'])
    const c = moment(['z', 'x', 'y'])

    return { x: Math.sqrt(b + c), y: Math.sqrt(a + c), z: Math.sqrt(a + b) }
  }

  return {
    massCenter,
    rotationInertia: estimate ? { x: estimate, y: estimate, z: estimate } : inertia(),
    radius,
    surfaceDeviation:
      radius > 0 ? Math.trunc(1 + deviation / (radius / DEVIATION_STEPS)) / DEVIATION_STEPS : 0,
  }
}

export function* getNodes(root: Node) {
  const queue = [root]
  let node

  while ((node = queue.pop())) {
    if (node.right) queue.push(node.right)
    if (node.left) queue.push(node.left)

    yield node
  }
}

export function* getHulls(root: Node) {
  for (const node of getNodes(root)) if (node.hull) yield node.hull
}

/**
 * Folds leaf nodes into the full binary tree the format wants, merging whichever pair yields the
 * tightest bounds until one node is left — the rule IVP's sphere clustering minimizes, without
 * the interval hash it uses to avoid comparing every pair.
 *
 * Inner nodes come back without a hull, which is what IVP emits when a bounding ledge was not
 * built. Retail files always carry one; see {@link createPart} for how a box hull is put there.
 */
export function createHierarchy(nodes: Iterable<Node>): Node {
  const pool = [...nodes]
  const first = pool[0]

  if (!first) throw new RangeError('A surface part needs at least one hull')

  while (pool.length > 1) {
    let best: [left: number, right: number, node: Node] | undefined

    for (let i = 0; i < pool.length; i++)
      for (let j = i + 1; j < pool.length; j++) {
        const node = mergeNodes(pool[i]!, pool[j]!)
        if (!best || node.radius < best[2].radius) best = [i, j, node]
      }

    const [left, right, node] = best!

    pool[left] = node
    pool.splice(right, 1)
  }

  return pool[0]!
}

/** Builds a surface block around a hierarchy, deriving its {@link MassProperties}. */
export const createSurface = (
  root: Node,
  points: Point[],
  overrides: Partial<MassProperties> = {},
): Surface => ({
  ...getMassProperties(getHulls(root), points),
  ...overrides,
  points,
  root,
  padding: { x: 0, y: 0, z: 0 },
})

const subView = (view: BufferView, length: number): BufferView => {
  const value = view.subarray(view.offset, view.offset + length)
  view.offset += value.byteLength
  return value
}

export function readSurface(view: BufferView, surface: Surface): void {
  view = subView(view, view.readUint32())

  surface.massCenter = {
    x: view.readFloat32(),
    y: view.readFloat32(),
    z: view.readFloat32(),
  }

  surface.rotationInertia = {
    x: view.readFloat32(),
    y: view.readFloat32(),
    z: view.readFloat32(),
  }

  surface.radius = view.readFloat32()

  const header = view.readUint32()

  surface.surfaceDeviation = (header & 0xff) / DEVIATION_STEPS

  /** Size of the whole block, so also one past its last valid offset. */
  const endOffset = header >>> 8
  const startOffset = view.readInt32()

  surface.padding = {
    x: view.readInt32(),
    y: view.readInt32(),
    z: view.readInt32(),
  }

  const queue: [offset: number, parent?: Node][] = [[startOffset]]

  let pointsOffset = 0

  // Read nodes.
  while (queue.length) {
    const [offset, parent] = queue.pop()!

    if (offset < startOffset || offset > endOffset)
      throw new RangeError('Surface part node offset is out of bounds')

    view.offset = offset

    let rightOffset = view.readInt32()
    let hullOffset = view.readInt32()

    if (rightOffset) rightOffset += offset
    if (hullOffset) hullOffset += offset

    const node = readNode(view)

    !parent ? (surface.root = node) : !parent.left ? (parent.left = node) : (parent.right = node)

    const leftOffset = view.offset

    // Read hull.
    if (hullOffset) {
      pointsOffset = (view.offset = hullOffset) + view.readInt32()
      node.hull = readHull(view)
    }

    if (!node.hull || node.hull.type === HullType.Skip) {
      if (rightOffset) queue.push([rightOffset, node])
      if (leftOffset) queue.push([leftOffset, node])
    }
  }

  if (!pointsOffset) throw new RangeError('Invalid offset to points.')

  view.offset = pointsOffset

  // Read points.
  while (view.offset < startOffset) surface.points.push(readPoint(view))
}

/**
 * Blocks are laid out in the order IVP's `IVP_SurfaceBuilder_Ledge_Soup` emits them: header,
 * hulls, points, then the node tree. Every offset stored inside the block is relative to the
 * field that holds it, so the block is position independent.
 */
export function writeSurface(surface: Surface): BufferView {
  const { root, massCenter, rotationInertia, points, radius, surfaceDeviation, padding } = surface

  const nodes = Array.from(getNodes(root))
  const hulls = nodes.filter(({ hull }) => !!hull).map(({ hull }) => hull!)

  const size =
    HEADER_SIZE +
    hulls.reduce((total, { faces }) => total + RECORD_SIZE + faces.length * RECORD_SIZE, 0) +
    points.length * RECORD_SIZE +
    nodes.length * NODE_SIZE

  const view = BufferView.allocate(size)

  view.offset = HEADER_SIZE

  const hullOffsets = new Map<Hull, number>()

  // Write hulls. The leading point offset is patched in once the points block is placed.
  for (const hull of hulls) {
    hullOffsets.set(hull, view.offset)

    view.offset += Int32Array.BYTES_PER_ELEMENT
    writeHull(view, hull)
  }

  /** Points block start offset. */
  const pointsOffset = view.offset

  for (const point of points) writePoint(view, point)

  /** Nodes block start offset, and the value of `offset_ledgetree_root`. */
  const nodesOffset = view.offset

  for (const offset of hullOffsets.values()) {
    view.offset = offset
    view.writeInt32(pointsOffset - offset)
  }

  view.offset = nodesOffset

  const nodeOffsets = new Map<Node, number>()

  // Depth-first, so that a left child always immediately follows its parent.
  const queue: [parentOffset: number, node: Node][] = [[0, root]]

  while (queue.length > 0) {
    const [parentOffset, node] = queue.pop()!
    const offset = view.offset

    nodeOffsets.set(node, offset)

    // Fill in the right-child offset the parent left blank.
    if (parentOffset > 0) view.setInt32(parentOffset, offset - parentOffset, view.littleEndian)

    view.writeInt32(0) // Offset to right child.
    view.writeInt32(node.hull ? (hullOffsets.get(node.hull) ?? 0) - offset : 0) // Offset to hull.
    writeNode(view, node)

    if (node.right) queue.push([offset, node.right])
    if (node.left) queue.push([0, node.left])
  }

  // A hull bounding a subtree stores an offset back to the node that owns it, which is only
  // known now that the tree has been placed.
  for (const [node, offset] of nodeOffsets) {
    const { hull } = node
    if (!hull || hull.type !== HullType.Skip) continue

    const hullOffset = hullOffsets.get(hull) ?? 0

    view.offset = hullOffset + Int32Array.BYTES_PER_ELEMENT
    view.writeInt32(offset - hullOffset)
  }

  view.offset = 0

  view.writeFloat32(massCenter.x)
  view.writeFloat32(massCenter.y)
  view.writeFloat32(massCenter.z)

  view.writeFloat32(rotationInertia.x)
  view.writeFloat32(rotationInertia.y)
  view.writeFloat32(rotationInertia.z)

  view.writeFloat32(radius)
  view.writeUint32(((Math.round(surfaceDeviation * DEVIATION_STEPS) & 0xff) | (size << 8)) >>> 0)
  view.writeInt32(nodesOffset)

  view.writeInt32(padding.x)
  view.writeInt32(padding.y)
  view.writeInt32(padding.z)

  return BufferView.join(BufferView.allocate(Uint32Array.BYTES_PER_ELEMENT).writeUint32(size), view)
}
