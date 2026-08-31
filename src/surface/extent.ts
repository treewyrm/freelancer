import BufferView from '#/utility/bufferview.js'
import type Vector3 from '#/math/vector3.js'
import type { TriangleIndices } from './face.js'

/** Extents section (bounding box). */
export interface Extent {
  /** Boundary box minimum. */
  minimum: Vector3

  /** Boundary box maximum. */
  maximum: Vector3
}

/** Axis-aligned bounding box of a point set. An empty set yields an inverted, empty extent. */
export function getExtent(points: Iterable<Vector3>): Extent {
  const minimum = { x: Infinity, y: Infinity, z: Infinity }
  const maximum = { x: -Infinity, y: -Infinity, z: -Infinity }

  for (const { x, y, z } of points) {
    minimum.x = Math.min(minimum.x, x)
    minimum.y = Math.min(minimum.y, y)
    minimum.z = Math.min(minimum.z, z)
    maximum.x = Math.max(maximum.x, x)
    maximum.y = Math.max(maximum.y, y)
    maximum.z = Math.max(maximum.z, z)
  }

  return { minimum, maximum }
}

/**
 * The eight corners of a box and the twelve triangles over them, wound counter-clockwise seen
 * from outside — the geometry a hull is built from. Corners are indexed by axis bit, so corner
 * `n` takes {@link Extent.maximum} on axis `a` when bit `a` of `n` is set.
 */
export function createBox(extent: Extent): { points: Vector3[]; triangles: TriangleIndices[] } {
  const { minimum, maximum } = extent

  const points = Array.from({ length: 8 }, (_, index) => ({
    x: index & 1 ? maximum.x : minimum.x,
    y: index & 2 ? maximum.y : minimum.y,
    z: index & 4 ? maximum.z : minimum.z,
  }))

  /** Two triangles per box face, in the order -Z, +Z, -Y, +Y, -X, +X. */
  const triangles: TriangleIndices[] = [
    [0, 2, 3],
    [0, 3, 1],
    [4, 5, 7],
    [4, 7, 6],
    [0, 1, 5],
    [0, 5, 4],
    [2, 7, 3],
    [2, 6, 7],
    [0, 4, 6],
    [0, 6, 2],
    [1, 3, 7],
    [1, 7, 5],
  ]

  return { points, triangles }
}

/**
 * Stored as two contiguous vectors (minimum xyz, then maximum xyz), not interleaved
 * per component the way `VMeshRef` stores its bounding box.
 */
export function readExtent(view: BufferView, extent: Extent): BufferView {
  const { minimum, maximum } = extent

  minimum.x = view.readFloat32()
  minimum.y = view.readFloat32()
  minimum.z = view.readFloat32()
  maximum.x = view.readFloat32()
  maximum.y = view.readFloat32()
  maximum.z = view.readFloat32()

  return view
}

export function writeExtent(extent: Extent): BufferView {
  const { minimum, maximum } = extent

  return BufferView.allocate(Float32Array.BYTES_PER_ELEMENT * 6)
    .writeFloat32(minimum.x)
    .writeFloat32(minimum.y)
    .writeFloat32(minimum.z)
    .writeFloat32(maximum.x)
    .writeFloat32(maximum.y)
    .writeFloat32(maximum.z)
}
