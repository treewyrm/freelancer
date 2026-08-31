import BufferView from '#/utility/bufferview.js'
import Vector3 from '#/math/vector3.js'
import { getIndices, type Hull } from './hull.js'
import { getExtent, type Extent } from './extent.js'

/** Quantization steps for {@link Node.boxSizes}. */
const BOX_STEPS = 0xfa

/** Boundary volume hierarchy node. Corresponds to IVP's `IVP_Compact_Ledgetree_Node`. */
export interface Node {
  /** Boundary center, in object coordinates. */
  center: Vector3

  /** Bounding sphere radius. */
  radius: number

  /**
   * Box sizes, quantized in steps of 1/250. Multiply by {@link radius} to get the half-extents
   * of the axis-aligned bounding box around {@link center}.
   */
  boxSizes: Vector3

  /** Padding to a 4-byte boundary. Zero in every file Freelancer ships. */
  padding: number

  /** Referenced hull. */
  hull?: Hull

  /** BSP left child. */
  left?: Node

  /** BSP right child. */
  right?: Node
}

/**
 * The bounds IVP's builder derives from a box: the sphere is centred on the box and reaches its
 * corners, and each box size is `int(halfExtent / (radius / 250)) + 1` — truncated and then
 * stepped past, so the quantised box always contains the one it came from. The half-extent never
 * exceeds the radius, so the count never exceeds 251 and always fits its byte.
 */
function getBounds({ minimum, maximum }: Extent): Pick<Node, 'center' | 'radius' | 'boxSizes'> {
  const center = Vector3.lerp(minimum, maximum, 0.5)
  const half = Vector3.subtract(maximum, center)
  const radius = Vector3.magnitude(half)

  const step = (size: number) => (radius > 0 ? Math.trunc(size / (radius / BOX_STEPS)) + 1 : 1)

  return {
    center,
    radius,
    boxSizes: {
      x: step(half.x) / BOX_STEPS,
      y: step(half.y) / BOX_STEPS,
      z: step(half.z) / BOX_STEPS,
    },
  }
}

/** The axis-aligned box a node bounds, recovered from its sphere radius and quantised sizes. */
export const getNodeExtent = ({ center, radius, boxSizes }: Node): Extent => {
  const half = Vector3.multiplyScalar(boxSizes, radius)

  return { minimum: Vector3.subtract(center, half), maximum: Vector3.add(center, half) }
}

/** Leaf node bounding one terminal hull, from the points its faces index. */
export const createNode = (hull: Hull, points: readonly Vector3[]): Node => ({
  ...getBounds(getExtent(getIndices(hull.faces).map((index) => points[index]!))),
  padding: 0,
  hull,
})

/**
 * Inner node bounding two children. IVP unions the children's **quantised** boxes rather than
 * their spheres, so a parent's bounds follow from what was written for its children and nothing
 * below has to be visited again.
 */
export function mergeNodes(left: Node, right: Node, hull?: Hull): Node {
  const a = getNodeExtent(left)
  const b = getNodeExtent(right)

  const node: Node = {
    ...getBounds(getExtent([a.minimum, a.maximum, b.minimum, b.maximum])),
    padding: 0,
    left,
    right,
  }

  return hull ? { ...node, hull } : node
}

export function readNode(view: BufferView): Node {
  return {
    center: {
      x: view.readFloat32(),
      y: view.readFloat32(),
      z: view.readFloat32(),
    },
    radius: view.readFloat32(),
    boxSizes: {
      x: view.readUint8() / BOX_STEPS,
      y: view.readUint8() / BOX_STEPS,
      z: view.readUint8() / BOX_STEPS,
    },
    padding: view.readUint8(),
  }
}

export function writeNode(view: BufferView, node: Node) {
  view.writeFloat32(node.center.x)
  view.writeFloat32(node.center.y)
  view.writeFloat32(node.center.z)
  view.writeFloat32(node.radius)
  view.writeUint8(Math.round(node.boxSizes.x * BOX_STEPS))
  view.writeUint8(Math.round(node.boxSizes.y * BOX_STEPS))
  view.writeUint8(Math.round(node.boxSizes.z * BOX_STEPS))
  view.writeUint8(node.padding)
}
