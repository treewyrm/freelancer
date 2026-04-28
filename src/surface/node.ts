import BufferView from '../utility/bufferview.js'
import Vector3 from '../math/vector3.js'
import type { Hull } from './hull.js'

/** Boundary volume hierarchy node. */
export interface Node {
  /** Boundary center. */
  center: Vector3

  /** Boundary half-width */
  radius: number

  /** Boundary axis multiplier. */
  axis: Vector3

  /** Unknown byte (padding?). */
  unknown: number

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
    axis: {
      x: view.readUint8() / 0xfa,
      y: view.readUint8() / 0xfa,
      z: view.readUint8() / 0xfa,
    },
    unknown: view.readUint8(),
  }
}

export function writeNode(view: BufferView, node: Node) {
  view.writeFloat32(node.center.x)
  view.writeFloat32(node.center.y)
  view.writeFloat32(node.center.z)
  view.writeFloat32(node.radius)
  view.writeUint8(node.axis.x * 0xfa)
  view.writeUint8(node.axis.y * 0xfa)
  view.writeUint8(node.axis.z * 0xfa)
  view.writeUint8(node.unknown)
}
