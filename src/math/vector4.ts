import BufferView from '#/utility/bufferview.js'
import { equal, lerp, random } from './scalar.js'
import type Vector3 from './vector3.js'

/** 4D vector. */
interface Vector4 extends Vector3 {
  w: number
}

const Vector4 = {
  /**
   * Zero vector — the additive identity.
   *
   * Deliberately not named `identity` the way `Vector3.identity` is: `Quat` is an alias of
   * this type and `Quat.identity` is the identity *rotation* `(0, 0, 0, 1)`, so the two names next
   * to each other would read as the same thing and are not.
   */
  zero: { x: 0, y: 0, z: 0, w: 0 } as const,

  x: { x: 1, y: 0, z: 0, w: 0 } as const,
  y: { x: 0, y: 1, z: 0, w: 0 } as const,
  z: { x: 0, y: 0, z: 1, w: 0 } as const,
  w: { x: 0, y: 0, z: 0, w: 1 } as const,

  /** Tests if value is a vector-like object. */
  is(value: unknown): value is Vector4 {
    return (
      value !== null &&
      typeof value === 'object' &&
      'x' in value &&
      'y' in value &&
      'z' in value &&
      'w' in value &&
      typeof value.x === 'number' &&
      typeof value.y === 'number' &&
      typeof value.z === 'number' &&
      typeof value.w === 'number'
    )
  },

  /** Tests if vector has any NaN components. */
  isNaN(vector: Vector4): boolean {
    return (
      Number.isNaN(vector.x) ||
      Number.isNaN(vector.y) ||
      Number.isNaN(vector.z) ||
      Number.isNaN(vector.w)
    )
  },

  /** Tests if vector has finite components. */
  isFinite(vector: Vector4): boolean {
    return (
      Number.isFinite(vector.x) &&
      Number.isFinite(vector.y) &&
      Number.isFinite(vector.z) &&
      Number.isFinite(vector.w)
    )
  },

  /** Tests if two vectors are equal within margin of error. */
  equal(a: Vector4, b: Vector4, epsilon?: number): boolean {
    return (
      equal(a.x, b.x, epsilon) &&
      equal(a.y, b.y, epsilon) &&
      equal(a.z, b.z, epsilon) &&
      equal(a.w, b.w, epsilon)
    )
  },

  /** Calculates dot (scalar) product between two vectors. */
  dot(a: Vector4, b: Vector4): number {
    return a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w
  },

  /** Calculates vector magnitude/length. */
  magnitude(vector: Vector4): number {
    return Math.sqrt(Vector4.dot(vector, vector))
  },

  /** Normalizes vector to unit magnitude/length. */
  normalize(vector: Vector4): Vector4 {
    return Vector4.divideScalar(vector, Vector4.magnitude(vector))
  },

  /** Calculates angle between two vectors. */
  angle(a: Vector4, b: Vector4): number {
    return Math.acos(Vector4.dot(a, b) / (Vector4.magnitude(a) * Vector4.magnitude(b)))
  },

  /** Calculates distance between two vectors. */
  distance(a: Vector4, b: Vector4): number {
    return Vector4.magnitude(Vector4.subtract(a, b))
  },

  /**
   * Creates a copy of vector.
   *
   * `w` defaults to `1`, not `0`: that is both the identity rotation and a homogeneous *point*,
   * which are the two things this type is used for. `Vector4.copy(vector3)` is therefore the lift
   * of a position into homogeneous coordinates.
   */
  copy(vector: Partial<Vector4>): Vector4 {
    const { x = 0, y = 0, z = 0, w = 1 } = vector
    return { x, y, z, w }
  },

  /** Adds two vectors. */
  add(a: Vector4, b: Vector4): Vector4 {
    return {
      x: a.x + b.x,
      y: a.y + b.y,
      z: a.z + b.z,
      w: a.w + b.w,
    }
  },

  /** Adds scalar value to a vector. */
  addScalar(a: Vector4, b: number): Vector4 {
    return {
      x: a.x + b,
      y: a.y + b,
      z: a.z + b,
      w: a.w + b,
    }
  },

  /** Subtracts vector from a vector. */
  subtract(a: Vector4, b: Vector4): Vector4 {
    return {
      x: a.x - b.x,
      y: a.y - b.y,
      z: a.z - b.z,
      w: a.w - b.w,
    }
  },

  /** Subtracts scalar value from a vector. */
  subtractScalar(a: Vector4, b: number): Vector4 {
    return {
      x: a.x - b,
      y: a.y - b,
      z: a.z - b,
      w: a.w - b,
    }
  },

  /** Multiplies two vectors. */
  multiply(a: Vector4, b: Vector4): Vector4 {
    return {
      x: a.x * b.x,
      y: a.y * b.y,
      z: a.z * b.z,
      w: a.w * b.w,
    }
  },

  /** Multiplies vector by a scalar value. */
  multiplyScalar(a: Vector4, b: number): Vector4 {
    return {
      x: a.x * b,
      y: a.y * b,
      z: a.z * b,
      w: a.w * b,
    }
  },

  /** Divides vector by a vector. */
  divide(a: Vector4, b: Vector4): Vector4 {
    return {
      x: a.x / b.x,
      y: a.y / b.y,
      z: a.z / b.z,
      w: a.w / b.w,
    }
  },

  /** Divides vector by a scalar value. */
  divideScalar(a: Vector4, b: number): Vector4 {
    return {
      x: a.x / b,
      y: a.y / b,
      z: a.z / b,
      w: a.w / b,
    }
  },

  /**
   * Perspective divide — `xyz / w`, dropping `w`.
   *
   * The step `Matrix4.transform` leaves to the caller: clip space to normalized device
   * coordinates. A vector with `w = 0` is a direction and has no projection, so the result is
   * infinite by design rather than clamped.
   */
  project(vector: Vector4): Vector3 {
    const { x, y, z, w } = vector
    return { x: x / w, y: y / w, z: z / w }
  },

  /** Calculates linear interpolation between two vectors. */
  lerp(a: Vector4, b: Vector4, t: number): Vector4 {
    return {
      x: lerp(a.x, b.x, t),
      y: lerp(a.y, b.y, t),
      z: lerp(a.z, b.z, t),
      w: lerp(a.w, b.w, t),
    }
  },

  /**
   * Generates uniformly distributed random unit vector by Shoemake's method.
   *
   * Uniform on the unit 3-sphere, which for a unit quaternion is a uniformly distributed random
   * rotation. There is no arc interpolation here to go with it — `Quat.slerp` is the one that
   * handles the double cover, and a second, subtly different one would only be picked by mistake.
   */
  random(): Vector4 {
    const u = random(0, 1)
    const a = random(0, 1) * Math.PI * 2
    const b = random(0, 1) * Math.PI * 2

    const s = Math.sqrt(1 - u)
    const t = Math.sqrt(u)

    return {
      x: s * Math.sin(a),
      y: s * Math.cos(a),
      z: t * Math.sin(b),
      w: t * Math.cos(b),
    }
  },

  /** Reads four `float32` components from a cursor. */
  read(view: BufferView): Vector4 {
    return {
      x: view.readFloat32(),
      y: view.readFloat32(),
      z: view.readFloat32(),
      w: view.readFloat32(),
    }
  },

  /** Writes four `float32` components into a view of its own. */
  write(vector: Vector4) {
    return BufferView.allocate(Float32Array.BYTES_PER_ELEMENT * 4)
      .writeFloat32(vector.x)
      .writeFloat32(vector.y)
      .writeFloat32(vector.z)
      .writeFloat32(vector.w)
  },
}

export default Vector4
