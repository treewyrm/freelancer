import Matrix3 from './matrix3.js'
import Quat from './quat.js'
import type Transform from './transform.js'
import Vector3 from './vector3.js'
import Vector4 from './vector4.js'

/**
 * 4x4 transformation matrix, stored as its four **columns**.
 *
 * `x`, `y` and `z` are the local axes and `w` is the translation, so {@link Matrix4.toArray} is a
 * straight concatenation and lands column-major — what `uniformMatrix4fv` wants with
 * `transpose = false`, and what a `mat4` vertex attribute wants as four consecutive locations.
 *
 * **This is not how a `Matrix3` sits on disk.** The nine floats of a joint rotation or a hardpoint
 * orientation are the *rows* of a column-vector rotation matrix (RENDERER.md §2), so
 * {@link Matrix4.fromRotationTranslation} transposes on the way in and every matrix here is already
 * in axes-as-columns form. That is also why `Matrix4.multiply` composes the other way round from
 * `Matrix3.multiply` read against the file: the two hold transposes of each other.
 *
 * No format in this library stores a 4x4 — meshes, joints and hardpoints all carry a `Matrix3` and
 * a `Vector3` — so there is no `read`/`write` pair here.
 */
interface Matrix4 {
  x: Vector4
  y: Vector4
  z: Vector4
  w: Vector4
}

const scaleOf = (scale: Vector3 | number): Vector3 =>
  typeof scale === 'number' ? { x: scale, y: scale, z: scale } : scale

const Matrix4 = {
  /** Identity matrix. */
  identity: {
    x: { x: 1, y: 0, z: 0, w: 0 },
    y: { x: 0, y: 1, z: 0, w: 0 },
    z: { x: 0, y: 0, z: 1, w: 0 },
    w: { x: 0, y: 0, z: 0, w: 1 },
  } as const,

  /** Tests if value is a matrix-like object. */
  is(value: unknown): value is Matrix4 {
    return (
      value !== null &&
      typeof value === 'object' &&
      'x' in value &&
      'y' in value &&
      'z' in value &&
      'w' in value &&
      Vector4.is(value.x) &&
      Vector4.is(value.y) &&
      Vector4.is(value.z) &&
      Vector4.is(value.w)
    )
  },

  /** Tests if matrix has any NaN components. */
  isNaN(matrix: Matrix4): boolean {
    return (
      Vector4.isNaN(matrix.x) ||
      Vector4.isNaN(matrix.y) ||
      Vector4.isNaN(matrix.z) ||
      Vector4.isNaN(matrix.w)
    )
  },

  /** Tests if matrix has finite components. */
  isFinite(matrix: Matrix4): boolean {
    return (
      Vector4.isFinite(matrix.x) &&
      Vector4.isFinite(matrix.y) &&
      Vector4.isFinite(matrix.z) &&
      Vector4.isFinite(matrix.w)
    )
  },

  /** Tests if two matrices are equal within margin of error. */
  equal(a: Matrix4, b: Matrix4, epsilon?: number): boolean {
    return (
      Vector4.equal(a.x, b.x, epsilon) &&
      Vector4.equal(a.y, b.y, epsilon) &&
      Vector4.equal(a.z, b.z, epsilon) &&
      Vector4.equal(a.w, b.w, epsilon)
    )
  },

  /** Creates a copy of matrix. */
  copy(matrix: Partial<Matrix4>): Matrix4 {
    const {
      x = Matrix4.identity.x,
      y = Matrix4.identity.y,
      z = Matrix4.identity.z,
      w = Matrix4.identity.w,
    } = matrix

    return { x: Vector4.copy(x), y: Vector4.copy(y), z: Vector4.copy(z), w: Vector4.copy(w) }
  },

  /**
   * Builds a matrix from a stored rotation and position — a joint, a hardpoint, a mesh part.
   *
   * The rotation's three triples are taken as **rows**, which is what the exporter wrote: they are
   * the rows of an ordinary column-vector rotation matrix, so the part's axes are their columns and
   * reaching here means a transpose. `Matrix3.fromQuaternion` and `Matrix3.axisAngle` emit the same
   * form; `Matrix3.transform` and `Matrix3.lookAt` are the pair that read the triples as axes and
   * therefore apply the inverse. See RENDERER.md §2 for the measurement — reading the two matrices
   * of a chain each way cancels, which can make a wrong convention look right.
   */
  fromRotationTranslation(rotation: Matrix3, position: Vector3 = Vector3.identity): Matrix4 {
    const { x, y, z } = rotation

    return {
      x: { x: x.x, y: y.x, z: z.x, w: 0 },
      y: { x: x.y, y: y.y, z: z.y, w: 0 },
      z: { x: x.z, y: y.z, z: z.z, w: 0 },
      w: { x: position.x, y: position.y, z: position.z, w: 1 },
    }
  },

  /**
   * Composes translation, rotation and scale, applied in that order (`T * R * S`).
   *
   * Scale multiplies the columns, each column being a local axis, so a non-uniform scale is
   * expressed exactly — which is what an Alchemy cube emitter needs and a single scale float
   * cannot give.
   */
  fromTRS(
    position: Vector3 = Vector3.identity,
    orientation: Quat = Quat.identity,
    scale: Vector3 | number = 1,
  ): Matrix4 {
    const { x, y, z } = Matrix3.fromQuaternion(orientation)
    const s = scaleOf(scale)

    return {
      x: { x: x.x * s.x, y: y.x * s.x, z: z.x * s.x, w: 0 },
      y: { x: x.y * s.y, y: y.y * s.y, z: z.y * s.y, w: 0 },
      z: { x: x.z * s.z, y: y.z * s.z, z: z.z * s.z, w: 0 },
      w: { x: position.x, y: position.y, z: position.z, w: 1 },
    }
  },

  /** Composes a {@link Transform}, optionally with a scale it does not carry. */
  fromTransform(transform: Transform, scale: Vector3 | number = 1): Matrix4 {
    return Matrix4.fromTRS(transform.position, transform.orientation, scale)
  },

  /** Pure translation. */
  translation(position: Vector3): Matrix4 {
    return {
      x: { x: 1, y: 0, z: 0, w: 0 },
      y: { x: 0, y: 1, z: 0, w: 0 },
      z: { x: 0, y: 0, z: 1, w: 0 },
      w: { x: position.x, y: position.y, z: position.z, w: 1 },
    }
  },

  /** Pure scale. */
  scaling(scale: Vector3 | number): Matrix4 {
    const { x, y, z } = scaleOf(scale)

    return {
      x: { x, y: 0, z: 0, w: 0 },
      y: { x: 0, y, z: 0, w: 0 },
      z: { x: 0, y: 0, z, w: 0 },
      w: { x: 0, y: 0, z: 0, w: 1 },
    }
  },

  /** Transforms 4D vector by matrix. */
  transform(vector: Vector4, matrix: Matrix4): Vector4 {
    const { x, y, z, w } = vector
    const { x: a, y: b, z: c, w: d } = matrix

    return {
      x: x * a.x + y * b.x + z * c.x + w * d.x,
      y: x * a.y + y * b.y + z * c.y + w * d.y,
      z: x * a.z + y * b.z + z * c.z + w * d.z,
      w: x * a.w + y * b.w + z * c.w + w * d.w,
    }
  },

  /**
   * Transforms a point (implicit `w = 1`) and drops the resulting `w`.
   *
   * Affine only — a projection matrix produces a `w` that has to be divided through, and that is
   * {@link Matrix4.transform}'s job.
   */
  transformPoint(vector: Vector3, matrix: Matrix4): Vector3 {
    const { x, y, z } = vector
    const { x: a, y: b, z: c, w: d } = matrix

    return {
      x: x * a.x + y * b.x + z * c.x + d.x,
      y: x * a.y + y * b.y + z * c.y + d.y,
      z: x * a.z + y * b.z + z * c.z + d.z,
    }
  },

  /**
   * Transforms a direction (implicit `w = 0`), so translation does not apply.
   *
   * The result is **not** normalized: a scaled matrix lengthens it, and whether that should carry
   * into whatever the direction feeds is the consumer's call.
   */
  transformDirection(vector: Vector3, matrix: Matrix4): Vector3 {
    const { x, y, z } = vector
    const { x: a, y: b, z: c } = matrix

    return {
      x: x * a.x + y * b.x + z * c.x,
      y: x * a.y + y * b.y + z * c.y,
      z: x * a.z + y * b.z + z * c.z,
    }
  },

  /** Multiplies two matrices — `a * b`, applying `b` first. */
  multiply(a: Matrix4, b: Matrix4): Matrix4 {
    return {
      x: Matrix4.transform(b.x, a),
      y: Matrix4.transform(b.y, a),
      z: Matrix4.transform(b.z, a),
      w: Matrix4.transform(b.w, a),
    }
  },

  /** Transposes matrix rows and columns. */
  transpose(matrix: Matrix4): Matrix4 {
    const { x, y, z, w } = matrix

    return {
      x: { x: x.x, y: y.x, z: z.x, w: w.x },
      y: { x: x.y, y: y.y, z: z.y, w: w.y },
      z: { x: x.z, y: y.z, z: z.z, w: w.z },
      w: { x: x.w, y: y.w, z: z.w, w: w.w },
    }
  },

  /** Calculates matrix determinant. */
  determinant(matrix: Matrix4): number {
    const { x: a, y: b, z: c, w: d } = matrix

    const m0 = a.x * b.y - a.y * b.x
    const m1 = a.x * b.z - a.z * b.x
    const m2 = a.x * b.w - a.w * b.x
    const m3 = a.y * b.z - a.z * b.y
    const m4 = a.y * b.w - a.w * b.y
    const m5 = a.z * b.w - a.w * b.z
    const m6 = c.x * d.y - c.y * d.x
    const m7 = c.x * d.z - c.z * d.x
    const m8 = c.x * d.w - c.w * d.x
    const m9 = c.y * d.z - c.z * d.y
    const m10 = c.y * d.w - c.w * d.y
    const m11 = c.z * d.w - c.w * d.z

    return m0 * m11 - m1 * m10 + m2 * m9 + m3 * m8 - m4 * m7 + m5 * m6
  },

  /** Calculates inversion of a matrix. Throws when the matrix is singular. */
  invert(matrix: Matrix4): Matrix4 {
    const { x: a, y: b, z: c, w: d } = matrix

    const m0 = a.x * b.y - a.y * b.x
    const m1 = a.x * b.z - a.z * b.x
    const m2 = a.x * b.w - a.w * b.x
    const m3 = a.y * b.z - a.z * b.y
    const m4 = a.y * b.w - a.w * b.y
    const m5 = a.z * b.w - a.w * b.z
    const m6 = c.x * d.y - c.y * d.x
    const m7 = c.x * d.z - c.z * d.x
    const m8 = c.x * d.w - c.w * d.x
    const m9 = c.y * d.z - c.z * d.y
    const m10 = c.y * d.w - c.w * d.y
    const m11 = c.z * d.w - c.w * d.z

    const k = 1 / (m0 * m11 - m1 * m10 + m2 * m9 + m3 * m8 - m4 * m7 + m5 * m6)
    if (!isFinite(k)) throw new Error('Matrix is not invertible')

    return {
      x: {
        x: (b.y * m11 - b.z * m10 + b.w * m9) * k,
        y: (a.z * m10 - a.y * m11 - a.w * m9) * k,
        z: (d.y * m5 - d.z * m4 + d.w * m3) * k,
        w: (c.z * m4 - c.y * m5 - c.w * m3) * k,
      },
      y: {
        x: (b.z * m8 - b.x * m11 - b.w * m7) * k,
        y: (a.x * m11 - a.z * m8 + a.w * m7) * k,
        z: (d.z * m2 - d.x * m5 - d.w * m1) * k,
        w: (c.x * m5 - c.z * m2 + c.w * m1) * k,
      },
      z: {
        x: (b.x * m10 - b.y * m8 + b.w * m6) * k,
        y: (a.y * m8 - a.x * m10 - a.w * m6) * k,
        z: (d.x * m4 - d.y * m2 + d.w * m0) * k,
        w: (c.y * m2 - c.x * m4 - c.w * m0) * k,
      },
      w: {
        x: (b.y * m7 - b.x * m9 - b.z * m6) * k,
        y: (a.x * m9 - a.y * m7 + a.z * m6) * k,
        z: (d.y * m1 - d.x * m3 - d.z * m0) * k,
        w: (c.x * m3 - c.y * m1 + c.z * m0) * k,
      },
    }
  },

  /**
   * Extracts the upper-left 3x3.
   *
   * The result keeps this module's reading — the triples are **columns**, matching
   * `Matrix3.transform` and `Matrix3.lookAt` — and is therefore the transpose of what a file holds.
   * `Matrix3.transpose` converts back if the on-disk form is what is wanted.
   */
  toMatrix3(matrix: Matrix4): Matrix3 {
    const { x, y, z } = matrix

    return {
      x: { x: x.x, y: x.y, z: x.z },
      y: { x: y.x, y: y.y, z: y.z },
      z: { x: z.x, y: z.y, z: z.z },
    }
  },

  /** Drops scale and returns the rotation and translation as a {@link Transform}. */
  toTransform(matrix: Matrix4): Transform {
    const { position, orientation } = Matrix4.decompose(matrix)
    return { position, orientation }
  },

  /**
   * Splits a matrix back into translation, rotation and scale.
   *
   * A negative determinant is folded into `scale.x`, which is the usual convention and the only one
   * available: a mirror cannot be a quaternion, and which axis carries the sign is not recoverable.
   * Nothing in the retail corpus mirrors — all 14,412 joint rotations and 12,053 hardpoint
   * orientations have determinant +1 — so this arm only fires on matrices an application built.
   *
   * A shear (from composing non-uniform scale with rotation) is not representable either and is
   * silently dropped.
   */
  decompose(matrix: Matrix4): { position: Vector3; orientation: Quat; scale: Vector3 } {
    const { x, y, z, w } = matrix

    const position = { x: w.x, y: w.y, z: w.z }

    let sx = Math.hypot(x.x, x.y, x.z)
    const sy = Math.hypot(y.x, y.y, y.z)
    const sz = Math.hypot(z.x, z.y, z.z)

    if (Matrix4.determinant(matrix) < 0) sx = -sx

    // Rows, which is the form Quat.fromMatrix reads — the inverse of Matrix3.fromQuaternion.
    const orientation = Quat.fromMatrix({
      x: { x: x.x / sx, y: y.x / sy, z: z.x / sz },
      y: { x: x.y / sx, y: y.y / sy, z: z.y / sz },
      z: { x: x.z / sx, y: y.z / sy, z: z.z / sz },
    })

    return { position, orientation, scale: { x: sx, y: sy, z: sz } }
  },

  /**
   * Writes the sixteen floats column-major — `uniformMatrix4fv` with `transpose = false`, or four
   * consecutive `mat4` attribute locations.
   *
   * `out` and `offset` are there so an instance buffer can be filled in place, without a
   * `Float32Array` per instance.
   */
  toArray(matrix: Matrix4, out = new Float32Array(16), offset = 0): Float32Array {
    const { x, y, z, w } = matrix

    out[offset + 0] = x.x
    out[offset + 1] = x.y
    out[offset + 2] = x.z
    out[offset + 3] = x.w
    out[offset + 4] = y.x
    out[offset + 5] = y.y
    out[offset + 6] = y.z
    out[offset + 7] = y.w
    out[offset + 8] = z.x
    out[offset + 9] = z.y
    out[offset + 10] = z.z
    out[offset + 11] = z.w
    out[offset + 12] = w.x
    out[offset + 13] = w.y
    out[offset + 14] = w.z
    out[offset + 15] = w.w

    return out
  },

  /**
   * Writes the upper-left 3x3 column-major — `uniformMatrix3fv` with `transpose = false`.
   *
   * For an orthonormal transform this is already the normal matrix, which covers every part
   * transform in the corpus. Anything carrying a non-uniform scale wants
   * `transpose(invert(matrix))` first.
   */
  toArray3(matrix: Matrix4, out = new Float32Array(9), offset = 0): Float32Array {
    const { x, y, z } = matrix

    out[offset + 0] = x.x
    out[offset + 1] = x.y
    out[offset + 2] = x.z
    out[offset + 3] = y.x
    out[offset + 4] = y.y
    out[offset + 5] = y.z
    out[offset + 6] = z.x
    out[offset + 7] = z.y
    out[offset + 8] = z.z

    return out
  },

  /**
   * Reads the sixteen floats back, column-major — the inverse of {@link Matrix4.toArray}.
   */
  fromArray(values: ArrayLike<number>, offset = 0): Matrix4 {
    const at = (index: number): number => values[offset + index] ?? 0

    return {
      x: { x: at(0), y: at(1), z: at(2), w: at(3) },
      y: { x: at(4), y: at(5), z: at(6), w: at(7) },
      z: { x: at(8), y: at(9), z: at(10), w: at(11) },
      w: { x: at(12), y: at(13), z: at(14), w: at(15) },
    }
  },

  /**
   * Left-handed perspective projection onto GL's -1..1 depth range: a point at +Z in view space is
   * in front of the camera, and larger Z is further away.
   *
   * Left-handed because Freelancer's space is (D3D, +Z into the screen) and positions are uploaded
   * verbatim. Nothing mirrors — x and y scale positively and {@link Matrix4.lookAtLH}'s basis has
   * determinant +1 — so a left-handed view space lands on GL's left-handed NDC with handedness
   * intact, and front faces come out clockwise. See RENDERER.md §2.
   *
   * @param fovY Vertical field of view (radians)
   * @param aspect Width over height
   */
  perspectiveLH(fovY: number, aspect: number, near: number, far: number): Matrix4 {
    const f = 1 / Math.tan(fovY / 2)
    const d = far - near

    return {
      x: { x: f / aspect, y: 0, z: 0, w: 0 },
      y: { x: 0, y: f, z: 0, w: 0 },
      z: { x: 0, y: 0, z: (far + near) / d, w: 1 },
      w: { x: 0, y: 0, z: (-2 * far * near) / d, w: 0 },
    }
  },

  /** Left-handed orthographic projection onto GL's -1..1 depth range. */
  orthographicLH(
    left: number,
    right: number,
    bottom: number,
    top: number,
    near: number,
    far: number,
  ): Matrix4 {
    const w = right - left
    const h = top - bottom
    const d = far - near

    return {
      x: { x: 2 / w, y: 0, z: 0, w: 0 },
      y: { x: 0, y: 2 / h, z: 0, w: 0 },
      z: { x: 0, y: 0, z: 2 / d, w: 0 },
      w: { x: -(right + left) / w, y: -(top + bottom) / h, z: -(far + near) / d, w: 1 },
    }
  },

  /**
   * Left-handed view matrix: the camera looks down its own +Z.
   *
   * Unlike `Matrix3.lookAt`, which aims the **x** axis along the direction, this is a view matrix —
   * it is the inverse of the camera's placement, so it takes world space to view space.
   */
  lookAtLH(eye: Vector3, target: Vector3, up: Vector3 = Vector3.y): Matrix4 {
    const z = Vector3.normalize(Vector3.subtract(target, eye))
    const x = Vector3.normalize(Vector3.cross(up, z))
    const y = Vector3.cross(z, x)

    return {
      x: { x: x.x, y: y.x, z: z.x, w: 0 },
      y: { x: x.y, y: y.y, z: z.y, w: 0 },
      z: { x: x.z, y: y.z, z: z.z, w: 0 },
      w: {
        x: -Vector3.dot(x, eye),
        y: -Vector3.dot(y, eye),
        z: -Vector3.dot(z, eye),
        w: 1,
      },
    }
  },

  /**
   * Pushes transformation matrix into transform stack, returning the composed result.
   *
   * The parent applies second — `parent * child` — which is what a joint chain wants. Note this is
   * the opposite argument order from `Matrix3.push`, and for the same reason `Matrix4.multiply`
   * composes the other way: a stored `Matrix3` holds rows where a `Matrix4` here holds columns.
   */
  push(stack: Matrix4[], matrix: Matrix4): Matrix4 {
    const last = stack.at(-1)
    stack.push((matrix = last ? Matrix4.multiply(last, matrix) : Matrix4.copy(matrix)))
    return matrix
  },
}

export default Matrix4
