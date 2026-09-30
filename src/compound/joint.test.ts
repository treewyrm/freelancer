import { ok, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import Matrix3 from '#/math/matrix3.js'
import Matrix4 from '#/math/matrix4.js'
import Quat from '#/math/quat.js'
import Vector3 from '#/math/vector3.js'
import { getJointMatrix, type Joint, type JointOf } from './joint.js'

/** A rest rotation of a quarter turn about Z, so the two orders of composition cannot coincide. */
const orientation = Matrix3.axisAngle(Vector3.z, Math.PI / 2)

const position = { x: 1, y: 2, z: 3 }

const offset = { x: 0.5, y: 0, z: -0.25 }

const revolute: JointOf<'revolute'> = {
  type: 'revolute',
  position,
  offset,
  orientation,
  axis: Vector3.x,
  min: -1,
  max: 1,
}

const prismatic: JointOf<'prismatic'> = { ...revolute, type: 'prismatic', min: 0, max: 4 }

const near = (a: Vector3, b: Vector3) => Vector3.equal(a, b, 1e-6)

/**
 * The engine's arithmetic written out independently of `Matrix4`: a `Matrix3`'s triples are the
 * rows of a row-major matrix applied as `M · v` (`x86math.dll` `+0x20`, `+0x2c`).
 */
const rows = (matrix: Matrix3) => [matrix.x, matrix.y, matrix.z]

const apply = (matrix: Matrix3, v: Vector3): Vector3 => {
  const [x, y, z] = rows(matrix).map((row) => Vector3.dot(row, v))
  return { x: x!, y: y!, z: z! }
}

/** `a · b` on row-major 3×3s. */
const product = (a: Matrix3, b: Matrix3): Matrix3 => {
  const column = (i: 'x' | 'y' | 'z') => ({ x: b.x[i], y: b.y[i], z: b.z[i] })
  const row = (r: Vector3) => ({
    x: Vector3.dot(r, column('x')),
    y: Vector3.dot(r, column('y')),
    z: Vector3.dot(r, column('z')),
  })

  return { x: row(a.x), y: row(a.y), z: row(a.z) }
}

describe('getJointMatrix', () => {
  it('puts the driven rotation on the left of the rest, in the parent frame', () => {
    const angle = 0.75
    const expected = product(Matrix3.axisAngle(Vector3.x, angle), orientation)
    const matrix = getJointMatrix(revolute, { value: angle })

    for (const v of [Vector3.x, Vector3.y, Vector3.z])
      ok(near(Matrix4.transformDirection(v, matrix), apply(expected, v)))
  })

  it('lands the child point on the parent point, whatever the angle', () => {
    for (const value of [-1, 0, 0.3, 1])
      ok(near(Matrix4.transformPoint(offset, getJointMatrix(revolute, { value })), position))
  })

  it('clamps revolute and prismatic values to their limits, and lets NaN through', () => {
    const at = (joint: Joint, value: number) =>
      Matrix4.transformDirection(Vector3.y, getJointMatrix(joint, { value }))

    ok(near(at(revolute, 5), at(revolute, 1)))
    ok(near(at(revolute, -5), at(revolute, -1)))
    ok(near(at(prismatic, -2), at(prismatic, 0)) && near(at(prismatic, 9), at(prismatic, 4)))

    const travelled = Matrix4.transformPoint(offset, getJointMatrix(prismatic, { value: 9 }))
    ok(near(travelled, Vector3.add(position, { x: 4, y: 0, z: 0 })))
    ok(Number.isNaN(Matrix4.transformPoint(offset, getJointMatrix(prismatic, { value: NaN })).x))
  })

  it('normalizes a revolute axis but takes a prismatic one as stored', () => {
    const long = { x: 2, y: 0, z: 0 }

    ok(
      near(
        Matrix4.transformDirection(
          Vector3.y,
          getJointMatrix({ ...revolute, axis: long }, { value: 1 }),
        ),
        Matrix4.transformDirection(Vector3.y, getJointMatrix(revolute, { value: 1 })),
      ),
    )
    ok(
      near(
        Matrix4.transformPoint(offset, getJointMatrix({ ...prismatic, axis: long }, { value: 1 })),
        Vector3.add(position, long),
      ),
    )
  })

  it('applies no limits to a sphere', () => {
    const sphere: Joint = {
      type: 'sphere',
      position,
      offset,
      orientation,
      minX: 0,
      maxX: 0,
      minY: 0,
      maxY: 0,
      minZ: 0,
      maxZ: 0,
    }
    const q = Quat.axisAngle({ axis: Vector3.y, angle: 2 })
    const expected = product(Matrix3.fromQuaternion(q), orientation)

    ok(
      near(
        Matrix4.transformDirection(Vector3.x, getJointMatrix(sphere, { orientation: q })),
        apply(expected, Vector3.x),
      ),
    )
  })

  it('drives a cylinder by travel and angle together, unclamped', () => {
    const cylinder: Joint = {
      type: 'cylinder',
      position,
      offset,
      orientation,
      axis: Vector3.x,
      minPris: 0,
      maxPris: 0,
      minRev: 0,
      maxRev: 0,
    }
    const matrix = getJointMatrix(cylinder, { value: 2, rotation: 0.5 })

    ok(near(Matrix4.transformPoint(offset, matrix), Vector3.add(position, { x: 2, y: 0, z: 0 })))
    ok(
      near(
        Matrix4.transformDirection(Vector3.y, matrix),
        apply(product(Matrix3.axisAngle(Vector3.x, 0.5), orientation), Vector3.y),
      ),
    )
  })

  it('moves a translational joint in the parent frame and keeps its rest orientation', () => {
    const joint: Joint = { type: 'translational', position, orientation }
    const matrix = getJointMatrix(joint, { position: { x: 0, y: 0, z: 1 } })

    ok(near(Matrix4.transformPoint(Vector3.zero, matrix), { x: 1, y: 2, z: 4 }))
    ok(near(Matrix4.transformDirection(Vector3.x, matrix), apply(orientation, Vector3.x)))
  })

  it('adds a loose displacement to the rest position and turns before the rest', () => {
    const joint: Joint = { type: 'loose', position, orientation }
    const q = Quat.axisAngle({ axis: Vector3.x, angle: 1 })
    const matrix = getJointMatrix(joint, { position: { x: 1, y: 0, z: 0 }, orientation: q })

    ok(near(Matrix4.transformPoint(Vector3.zero, matrix), { x: 2, y: 2, z: 3 }))
    ok(
      near(
        Matrix4.transformDirection(Vector3.y, matrix),
        apply(product(Matrix3.fromQuaternion(q), orientation), Vector3.y),
      ),
    )
  })

  it('stands at rest with no state', () => {
    const matrix = getJointMatrix(revolute)

    strictEqual(Matrix4.equal(matrix, getJointMatrix(revolute, { value: 0 })), true)
  })
})
