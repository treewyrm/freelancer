import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import Vector3 from './vector3.js'
import BufferView from '#/utility/bufferview.js'

// ---------------------------------------------------------------------------
// Axis constants
// ---------------------------------------------------------------------------

describe('Vector3 axis constants', () => {
  it('x axis is (1, 0, 0)', () => {
    assert.deepEqual(Vector3.x, { x: 1, y: 0, z: 0 })
  })

  it('y axis is (0, 1, 0)', () => {
    assert.deepEqual(Vector3.y, { x: 0, y: 1, z: 0 })
  })

  it('z axis is (0, 0, 1)', () => {
    assert.deepEqual(Vector3.z, { x: 0, y: 0, z: 1 })
  })
})

// ---------------------------------------------------------------------------
// Vector3.is
// ---------------------------------------------------------------------------

describe('Vector3.is', () => {
  it('returns true for a valid Vector3 object', () => {
    assert.equal(Vector3.is({ x: 1, y: 2, z: 3 }), true)
  })

  it('returns true when extra properties are present', () => {
    assert.equal(Vector3.is({ x: 0, y: 0, z: 0, w: 1 }), true)
  })

  it('returns false for null', () => {
    assert.equal(Vector3.is(null), false)
  })

  it('returns false for a non-object', () => {
    assert.equal(Vector3.is(42), false)
    assert.equal(Vector3.is('vector'), false)
  })

  it('returns false when a component is missing', () => {
    assert.equal(Vector3.is({ x: 1, y: 2 }), false)
  })

  it('returns false when a component is not a number', () => {
    assert.equal(Vector3.is({ x: 1, y: 2, z: '3' }), false)
  })
})

// ---------------------------------------------------------------------------
// Vector3.isNaN
// ---------------------------------------------------------------------------

describe('Vector3.isNaN', () => {
  it('returns false for a finite vector', () => {
    assert.equal(Vector3.isNaN({ x: 1, y: 2, z: 3 }), false)
  })

  it('returns true when any component is NaN', () => {
    assert.equal(Vector3.isNaN({ x: NaN, y: 0, z: 0 }), true)
    assert.equal(Vector3.isNaN({ x: 0, y: NaN, z: 0 }), true)
    assert.equal(Vector3.isNaN({ x: 0, y: 0, z: NaN }), true)
  })
})

// ---------------------------------------------------------------------------
// Vector3.isFinite
// ---------------------------------------------------------------------------

describe('Vector3.isFinite', () => {
  it('returns true for a finite vector', () => {
    assert.equal(Vector3.isFinite({ x: 1, y: 2, z: 3 }), true)
  })

  it('returns false when any component is Infinity', () => {
    assert.equal(Vector3.isFinite({ x: Infinity, y: 0, z: 0 }), false)
    assert.equal(Vector3.isFinite({ x: 0, y: -Infinity, z: 0 }), false)
    assert.equal(Vector3.isFinite({ x: 0, y: 0, z: Infinity }), false)
  })

  it('returns false when any component is NaN', () => {
    assert.equal(Vector3.isFinite({ x: NaN, y: 0, z: 0 }), false)
  })
})

// ---------------------------------------------------------------------------
// Vector3.equal
// ---------------------------------------------------------------------------

describe('Vector3.equal', () => {
  it('returns true for identical vectors', () => {
    assert.equal(Vector3.equal({ x: 1, y: 2, z: 3 }, { x: 1, y: 2, z: 3 }), true)
  })

  it('returns true within default epsilon', () => {
    assert.equal(Vector3.equal({ x: 1, y: 1, z: 1 }, { x: 1.00005, y: 1.00005, z: 1.00005 }), true)
  })

  it('returns false when any component differs beyond epsilon', () => {
    assert.equal(Vector3.equal({ x: 1, y: 2, z: 3 }, { x: 1, y: 2, z: 4 }), false)
  })
})

// ---------------------------------------------------------------------------
// Vector3.dot
// ---------------------------------------------------------------------------

describe('Vector3.dot', () => {
  it('returns 1 for a unit vector dotted with itself', () => {
    assert.equal(Vector3.dot(Vector3.x, Vector3.x), 1)
  })

  it('returns 0 for perpendicular unit vectors', () => {
    assert.equal(Vector3.dot(Vector3.x, Vector3.y), 0)
    assert.equal(Vector3.dot(Vector3.y, Vector3.z), 0)
  })

  it('computes correctly for arbitrary vectors', () => {
    assert.equal(Vector3.dot({ x: 1, y: 2, z: 3 }, { x: 4, y: 5, z: 6 }), 32)
  })
})

// ---------------------------------------------------------------------------
// Vector3.magnitude
// ---------------------------------------------------------------------------

describe('Vector3.magnitude', () => {
  it('returns 1 for unit axis vectors', () => {
    assert.equal(Vector3.magnitude(Vector3.x), 1)
    assert.equal(Vector3.magnitude(Vector3.y), 1)
    assert.equal(Vector3.magnitude(Vector3.z), 1)
  })

  it('returns correct length for a known vector', () => {
    assert.equal(Vector3.magnitude({ x: 3, y: 4, z: 0 }), 5)
  })

  it('returns 0 for the zero vector', () => {
    assert.equal(Vector3.magnitude({ x: 0, y: 0, z: 0 }), 0)
  })
})

// ---------------------------------------------------------------------------
// Vector3.normalize
// ---------------------------------------------------------------------------

describe('Vector3.normalize', () => {
  it('produces a unit vector', () => {
    const n = Vector3.normalize({ x: 3, y: 4, z: 0 })
    assert.ok(Math.abs(Vector3.magnitude(n) - 1) < 1e-10)
  })

  it('does not change a unit vector', () => {
    const n = Vector3.normalize(Vector3.x)
    assert.ok(Vector3.equal(n, Vector3.x))
  })
})

// ---------------------------------------------------------------------------
// Vector3.angle
// ---------------------------------------------------------------------------

describe('Vector3.angle', () => {
  it('returns 0 for identical unit vectors', () => {
    assert.equal(Vector3.angle(Vector3.x, Vector3.x), 0)
  })

  it('returns π/2 for perpendicular unit vectors', () => {
    assert.ok(Math.abs(Vector3.angle(Vector3.x, Vector3.y) - Math.PI / 2) < 1e-10)
  })

  it('returns π for opposite unit vectors', () => {
    assert.ok(Math.abs(Vector3.angle(Vector3.x, { x: -1, y: 0, z: 0 }) - Math.PI) < 1e-10)
  })
})

// ---------------------------------------------------------------------------
// Vector3.distance
// ---------------------------------------------------------------------------

describe('Vector3.distance', () => {
  it('returns 0 for identical vectors', () => {
    assert.equal(Vector3.distance({ x: 1, y: 2, z: 3 }, { x: 1, y: 2, z: 3 }), 0)
  })

  it('computes the correct Euclidean distance', () => {
    assert.equal(Vector3.distance({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 }), 5)
  })
})

// ---------------------------------------------------------------------------
// Vector3.copy
// ---------------------------------------------------------------------------

describe('Vector3.copy', () => {
  it('copies all three components', () => {
    assert.deepEqual(Vector3.copy({ x: 1, y: 2, z: 3 }), { x: 1, y: 2, z: 3 })
  })

  it('defaults missing components to 0', () => {
    assert.deepEqual(Vector3.copy({ x: 5 }), { x: 5, y: 0, z: 0 })
    assert.deepEqual(Vector3.copy({}), { x: 0, y: 0, z: 0 })
  })
})

// ---------------------------------------------------------------------------
// Vector3.add / addScalar
// ---------------------------------------------------------------------------

describe('Vector3.add', () => {
  it('adds component-wise', () => {
    assert.deepEqual(Vector3.add({ x: 1, y: 2, z: 3 }, { x: 4, y: 5, z: 6 }), { x: 5, y: 7, z: 9 })
  })

  it('adding zero vector is identity', () => {
    const v = { x: 1, y: 2, z: 3 }
    assert.deepEqual(Vector3.add(v, { x: 0, y: 0, z: 0 }), v)
  })
})

describe('Vector3.addScalar', () => {
  it('adds scalar to each component', () => {
    assert.deepEqual(Vector3.addScalar({ x: 1, y: 2, z: 3 }, 10), { x: 11, y: 12, z: 13 })
  })
})

// ---------------------------------------------------------------------------
// Vector3.subtract / subtractScalar
// ---------------------------------------------------------------------------

describe('Vector3.subtract', () => {
  it('subtracts component-wise', () => {
    assert.deepEqual(Vector3.subtract({ x: 5, y: 7, z: 9 }, { x: 4, y: 5, z: 6 }), {
      x: 1,
      y: 2,
      z: 3,
    })
  })

  it('subtracting self gives zero vector', () => {
    const v = { x: 3, y: 4, z: 5 }
    assert.deepEqual(Vector3.subtract(v, v), { x: 0, y: 0, z: 0 })
  })
})

describe('Vector3.subtractScalar', () => {
  it('subtracts scalar from each component', () => {
    assert.deepEqual(Vector3.subtractScalar({ x: 11, y: 12, z: 13 }, 10), { x: 1, y: 2, z: 3 })
  })
})

// ---------------------------------------------------------------------------
// Vector3.multiply / multiplyScalar
// ---------------------------------------------------------------------------

describe('Vector3.multiply', () => {
  it('multiplies component-wise', () => {
    assert.deepEqual(Vector3.multiply({ x: 2, y: 3, z: 4 }, { x: 5, y: 6, z: 7 }), {
      x: 10,
      y: 18,
      z: 28,
    })
  })
})

describe('Vector3.multiplyScalar', () => {
  it('scales each component', () => {
    assert.deepEqual(Vector3.multiplyScalar({ x: 1, y: 2, z: 3 }, 2), { x: 2, y: 4, z: 6 })
  })

  it('multiplying by 0 gives zero vector', () => {
    assert.deepEqual(Vector3.multiplyScalar({ x: 1, y: 2, z: 3 }, 0), { x: 0, y: 0, z: 0 })
  })
})

// ---------------------------------------------------------------------------
// Vector3.divide / divideScalar
// ---------------------------------------------------------------------------

describe('Vector3.divide', () => {
  it('divides component-wise', () => {
    assert.deepEqual(Vector3.divide({ x: 10, y: 18, z: 28 }, { x: 5, y: 6, z: 7 }), {
      x: 2,
      y: 3,
      z: 4,
    })
  })
})

describe('Vector3.divideScalar', () => {
  it('divides each component by the scalar', () => {
    assert.deepEqual(Vector3.divideScalar({ x: 2, y: 4, z: 6 }, 2), { x: 1, y: 2, z: 3 })
  })
})

// ---------------------------------------------------------------------------
// Vector3.cross
// ---------------------------------------------------------------------------

describe('Vector3.cross', () => {
  it('x × y = z', () => {
    assert.deepEqual(Vector3.cross(Vector3.x, Vector3.y), Vector3.z)
  })

  it('y × x = -z', () => {
    assert.deepEqual(Vector3.cross(Vector3.y, Vector3.x), { x: 0, y: 0, z: -1 })
  })

  it('y × z = x', () => {
    assert.deepEqual(Vector3.cross(Vector3.y, Vector3.z), Vector3.x)
  })

  it('v × v = zero vector', () => {
    const v = { x: 1, y: 2, z: 3 }
    assert.deepEqual(Vector3.cross(v, v), { x: 0, y: 0, z: 0 })
  })
})

// ---------------------------------------------------------------------------
// Vector3.lerp
// ---------------------------------------------------------------------------

describe('Vector3.lerp', () => {
  it('returns a at t=0', () => {
    const a = { x: 1, y: 2, z: 3 }
    assert.deepEqual(Vector3.lerp(a, { x: 4, y: 5, z: 6 }, 0), a)
  })

  it('returns b at t=1', () => {
    const b = { x: 4, y: 5, z: 6 }
    assert.deepEqual(Vector3.lerp({ x: 1, y: 2, z: 3 }, b, 1), b)
  })

  it('returns midpoint at t=0.5', () => {
    assert.deepEqual(Vector3.lerp({ x: 0, y: 0, z: 0 }, { x: 2, y: 4, z: 6 }, 0.5), {
      x: 1,
      y: 2,
      z: 3,
    })
  })
})

// ---------------------------------------------------------------------------
// Vector3.slerp
// ---------------------------------------------------------------------------

describe('Vector3.slerp', () => {
  it('falls back to lerp for very small t (< 0.01)', () => {
    const a = Vector3.x
    const b = Vector3.y
    const result = Vector3.slerp(a, b, 0)
    assert.ok(Vector3.equal(result, a))
  })

  it('interpolates halfway between x and y axes on the unit sphere', () => {
    const result = Vector3.slerp(Vector3.x, Vector3.y, 0.5)
    const expected = { x: Math.SQRT1_2, y: Math.SQRT1_2, z: 0 }
    assert.ok(Vector3.equal(result, expected), `got ${JSON.stringify(result)}`)
  })

  it('result stays on the unit sphere', () => {
    const result = Vector3.slerp(Vector3.x, Vector3.y, 0.3)
    assert.ok(Math.abs(Vector3.magnitude(result) - 1) < 1e-10)
  })
})

// ---------------------------------------------------------------------------
// Vector3.random
// ---------------------------------------------------------------------------

describe('Vector3.random', () => {
  it('returns a unit vector', () => {
    for (let i = 0; i < 20; i++) {
      const v = Vector3.random()
      assert.ok(Math.abs(Vector3.magnitude(v) - 1) < 1e-10, `magnitude was ${Vector3.magnitude(v)}`)
    }
  })
})

// ---------------------------------------------------------------------------
// Vector3.sphere
// ---------------------------------------------------------------------------

describe('Vector3.sphere', () => {
  it('sphere(0, 0) is the y axis (north pole)', () => {
    const v = Vector3.sphere(0, 0)
    assert.ok(Vector3.equal(v, { x: 0, y: 1, z: 0 }))
  })

  it('sphere(0, π/2) is the x axis', () => {
    const v = Vector3.sphere(0, Math.PI / 2)
    assert.ok(Vector3.equal(v, { x: 1, y: 0, z: 0 }))
  })

  it('sphere(π/2, π/2) is the z axis', () => {
    const v = Vector3.sphere(Math.PI / 2, Math.PI / 2)
    assert.ok(Vector3.equal(v, { x: 0, y: 0, z: 1 }))
  })

  it('result lies on the unit sphere', () => {
    for (const [phi, theta] of [
      [0, 0],
      [Math.PI / 4, Math.PI / 4],
      [Math.PI, Math.PI / 2],
    ]) {
      const v = Vector3.sphere(phi!, theta!)
      assert.ok(Math.abs(Vector3.magnitude(v) - 1) < 1e-10)
    }
  })
})

// ---------------------------------------------------------------------------
// Vector3.read / write
// ---------------------------------------------------------------------------

describe('Vector3.read / write', () => {
  it('round-trips a vector through binary', () => {
    const original = { x: 1.5, y: -2.5, z: 3.0 }
    const view = BufferView.from(Vector3.write(original))
    const result = Vector3.read(view)
    assert.ok(Vector3.equal(result, original), `got ${JSON.stringify(result)}`)
  })

  it('write produces a 12-byte buffer (3 × float32)', () => {
    const view = Vector3.write({ x: 0, y: 0, z: 0 })
    assert.equal(view.byteLength, 12)
  })

  it('read advances the view offset by 12 bytes', () => {
    const view = BufferView.allocate(24)
    Vector3.read(view)
    assert.equal(view.offset, 12)
  })
})
