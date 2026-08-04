import type Matrix3 from './matrix3.js'
import type { AxisAngle } from './misc.js'
import Vector3 from './vector3.js'
import Vector4 from './vector4.js'

/** Quaternion. */
type Quat = Vector4

const Quat = {
  identity: { x: 0, y: 0, z: 0, w: 1 } as const,

  conjugate(quat: Vector4): Vector4 {
    return {
      x: -quat.x,
      y: -quat.y,
      z: -quat.z,
      w: quat.w,
    }
  },

  /** Multiplies two quaternions. */
  multiply(a: Vector4, b: Vector4): Vector4 {
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
  axisAngle(axisAngle: AxisAngle): Vector4 {
    let { axis, angle } = axisAngle

    angle *= 0.5
    const s = Math.sin(angle)

    return {
      x: axis.x * s,
      y: axis.y * s,
      z: axis.z * s,
      w: Math.cos(angle),
    }
  },

  /** Calculates rotation axis and angle from quaternion.  */
  getAxisAngle(quat: Vector4, e = 0.0001): AxisAngle {
    const r = Math.acos(quat.w) * 2.0
    const s = Math.sin(r / 2.0)

    if (s > e)
      return {
        axis: {
          x: quat.x / s,
          y: quat.y / s,
          z: quat.z / s,
        },
        angle: r,
      }

    return { axis: Vector3.copy(Vector3.x), angle: r }
  },

  /** Generates shortest-arc quaternion rotating unit vector `from` onto unit vector `to`. */
  fromTo(from: Vector3, to: Vector3): Vector4 {
    const d = Vector3.dot(from, to)

    if (d < -1 + 1e-6) {
      const perp =
        Math.abs(from.x) < 0.9
          ? Vector3.normalize(Vector3.cross(from, Vector3.x))
          : Vector3.normalize(Vector3.cross(from, Vector3.y))
      return { x: perp.x, y: perp.y, z: perp.z, w: 0 }
    }

    const c = Vector3.cross(from, to)
    const w = Math.sqrt(2 * (1 + d))
    return { x: c.x / w, y: c.y / w, z: c.z / w, w: w / 2 }
  },

  /** Generates quaternion from intrinsic XYZ Euler angles (radians). */
  fromEuler(x: number, y: number, z: number): Vector4 {
    const hx = x * 0.5,
      hy = y * 0.5,
      hz = z * 0.5
    const cx = Math.cos(hx),
      sx = Math.sin(hx)
    const cy = Math.cos(hy),
      sy = Math.sin(hy)
    const cz = Math.cos(hz),
      sz = Math.sin(hz)

    return {
      x: sx * cy * cz - cx * sy * sz,
      y: cx * sy * cz + sx * cy * sz,
      z: cx * cy * sz - sx * sy * cz,
      w: cx * cy * cz + sx * sy * sz,
    }
  },

  /** Generates quaternion from a matrix. */
  fromMatrix(matrix: Matrix3): Vector4 {
    const { x, y, z } = matrix
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
  transform(vector: Vector3, quat: Vector4): Vector3 {
    const u = Vector3.cross(quat, vector)

    return Vector3.add(
      vector,
      Vector3.add(
        Vector3.multiplyScalar(u, 2 * quat.w),
        Vector3.multiplyScalar(Vector3.cross(quat, u), 2),
      ),
    )
  },

  /** Normalised linear interpolation — cheaper than slerp, accurate for small angles. */
  nlerp(a: Vector4, b: Vector4, t: number): Vector4 {
    if (Vector4.dot(a, b) < 0) b = Vector4.multipyScalar(b, -1)
    return Vector4.normalize({
      x: a.x + t * (b.x - a.x),
      y: a.y + t * (b.y - a.y),
      z: a.z + t * (b.z - a.z),
      w: a.w + t * (b.w - a.w),
    })
  },

  /** Calculate quaternion spherical interpolation. */
  slerp(a: Vector4, b: Vector4, t: number, e = 0.0001): Vector4 {
    let d = Vector4.dot(a, b)

    if (d < 0) {
      d = -d
      b = Vector4.multipyScalar(b, -1)
    }

    let u = 1.0 - t
    let v = t

    if (1.0 - d > e) {
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
