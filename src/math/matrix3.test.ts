import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import Matrix3 from './matrix3.js'
import Vector3 from './vector3.js'
import BufferView from '#/utility/bufferview.js'

// Helpers for approximate assertions
const approx = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps
const vecApprox = (a: Vector3, b: Vector3, eps?: number) => Vector3.equal(a, b, eps)
const matApprox = (a: Matrix3, b: Matrix3, eps?: number) => Matrix3.equal(a, b, eps)

// ---------------------------------------------------------------------------
// Matrix3.identity
// ---------------------------------------------------------------------------

describe('Matrix3.identity', () => {
  it('is the 3x3 identity matrix', () => {
    assert.deepEqual(Matrix3.identity, {
      x: { x: 1, y: 0, z: 0 },
      y: { x: 0, y: 1, z: 0 },
      z: { x: 0, y: 0, z: 1 },
    })
  })
})

// ---------------------------------------------------------------------------
// Matrix3.is
// ---------------------------------------------------------------------------

describe('Matrix3.is', () => {
  it('returns true for a valid matrix object', () => {
    assert.equal(Matrix3.is(Matrix3.identity), true)
  })

  it('returns false for null', () => {
    assert.equal(Matrix3.is(null), false)
  })

  it('returns false when a column is not a Vector3', () => {
    assert.equal(Matrix3.is({ x: 1, y: { x: 0, y: 1, z: 0 }, z: { x: 0, y: 0, z: 1 } }), false)
  })

  it('returns false when a column is missing', () => {
    assert.equal(Matrix3.is({ x: Vector3.x, y: Vector3.y }), false)
  })
})

// ---------------------------------------------------------------------------
// Matrix3.isNaN
// ---------------------------------------------------------------------------

describe('Matrix3.isNaN', () => {
  it('returns false for a finite matrix', () => {
    assert.equal(Matrix3.isNaN(Matrix3.identity), false)
  })

  it('returns true when any component is NaN', () => {
    assert.equal(Matrix3.isNaN({ x: { x: NaN, y: 0, z: 0 }, y: Vector3.y, z: Vector3.z }), true)
    assert.equal(Matrix3.isNaN({ x: Vector3.x, y: { x: 0, y: NaN, z: 0 }, z: Vector3.z }), true)
  })
})

// ---------------------------------------------------------------------------
// Matrix3.isFinite
// ---------------------------------------------------------------------------

describe('Matrix3.isFinite', () => {
  it('returns true for a finite matrix', () => {
    assert.equal(Matrix3.isFinite(Matrix3.identity), true)
  })

  it('returns false when any component is Infinity', () => {
    assert.equal(
      Matrix3.isFinite({ x: { x: Infinity, y: 0, z: 0 }, y: Vector3.y, z: Vector3.z }),
      false,
    )
  })
})

// ---------------------------------------------------------------------------
// Matrix3.equal
// ---------------------------------------------------------------------------

describe('Matrix3.equal', () => {
  it('returns true for identical matrices', () => {
    assert.equal(Matrix3.equal(Matrix3.identity, Matrix3.identity), true)
  })

  it('returns true within default epsilon', () => {
    const a = Matrix3.identity
    const b: Matrix3 = {
      x: { x: 1.00005, y: 0, z: 0 },
      y: { x: 0, y: 1.00005, z: 0 },
      z: { x: 0, y: 0, z: 1.00005 },
    }
    assert.equal(Matrix3.equal(a, b), true)
  })

  it('returns false when any component differs beyond epsilon', () => {
    const a = Matrix3.identity
    const b: Matrix3 = { x: { x: 2, y: 0, z: 0 }, y: Vector3.y, z: Vector3.z }
    assert.equal(Matrix3.equal(a, b), false)
  })
})

// ---------------------------------------------------------------------------
// Matrix3.transform
// ---------------------------------------------------------------------------

describe('Matrix3.transform', () => {
  it('identity matrix leaves vector unchanged', () => {
    const v = { x: 1, y: 2, z: 3 }
    assert.deepEqual(Matrix3.transform(v, Matrix3.identity), v)
  })

  it('transforms each axis vector to the corresponding matrix column', () => {
    const m: Matrix3 = {
      x: { x: 1, y: 2, z: 3 },
      y: { x: 4, y: 5, z: 6 },
      z: { x: 7, y: 8, z: 9 },
    }
    assert.deepEqual(Matrix3.transform(Vector3.x, m), m.x)
    assert.deepEqual(Matrix3.transform(Vector3.y, m), m.y)
    assert.deepEqual(Matrix3.transform(Vector3.z, m), m.z)
  })
})

// ---------------------------------------------------------------------------
// Matrix3.copy
// ---------------------------------------------------------------------------

describe('Matrix3.copy', () => {
  it('produces a deep copy', () => {
    const copy = Matrix3.copy(Matrix3.identity)
    assert.deepEqual(copy, Matrix3.identity)
    assert.notEqual(copy, Matrix3.identity)
    assert.notEqual(copy.x, Matrix3.identity.x)
  })

  it('defaults missing columns to identity axes', () => {
    const copy = Matrix3.copy({})
    assert.deepEqual(copy, Matrix3.identity)
  })
})

// ---------------------------------------------------------------------------
// Matrix3.determinant
// ---------------------------------------------------------------------------

describe('Matrix3.determinant', () => {
  it('returns 1 for the identity matrix', () => {
    assert.equal(Matrix3.determinant(Matrix3.identity), 1)
  })

  it('returns the product of diagonal entries for a diagonal matrix', () => {
    const m: Matrix3 = {
      x: { x: 2, y: 0, z: 0 },
      y: { x: 0, y: 3, z: 0 },
      z: { x: 0, y: 0, z: 4 },
    }
    assert.equal(Matrix3.determinant(m), 24)
  })

  it('returns 0 for a singular matrix', () => {
    const m: Matrix3 = {
      x: { x: 1, y: 2, z: 3 },
      y: { x: 4, y: 5, z: 6 },
      z: { x: 7, y: 8, z: 9 },
    }
    assert.ok(approx(Matrix3.determinant(m), 0))
  })

  it('returns -1 for a reflection matrix', () => {
    const reflect: Matrix3 = {
      x: { x: -1, y: 0, z: 0 },
      y: Vector3.y,
      z: Vector3.z,
    }
    assert.equal(Matrix3.determinant(reflect), -1)
  })
})

// ---------------------------------------------------------------------------
// Matrix3.transpose
// ---------------------------------------------------------------------------

describe('Matrix3.transpose', () => {
  it('transpose of identity is identity', () => {
    assert.deepEqual(Matrix3.transpose(Matrix3.identity), Matrix3.identity)
  })

  it('swaps rows and columns', () => {
    const m: Matrix3 = {
      x: { x: 1, y: 2, z: 3 },
      y: { x: 4, y: 5, z: 6 },
      z: { x: 7, y: 8, z: 9 },
    }
    assert.deepEqual(Matrix3.transpose(m), {
      x: { x: 1, y: 4, z: 7 },
      y: { x: 2, y: 5, z: 8 },
      z: { x: 3, y: 6, z: 9 },
    })
  })

  it('double-transpose returns original', () => {
    const m = Matrix3.axisAngle(Vector3.z, Math.PI / 4)
    assert.ok(matApprox(Matrix3.transpose(Matrix3.transpose(m)), m))
  })
})

// ---------------------------------------------------------------------------
// Matrix3.invert
// ---------------------------------------------------------------------------

describe('Matrix3.invert', () => {
  it('invert of identity is identity', () => {
    assert.ok(matApprox(Matrix3.invert(Matrix3.identity), Matrix3.identity))
  })

  it('M * invert(M) ≈ identity', () => {
    const m = Matrix3.axisAngle({ x: 1, y: 1, z: 0 }, Math.PI / 3)
    const result = Matrix3.multiply(m, Matrix3.invert(m))
    assert.ok(matApprox(result, Matrix3.identity))
  })

  it('throws for a singular matrix', () => {
    const singular: Matrix3 = {
      x: { x: 1, y: 2, z: 3 },
      y: { x: 4, y: 5, z: 6 },
      z: { x: 7, y: 8, z: 9 },
    }
    assert.throws(() => Matrix3.invert(singular))
  })
})

// ---------------------------------------------------------------------------
// Matrix3.multiply
// ---------------------------------------------------------------------------

describe('Matrix3.multiply', () => {
  it('identity * identity = identity', () => {
    assert.ok(matApprox(Matrix3.multiply(Matrix3.identity, Matrix3.identity), Matrix3.identity))
  })

  it('M * identity = M', () => {
    const m = Matrix3.axisAngle(Vector3.z, Math.PI / 6)
    assert.ok(matApprox(Matrix3.multiply(m, Matrix3.identity), m))
  })

  it('identity * M = M', () => {
    const m = Matrix3.axisAngle(Vector3.z, Math.PI / 6)
    assert.ok(matApprox(Matrix3.multiply(Matrix3.identity, m), m))
  })

  it('M * invert(M) = identity', () => {
    const m = Matrix3.axisAngle(Vector3.y, Math.PI / 5)
    assert.ok(matApprox(Matrix3.multiply(m, Matrix3.invert(m)), Matrix3.identity))
  })

  it('combining two rotations equals single rotation with summed angles', () => {
    const r1 = Matrix3.axisAngle(Vector3.z, Math.PI / 4)
    const r2 = Matrix3.axisAngle(Vector3.z, Math.PI / 4)
    const combined = Matrix3.multiply(r1, r2)
    const expected = Matrix3.axisAngle(Vector3.z, Math.PI / 2)
    assert.ok(matApprox(combined, expected))
  })
})

// ---------------------------------------------------------------------------
// Matrix3.axisAngle
// ---------------------------------------------------------------------------

describe('Matrix3.axisAngle', () => {
  it('zero angle produces identity matrix', () => {
    assert.ok(matApprox(Matrix3.axisAngle(Vector3.z, 0), Matrix3.identity))
  })

  it('produces an orthogonal matrix (columns are unit vectors)', () => {
    const m = Matrix3.axisAngle(Vector3.z, Math.PI / 3)
    assert.ok(approx(Vector3.magnitude(m.x), 1))
    assert.ok(approx(Vector3.magnitude(m.y), 1))
    assert.ok(approx(Vector3.magnitude(m.z), 1))
  })

  it('produces a rotation matrix with determinant 1', () => {
    const m = Matrix3.axisAngle(Vector3.normalize({ x: 1, y: 1, z: 1 }), Math.PI / 4)
    assert.ok(approx(Matrix3.determinant(m), 1))
  })

  it('2π rotation restores identity', () => {
    const m = Matrix3.axisAngle(Vector3.y, Math.PI * 2)
    assert.ok(matApprox(m, Matrix3.identity))
  })
})

// ---------------------------------------------------------------------------
// Matrix3.fromQuaternion
// ---------------------------------------------------------------------------

describe('Matrix3.fromQuaternion', () => {
  it('identity quaternion (0,0,0,1) produces identity matrix', () => {
    assert.ok(matApprox(Matrix3.fromQuaternion({ x: 0, y: 0, z: 0, w: 1 }), Matrix3.identity))
  })

  it('matches axisAngle for a 90° rotation around z', () => {
    const s = Math.SQRT1_2
    const fromQuat = Matrix3.fromQuaternion({ x: 0, y: 0, z: s, w: s })
    const fromAxis = Matrix3.axisAngle(Vector3.z, Math.PI / 2)
    assert.ok(matApprox(fromQuat, fromAxis))
  })

  it('matches axisAngle for a 90° rotation around x', () => {
    const s = Math.SQRT1_2
    const fromQuat = Matrix3.fromQuaternion({ x: s, y: 0, z: 0, w: s })
    const fromAxis = Matrix3.axisAngle(Vector3.x, Math.PI / 2)
    assert.ok(matApprox(fromQuat, fromAxis))
  })
})

// ---------------------------------------------------------------------------
// Matrix3.lookAt
// ---------------------------------------------------------------------------

describe('Matrix3.lookAt', () => {
  it('produces an orthonormal matrix', () => {
    const m = Matrix3.lookAt(Vector3.z)
    assert.ok(approx(Vector3.magnitude(m.x), 1))
    assert.ok(approx(Vector3.magnitude(m.y), 1))
    assert.ok(approx(Vector3.magnitude(m.z), 1))
    assert.ok(approx(Vector3.dot(m.x, m.y), 0))
    assert.ok(approx(Vector3.dot(m.x, m.z), 0))
  })

  it('x column aligns with the direction vector', () => {
    const dir = Vector3.normalize({ x: 1, y: 0, z: 1 })
    const m = Matrix3.lookAt(dir)
    assert.ok(vecApprox(m.x, dir))
  })

  it('looking along z with default up (y) produces expected axes', () => {
    const m = Matrix3.lookAt(Vector3.z)
    assert.ok(vecApprox(m.x, Vector3.z))
    assert.ok(vecApprox(m.y, Vector3.x))
    assert.ok(vecApprox(m.z, Vector3.y))
  })
})

// ---------------------------------------------------------------------------
// Matrix3.push
// ---------------------------------------------------------------------------

describe('Matrix3.push', () => {
  it('push onto empty stack copies the matrix', () => {
    const stack: Matrix3[] = []
    const m = Matrix3.axisAngle(Vector3.z, Math.PI / 4)
    const result = Matrix3.push(stack, m)
    assert.equal(stack.length, 1)
    assert.ok(matApprox(result, m))
  })

  it('push onto stack with identity returns the pushed matrix', () => {
    const stack: Matrix3[] = [Matrix3.copy(Matrix3.identity)]
    const m = Matrix3.axisAngle(Vector3.y, Math.PI / 3)
    const result = Matrix3.push(stack, m)
    assert.equal(stack.length, 2)
    assert.ok(matApprox(result, m))
  })

  it('stacks combine as multiply(new, last)', () => {
    const r1 = Matrix3.axisAngle(Vector3.z, Math.PI / 4)
    const r2 = Matrix3.axisAngle(Vector3.z, Math.PI / 4)
    const stack: Matrix3[] = []
    Matrix3.push(stack, r1)
    Matrix3.push(stack, r2)
    const expected = Matrix3.axisAngle(Vector3.z, Math.PI / 2)
    assert.ok(matApprox(stack[1]!, expected))
  })
})

// ---------------------------------------------------------------------------
// Matrix3.read / write
// ---------------------------------------------------------------------------

describe('Matrix3.read / write', () => {
  it('round-trips through binary', () => {
    const original = Matrix3.axisAngle({ x: 1, y: 2, z: 3 }, Math.PI / 7)
    const view = Matrix3.write(original)
    view.rewind()
    const result = Matrix3.read(view)
    assert.ok(matApprox(result, original, 0.0001))
  })

  it('write produces a 36-byte buffer (9 × float32)', () => {
    const view = Matrix3.write(Matrix3.identity)
    assert.equal(view.byteLength, 36)
  })

  it('read advances the view offset by 36 bytes', () => {
    const view = BufferView.allocate(72)
    Matrix3.read(view)
    assert.equal(view.offset, 36)
  })
})
