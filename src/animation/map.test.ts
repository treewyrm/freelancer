import { ok, strictEqual, throws } from 'node:assert/strict'
import { describe, it } from 'node:test'
import Quat from '#/math/quat.js'
import Vector3 from '#/math/vector3.js'
import Vector4 from '#/math/vector4.js'
import type { Channel } from './channel.js'
import { sampleObjectMap, type ObjectMap } from './map.js'

const quarter = Quat.axisAngle({ axis: Vector3.y, angle: Math.PI / 2 })

/** One step forward and a quarter turn left over two seconds, the way a walk cycle is authored. */
const step: Channel = {
  type: 'motion',
  interval: 1,
  position: 'vector',
  orientation: 'quaternion',
  keyframes: [
    { key: 0, position: { x: 0, y: 0, z: 0 }, orientation: Quat.identity },
    { key: 1, position: { x: 0, y: 0, z: 0.5 }, orientation: Quat.identity },
    { key: 2, position: { x: 0, y: 0, z: 1 }, orientation: quarter },
  ],
}

const walk: ObjectMap = { type: 'object', object: 'Root', channel: step }

const near = (a: Vector3, b: Vector3) => Vector3.equal(a, b, 1e-6)

describe('sampleObjectMap', () => {
  it('samples within the first cycle as the channel stores it', () => {
    const { position, orientation } = sampleObjectMap(walk, 1)

    ok(near(position, { x: 0, y: 0, z: 0.5 }))
    ok(Vector4.equal(orientation, Quat.identity, 1e-9))
  })

  it('carries a loop forward from where the last cycle ended', () => {
    // Cycle two starts one metre on and turned a quarter left, so its half-metre step goes along +X.
    const { position, orientation } = sampleObjectMap(walk, 3)

    ok(near(position, { x: 0.5, y: 0, z: 1 }), JSON.stringify(position))
    ok(Vector4.equal(orientation, quarter, 1e-9))
  })

  it('closes a square after four cycles', () => {
    const { position, orientation } = sampleObjectMap(walk, 8)

    ok(near(position, Vector3.zero), JSON.stringify(position))
    ok(Math.abs(Math.abs(orientation.w) - 1) < 1e-9, 'four quarter turns are a whole one')
  })

  it('holds a single play at its last keyframe', () => {
    const { position } = sampleObjectMap(walk, 30, 'once')

    ok(near(position, { x: 0, y: 0, z: 1 }))
  })

  it('turns a bounce round without moving on', () => {
    const { position } = sampleObjectMap(walk, 3, 'pingPong')

    ok(near(position, { x: 0, y: 0, z: 0.5 }))
  })

  it('refuses an angle channel, which the engine never binds to an object', () => {
    const map: ObjectMap = {
      type: 'object',
      object: 'Root',
      channel: { type: 'angle', interval: 1, keyframes: [{ key: 0, value: 0 }] },
    }

    throws(() => sampleObjectMap(map, 0), RangeError)
  })

  it('reads negative time as the start', () => {
    strictEqual(sampleObjectMap(walk, -1).position.z, 0)
  })
})
