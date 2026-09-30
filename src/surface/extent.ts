import BufferView from '#/utility/bufferview.js'
import BoundingBox from '#/math/boundingbox.js'
import type Vector3 from '#/math/vector3.js'
import type { TriangleIndices } from './face.js'

/** Axis-aligned bounding box of a point set. An empty set yields an inverted, empty box. */
export const getExtent = (points: Iterable<Vector3>): BoundingBox => BoundingBox.fromPoints(points)

/**
 * The eight corners of a box and the twelve triangles over them, wound counter-clockwise seen
 * from outside — the geometry a hull is built from. Corners are indexed by axis bit, so corner
 * `n` takes {@link BoundingBox.max} on axis `a` when bit `a` of `n` is set.
 */
export function createBox(box: BoundingBox): { points: Vector3[]; triangles: TriangleIndices[] } {
  const { min, max } = box

  const points = Array.from({ length: 8 }, (_, index) => ({
    x: index & 1 ? max.x : min.x,
    y: index & 2 ? max.y : min.y,
    z: index & 4 ? max.z : min.z,
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
 * Reads an `exts` payload. Stored as two contiguous vectors (minimum xyz, then maximum xyz), not
 * interleaved per component the way `VMeshRef` stores its bounding box.
 */
export function readExtent(view: BufferView): BoundingBox {
  return {
    min: { x: view.readFloat32(), y: view.readFloat32(), z: view.readFloat32() },
    max: { x: view.readFloat32(), y: view.readFloat32(), z: view.readFloat32() },
  }
}

/** Writes an `exts` payload: minimum xyz then maximum xyz, two contiguous vectors. */
export function writeExtent({ min, max }: BoundingBox): BufferView {
  return BufferView.allocate(Float32Array.BYTES_PER_ELEMENT * 6)
    .writeFloat32(min.x)
    .writeFloat32(min.y)
    .writeFloat32(min.z)
    .writeFloat32(max.x)
    .writeFloat32(max.y)
    .writeFloat32(max.z)
}
