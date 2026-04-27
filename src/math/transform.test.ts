import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import Transform from './transform.js'
import Quat from './quat.js'
import Vector3 from './vector3.js'
import Vector4 from './vector4.js'

const identity: Transform = { position: { x: 0, y: 0, z: 0 }, orientation: Quat.identity }

const vecApprox = (a: Vector3, b: Vector3) => Vector3.equal(a, b)
const quatApprox = (a: Vector4, b: Vector4) => Vector4.equal(a, b)

// 90° rotation around each axis
const rot90x = Quat.axisAngle({ axis: Vector3.x, angle: Math.PI / 2 })
const rot90y = Quat.axisAngle({ axis: Vector3.y, angle: Math.PI / 2 })
const rot90z = Quat.axisAngle({ axis: Vector3.z, angle: Math.PI / 2 })

// ---------------------------------------------------------------------------
// Transform.copy
// ---------------------------------------------------------------------------

describe('Transform.copy', () => {
  it('returns equal values', () => {
    const t: Transform = { position: { x: 1, y: 2, z: 3 }, orientation: rot90z }
    const c = Transform.copy(t)
    assert.deepEqual(c.position, t.position)
    assert.deepEqual(c.orientation, t.orientation)
  })

  it('deep-copies position (mutation does not affect original)', () => {
    const t: Transform = { position: { x: 1, y: 2, z: 3 }, orientation: Quat.identity }
    const c = Transform.copy(t)
    ;(c.position as { x: number }).x = 99
    assert.equal(t.position.x, 1)
  })

  it('deep-copies orientation', () => {
    const t: Transform = { position: Vector3.copy({}), orientation: { ...rot90z } }
    const c = Transform.copy(t)
    assert.notEqual(c.orientation, t.orientation)
  })
})

// ---------------------------------------------------------------------------
// Transform.transform
// ---------------------------------------------------------------------------

describe('Transform.transform', () => {
  it('identity transform leaves vector unchanged', () => {
    const v = { x: 1, y: 2, z: 3 }
    assert.ok(vecApprox(Transform.transform(v, identity), v))
  })

  it('pure translation adds offset to vector', () => {
    const t: Transform = { position: { x: 10, y: 0, z: 0 }, orientation: Quat.identity }
    assert.ok(vecApprox(Transform.transform({ x: 1, y: 0, z: 0 }, t), { x: 11, y: 0, z: 0 }))
  })

  it('pure 90° rotation around z rotates x-axis to y-axis', () => {
    const t: Transform = { position: { x: 0, y: 0, z: 0 }, orientation: rot90z }
    assert.ok(vecApprox(Transform.transform(Vector3.x, t), Vector3.y))
  })

  it('pure 90° rotation around x rotates y-axis to z-axis', () => {
    const t: Transform = { position: { x: 0, y: 0, z: 0 }, orientation: rot90x }
    assert.ok(vecApprox(Transform.transform(Vector3.y, t), Vector3.z))
  })

  it('rotation and translation are applied in the correct order (rotate-then-translate)', () => {
    // Rotate x-axis 90° around z (→ y), then translate by (0,0,5)
    const t: Transform = { position: { x: 0, y: 0, z: 5 }, orientation: rot90z }
    assert.ok(vecApprox(Transform.transform(Vector3.x, t), { x: 0, y: 1, z: 5 }))
  })
})

// ---------------------------------------------------------------------------
// Transform.revert
// ---------------------------------------------------------------------------

describe('Transform.revert', () => {
  it('identity transform leaves vector unchanged', () => {
    const v = { x: 3, y: 1, z: 4 }
    assert.ok(vecApprox(Transform.revert(v, identity), v))
  })

  it('revert undoes a pure translation', () => {
    const t: Transform = { position: { x: 5, y: 0, z: 0 }, orientation: Quat.identity }
    assert.ok(vecApprox(Transform.revert({ x: 6, y: 0, z: 0 }, t), { x: 1, y: 0, z: 0 }))
  })

  it('revert(transform(v, t), t) round-trips back to v', () => {
    const t: Transform = { position: { x: 3, y: -1, z: 2 }, orientation: rot90y }
    const v = { x: 1, y: 2, z: 3 }
    assert.ok(vecApprox(Transform.revert(Transform.transform(v, t), t), v))
  })

  it('revert is the inverse of transform for a combined rotation+translation', () => {
    const t: Transform = { position: { x: 1, y: 2, z: 3 }, orientation: rot90z }
    const v = { x: 4, y: 5, z: 6 }
    assert.ok(vecApprox(Transform.revert(Transform.transform(v, t), t), v))
  })
})

// ---------------------------------------------------------------------------
// Transform.multiply
// ---------------------------------------------------------------------------

describe('Transform.multiply', () => {
  it('child * identity parent = child', () => {
    const child: Transform = { position: { x: 1, y: 2, z: 3 }, orientation: rot90z }
    const result = Transform.multiply(child, identity)
    assert.ok(vecApprox(result.position, child.position))
    assert.ok(quatApprox(result.orientation, child.orientation))
  })

  it('identity child * parent = parent', () => {
    const parent: Transform = { position: { x: 5, y: 0, z: 0 }, orientation: rot90x }
    const result = Transform.multiply(identity, parent)
    assert.ok(vecApprox(result.position, parent.position))
    assert.ok(quatApprox(result.orientation, parent.orientation))
  })

  it('two pure translations compose by addition', () => {
    const a: Transform = { position: { x: 1, y: 0, z: 0 }, orientation: Quat.identity }
    const b: Transform = { position: { x: 0, y: 2, z: 0 }, orientation: Quat.identity }
    const result = Transform.multiply(a, b)
    assert.ok(vecApprox(result.position, { x: 1, y: 2, z: 0 }))
  })

  it('parent rotation is applied to child position', () => {
    // parent: 90° around z; child offset along x
    // parent rotates child's x-offset to y, then adds parent translation
    const parent: Transform = { position: { x: 0, y: 0, z: 0 }, orientation: rot90z }
    const child: Transform = { position: { x: 1, y: 0, z: 0 }, orientation: Quat.identity }
    const result = Transform.multiply(child, parent)
    assert.ok(vecApprox(result.position, { x: 0, y: 1, z: 0 }))
  })

  it('orientations are composed correctly', () => {
    const a: Transform = { position: Vector3.copy({}), orientation: rot90z }
    const b: Transform = { position: Vector3.copy({}), orientation: rot90z }
    const result = Transform.multiply(a, b)
    const expected = Quat.multiply(b.orientation, a.orientation)
    assert.ok(quatApprox(result.orientation, expected))
  })
})

// ---------------------------------------------------------------------------
// Transform.interpolate
// ---------------------------------------------------------------------------

describe('Transform.interpolate', () => {
  const source: Transform = { position: { x: 0, y: 0, z: 0 }, orientation: Quat.identity }
  const target: Transform = { position: { x: 2, y: 4, z: 6 }, orientation: rot90y }

  it('returns source at t=0', () => {
    const r = Transform.interpolate(source, target, 0)
    assert.ok(vecApprox(r.position, source.position))
    assert.ok(quatApprox(r.orientation, source.orientation))
  })

  it('returns target at t=1', () => {
    const r = Transform.interpolate(source, target, 1)
    assert.ok(vecApprox(r.position, target.position))
    assert.ok(quatApprox(r.orientation, target.orientation))
  })

  it('position is linearly interpolated at t=0.5', () => {
    const r = Transform.interpolate(source, target, 0.5)
    assert.ok(vecApprox(r.position, { x: 1, y: 2, z: 3 }))
  })

  it('result orientation is unit length at t=0.5', () => {
    const r = Transform.interpolate(source, target, 0.5)
    assert.ok(Math.abs(Vector4.magnitude(r.orientation) - 1) < 1e-6)
  })
})

// ---------------------------------------------------------------------------
// Transform.push
// ---------------------------------------------------------------------------

describe('Transform.push', () => {
  it('pushes a copy onto an empty stack', () => {
    const stack: Transform[] = []
    const t: Transform = { position: { x: 1, y: 0, z: 0 }, orientation: rot90z }
    Transform.push(stack, t)
    assert.equal(stack.length, 1)
    assert.ok(vecApprox(stack[0]!.position, t.position))
  })

  it('stack grows by one per push', () => {
    const stack: Transform[] = []
    Transform.push(stack, identity)
    Transform.push(stack, identity)
    assert.equal(stack.length, 2)
  })

  it('second push multiplies with previous top', () => {
    const stack: Transform[] = []
    const tx: Transform = { position: { x: 1, y: 0, z: 0 }, orientation: Quat.identity }
    Transform.push(stack, tx)
    Transform.push(stack, tx)
    // tx composed with tx: position = (1,0,0) + (1,0,0) = (2,0,0)
    assert.ok(vecApprox(stack[1]!.position, { x: 2, y: 0, z: 0 }))
  })

  it('pushing identity onto identity stack stays identity', () => {
    const stack: Transform[] = []
    Transform.push(stack, identity)
    Transform.push(stack, identity)
    assert.ok(vecApprox(stack[1]!.position, { x: 0, y: 0, z: 0 }))
    assert.ok(quatApprox(stack[1]!.orientation, Quat.identity))
  })
})
