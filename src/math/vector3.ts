import BufferView from '#/utility/bufferview.js'
import { equal, lerp, random } from './scalar.js'

/** 3D vector. */
type Vector3 = { x: number; y: number; z: number }

const Vector3 = {
  x: { x: 1, y: 0, z: 0 } as const,
  y: { x: 0, y: 1, z: 0 } as const,
  z: { x: 0, y: 0, z: 1 } as const,

  is: (value: unknown): value is Vector3 =>
    value !== null &&
    typeof value === 'object' &&
    'x' in value &&
    'y' in value &&
    'z' in value &&
    typeof value.x === 'number' &&
    typeof value.y === 'number' &&
    typeof value.z === 'number',

  isNaN: ({ x, y, z }: Vector3): boolean => Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z),

  isFinite: ({ x, y, z }: Vector3): boolean =>
    Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z),

  equal: (a: Vector3, b: Vector3, epsilon?: number): boolean =>
    equal(a.x, b.x, epsilon) && equal(a.y, b.y, epsilon) && equal(a.z, b.z, epsilon),

  dot: (a: Vector3, b: Vector3): number => a.x * b.x + a.y * b.y + a.z * b.z,

  magnitude: (a: Vector3): number => Math.sqrt(Vector3.dot(a, a)),

  normalize: (a: Vector3): Vector3 => Vector3.divideScalar(a, Vector3.magnitude(a)),

  /** Calculates angle between two vectors. */
  angle: (a: Vector3, b: Vector3): number =>
    Math.acos(Vector3.dot(a, b) / (Vector3.magnitude(a) * Vector3.magnitude(b))),

  /** Calculates distance between two vectors. */
  distance: (a: Vector3, b: Vector3): number => Vector3.magnitude(Vector3.subtract(a, b)),

  /** Creates a copy of vector. */
  copy: ({ x = 0, y = 0, z = 0 }: Partial<Vector3>): Vector3 => ({ x, y, z }),

  /** Adds two vectors. */
  add: (a: Vector3, b: Vector3): Vector3 => ({
    x: a.x + b.x,
    y: a.y + b.y,
    z: a.z + b.z,
  }),

  /** Adds scalar value to a vector. */
  addScalar: (a: Vector3, b: number): Vector3 => ({
    x: a.x + b,
    y: a.y + b,
    z: a.z + b,
  }),

  /** Subtracts vector from a vector. */
  subtract: (a: Vector3, b: Vector3): Vector3 => ({
    x: a.x - b.x,
    y: a.y - b.y,
    z: a.z - b.z,
  }),

  /** Subtracts scalar value from a vector. */
  subtractScalar: (a: Vector3, b: number): Vector3 => ({
    x: a.x - b,
    y: a.y - b,
    z: a.z - b,
  }),

  /** Multiplies two vectors. */
  multiply: (a: Vector3, b: Vector3): Vector3 => ({
    x: a.x * b.x,
    y: a.y * b.y,
    z: a.z * b.z,
  }),

  /** Multiplies vector by a scalar value. */
  multiplyScalar: (a: Vector3, b: number): Vector3 => ({
    x: a.x * b,
    y: a.y * b,
    z: a.z * b,
  }),

  /** Divides vector by a vector. */
  divide: (a: Vector3, b: Vector3): Vector3 => ({
    x: a.x / b.x,
    y: a.y / b.y,
    z: a.z / b.z,
  }),

  /** Divides vector by a scalar value. */
  divideScalar: (a: Vector3, b: number): Vector3 => ({
    x: a.x / b,
    y: a.y / b,
    z: a.z / b,
  }),

  /** Calculates cross (vector) product. */
  cross: (a: Vector3, b: Vector3): Vector3 => ({
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }),

  /** Calculates linear interpolation between two vectors. */
  lerp: (a: Vector3, b: Vector3, t: number): Vector3 => ({
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    z: lerp(a.z, b.z, t),
  }),

  /** Calculates arc linear interpolation between two vectors. */
  slerp: (a: Vector3, b: Vector3, t: number): Vector3 => {
    if (t < 0.01) return Vector3.lerp(a, b, t)

    a = Vector3.normalize(a)
    b = Vector3.normalize(b)

    const k = Vector3.angle(a, b)
    const s = Math.sin(k)

    const u = Math.sin((1 - t) * k) / s
    const v = Math.sin(t * k) / s

    return {
      x: a.x * u + b.x * v,
      y: a.y * u + b.y * v,
      z: a.z * u + b.z * v,
    }
  },

  /** Generates uniformly distributed random unit vector. */
  random: (): Vector3 => {
    const a = Math.acos(random(-1, 1))
    const b = random(0, 1) * Math.PI * 2

    return {
      x: Math.sin(a) * Math.cos(b),
      y: Math.sin(a) * Math.sin(b),
      z: Math.cos(a),
    }
  },

  /** Point on unit sphere. */
  sphere: (phi: number, theta: number): Vector3 => ({
    x: Math.cos(phi) * Math.sin(theta),
    y: Math.cos(theta),
    z: Math.sin(phi) * Math.sin(theta),
  }),

  read: (view: BufferView): Vector3 => ({
    x: view.readFloat32(),
    y: view.readFloat32(),
    z: view.readFloat32(),
  }),

  write: ({ x, y, z }: Vector3) =>
    BufferView.allocate(Float32Array.BYTES_PER_ELEMENT * 3)
      .writeFloat32(x)
      .writeFloat32(y)
      .writeFloat32(z),
}

export default Vector3
