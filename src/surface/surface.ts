import BufferView from '#/utility/bufferview.js'
import type Vector3 from '#/math/vector3.js'
import { HullType, readHull, writeHull, type Hull } from './hull.js'
import { readNode, writeNode, type Node } from './node.js'
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
