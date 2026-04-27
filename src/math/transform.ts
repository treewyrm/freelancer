import Quat from './quat.js'
import Vector3 from './vector3.js'
import Vector4 from './vector4.js'

/** Transformation stack element. */
type Transform = { position: Vector3; orientation: Quat }

const Transform = {
  /** Creates a copy of transform. */
  copy: ({ position, orientation }: Transform): Transform => ({
    position: Vector3.copy(position),
    orientation: Vector4.copy(orientation),
  }),

  /** Transforms vector by a transform object. */
  transform: (v: Vector3, t: Transform): Vector3 =>
    Vector3.add(Quat.transform(v, t.orientation), t.position),

  /** Transforms vector by inverse of transform object. */
  revert: (v: Vector3, t: Transform): Vector3 =>
    Quat.transform(Vector3.subtract(v, t.position), Quat.conjugate(t.orientation)),

  /** Multiplies transform by a transform object. */
  multiply: (child: Transform, parent: Transform): Transform => ({
    position: Vector3.add(Quat.transform(child.position, parent.orientation), parent.position),
    orientation: Quat.multiply(parent.orientation, child.orientation),
  }),

  /** Interpolates between two transforms. */
  interpolate: (a: Transform, b: Transform, t: number): Transform => ({
    position: Vector3.lerp(a.position, b.position, t),
    orientation: Quat.slerp(a.orientation, b.orientation, t),
  }),

  /** Pushes transform to transform stack. */
  push: (stack: Transform[], transform: Transform): void => {
    const last = stack.at(-1)
    stack.push(last ? Transform.multiply(transform, last) : Transform.copy(transform))
  },
}

export default Transform
