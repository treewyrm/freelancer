import type Vector3 from './vector3.js'

/** A rotation as a unit axis and an angle about it, in radians. */
export interface AxisAngle {
  axis: Vector3
  angle: number
}
