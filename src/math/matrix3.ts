import BufferView from '#/utility/bufferview.js'
import Vector3 from './vector3.js'
import type Vector4 from './vector4.js'

/** 3x3 transformation matrix. */
interface Matrix3 {
  x: Vector3
  y: Vector3
  z: Vector3
}

const Matrix3 = {
  /** Identity matrix. */
  identity: { x: Vector3.x, y: Vector3.y, z: Vector3.z } as const,

  /** Tests if value is a matrix-like object. */
  is(value: unknown): value is Matrix3 {
    return (
      value !== null &&
      typeof value === 'object' &&
      'x' in value &&
      'y' in value &&
      'z' in value &&
      Vector3.is(value.x) &&
      Vector3.is(value.y) &&
      Vector3.is(value.z)
    )
  },

  /** Tests if matrix has any NaN components. */
  isNaN(matrix: Matrix3): boolean {
    return Vector3.isNaN(matrix.x) || Vector3.isNaN(matrix.y) || Vector3.isNaN(matrix.z)
  },

  /** Tests if matrix has finite components. */
  isFinite(matrix: Matrix3): boolean {
    return Vector3.isFinite(matrix.x) && Vector3.isFinite(matrix.y) && Vector3.isFinite(matrix.z)
  },

  /** Tests if two matrices are equal within margin of error. */
  equal(a: Matrix3, b: Matrix3, epsilon?: number): boolean {
    return (
      Vector3.equal(a.x, b.x, epsilon) &&
      Vector3.equal(a.y, b.y, epsilon) &&
      Vector3.equal(a.z, b.z, epsilon)
    )
  },

  /** Transforms vector by matrix. */
  transform(vector: Vector3, matrix: Matrix3): Vector3 {
    const { x, y, z } = vector
    const { x: u, y: v, z: w } = matrix

    return {
      x: x * u.x + y * v.x + z * w.x,
      y: x * u.y + y * v.y + z * w.y,
      z: x * u.z + y * v.z + z * w.z,
    }
  },

  /** Creates a copy of matrix. */
  copy(matrix: Partial<Matrix3>): Matrix3 {
    const { x = Vector3.x, y = Vector3.y, z = Vector3.z } = matrix

    return {
      x: Vector3.copy(x),
      y: Vector3.copy(y),
      z: Vector3.copy(z),
    }
  },

  /** Calculates matrix determinant (1 for normal and -1 for flipped matrices). */
  determinant(matrix: Matrix3) {
    const { x, y, z } = matrix

    return (
      x.x * (y.y * z.z - y.z * z.y) - x.y * (y.x * z.z - y.z * z.x) + x.z * (y.x * z.y - y.y * z.x)
    )
  },

  /**
   * Transposes matrix rows and columns.
   * @param matrix Input matrix
   * @returns
   */
  transpose(matrix: Matrix3): Matrix3 {
    const { x, y, z } = matrix

    return {
      x: {
        x: x.x,
        y: y.x,
        z: z.x,
      },
      y: {
        x: x.y,
        y: y.y,
        z: z.y,
      },
      z: {
        x: x.z,
        y: y.z,
        z: z.z,
      },
    }
  },

  /** Calculates inversion of a matrix. */
  invert(matrix: Matrix3): Matrix3 {
    const d = 1 / Matrix3.determinant(matrix)
    if (!isFinite(d)) throw new Error()

    const { x, y, z } = matrix

    return {
      x: {
        x: (z.z * y.y - y.z * z.y) * d,
        y: (-z.z * x.y + x.z * z.y) * d,
        z: (y.z * x.y - x.z * y.y) * d,
      },
      y: {
        x: (-z.z * y.x + y.z * z.x) * d,
        y: (z.z * x.x - x.z * z.x) * d,
        z: (-y.z * x.x + x.z * y.x) * d,
      },
      z: {
        x: (z.y * y.x - y.y * z.x) * d,
        y: (-z.y * x.x + x.y * z.x) * d,
        z: (y.y * x.x - x.y * y.x) * d,
      },
    }
  },

  /** Multiplies two matrices. */
  multiply(a: Matrix3, b: Matrix3): Matrix3 {
    const { x: ax, y: ay, z: az } = a
    const { x: bx, y: by, z: bz } = b

    return {
      x: {
        x: ax.x * bx.x + ay.x * bx.y + az.x * bx.z,
        y: ax.y * bx.x + ay.y * bx.y + az.y * bx.z,
        z: ax.z * bx.x + ay.z * bx.y + az.z * bx.z,
      },
      y: {
        x: ax.x * by.x + ay.x * by.y + az.x * by.z,
        y: ax.y * by.x + ay.y * by.y + az.y * by.z,
        z: ax.z * by.x + ay.z * by.y + az.z * by.z,
      },
      z: {
        x: ax.x * bz.x + ay.x * bz.y + az.x * bz.z,
        y: ax.y * bz.x + ay.y * bz.y + az.y * bz.z,
        z: ax.z * bz.x + ay.z * bz.y + az.z * bz.z,
      },
    }
  },

  /**
   * Creates matrix from axis and angle.
   * @param axis Axis vector
   * @param angle Turn angle (radians)
   * @returns
   */
  axisAngle(axis: Vector3, angle: number): Matrix3 {
    const { x, y, z } = axis

    const co = Math.cos(angle)
    const si = Math.sin(angle)
    const t = 1 - co

    const xy = x * y * t
    const zs = z * si
    const xz = x * z * t
    const ys = y * si
    const yz = y * z * t
    const xs = x * si

    return {
      x: {
        x: co + x * x * t,
        y: xy - zs,
        z: xz + ys,
      },
      y: {
        x: xy + zs,
        y: co + y * y * t,
        z: yz - xs,
      },
      z: {
        x: xz - ys,
        y: yz + xs,
        z: co + z * z * t,
      },
    }
  },

  /** Creates matrix from quaternion. */
  fromQuaternion(quat: Vector4): Matrix3 {
    const { x, y, z, w } = quat

    const xx = x * x
    const xy = x * y
    const xz = x * z
    const xw = x * w
    const yy = y * y
    const yz = y * z
    const yw = y * w
    const zz = z * z
    const zw = z * w

    return {
      x: {
        x: 1 - 2 * (yy + zz),
        y: 2 * (xy - zw),
        z: 2 * (xz + yw),
      },
      y: {
        x: 2 * (xy + zw),
        y: 1 - 2 * (xx + zz),
        z: 2 * (yz - xw),
      },
      z: {
        x: 2 * (xz - yw),
        y: 2 * (yz + xw),
        z: 1 - 2 * (xx + yy),
      },
    }
  },

  /** Creates matrix oriented towards direction vector. */
  lookAt(direction: Vector3, up: Vector3 = Vector3.y): Matrix3 {
    const x = Vector3.normalize(direction)
    const y = Vector3.normalize(Vector3.cross(Vector3.normalize(up), x))
    const z = Vector3.normalize(Vector3.cross(x, y))

    return { x, y, z }
  },

  /**
   * Pushes transformation matrix into transform stack.
   * @param stack Matrix stack
   * @param matrix Matrix to be pushed
   * @returns
   */
  push(stack: Matrix3[], matrix: Matrix3) {
    const last = stack.at(-1)
    stack.push((matrix = last ? Matrix3.multiply(matrix, last) : Matrix3.copy(matrix)))
    return matrix
  },

  read(view: BufferView): Matrix3 {
    return {
      x: Vector3.read(view),
      y: Vector3.read(view),
      z: Vector3.read(view),
    }
  },

  write(matrix: Matrix3) {
    return BufferView.join(
      Vector3.write(matrix.x),
      Vector3.write(matrix.y),
      Vector3.write(matrix.z),
    )
  },
}

export default Matrix3
