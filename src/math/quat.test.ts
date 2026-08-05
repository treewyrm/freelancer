import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import Quat from './quat.js'
import Vector3 from './vector3.js'
import Vector4 from './vector4.js'

const qApprox = (a: Vector4, b: Vector4, eps = 1e-6) =>
  Vector4.equal(a, b, eps) || Vector4.equal(a, Vector4.multiplyScalar(b, -1), eps)

const qExact = (a: Vector4, b: Vector4, eps = 1e-6) => Vector4.equal(a, b, eps)

const v3Approx = (a: Vector3, b: Vector3, eps = 1e-6) => Vector3.equal(a, b, eps)

// Commonly reused quaternions
const q90Z = Quat.axisAngle({ axis: Vector3.z, angle: Math.PI / 2 })
const q180Z = Quat.axisAngle({ axis: Vector3.z, angle: Math.PI })
const q90X = Quat.axisAngle({ axis: Vector3.x, angle: Math.PI / 2 })

// ---------------------------------------------------------------------------
// Quat.identity
// ---------------------------------------------------------------------------

describe('Quat.identity', () => {
  it('is (0, 0, 0, 1)', () => {
    assert.deepEqual(Quat.identity, { x: 0, y: 0, z: 0, w: 1 })
  })

  it('is a unit quaternion', () => {
    assert.ok(Math.abs(Vector4.magnitude(Quat.identity) - 1) < 1e-10)
  })
})

// ---------------------------------------------------------------------------
// Quat.conjugate
// ---------------------------------------------------------------------------

describe('Quat.conjugate', () => {
  it('negates xyz and keeps w', () => {
    assert.deepEqual(Quat.conjugate({ x: 1, y: 2, z: 3, w: 4 }), { x: -1, y: -2, z: -3, w: 4 })
  })

  it('conjugate of identity is identity', () => {
    assert.ok(qExact(Quat.conjugate(Quat.identity), Quat.identity))
  })

  it('double conjugate returns original quaternion', () => {
    const q = { x: 0.5, y: -0.5, z: 0.5, w: 0.5 }
    assert.deepEqual(Quat.conjugate(Quat.conjugate(q)), q)
  })

  it('q * conj(q) is identity for a unit quaternion', () => {
    const product = Quat.multiply(q90Z, Quat.conjugate(q90Z))
    assert.ok(qExact(product, Quat.identity), `got ${JSON.stringify(product)}`)
  })
})

// ---------------------------------------------------------------------------
// Quat.multiply
// ---------------------------------------------------------------------------

describe('Quat.multiply', () => {
  it('identity * q = q', () => {
    assert.ok(qExact(Quat.multiply(Quat.identity, q90Z), q90Z))
  })

  it('q * identity = q', () => {
    assert.ok(qExact(Quat.multiply(q90Z, Quat.identity), q90Z))
  })

  it('90°-Z × 90°-Z = 180°-Z', () => {
    const result = Quat.multiply(q90Z, q90Z)
    assert.ok(qApprox(result, q180Z), `got ${JSON.stringify(result)}`)
  })

  it('multiplication is not commutative', () => {
    const ab = Quat.multiply(q90Z, q90X)
    const ba = Quat.multiply(q90X, q90Z)
    assert.ok(!qExact(ab, ba))
  })

  it('product of unit quaternions is unit', () => {
    const result = Quat.multiply(q90Z, q90X)
    assert.ok(Math.abs(Vector4.magnitude(result) - 1) < 1e-10)
  })
})

// ---------------------------------------------------------------------------
// Quat.axisAngle
// ---------------------------------------------------------------------------

describe('Quat.axisAngle', () => {
  it('zero angle produces identity', () => {
    const q = Quat.axisAngle({ axis: Vector3.z, angle: 0 })
    assert.ok(qExact(q, Quat.identity), `got ${JSON.stringify(q)}`)
  })

  it('90° around Z gives (0, 0, √½, √½)', () => {
    const s = Math.SQRT1_2
    assert.ok(qExact(q90Z, { x: 0, y: 0, z: s, w: s }), `got ${JSON.stringify(q90Z)}`)
  })

  it('180° around Z gives (0, 0, 1, 0)', () => {
    assert.ok(qApprox(q180Z, { x: 0, y: 0, z: 1, w: 0 }))
  })

  it('result is a unit quaternion', () => {
    const q = Quat.axisAngle({ axis: Vector3.y, angle: Math.PI / 3 })
    assert.ok(Math.abs(Vector4.magnitude(q) - 1) < 1e-10)
  })
})

// ---------------------------------------------------------------------------
// Quat.getAxisAngle
// ---------------------------------------------------------------------------

describe('Quat.getAxisAngle', () => {
  it('identity gives angle ≈ 0', () => {
    const { angle } = Quat.getAxisAngle(Quat.identity)
    assert.ok(Math.abs(angle) < 1e-6, `angle was ${angle}`)
  })

  it('round-trips angle from axisAngle', () => {
    const original = { axis: Vector3.z, angle: Math.PI / 3 }
    const { angle } = Quat.getAxisAngle(Quat.axisAngle(original))
    assert.ok(Math.abs(angle - original.angle) < 1e-6, `got angle ${angle}`)
  })

  it('round-trips axis from axisAngle', () => {
    const original = { axis: Vector3.z, angle: Math.PI / 3 }
    const { axis } = Quat.getAxisAngle(Quat.axisAngle(original))
    assert.ok(v3Approx(axis, original.axis), `got axis ${JSON.stringify(axis)}`)
  })

  it('near-zero angle falls back to X axis', () => {
    const { axis } = Quat.getAxisAngle(Quat.identity)
    assert.ok(v3Approx(axis, Vector3.x), `got axis ${JSON.stringify(axis)}`)
  })
})

// ---------------------------------------------------------------------------
// Quat.fromTo
// ---------------------------------------------------------------------------

describe('Quat.fromTo', () => {
  it('same unit vector → identity', () => {
    const q = Quat.fromTo(Vector3.x, Vector3.x)
    assert.ok(qExact(q, Quat.identity), `got ${JSON.stringify(q)}`)
  })

  it('x → y gives 90° around Z', () => {
    const q = Quat.fromTo(Vector3.x, Vector3.y)
    assert.ok(qApprox(q, q90Z), `got ${JSON.stringify(q)}`)
  })

  it('anti-parallel vectors produce 180° rotation', () => {
    const q = Quat.fromTo(Vector3.x, { x: -1, y: 0, z: 0 })
    const angle = Quat.getAxisAngle(q).angle
    assert.ok(Math.abs(angle - Math.PI) < 1e-5, `angle was ${angle}`)
  })

  it('result transforms `from` into `to`', () => {
    const from = Vector3.normalize({ x: 1, y: 1, z: 0 })
    const to = Vector3.normalize({ x: 0, y: 1, z: 1 })
    const q = Quat.fromTo(from, to)
    const rotated = Vector3.normalize(Quat.transform(from, q))
    assert.ok(v3Approx(rotated, to), `got ${JSON.stringify(rotated)}`)
  })
})

// ---------------------------------------------------------------------------
// Quat.fromEuler
// ---------------------------------------------------------------------------

describe('Quat.fromEuler', () => {
  it('(0, 0, 0) → identity', () => {
    const q = Quat.fromEuler(0, 0, 0)
    assert.ok(qExact(q, Quat.identity), `got ${JSON.stringify(q)}`)
  })

  it('(π/2, 0, 0) → 90° around X', () => {
    const q = Quat.fromEuler(Math.PI / 2, 0, 0)
    assert.ok(qExact(q, q90X), `got ${JSON.stringify(q)}`)
  })

  it('(0, 0, π/2) → 90° around Z', () => {
    const q = Quat.fromEuler(0, 0, Math.PI / 2)
    assert.ok(qApprox(q, q90Z), `got ${JSON.stringify(q)}`)
  })

  it('result is a unit quaternion', () => {
    const q = Quat.fromEuler(0.3, 1.1, -0.7)
    assert.ok(Math.abs(Vector4.magnitude(q) - 1) < 1e-10)
  })
})

// ---------------------------------------------------------------------------
// Quat.fromMatrix
// ---------------------------------------------------------------------------

describe('Quat.fromMatrix', () => {
  it('identity matrix → identity quaternion', () => {
    const q = Quat.fromMatrix({
      x: { x: 1, y: 0, z: 0 },
      y: { x: 0, y: 1, z: 0 },
      z: { x: 0, y: 0, z: 1 },
    })
    assert.ok(qExact(q, Quat.identity), `got ${JSON.stringify(q)}`)
  })

  it('90°-Z rotation matrix → 90°-Z quaternion', () => {
    // Matrix where matrix.x = image of e_x under CW-Z (transpose of CCW-Z)
    const m90Z = {
      x: { x: 0, y: -1, z: 0 },
      y: { x: 1, y: 0, z: 0 },
      z: { x: 0, y: 0, z: 1 },
    }
    const q = Quat.fromMatrix(m90Z)
    assert.ok(qApprox(q, q90Z), `got ${JSON.stringify(q)}`)
  })

  it('result is a unit quaternion', () => {
    const m = {
      x: { x: 0, y: -1, z: 0 },
      y: { x: 1, y: 0, z: 0 },
      z: { x: 0, y: 0, z: 1 },
    }
    const q = Quat.fromMatrix(m)
    assert.ok(Math.abs(Vector4.magnitude(q) - 1) < 1e-10)
  })
})

// ---------------------------------------------------------------------------
// Quat.transform
// ---------------------------------------------------------------------------

describe('Quat.transform', () => {
  it('identity quaternion leaves vector unchanged', () => {
    const v = { x: 1, y: 2, z: 3 }
    const result = Quat.transform(v, Quat.identity)
    assert.ok(v3Approx(result, v), `got ${JSON.stringify(result)}`)
  })

  it('90°-Z rotates x-axis onto y-axis', () => {
    const result = Quat.transform(Vector3.x, q90Z)
    assert.ok(v3Approx(result, Vector3.y), `got ${JSON.stringify(result)}`)
  })

  it('90°-Z rotates y-axis onto -x-axis', () => {
    const result = Quat.transform(Vector3.y, q90Z)
    assert.ok(v3Approx(result, { x: -1, y: 0, z: 0 }), `got ${JSON.stringify(result)}`)
  })

  it('180°-Z rotates x-axis onto -x-axis', () => {
    const result = Quat.transform(Vector3.x, q180Z)
    assert.ok(v3Approx(result, { x: -1, y: 0, z: 0 }), `got ${JSON.stringify(result)}`)
  })

  it('preserves vector magnitude', () => {
    const v = { x: 1, y: 2, z: 3 }
    const result = Quat.transform(v, q90Z)
    assert.ok(Math.abs(Vector3.magnitude(result) - Vector3.magnitude(v)) < 1e-10)
  })
})

// ---------------------------------------------------------------------------
// Quat.nlerp
// ---------------------------------------------------------------------------

describe('Quat.nlerp', () => {
  it('t=0 returns a (normalized)', () => {
    const result = Quat.nlerp(Quat.identity, q90Z, 0)
    assert.ok(qExact(result, Vector4.normalize(Quat.identity)))
  })

  it('t=1 returns b (normalized)', () => {
    const result = Quat.nlerp(Quat.identity, q90Z, 1)
    assert.ok(qExact(result, Vector4.normalize(q90Z)))
  })

  it('result is always a unit quaternion', () => {
    for (const t of [0.25, 0.5, 0.75]) {
      const result = Quat.nlerp(Quat.identity, q90Z, t)
      assert.ok(
        Math.abs(Vector4.magnitude(result) - 1) < 1e-10,
        `t=${t} magnitude ${Vector4.magnitude(result)}`,
      )
    }
  })

  it('negates b when dot product is negative', () => {
    const q = q90Z
    const qNeg = Vector4.multiplyScalar(q, -1)
    const r1 = Quat.nlerp(Quat.identity, q, 0.5)
    const r2 = Quat.nlerp(Quat.identity, qNeg, 0.5)
    assert.ok(qApprox(r1, r2), `nlerp should produce same result regardless of b's sign`)
  })
})

// ---------------------------------------------------------------------------
// Quat.slerp
// ---------------------------------------------------------------------------

describe('Quat.slerp', () => {
  it('t=0 returns a', () => {
    const result = Quat.slerp(Quat.identity, q90Z, 0)
    assert.ok(qExact(result, Quat.identity), `got ${JSON.stringify(result)}`)
  })

  it('t=1 returns b', () => {
    const result = Quat.slerp(Quat.identity, q90Z, 1)
    assert.ok(qExact(result, q90Z), `got ${JSON.stringify(result)}`)
  })

  it('t=0.5 gives 45°-Z midpoint between identity and 90°-Z', () => {
    const result = Quat.slerp(Quat.identity, q90Z, 0.5)
    const expected = Quat.axisAngle({ axis: Vector3.z, angle: Math.PI / 4 })
    assert.ok(qExact(result, expected, 1e-6), `got ${JSON.stringify(result)}`)
  })

  it('falls back to lerp when quaternions are nearly identical', () => {
    const result = Quat.slerp(Quat.identity, Quat.identity, 0.5)
    assert.ok(qExact(result, Quat.identity), `got ${JSON.stringify(result)}`)
  })

  it('negates b when dot product is negative', () => {
    const qNeg = Vector4.multiplyScalar(q90Z, -1)
    const r1 = Quat.slerp(Quat.identity, q90Z, 0.5)
    const r2 = Quat.slerp(Quat.identity, qNeg, 0.5)
    assert.ok(qApprox(r1, r2), `slerp should handle negated b`)
  })
})
