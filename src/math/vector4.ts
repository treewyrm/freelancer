import { equal } from './scalar.js'

/** 4D vector. */
type Vector4 = { x: number; y: number; z: number; w: number }

const Vector4 = {
  /** Tests if value is a vector-like object. */
  is: (value: unknown): value is Vector4 =>
    value !== null &&
    typeof value === 'object' &&
    'x' in value &&
    'y' in value &&
    'z' in value &&
    'w' in value &&
    typeof value.x === 'number' &&
    typeof value.y === 'number' &&
    typeof value.z === 'number' &&
    typeof value.w === 'number',

  /** Tests if vector has any NaN components. */
  isNaN: ({ x, y, z, w }: Vector4): boolean =>
    Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z) || Number.isNaN(w),

  /** Tests if vector has finite components. */
  isFinite: ({ x, y, z, w }: Vector4): boolean =>
    Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) && Number.isFinite(w),

  /** Tests if two vectors are equal within margin of error. */
  equal: (a: Vector4, b: Vector4, epsilon?: number) =>
    equal(a.x, b.x, epsilon) &&
    equal(a.y, b.y, epsilon) &&
    equal(a.z, b.z, epsilon) &&
    equal(a.w, b.w, epsilon),

  copy: ({ x = 0, y = 0, z = 0, w = 1 }: Partial<Vector4>): Vector4 => ({
    x,
    y,
    z,
    w,
  }),

  /** Calculates dot (scalar) product between two quaternions. */
  dot: (a: Vector4, b: Vector4): number => a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w,

  /** Calculates quaternion magnitude/length. */
  magnitude: (q: Vector4): number => Math.sqrt(Vector4.dot(q, q)),

  /** Normalizes quaternion to unit magnitude/length. */
  normalize: (q: Vector4): Vector4 => Vector4.divideScalar(q, Vector4.magnitude(q)),

  add: (a: Vector4, b: Vector4): Vector4 => ({
    x: a.x + b.x,
    y: a.y + b.y,
    z: a.z + b.z,
    w: a.w + b.w,
  }),

  subtract: (a: Vector4, b: Vector4): Vector4 => ({
    x: a.x - b.x,
    y: a.y - b.y,
    z: a.z - b.z,
    w: a.w - b.w,
  }),

  /** Multiplies quaternion by a scalar value. */
  multipyScalar: (a: Vector4, b: number): Vector4 => ({
    x: a.x * b,
    y: a.y * b,
    z: a.z * b,
    w: a.w * b,
  }),

  /** Divides quaternion by a scalar value. */
  divideScalar: (a: Vector4, b: number): Vector4 => ({
    x: a.x / b,
    y: a.y / b,
    z: a.z / b,
    w: a.w / b,
  }),
}

export default Vector4
