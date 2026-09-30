import Vector3 from './vector3.js'

/** Sphere by centre and radius, in the same frame as whatever it encloses. */
interface BoundingSphere {
  center: Vector3
  radius: number
}

const BoundingSphere = {
  /** Creates a copy of a sphere. */
  copy({ center, radius }: BoundingSphere): BoundingSphere {
    return { center: Vector3.copy(center), radius }
  },
}

export default BoundingSphere
