import BufferView from '../utility/bufferview.js'
import type Vector3 from '../math/vector3.js'
import { HullType, readHull, writeHull, type Hull } from './hull.js'
import { readNode, writeNode, type Node } from './node.js'
import { readPoint, writePoint, type Point } from './point.js'

/** Surfaces section. */
export interface Surface {
  /** Center of mass and bounding sphere center. Used for aiming reticle. */
  center: Vector3

  /** Default linear drag. */
  drag: Vector3

  /** Bounding sphere radius. Must encompass all hulls of a part. */
  radius: number

  /** Bounding sphere radius multiplier for hulls not listed in hardpoints. */
  radiusScale: number

  /** Hull points. */
  points: Point[]

  /** Root node of boundary volume hierarchy. */
  root: Node

  /** Unknown vector. Appears unused. */
  unknown: Vector3
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

  surface.center = {
    x: view.readFloat32(),
    y: view.readFloat32(),
    z: view.readFloat32(),
  }

  surface.drag = {
    x: view.readFloat32(),
    y: view.readFloat32(),
    z: view.readFloat32(),
  }

  surface.radius = view.readFloat32()

  const header = view.readUint32()

  surface.radiusScale = (header && 0xff) / 0xfa

  const endOffset = header >> 8
  const startOffset = view.readInt32()

  surface.unknown = {
    x: view.readFloat32(),
    y: view.readFloat32(),
    z: view.readFloat32(),
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

export function writeSurface(surface: Surface): BufferView {
  const { root, center, drag, points, radius, radiusScale, unknown } = surface

  let size = 0

  const nodes = Array.from(getNodes(root))
  const hulls = nodes.filter(({ hull }) => !!hull).map(({ hull }) => hull!)

  size += 48 // header
  size += nodes.length * 28
  size += hulls.reduce((total, { faces: { length } }) => total + 16 + length * 16, 0)
  size += points.length * 16

  const view = BufferView.allocate(size)

  /** Points block start offset. */
  let pointsOffset = 0

  /** Nodes block start offset. */
  let nodesOffset = 0

  // Skip header
  view.offset += 48

  const hullOffsets = new Map<Hull, number>()

  // Write hulls.
  for (const hull of hulls) {
    hullOffsets.set(hull, view.offset)

    view.offset += Int32Array.BYTES_PER_ELEMENT
    view.writeUint32(hull.type)
    writeHull(view, hull)
  }

  // Mark where points begin
  pointsOffset = view.offset

  // Write points.
  for (const point of points) writePoint(view, point)

  // Mark where nodes begin
  nodesOffset = view.offset

  // Update hulls with relative offsets to pointsOffset and nodesOffset.
  for (const [hull, offset] of hullOffsets) {
    view.offset = offset

    view.writeInt32(pointsOffset - offset)
    if (hull.type === HullType.Skip) view.writeInt32(nodesOffset - offset)
  }

  // Switch back to nodes
  view.offset = nodesOffset

  // Write nodes.
  const queue: [number, Node][] = [[0, root]]

  while (queue.length > 0) {
    const [parentOffset, node] = queue.pop()!
    const offset = view.offset

    // Update parent offset.
    if (parentOffset > 0) view.setInt32(parentOffset, offset - parentOffset, view.littleEndian)

    view.writeInt32(0) // Offset to right child.
    view.writeInt32(node.hull ? (hullOffsets.get(node.hull) ?? 0) - offset : 0) // Offset to hull.
    writeNode(view, node)

    if (node.right) queue.push([offset, node.right])
    if (node.left) queue.push([0, node.left])
  }

  size = view.offset

  view.offset = 0
  view.writeUint32(size)

  view.writeFloat32(center.x)
  view.writeFloat32(center.y)
  view.writeFloat32(center.z)

  view.writeFloat32(drag.x)
  view.writeFloat32(drag.y)
  view.writeFloat32(drag.z)

  view.writeFloat32(radius)
  view.writeUint32((radiusScale * 0xfa) | (size << 8))
  view.writeUint32(nodesOffset)

  view.writeFloat32(unknown.x)
  view.writeFloat32(unknown.y)
  view.writeFloat32(unknown.z)

  return BufferView.join(BufferView.allocate(Uint32Array.BYTES_PER_ELEMENT).writeUint32(size), view)
}
