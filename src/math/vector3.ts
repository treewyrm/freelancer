import BufferView from '#/utility/bufferview.js'
import { equal, lerp, random } from './scalar.js'

/** 3D vector. */
interface Vector3 {
  x: number
  y: number
  z: number
}

const Vector3 = {
  zero: { x: 0, y: 0, z: 0 } as const,

  x: { x: 1, y: 0, z: 0 } as const,
  y: { x: 0, y: 1, z: 0 } as const,
  z: { x: 0, y: 0, z: 1 } as const,

  is(value: unknown): value is Vector3 {
    return (
      value !== null &&
      typeof value === 'object' &&
      'x' in value &&
      'y' in value &&
      'z' in value &&
      typeof value.x === 'number' &&
      typeof value.y === 'number' &&
      typeof value.z === 'number'
    )
  },

  isNaN(vector: Vector3): boolean {
    return Number.isNaN(vector.x) || Number.isNaN(vector.y) || Number.isNaN(vector.z)
  },

  isFinite(vector: Vector3): boolean {
    return Number.isFinite(vector.x) && Number.isFinite(vector.y) && Number.isFinite(vector.z)
  },

  equal(a: Vector3, b: Vector3, e?: number): boolean {
    return equal(a.x, b.x, e) && equal(a.y, b.y, e) && equal(a.z, b.z, e)
  },

  dot(a: Vector3, b: Vector3): number {
    return a.x * b.x + a.y * b.y + a.z * b.z
  },

  magnitude(vector: Vector3): number {
    return Math.sqrt(Vector3.dot(vector, vector))
  },

  normalize(vector: Vector3): Vector3 {
    return Vector3.divideScalar(vector, Vector3.magnitude(vector))
  },

  /** Calculates angle between two vectors. */
  angle(a: Vector3, b: Vector3): number {
    return Math.acos(Vector3.dot(a, b) / (Vector3.magnitude(a) * Vector3.magnitude(b)))
  },

  /** Calculates distance between two vectors. */
  distance(a: Vector3, b: Vector3): number {
    return Vector3.magnitude(Vector3.subtract(a, b))
  },

  /** Creates a copy of vector. */
  copy(vector: Partial<Vector3>): Vector3 {
    const { x = 0, y = 0, z = 0 } = vector
    return { x, y, z }
  },

  /** Adds two vectors. */
  add(a: Vector3, b: Vector3): Vector3 {
    return {
      x: a.x + b.x,
      y: a.y + b.y,
      z: a.z + b.z,
    }
  },

  /** Adds scalar value to a vector. */
  addScalar(a: Vector3, b: number): Vector3 {
    return {
      x: a.x + b,
      y: a.y + b,
      z: a.z + b,
    }
  },

  /** Subtracts vector from a vector. */
  subtract(a: Vector3, b: Vector3): Vector3 {
    return {
      x: a.x - b.x,
      y: a.y - b.y,
      z: a.z - b.z,
    }
  },

  /** Subtracts scalar value from a vector. */
  subtractScalar(a: Vector3, b: number): Vector3 {
    return {
      x: a.x - b,
      y: a.y - b,
      z: a.z - b,
    }
  },

  /** Multiplies two vectors. */
  multiply(a: Vector3, b: Vector3): Vector3 {
    return {
      x: a.x * b.x,
      y: a.y * b.y,
      z: a.z * b.z,
    }
  },

  /** Multiplies vector by a scalar value. */
  multiplyScalar(a: Vector3, b: number): Vector3 {
    return {
      x: a.x * b,
      y: a.y * b,
      z: a.z * b,
    }
  },

  /** Divides vector by a vector. */
  divide(a: Vector3, b: Vector3): Vector3 {
    return {
      x: a.x / b.x,
      y: a.y / b.y,
      z: a.z / b.z,
    }
  },

  /** Divides vector by a scalar value. */
  divideScalar(a: Vector3, b: number): Vector3 {
    return {
      x: a.x / b,
      y: a.y / b,
      z: a.z / b,
    }
  },

  /** Calculates cross (vector) product. */
  cross(a: Vector3, b: Vector3): Vector3 {
    return {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x,
    }
  },

  /** Calculates linear interpolation between two vectors. */
  lerp(a: Vector3, b: Vector3, t: number): Vector3 {
    return {
      x: lerp(a.x, b.x, t),
      y: lerp(a.y, b.y, t),
      z: lerp(a.z, b.z, t),
    }
  },

  /** Calculates arc linear interpolation between two vectors. */
  slerp(a: Vector3, b: Vector3, t: number): Vector3 {
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
  random(): Vector3 {
    const a = Math.acos(random(-1, 1))
    const b = random(0, 1) * Math.PI * 2

    return {
      x: Math.sin(a) * Math.cos(b),
      y: Math.sin(a) * Math.sin(b),
      z: Math.cos(a),
    }
  },

  /** Point on unit sphere. */
  sphere(phi: number, theta: number): Vector3 {
    return {
      x: Math.cos(phi) * Math.sin(theta),
      y: Math.cos(theta),
      z: Math.sin(phi) * Math.sin(theta),
    }
  },

  read(view: BufferView): Vector3 {
    return {
      x: view.readFloat32(),
      y: view.readFloat32(),
      z: view.readFloat32(),
    }
  },

  write(vector: Vector3) {
    return BufferView.allocate(Float32Array.BYTES_PER_ELEMENT * 3)
      .writeFloat32(vector.x)
      .writeFloat32(vector.y)
      .writeFloat32(vector.z)
  },
}

export default Vector3
