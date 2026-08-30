import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import Matrix3 from './matrix3.js'
import Matrix4 from './matrix4.js'
import Quat from './quat.js'
import Vector3 from './vector3.js'
import Vector4 from './vector4.js'

const matApprox = (a: Matrix4, b: Matrix4, eps?: number) => Matrix4.equal(a, b, eps)
const vecApprox = (a: Vector3, b: Vector3, eps?: number) => Vector3.equal(a, b, eps)

/** An arbitrary rigid transform, plus a non-uniform scale, to exercise the general paths. */
const rotation = Quat.axisAngle({ axis: Vector3.normalize({ x: 1, y: 2, z: -3 }), angle: 0.7 })
const position = { x: 4, y: -5, z: 6 }
const scale = { x: 2, y: 3, z: 0.5 }

// ---------------------------------------------------------------------------
// Matrix4.identity
// ---------------------------------------------------------------------------

describe('Matrix4.identity', () => {
  it('is the 4x4 identity matrix', () => {
    assert.deepEqual(Matrix4.identity, {
      x: { x: 1, y: 0, z: 0, w: 0 },
      y: { x: 0, y: 1, z: 0, w: 0 },
      z: { x: 0, y: 0, z: 1, w: 0 },
      w: { x: 0, y: 0, z: 0, w: 1 },
    })
  })

  it('leaves a point untouched', () => {
    assert.ok(vecApprox(Matrix4.transformPoint(position, Matrix4.identity), position))
  })
})

// ---------------------------------------------------------------------------
// Matrix4.is / isNaN / isFinite / equal / copy
// ---------------------------------------------------------------------------

describe('Matrix4.is', () => {
  it('returns true for a valid matrix object', () => {
    assert.equal(Matrix4.is(Matrix4.identity), true)
  })

  it('returns false for null', () => {
    assert.equal(Matrix4.is(null), false)
  })

  it('returns false for a Matrix3', () => {
    assert.equal(Matrix4.is(Matrix3.identity), false)
  })

  it('returns false when a column is not a Vector4', () => {
    assert.equal(Matrix4.is({ ...Matrix4.identity, z: { x: 0, y: 0, z: 1 } }), false)
  })
})

describe('Matrix4.isNaN / isFinite', () => {
  it('detects a NaN component', () => {
    const matrix = { ...Matrix4.identity, y: { x: 0, y: NaN, z: 0, w: 0 } }
    assert.equal(Matrix4.isNaN(matrix), true)
    assert.equal(Matrix4.isFinite(matrix), false)
  })

  it('accepts a finite matrix', () => {
    assert.equal(Matrix4.isNaN(Matrix4.identity), false)
    assert.equal(Matrix4.isFinite(Matrix4.identity), true)
  })

  it('rejects an infinite component', () => {
    const matrix = { ...Matrix4.identity, w: { x: Infinity, y: 0, z: 0, w: 1 } }
    assert.equal(Matrix4.isNaN(matrix), false)
    assert.equal(Matrix4.isFinite(matrix), false)
  })
})

describe('Matrix4.copy', () => {
  it('produces an equal but distinct matrix', () => {
    const source = Matrix4.fromTRS(position, rotation, scale)
    const copy = Matrix4.copy(source)

    assert.ok(matApprox(copy, source))
    assert.notEqual(copy, source)
    assert.notEqual(copy.x, source.x)
  })

  it('fills missing columns from identity', () => {
    assert.deepEqual(Matrix4.copy({}), Matrix4.copy(Matrix4.identity))
  })
})

// ---------------------------------------------------------------------------
// Matrix4.fromRotationTranslation
// ---------------------------------------------------------------------------

describe('Matrix4.fromRotationTranslation', () => {
  it('reads the Matrix3 triples as rows', () => {
    // A quarter turn about Z, as Matrix3.axisAngle writes it (rows).
    const stored = Matrix3.axisAngle(Vector3.z, Math.PI / 2)
    const matrix = Matrix4.fromRotationTranslation(stored)

    // The x axis is the first column of the mat4, and rotates onto +Y.
    assert.ok(vecApprox(Matrix4.transformPoint(Vector3.x, matrix), Vector3.y))
  })

  it('agrees with the quaternion of the same rotation', () => {
    const stored = Matrix3.fromQuaternion(rotation)
    const matrix = Matrix4.fromRotationTranslation(stored)

    assert.ok(
      vecApprox(Matrix4.transformPoint(Vector3.x, matrix), Quat.transform(Vector3.x, rotation)),
    )
    assert.ok(
      vecApprox(Matrix4.transformPoint(Vector3.y, matrix), Quat.transform(Vector3.y, rotation)),
    )
    assert.ok(
      vecApprox(Matrix4.transformPoint(Vector3.z, matrix), Quat.transform(Vector3.z, rotation)),
    )
  })

  it('is the transpose of reading the triples as columns', () => {
    const stored = Matrix3.fromQuaternion(rotation)

    assert.ok(
      Matrix3.equal(
        Matrix4.toMatrix3(Matrix4.fromRotationTranslation(stored)),
        Matrix3.transpose(stored),
      ),
    )
  })

  it('puts position in the fourth column', () => {
    const matrix = Matrix4.fromRotationTranslation(Matrix3.identity, position)

    assert.deepEqual(matrix.w, { ...position, w: 1 })
    assert.ok(vecApprox(Matrix4.transformPoint(Vector3.identity, matrix), position))
  })

  it('defaults position to the origin', () => {
    assert.ok(matApprox(Matrix4.fromRotationTranslation(Matrix3.identity), Matrix4.identity))
  })
})

// ---------------------------------------------------------------------------
// Matrix4.fromTRS / fromTransform / translation / scaling
// ---------------------------------------------------------------------------

describe('Matrix4.fromTRS', () => {
  it('defaults to identity', () => {
    assert.ok(matApprox(Matrix4.fromTRS(), Matrix4.identity))
  })

  it('applies scale, then rotation, then translation', () => {
    const matrix = Matrix4.fromTRS(position, rotation, scale)
    const expected = Vector3.add(
      Quat.transform(Vector3.multiply(Vector3.x, scale), rotation),
      position,
    )

    assert.ok(vecApprox(Matrix4.transformPoint(Vector3.x, matrix), expected))
  })

  it('accepts a uniform scale as a number', () => {
    assert.ok(
      matApprox(
        Matrix4.fromTRS(position, rotation, 2),
        Matrix4.fromTRS(position, rotation, { x: 2, y: 2, z: 2 }),
      ),
    )
  })

  it('scales the columns, so each local axis keeps its own factor', () => {
    const matrix = Matrix4.fromTRS(Vector3.identity, Quat.identity, scale)

    assert.ok(vecApprox(Matrix4.transformPoint(Vector3.x, matrix), { x: 2, y: 0, z: 0 }))
    assert.ok(vecApprox(Matrix4.transformPoint(Vector3.y, matrix), { x: 0, y: 3, z: 0 }))
    assert.ok(vecApprox(Matrix4.transformPoint(Vector3.z, matrix), { x: 0, y: 0, z: 0.5 }))
  })

  it('matches fromRotationTranslation on the same rotation', () => {
    assert.ok(
      matApprox(
        Matrix4.fromTRS(position, rotation),
        Matrix4.fromRotationTranslation(Matrix3.fromQuaternion(rotation), position),
      ),
    )
  })
})

describe('Matrix4.fromTransform', () => {
  it('composes a Transform', () => {
    assert.ok(
      matApprox(
        Matrix4.fromTransform({ position, orientation: rotation }),
        Matrix4.fromTRS(position, rotation),
      ),
    )
  })

  it('agrees with Transform.transform', () => {
    const transform = { position, orientation: rotation }
    const point = { x: 1, y: -2, z: 3 }

    assert.ok(
      vecApprox(
        Matrix4.transformPoint(point, Matrix4.fromTransform(transform)),
        Vector3.add(Quat.transform(point, rotation), position),
      ),
    )
  })
})

describe('Matrix4.translation / scaling', () => {
  it('translation moves a point and leaves a direction alone', () => {
    const matrix = Matrix4.translation(position)

    assert.ok(
      vecApprox(Matrix4.transformPoint(Vector3.x, matrix), Vector3.add(Vector3.x, position)),
    )
    assert.ok(vecApprox(Matrix4.transformDirection(Vector3.x, matrix), Vector3.x))
  })

  it('scaling accepts a vector or a scalar', () => {
    assert.ok(matApprox(Matrix4.scaling(3), Matrix4.scaling({ x: 3, y: 3, z: 3 })))
    assert.ok(
      vecApprox(Matrix4.transformPoint({ x: 1, y: 1, z: 1 }, Matrix4.scaling(scale)), scale),
    )
  })

  it('composes to the same thing fromTRS builds', () => {
    assert.ok(
      matApprox(
        Matrix4.multiply(Matrix4.translation(position), Matrix4.scaling(scale)),
        Matrix4.fromTRS(position, Quat.identity, scale),
      ),
    )
  })
})

// ---------------------------------------------------------------------------
// Matrix4.transform / transformPoint / transformDirection
// ---------------------------------------------------------------------------

describe('Matrix4.transform', () => {
  it('carries w through', () => {
    const matrix = Matrix4.translation(position)

    assert.ok(
      Vector4.equal(Matrix4.transform({ x: 0, y: 0, z: 0, w: 1 }, matrix), { ...position, w: 1 }),
    )
    assert.ok(
      Vector4.equal(Matrix4.transform({ x: 0, y: 0, z: 0, w: 0 }, matrix), {
        x: 0,
        y: 0,
        z: 0,
        w: 0,
      }),
    )
  })

  it('produces the projective w a perspective matrix needs', () => {
    const projection = Matrix4.perspectiveLH(Math.PI / 4, 1, 1, 100)
    const { w } = Matrix4.transform({ x: 0, y: 0, z: 10, w: 1 }, projection)

    assert.equal(w, 10)
  })
})

describe('Matrix4.transformPoint / transformDirection', () => {
  it('differ by the translation', () => {
    const matrix = Matrix4.fromTRS(position, rotation)
    const vector = { x: 1, y: -2, z: 3 }

    assert.ok(
      vecApprox(
        Matrix4.transformPoint(vector, matrix),
        Vector3.add(Matrix4.transformDirection(vector, matrix), position),
      ),
    )
  })

  it('does not normalize a direction', () => {
    const direction = Matrix4.transformDirection(Vector3.x, Matrix4.scaling(scale))

    assert.ok(vecApprox(direction, { x: 2, y: 0, z: 0 }))
  })
})

// ---------------------------------------------------------------------------
// Matrix4.multiply
// ---------------------------------------------------------------------------

describe('Matrix4.multiply', () => {
  it('applies the right operand first', () => {
    const translate = Matrix4.translation({ x: 10, y: 0, z: 0 })
    const spin = Matrix4.fromTRS(
      Vector3.identity,
      Quat.axisAngle({ axis: Vector3.z, angle: Math.PI / 2 }),
    )

    // spin * translate: translate first, then rotate the result.
    assert.ok(
      vecApprox(Matrix4.transformPoint(Vector3.identity, Matrix4.multiply(spin, translate)), {
        x: 0,
        y: 10,
        z: 0,
      }),
    )

    // translate * spin: rotate first, then translate.
    assert.ok(
      vecApprox(Matrix4.transformPoint(Vector3.identity, Matrix4.multiply(translate, spin)), {
        x: 10,
        y: 0,
        z: 0,
      }),
    )
  })

  it('is identity-neutral', () => {
    const matrix = Matrix4.fromTRS(position, rotation, scale)

    assert.ok(matApprox(Matrix4.multiply(matrix, Matrix4.identity), matrix))
    assert.ok(matApprox(Matrix4.multiply(Matrix4.identity, matrix), matrix))
  })

  it('agrees with transforming twice', () => {
    const a = Matrix4.fromTRS(position, rotation, scale)
    const b = Matrix4.fromTRS(
      { x: -1, y: 2, z: 0.5 },
      Quat.axisAngle({ axis: Vector3.y, angle: 1.2 }),
    )
    const point = { x: 3, y: -1, z: 2 }

    assert.ok(
      vecApprox(
        Matrix4.transformPoint(point, Matrix4.multiply(a, b)),
        Matrix4.transformPoint(Matrix4.transformPoint(point, b), a),
      ),
    )
  })

  it('composes a Transform chain the same way Transform.multiply does', () => {
    const child = { position: { x: 1, y: 2, z: 3 }, orientation: rotation }
    const parent = {
      position: { x: -4, y: 0, z: 2 },
      orientation: Quat.axisAngle({ axis: Vector3.x, angle: -0.9 }),
    }

    assert.ok(
      matApprox(
        Matrix4.multiply(Matrix4.fromTransform(parent), Matrix4.fromTransform(child)),
        Matrix4.fromTransform({
          position: Vector3.add(
            Quat.transform(child.position, parent.orientation),
            parent.position,
          ),
          orientation: Quat.multiply(parent.orientation, child.orientation),
        }),
      ),
    )
  })
})

// ---------------------------------------------------------------------------
// Matrix4.transpose / determinant / invert
// ---------------------------------------------------------------------------

describe('Matrix4.transpose', () => {
  it('is its own inverse', () => {
    const matrix = Matrix4.fromTRS(position, rotation, scale)
    assert.ok(matApprox(Matrix4.transpose(Matrix4.transpose(matrix)), matrix))
  })

  it('moves the translation into the bottom row', () => {
    const matrix = Matrix4.transpose(Matrix4.translation(position))

    assert.deepEqual(matrix.x, { x: 1, y: 0, z: 0, w: position.x })
    assert.deepEqual(matrix.y, { x: 0, y: 1, z: 0, w: position.y })
    assert.deepEqual(matrix.z, { x: 0, y: 0, z: 1, w: position.z })
  })

  it('inverts a rotation, since a rotation is orthonormal', () => {
    const matrix = Matrix4.fromTRS(Vector3.identity, rotation)

    assert.ok(matApprox(Matrix4.transpose(matrix), Matrix4.invert(matrix)))
  })
})

describe('Matrix4.determinant', () => {
  it('is 1 for the identity', () => {
    assert.equal(Matrix4.determinant(Matrix4.identity), 1)
  })

  it('is 1 for a rigid transform', () => {
    const matrix = Matrix4.fromTRS(position, rotation)
    assert.ok(Math.abs(Matrix4.determinant(matrix) - 1) < 1e-9)
  })

  it('is the product of the scale factors', () => {
    const matrix = Matrix4.fromTRS(position, rotation, scale)
    assert.ok(Math.abs(Matrix4.determinant(matrix) - scale.x * scale.y * scale.z) < 1e-9)
  })

  it('is negative for a mirror', () => {
    assert.ok(Matrix4.determinant(Matrix4.scaling({ x: -1, y: 1, z: 1 })) < 0)
  })

  it('is 0 for a singular matrix', () => {
    assert.equal(Matrix4.determinant(Matrix4.scaling({ x: 1, y: 0, z: 1 })), 0)
  })
})

describe('Matrix4.invert', () => {
  it('round-trips an affine transform', () => {
    const matrix = Matrix4.fromTRS(position, rotation, scale)

    assert.ok(matApprox(Matrix4.multiply(matrix, Matrix4.invert(matrix)), Matrix4.identity, 1e-6))
    assert.ok(matApprox(Matrix4.multiply(Matrix4.invert(matrix), matrix), Matrix4.identity, 1e-6))
  })

  it('round-trips a projection, which is not affine', () => {
    const matrix = Matrix4.perspectiveLH(Math.PI / 3, 16 / 9, 0.5, 500)

    assert.ok(matApprox(Matrix4.multiply(matrix, Matrix4.invert(matrix)), Matrix4.identity, 1e-5))
  })

  it('round-trips a view matrix', () => {
    const matrix = Matrix4.lookAtLH({ x: 3, y: 4, z: -12 }, Vector3.identity, Vector3.y)

    assert.ok(matApprox(Matrix4.multiply(matrix, Matrix4.invert(matrix)), Matrix4.identity, 1e-6))
  })

  it('takes a point back where it came from', () => {
    const matrix = Matrix4.fromTRS(position, rotation, scale)
    const point = { x: -7, y: 0.25, z: 11 }

    assert.ok(
      vecApprox(
        Matrix4.transformPoint(Matrix4.transformPoint(point, matrix), Matrix4.invert(matrix)),
        point,
      ),
    )
  })

  it('throws on a singular matrix', () => {
    assert.throws(() => Matrix4.invert(Matrix4.scaling({ x: 1, y: 0, z: 1 })))
  })
})

// ---------------------------------------------------------------------------
// Matrix4.toMatrix3 / decompose / toTransform
// ---------------------------------------------------------------------------

describe('Matrix4.toMatrix3', () => {
  it('drops translation and keeps the columns', () => {
    const matrix = Matrix4.fromTRS(position, rotation)

    assert.ok(
      Matrix3.equal(Matrix4.toMatrix3(matrix), Matrix3.transpose(Matrix3.fromQuaternion(rotation))),
    )
  })

  it('agrees with transformDirection through Matrix3.transform', () => {
    const matrix = Matrix4.fromTRS(position, rotation, scale)
    const vector = { x: 2, y: -1, z: 0.5 }

    assert.ok(
      vecApprox(
        Matrix4.transformDirection(vector, matrix),
        Matrix3.transform(vector, Matrix4.toMatrix3(matrix)),
      ),
    )
  })
})

describe('Matrix4.decompose', () => {
  it('recovers what fromTRS composed', () => {
    const result = Matrix4.decompose(Matrix4.fromTRS(position, rotation, scale))

    assert.ok(vecApprox(result.position, position))
    assert.ok(vecApprox(result.scale, scale))
    assert.ok(Vector4.equal(result.orientation, rotation))
  })

  it('recovers a rigid transform with unit scale', () => {
    const result = Matrix4.decompose(Matrix4.fromTRS(position, rotation))

    assert.ok(vecApprox(result.scale, { x: 1, y: 1, z: 1 }))
  })

  it('is exact for the identity', () => {
    const result = Matrix4.decompose(Matrix4.identity)

    assert.deepEqual(result.position, Vector3.identity)
    assert.deepEqual(result.scale, { x: 1, y: 1, z: 1 })
    assert.ok(Vector4.equal(result.orientation, Quat.identity))
  })

  it('folds a mirror into scale.x', () => {
    const result = Matrix4.decompose(Matrix4.scaling({ x: 1, y: -1, z: 1 }))

    assert.ok(result.scale.x < 0)
    assert.ok(Matrix4.determinant(Matrix4.fromTRS(result.position, result.orientation)) > 0)
  })

  it('round-trips back through fromTRS', () => {
    const matrix = Matrix4.fromTRS(position, rotation, scale)
    const { position: p, orientation: o, scale: s } = Matrix4.decompose(matrix)

    assert.ok(matApprox(Matrix4.fromTRS(p, o, s), matrix))
  })
})

describe('Matrix4.toTransform', () => {
  it('drops scale', () => {
    const result = Matrix4.toTransform(Matrix4.fromTRS(position, rotation, scale))

    assert.ok(vecApprox(result.position, position))
    assert.ok(Vector4.equal(result.orientation, rotation))
  })
})

// ---------------------------------------------------------------------------
// Matrix4.toArray / toArray3 / fromArray
// ---------------------------------------------------------------------------

describe('Matrix4.toArray', () => {
  it('writes column-major, so the translation is the last four', () => {
    const values = Matrix4.toArray(Matrix4.translation(position))

    assert.deepEqual([...values.slice(12)], [position.x, position.y, position.z, 1])
  })

  it('writes the identity in order', () => {
    // prettier-ignore
    assert.deepEqual([...Matrix4.toArray(Matrix4.identity)], [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ])
  })

  it('fills an instance buffer in place at an offset', () => {
    const buffer = new Float32Array(32)
    const matrix = Matrix4.fromTRS(position, rotation, scale)

    assert.equal(Matrix4.toArray(matrix, buffer, 16), buffer)
    assert.ok(matApprox(Matrix4.fromArray(buffer, 16), matrix, 1e-6))
    assert.deepEqual([...buffer.slice(0, 16)], Array(16).fill(0))
  })
})

describe('Matrix4.toArray3', () => {
  it('writes the upper-left 3x3, column-major', () => {
    const matrix = Matrix4.fromTRS(position, rotation, scale)
    const values = Matrix4.toArray3(matrix)

    assert.equal(values.length, 9)
    assert.deepEqual(
      [...values],
      [
        matrix.x.x,
        matrix.x.y,
        matrix.x.z,
        matrix.y.x,
        matrix.y.y,
        matrix.y.z,
        matrix.z.x,
        matrix.z.y,
        matrix.z.z,
      ].map((value) => Math.fround(value)),
    )
  })

  it('drops the translation', () => {
    assert.deepEqual(
      [...Matrix4.toArray3(Matrix4.translation(position))],
      [1, 0, 0, 0, 1, 0, 0, 0, 1],
    )
  })
})

describe('Matrix4.fromArray', () => {
  it('is the inverse of toArray', () => {
    const matrix = Matrix4.fromTRS(position, rotation, scale)

    assert.ok(matApprox(Matrix4.fromArray(Matrix4.toArray(matrix)), matrix, 1e-6))
  })

  it('reads a plain array', () => {
    // prettier-ignore
    assert.deepEqual(Matrix4.fromArray([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ]), Matrix4.copy(Matrix4.identity))
  })

  it('treats a short array as zeroes', () => {
    assert.deepEqual(Matrix4.fromArray([1]).w, { x: 0, y: 0, z: 0, w: 0 })
  })
})

// ---------------------------------------------------------------------------
// Matrix4.perspectiveLH / orthographicLH
// ---------------------------------------------------------------------------

describe('Matrix4.perspectiveLH', () => {
  const near = 1
  const far = 100
  const projection = Matrix4.perspectiveLH(Math.PI / 2, 1, near, far)

  const project = (point: Vector3): Vector3 => {
    const { x, y, z, w } = Matrix4.transform({ ...point, w: 1 }, projection)
    return { x: x / w, y: y / w, z: z / w }
  }

  it('maps the near plane to -1 and the far plane to +1', () => {
    assert.ok(Math.abs(project({ x: 0, y: 0, z: near }).z + 1) < 1e-6)
    assert.ok(Math.abs(project({ x: 0, y: 0, z: far }).z - 1) < 1e-6)
  })

  it('puts increasing depth further away, so +Z is in front of the camera', () => {
    assert.ok(project({ x: 0, y: 0, z: 10 }).z < project({ x: 0, y: 0, z: 20 }).z)
  })

  it('does not mirror x or y', () => {
    const { x, y } = project({ x: 1, y: 1, z: 10 })

    assert.ok(x > 0)
    assert.ok(y > 0)
  })

  it('fills the viewport at the field of view', () => {
    // 90° vertical fov, aspect 1: the frustum edge sits at |x| = |y| = z.
    const { x, y } = project({ x: 10, y: 10, z: 10 })

    assert.ok(Math.abs(x - 1) < 1e-6)
    assert.ok(Math.abs(y - 1) < 1e-6)
  })

  it('narrows x as aspect widens', () => {
    const wide = Matrix4.perspectiveLH(Math.PI / 2, 2, near, far)

    assert.ok(wide.x.x < projection.x.x)
    assert.equal(wide.y.y, projection.y.y)
  })
})

describe('Matrix4.orthographicLH', () => {
  const projection = Matrix4.orthographicLH(-2, 2, -1, 1, 1, 11)

  it('maps the box corners onto the NDC cube', () => {
    assert.ok(
      vecApprox(Matrix4.transformPoint({ x: -2, y: -1, z: 1 }, projection), {
        x: -1,
        y: -1,
        z: -1,
      }),
    )
    assert.ok(
      vecApprox(Matrix4.transformPoint({ x: 2, y: 1, z: 11 }, projection), { x: 1, y: 1, z: 1 }),
    )
  })

  it('leaves w alone, so nothing needs dividing through', () => {
    assert.equal(Matrix4.transform({ x: 1, y: 1, z: 5, w: 1 }, projection).w, 1)
  })

  it('puts increasing depth further away', () => {
    assert.ok(
      Matrix4.transformPoint({ x: 0, y: 0, z: 3 }, projection).z <
        Matrix4.transformPoint({ x: 0, y: 0, z: 8 }, projection).z,
    )
  })
})

// ---------------------------------------------------------------------------
// Matrix4.lookAtLH
// ---------------------------------------------------------------------------

describe('Matrix4.lookAtLH', () => {
  const eye = { x: 0, y: 0, z: -10 }
  const view = Matrix4.lookAtLH(eye, Vector3.identity, Vector3.y)

  it('puts the eye at the view-space origin', () => {
    assert.ok(vecApprox(Matrix4.transformPoint(eye, view), Vector3.identity))
  })

  it('puts the target down +Z', () => {
    const target = Matrix4.transformPoint(Vector3.identity, view)

    assert.ok(Math.abs(target.x) < 1e-6)
    assert.ok(Math.abs(target.y) < 1e-6)
    assert.ok(Math.abs(target.z - 10) < 1e-6)
  })

  it('does not mirror — the basis has determinant +1', () => {
    assert.ok(Math.abs(Matrix4.determinant(view) - 1) < 1e-6)
  })

  it('keeps up pointing up', () => {
    assert.ok(vecApprox(Matrix4.transformDirection(Vector3.y, view), Vector3.y))
  })

  it('is rigid, so its inverse places the camera', () => {
    const oblique = Matrix4.lookAtLH({ x: 5, y: 3, z: -2 }, { x: 1, y: 0, z: 4 }, Vector3.y)
    const placement = Matrix4.invert(oblique)

    assert.ok(vecApprox(Matrix4.transformPoint(Vector3.identity, placement), { x: 5, y: 3, z: -2 }))
  })

  it('defaults up to +Y', () => {
    assert.ok(matApprox(Matrix4.lookAtLH(eye, Vector3.identity), view))
  })
})

// ---------------------------------------------------------------------------
// Matrix4.push
// ---------------------------------------------------------------------------

describe('Matrix4.push', () => {
  it('copies the first matrix onto an empty stack', () => {
    const stack: Matrix4[] = []
    const matrix = Matrix4.fromTRS(position, rotation)
    const pushed = Matrix4.push(stack, matrix)

    assert.equal(stack.length, 1)
    assert.notEqual(pushed, matrix)
    assert.ok(matApprox(pushed, matrix))
  })

  it('composes parent then child, so a chain accumulates', () => {
    const parent = Matrix4.translation({ x: 10, y: 0, z: 0 })
    const child = Matrix4.fromTRS(
      Vector3.identity,
      Quat.axisAngle({ axis: Vector3.z, angle: Math.PI / 2 }),
    )

    const stack: Matrix4[] = []
    Matrix4.push(stack, parent)
    const world = Matrix4.push(stack, child)

    // The child's rotation happens in the parent's frame, so the point ends up offset by the parent.
    assert.ok(vecApprox(Matrix4.transformPoint(Vector3.x, world), { x: 10, y: 1, z: 0 }))
    assert.ok(matApprox(world, Matrix4.multiply(parent, child)))
  })

  it('agrees with Matrix4.multiply over three levels', () => {
    const a = Matrix4.fromTRS({ x: 1, y: 0, z: 0 }, rotation)
    const b = Matrix4.fromTRS({ x: 0, y: 2, z: 0 }, Quat.axisAngle({ axis: Vector3.x, angle: 0.4 }))
    const c = Matrix4.fromTRS(
      { x: 0, y: 0, z: 3 },
      Quat.axisAngle({ axis: Vector3.y, angle: -1.1 }),
    )

    const stack: Matrix4[] = []
    Matrix4.push(stack, a)
    Matrix4.push(stack, b)

    assert.ok(matApprox(Matrix4.push(stack, c), Matrix4.multiply(Matrix4.multiply(a, b), c)))
  })
})
