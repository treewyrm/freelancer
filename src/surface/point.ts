import BufferView from '../utility/bufferview.js'
import Vector3 from '../math/vector3.js'

export interface Point extends Vector3 {
  id: number
}

export function readPoint(view: BufferView): Point {
  return {
    id: view.readInt32(),
    x: view.readFloat32(),
    y: view.readFloat32(),
    z: view.readFloat32(),
  }
}

export function writePoint(view: BufferView, point: Point): void {
  view.writeInt32(point.id)
  view.writeFloat32(point.x)
  view.writeFloat32(point.y)
  view.writeFloat32(point.z)
}
