import BufferView from '#/utility/bufferview.js'
import Vector3 from '#/math/vector3.js'
import type { Hull } from './hull.js'

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
