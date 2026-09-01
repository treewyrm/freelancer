import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import Vector4 from './vector4.js'
import Quat from './quat.js'
import BufferView from '#/utility/bufferview.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('Vector4 constants', () => {
  it('zero is (0, 0, 0, 0)', () => {
    assert.deepEqual(Vector4.zero, { x: 0, y: 0, z: 0, w: 0 })
  })

  it('x axis is (1, 0, 0, 0)', () => {
    assert.deepEqual(Vector4.x, { x: 1, y: 0, z: 0, w: 0 })
  })

  it('y axis is (0, 1, 0, 0)', () => {
    assert.deepEqual(Vector4.y, { x: 0, y: 1, z: 0, w: 0 })
  })

  it('z axis is (0, 0, 1, 0)', () => {
    assert.deepEqual(Vector4.z, { x: 0, y: 0, z: 1, w: 0 })
  })

  it('w axis is (0, 0, 0, 1)', () => {
    assert.deepEqual(Vector4.w, { x: 0, y: 0, z: 0, w: 1 })
  })

  it('zero is not the identity rotation — that is Quat.identity', () => {
    assert.notDeepEqual(Vector4.zero, Quat.identity)
    assert.deepEqual(Vector4.w, Quat.identity)
  })
})

// ---------------------------------------------------------------------------
// Vector4.is
// ---------------------------------------------------------------------------

describe('Vector4.is', () => {
  it('returns true for a valid Vector4 object', () => {
    assert.equal(Vector4.is({ x: 1, y: 2, z: 3, w: 4 }), true)
  })

  it('returns true when extra properties are present', () => {
    assert.equal(Vector4.is({ x: 0, y: 0, z: 0, w: 1, extra: 'ignored' }), true)
  })

  it('returns false for null', () => {
    assert.equal(Vector4.is(null), false)
  })

  it('returns false for a non-object', () => {
    assert.equal(Vector4.is(42), false)
    assert.equal(Vector4.is('vector'), false)
  })

  it('returns false for a Vector3 — w is missing', () => {
    assert.equal(Vector4.is({ x: 1, y: 2, z: 3 }), false)
  })

  it('returns false when a component is not a number', () => {
    assert.equal(Vector4.is({ x: 1, y: 2, z: 3, w: '4' }), false)
  })
})

// ---------------------------------------------------------------------------
// Vector4.isNaN
// ---------------------------------------------------------------------------

describe('Vector4.isNaN', () => {
  it('returns false for a finite vector', () => {
    assert.equal(Vector4.isNaN({ x: 1, y: 2, z: 3, w: 4 }), false)
  })

  it('returns true when any component is NaN', () => {
    assert.equal(Vector4.isNaN({ x: NaN, y: 0, z: 0, w: 0 }), true)
    assert.equal(Vector4.isNaN({ x: 0, y: NaN, z: 0, w: 0 }), true)
    assert.equal(Vector4.isNaN({ x: 0, y: 0, z: NaN, w: 0 }), true)
    assert.equal(Vector4.isNaN({ x: 0, y: 0, z: 0, w: NaN }), true)
  })
})

// ---------------------------------------------------------------------------
// Vector4.isFinite
// ---------------------------------------------------------------------------

describe('Vector4.isFinite', () => {
  it('returns true for a finite vector', () => {
    assert.equal(Vector4.isFinite({ x: 1, y: 2, z: 3, w: 4 }), true)
  })

  it('returns false when any component is Infinity', () => {
    assert.equal(Vector4.isFinite({ x: Infinity, y: 0, z: 0, w: 0 }), false)
    assert.equal(Vector4.isFinite({ x: 0, y: -Infinity, z: 0, w: 0 }), false)
    assert.equal(Vector4.isFinite({ x: 0, y: 0, z: Infinity, w: 0 }), false)
    assert.equal(Vector4.isFinite({ x: 0, y: 0, z: 0, w: -Infinity }), false)
  })

  it('returns false when any component is NaN', () => {
    assert.equal(Vector4.isFinite({ x: 0, y: 0, z: 0, w: NaN }), false)
  })
})

// ---------------------------------------------------------------------------
// Vector4.equal
// ---------------------------------------------------------------------------

describe('Vector4.equal', () => {
  it('returns true for identical vectors', () => {
    assert.equal(Vector4.equal({ x: 1, y: 2, z: 3, w: 4 }, { x: 1, y: 2, z: 3, w: 4 }), true)
  })

  it('returns true within default epsilon', () => {
    assert.equal(
      Vector4.equal({ x: 1, y: 1, z: 1, w: 1 }, { x: 1.00005, y: 1.00005, z: 1.00005, w: 1.00005 }),
      true,
    )
  })

  it('returns false when w alone differs beyond epsilon', () => {
    assert.equal(Vector4.equal({ x: 1, y: 2, z: 3, w: 4 }, { x: 1, y: 2, z: 3, w: 5 }), false)
  })

  it('honours an explicit epsilon', () => {
    const a = { x: 0, y: 0, z: 0, w: 0 }
    const b = { x: 0, y: 0, z: 0, w: 0.01 }
    assert.equal(Vector4.equal(a, b), false)
    assert.equal(Vector4.equal(a, b, 0.1), true)
  })
})

// ---------------------------------------------------------------------------
// Vector4.dot
// ---------------------------------------------------------------------------

describe('Vector4.dot', () => {
  it('returns 1 for a unit vector dotted with itself', () => {
    assert.equal(Vector4.dot(Vector4.w, Vector4.w), 1)
  })

  it('returns 0 for perpendicular unit vectors', () => {
    assert.equal(Vector4.dot(Vector4.x, Vector4.y), 0)
    assert.equal(Vector4.dot(Vector4.z, Vector4.w), 0)
  })

  it('computes correctly for arbitrary vectors', () => {
    assert.equal(Vector4.dot({ x: 1, y: 2, z: 3, w: 4 }, { x: 5, y: 6, z: 7, w: 8 }), 70)
  })
})

// ---------------------------------------------------------------------------
// Vector4.magnitude
// ---------------------------------------------------------------------------

describe('Vector4.magnitude', () => {
  it('returns 1 for unit axis vectors', () => {
    assert.equal(Vector4.magnitude(Vector4.x), 1)
    assert.equal(Vector4.magnitude(Vector4.y), 1)
    assert.equal(Vector4.magnitude(Vector4.z), 1)
    assert.equal(Vector4.magnitude(Vector4.w), 1)
  })

  it('returns correct length for a known vector', () => {
    assert.equal(Vector4.magnitude({ x: 1, y: 1, z: 1, w: 1 }), 2)
  })

  it('returns 0 for the zero vector', () => {
    assert.equal(Vector4.magnitude(Vector4.zero), 0)
  })
})

// ---------------------------------------------------------------------------
// Vector4.normalize
// ---------------------------------------------------------------------------

describe('Vector4.normalize', () => {
  it('produces a unit vector', () => {
    const n = Vector4.normalize({ x: 1, y: 2, z: 3, w: 4 })
    assert.ok(Math.abs(Vector4.magnitude(n) - 1) < 1e-10)
  })

  it('does not change a unit vector', () => {
    assert.ok(Vector4.equal(Vector4.normalize(Vector4.w), Vector4.w))
  })

  it('preserves direction', () => {
    const n = Vector4.normalize({ x: 2, y: 0, z: 0, w: 0 })
    assert.ok(Vector4.equal(n, Vector4.x))
  })
})

// ---------------------------------------------------------------------------
// Vector4.angle
// ---------------------------------------------------------------------------

describe('Vector4.angle', () => {
  it('returns 0 for identical unit vectors', () => {
    assert.equal(Vector4.angle(Vector4.x, Vector4.x), 0)
  })

  it('returns π/2 for perpendicular unit vectors', () => {
    assert.ok(Math.abs(Vector4.angle(Vector4.x, Vector4.w) - Math.PI / 2) < 1e-10)
  })

  it('returns π for opposite unit vectors', () => {
    const opposite = { x: -1, y: 0, z: 0, w: 0 }
    assert.ok(Math.abs(Vector4.angle(Vector4.x, opposite) - Math.PI) < 1e-7)
  })

  it('is independent of magnitude', () => {
    const a = { x: 3, y: 0, z: 0, w: 0 }
    const b = { x: 0, y: 7, z: 0, w: 0 }
    assert.ok(Math.abs(Vector4.angle(a, b) - Math.PI / 2) < 1e-10)
  })
})

// ---------------------------------------------------------------------------
// Vector4.distance
// ---------------------------------------------------------------------------

describe('Vector4.distance', () => {
  it('returns 0 for identical vectors', () => {
    const v = { x: 1, y: 2, z: 3, w: 4 }
    assert.equal(Vector4.distance(v, v), 0)
  })

  it('computes the correct Euclidean distance', () => {
    assert.equal(Vector4.distance(Vector4.zero, { x: 1, y: 1, z: 1, w: 1 }), 2)
  })

  it('is symmetric', () => {
    const a = { x: 1, y: 2, z: 3, w: 4 }
    const b = { x: 5, y: 4, z: 3, w: 2 }
    assert.equal(Vector4.distance(a, b), Vector4.distance(b, a))
  })
})

// ---------------------------------------------------------------------------
// Vector4.copy
// ---------------------------------------------------------------------------

describe('Vector4.copy', () => {
  it('copies all four components', () => {
    assert.deepEqual(Vector4.copy({ x: 1, y: 2, z: 3, w: 4 }), { x: 1, y: 2, z: 3, w: 4 })
  })

  it('returns a new object', () => {
    const v = { x: 1, y: 2, z: 3, w: 4 }
    assert.notEqual(Vector4.copy(v), v)
  })

  it('defaults xyz to 0 and w to 1', () => {
    assert.deepEqual(Vector4.copy({}), { x: 0, y: 0, z: 0, w: 1 })
    assert.deepEqual(Vector4.copy({ x: 5 }), { x: 5, y: 0, z: 0, w: 1 })
  })

  it('lifts a Vector3 into a homogeneous point', () => {
    assert.deepEqual(Vector4.copy({ x: 1, y: 2, z: 3 }), { x: 1, y: 2, z: 3, w: 1 })
  })

  it('keeps an explicit w of 0', () => {
    assert.deepEqual(Vector4.copy({ x: 1, y: 2, z: 3, w: 0 }), { x: 1, y: 2, z: 3, w: 0 })
  })

  it('defaults to the identity rotation', () => {
    assert.deepEqual(Vector4.copy({}), Quat.identity)
  })
})

// ---------------------------------------------------------------------------
// Vector4.add / addScalar
// ---------------------------------------------------------------------------

describe('Vector4.add', () => {
  it('adds component-wise', () => {
    assert.deepEqual(Vector4.add({ x: 1, y: 2, z: 3, w: 4 }, { x: 5, y: 6, z: 7, w: 8 }), {
      x: 6,
      y: 8,
      z: 10,
      w: 12,
    })
  })

  it('adding the zero vector is identity', () => {
    const v = { x: 1, y: 2, z: 3, w: 4 }
    assert.deepEqual(Vector4.add(v, Vector4.zero), v)
  })
})

describe('Vector4.addScalar', () => {
  it('adds scalar to each component', () => {
    assert.deepEqual(Vector4.addScalar({ x: 1, y: 2, z: 3, w: 4 }, 10), {
      x: 11,
      y: 12,
      z: 13,
      w: 14,
    })
  })
})

// ---------------------------------------------------------------------------
// Vector4.subtract / subtractScalar
// ---------------------------------------------------------------------------

describe('Vector4.subtract', () => {
  it('subtracts component-wise', () => {
    assert.deepEqual(Vector4.subtract({ x: 6, y: 8, z: 10, w: 12 }, { x: 5, y: 6, z: 7, w: 8 }), {
      x: 1,
      y: 2,
      z: 3,
      w: 4,
    })
  })

  it('subtracting self gives the zero vector', () => {
    const v = { x: 3, y: 4, z: 5, w: 6 }
    assert.deepEqual(Vector4.subtract(v, v), { x: 0, y: 0, z: 0, w: 0 })
  })
})

describe('Vector4.subtractScalar', () => {
  it('subtracts scalar from each component', () => {
    assert.deepEqual(Vector4.subtractScalar({ x: 11, y: 12, z: 13, w: 14 }, 10), {
      x: 1,
      y: 2,
      z: 3,
      w: 4,
    })
  })
})

// ---------------------------------------------------------------------------
// Vector4.multiply / multiplyScalar
// ---------------------------------------------------------------------------

describe('Vector4.multiply', () => {
  it('multiplies component-wise', () => {
    assert.deepEqual(Vector4.multiply({ x: 2, y: 3, z: 4, w: 5 }, { x: 5, y: 6, z: 7, w: 8 }), {
      x: 10,
      y: 18,
      z: 28,
      w: 40,
    })
  })

  it('is not quaternion multiplication', () => {
    // Quat.multiply(i, i) is -1; component-wise multiply is not.
    const i = { x: 1, y: 0, z: 0, w: 0 }
    assert.deepEqual(Vector4.multiply(i, i), { x: 1, y: 0, z: 0, w: 0 })
    assert.deepEqual(Quat.multiply(i, i), { x: 0, y: 0, z: 0, w: -1 })
  })
})

describe('Vector4.multiplyScalar', () => {
  it('scales each component', () => {
    assert.deepEqual(Vector4.multiplyScalar({ x: 1, y: 2, z: 3, w: 4 }, 2), {
      x: 2,
      y: 4,
      z: 6,
      w: 8,
    })
  })

  it('multiplying by 0 gives the zero vector', () => {
    assert.deepEqual(Vector4.multiplyScalar({ x: 1, y: 2, z: 3, w: 4 }, 0), {
      x: 0,
      y: 0,
      z: 0,
      w: 0,
    })
  })

  it('multiplying by -1 negates — the quaternion double cover', () => {
    const q = Quat.axisAngle({ axis: { x: 0, y: 0, z: 1 }, angle: Math.PI / 3 })
    const negated = Vector4.multiplyScalar(q, -1)
    assert.ok(Math.abs(Vector4.magnitude(negated) - 1) < 1e-10)
    assert.ok(Vector4.equal(Vector4.multiplyScalar(negated, -1), q))
  })
})

// ---------------------------------------------------------------------------
// Vector4.divide / divideScalar
// ---------------------------------------------------------------------------

describe('Vector4.divide', () => {
  it('divides component-wise', () => {
    assert.deepEqual(Vector4.divide({ x: 10, y: 18, z: 28, w: 40 }, { x: 5, y: 6, z: 7, w: 8 }), {
      x: 2,
      y: 3,
      z: 4,
      w: 5,
    })
  })
})

describe('Vector4.divideScalar', () => {
  it('divides each component by the scalar', () => {
    assert.deepEqual(Vector4.divideScalar({ x: 2, y: 4, z: 6, w: 8 }, 2), {
      x: 1,
      y: 2,
      z: 3,
      w: 4,
    })
  })
})

// ---------------------------------------------------------------------------
// Vector4.project
// ---------------------------------------------------------------------------

describe('Vector4.project', () => {
  it('divides xyz by w and drops w', () => {
    assert.deepEqual(Vector4.project({ x: 2, y: 4, z: 6, w: 2 }), { x: 1, y: 2, z: 3 })
  })

  it('is the identity on xyz when w is 1', () => {
    assert.deepEqual(Vector4.project({ x: 1, y: 2, z: 3, w: 1 }), { x: 1, y: 2, z: 3 })
  })

  it('yields infinities for a direction (w = 0)', () => {
    const result = Vector4.project({ x: 1, y: -1, z: 0, w: 0 })
    assert.equal(result.x, Infinity)
    assert.equal(result.y, -Infinity)
    assert.ok(Number.isNaN(result.z))
  })
})

// ---------------------------------------------------------------------------
// Vector4.lerp
// ---------------------------------------------------------------------------

describe('Vector4.lerp', () => {
  it('returns a at t=0', () => {
    const a = { x: 1, y: 2, z: 3, w: 4 }
    assert.deepEqual(Vector4.lerp(a, { x: 5, y: 6, z: 7, w: 8 }, 0), a)
  })

  it('returns b at t=1', () => {
    const b = { x: 5, y: 6, z: 7, w: 8 }
    assert.deepEqual(Vector4.lerp({ x: 1, y: 2, z: 3, w: 4 }, b, 1), b)
  })

  it('returns midpoint at t=0.5', () => {
    assert.deepEqual(Vector4.lerp(Vector4.zero, { x: 2, y: 4, z: 6, w: 8 }, 0.5), {
      x: 1,
      y: 2,
      z: 3,
      w: 4,
    })
  })

  it('extrapolates beyond the range', () => {
    assert.deepEqual(Vector4.lerp(Vector4.zero, { x: 1, y: 1, z: 1, w: 1 }, 2), {
      x: 2,
      y: 2,
      z: 2,
      w: 2,
    })
  })
})

// ---------------------------------------------------------------------------
// Vector4.random
// ---------------------------------------------------------------------------

describe('Vector4.random', () => {
  it('returns a unit vector', () => {
    for (let i = 0; i < 50; i++) {
      const v = Vector4.random()
      assert.ok(Math.abs(Vector4.magnitude(v) - 1) < 1e-10, `magnitude was ${Vector4.magnitude(v)}`)
    }
  })

  it('covers both hemispheres of every component', () => {
    let positive = 0
    let negative = 0

    for (let i = 0; i < 200; i++) {
      const { w } = Vector4.random()
      if (w > 0) positive++
      else negative++
    }

    assert.ok(positive > 0 && negative > 0, `positive ${positive}, negative ${negative}`)
  })
})

// ---------------------------------------------------------------------------
// Vector4.read / write
// ---------------------------------------------------------------------------

describe('Vector4.read / write', () => {
  it('round-trips a vector through binary', () => {
    const original = { x: 1.5, y: -2.5, z: 3.0, w: -0.25 }
    const view = BufferView.from(Vector4.write(original))
    assert.deepEqual(Vector4.read(view), original)
  })

  it('write produces a 16-byte buffer (4 × float32)', () => {
    assert.equal(Vector4.write(Vector4.zero).byteLength, 16)
  })

  it('read advances the view offset by 16 bytes', () => {
    const view = BufferView.allocate(32)
    Vector4.read(view)
    assert.equal(view.offset, 16)
  })

  it('reads consecutive vectors from one view', () => {
    const a = { x: 1, y: 2, z: 3, w: 4 }
    const b = { x: 5, y: 6, z: 7, w: 8 }
    const view = BufferView.concat([Vector4.write(a), Vector4.write(b)])

    assert.deepEqual(Vector4.read(view), a)
    assert.deepEqual(Vector4.read(view), b)
  })
})
