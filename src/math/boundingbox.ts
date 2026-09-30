import Vector3 from './vector3.js'

/** Axis-aligned box between its minimum and maximum corners. */
interface BoundingBox {
  min: Vector3
  max: Vector3
}

const BoundingBox = {
  /** Creates a copy of a box. */
  copy({ min, max }: BoundingBox): BoundingBox {
    return { min: Vector3.copy(min), max: Vector3.copy(max) }
  },

  /** Axis-aligned box of a point set. An empty set yields an inverted, empty box. */
  fromPoints(points: Iterable<Vector3>): BoundingBox {
    const min = { x: Infinity, y: Infinity, z: Infinity }
    const max = { x: -Infinity, y: -Infinity, z: -Infinity }

    for (const { x, y, z } of points) {
      min.x = Math.min(min.x, x)
      min.y = Math.min(min.y, y)
      min.z = Math.min(min.z, z)
      max.x = Math.max(max.x, x)
      max.y = Math.max(max.y, y)
      max.z = Math.max(max.z, z)
    }

    return { min, max }
  },
}

export default BoundingBox
