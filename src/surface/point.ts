import BufferView from '#/utility/bufferview.js'
import Vector3 from '#/math/vector3.js'

/**
 * Hull vertex, shared between the hulls of a part.
 *
 * IVP's `IVP_Compact_Poly_Point` derives from `IVP_U_Float_Hesse`, so the coordinates come
 * first and the trailing word is the plane's `hesse_val` slot, reused as `client_data`.
 */
export interface Point extends Vector3 {
  /** Trailing user data word. */
  clientData: number
}

export function readPoint(view: BufferView): Point {
  return {
    x: view.readFloat32(),
    y: view.readFloat32(),
    z: view.readFloat32(),
    clientData: view.readInt32(),
  }
}

export function writePoint(view: BufferView, point: Point): void {
  view.writeFloat32(point.x)
  view.writeFloat32(point.y)
  view.writeFloat32(point.z)
  view.writeInt32(point.clientData)
}
