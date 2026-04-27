import type Matrix3 from './matrix3.js'
import Vector3 from './vector3.js'
import Vector4 from './vector4.js'

/** Quaternion. */
type Quat = Vector4

const Quat = {
  identity: { x: 0, y: 0, z: 0, w: 1 } as const,

  conjugate: (q: Vector4): Vector4 => ({
    x: -q.x,
    y: -q.y,
    z: -q.z,
    w: q.w,
  }),

  /** Multiplies two quaternions. */
  multiply: (a: Vector4, b: Vector4): Vector4 => {
    const { x: ax, y: ay, z: az, w: aw } = a
    const { x: bx, y: by, z: bz, w: bw } = b

    return {
      x: ax * bw + aw * bx + ay * bz - az * by,
      y: ay * bw + aw * by + az * bx - ax * bz,
      z: az * bw + aw * bz + ax * by - ay * bx,
      w: aw * bw - ax * bx - ay * by - az * bz,
    }
  },

  /** Generates quaternion from axis and angle. */
  axisAngle: (v: Vector3, angle: number): Vector4 => {
    angle *= 0.5
    const s = Math.sin(angle)

    return {
      x: v.x * s,
      y: v.y * s,
      z: v.z * s,
      w: Math.cos(angle),
    }
  },

  /** Calculates rotation axis and angle from quaternion.  */
  getAxisAngle: (q: Vector4, epsilon = 0.0001): [axis: Vector3, angle: number] => {
    const r = Math.acos(q.w) * 2.0
    const s = Math.sin(r / 2.0)

    if (s > epsilon)
      return [
        {
          x: q.x / s,
          y: q.y / s,
          z: q.z / s,
        },
        r,
      ]

    return [{ ...Vector3.copy(Vector3.x) }, r]
  },

  /** Generates quaternion from a matrix. */
  fromMatrix: ({ x, y, z }: Matrix3): Vector4 => {
    const t = x.x + y.y + z.z
    let s = 0

    if (t > 0) {
      s = 0.5 / Math.sqrt(t + 1.0)

      return {
        x: (z.y - y.z) * s,
        y: (x.z - z.x) * s,
        z: (y.x - x.y) * s,
        w: 0.25 / s,
      }
    }

    if (x.x > y.y && x.x > z.z) {
      s = 2.0 * Math.sqrt(1.0 + x.x - y.y - z.z)

      return {
        x: 0.25 * s,
        y: (x.y + y.x) / s,
        z: (x.z + z.x) / s,
        w: (z.y - y.z) / s,
      }
    }

    if (y.y > z.z) {
      s = 2.0 * Math.sqrt(1.0 + y.y - x.x - z.z)

      return {
        x: (x.y + y.x) / s,
        y: 0.25 * s,
        z: (y.z + z.y) / s,
        w: (x.z - z.x) / s,
      }
    }

    s = 2.0 * Math.sqrt(1.0 + z.z - x.x - y.y)

    return {
      x: (x.z + z.x) / s,
      y: (y.z + z.y) / s,
      z: 0.25 * s,
      w: (y.x - x.y) / s,
    }
  },

  /** Transforms vector by quaternion. */
  transform: (v: Vector3, q: Vector4): Vector3 => {
    const u = Vector3.cross(q, v)

    return Vector3.add(
      v,
      Vector3.add(
        Vector3.multiplyScalar(u, 2 * q.w),
        Vector3.multiplyScalar(Vector3.cross(q, u), 2),
      ),
    )
  },

  /** Calculate quaternion spherical interpolation. */
  slerp: (a: Vector4, b: Vector4, t: number, epsilon = 0.0001): Vector4 => {
    let d = Vector4.dot(a, b)

    if (d < 0) {
      d = -d
      b = Vector4.multipyScalar(b, -1)
    }

    let u = 1.0 - t
    let v = t

    if (1.0 - d > epsilon) {
      const o = Math.acos(d)
      const s = Math.sin(o)

      u = Math.sin((1.0 - t) * o) / s
      v = Math.sin(t * o) / s
    }

    return {
      x: u * a.x + v * b.x,
      y: u * a.y + v * b.y,
      z: u * a.z + v * b.z,
      w: u * a.w + v * b.w,
    }
  },
}

export default Quat
