import Quat from './quat.js'
import Vector3 from './vector3.js'
import Vector4 from './vector4.js'

/** Transformation stack element. */
interface Transform {
  position: Vector3
  orientation: Quat
}

const Transform = {
  /** Creates a copy of transform. */
  copy(transform: Transform): Transform {
    let { position, orientation } = transform

    position = Vector3.copy(position)
    orientation = Vector4.copy(orientation)

    return { position, orientation }
  },

  /** Transforms vector by a transform object. */
  transform(vector: Vector3, transform: Transform): Vector3 {
    const position = Quat.transform(vector, transform.orientation)

    return Vector3.add(position, transform.position)
  },

  /** Transforms vector by inverse of transform object. */
  revert(vector: Vector3, transform: Transform): Vector3 {
    const orientation = Quat.conjugate(transform.orientation)
    const position = Vector3.subtract(vector, transform.position)

    return Quat.transform(position, orientation)
  },

  /** Multiplies transform by a transform object. */
  multiply(child: Transform, parent: Transform): Transform {
    const orientation = Quat.multiply(parent.orientation, child.orientation)
    let position = Quat.transform(child.position, parent.orientation)
    position = Vector3.add(position, parent.position)

    return { position, orientation }
  },

  /** Interpolates between two transforms. */
  interpolate(source: Transform, target: Transform, t: number): Transform {
    const orientation = Quat.slerp(source.orientation, target.orientation, t)
    const position = Vector3.lerp(source.position, target.position, t)

    return { position, orientation }
  },

  /** Pushes transform to transform stack. */
  push(stack: Transform[], transform: Transform): void {
    const last = stack.at(-1)
    stack.push(last ? Transform.multiply(transform, last) : Transform.copy(transform))
  },
}

export default Transform
