import BufferView from '#/utility/bufferview.js'
import type Vector3 from '#/math/vector3.js'
import { createFaces, type Face, type TriangleIndices } from './face.js'

/**
 * Not an enum in IVP but two packed flags: `has_children` (bits 0-1) and `is_compact` (bits 2-3).
 * Every hull Freelancer emits is compact, so only these two values occur.
 */
export enum HullType {
  /** Terminal hull; the node holding it is a leaf. */
  Enabled = 4,

  /** Hull bounds an entire subtree; the node holding it has children. */
  Skip = 5,
}

/**
 * One convex hull. Corresponds to IVP's `IVP_Compact_Ledge`.
 *
 * Faces carry the half-edge adjacency, and its points index the shared list of the part the hull
 * belongs to — a hull has no point list of its own.
 */
export interface Hull {
  /**
   * IVP's `union { ledgetree_node_offset; client_data; }`.
   * - Model part ID when type is 4. May differ from the id of the surface part it belongs to.
   * - Offset back to the owning node when type is 5, relative to the hull.
   */
  id: number

  /** Hull type determines state (4 = enabled, 5 = skip). */
  type: HullType

  /** Hull faces. */
  faces: Face[]

  /** Reserved trailing field. Zero in every hull Freelancer ships. */
  reserved: number
}

/**
 * IVP stores `size_div_16`, the whole ledge size in 16-byte units: one header, one per triangle
 * and one per point. A closed convex polyhedron has `V = 2 + F / 2` by Euler's formula, so the
 * count reduces to `1 + F + (2 + F / 2)`, i.e. `(12 + F * 6) / 4`.
 */
const getIndexCount = (faceCount: number): number => (12 + faceCount * 6) / 4

/**
 * A triangle occupies four 4-byte slots: a header word followed by its three edges. Edge `v` of
 * face `f` therefore sits at slot `4f + v + 1`, while `Face.opposites` uses the flat edge index
 * `3f + v`. IVP's `opposite_index` is a slot delta, so both codecs convert through these.
 *
 * `toEdgeIndex` takes a slot biased by -1 (the running `count` used while walking edges).
 */
const toEdgeIndex = (slot: number): number => Math.ceil(slot - slot / 4)

const toSlot = (edge: number): number => edge + Math.floor(edge / 3)

/**
 * The distinct point indices a hull's faces reference, in first-use order. A part shares one point
 * list across all its hulls, so this is what says which of them a given hull actually touches.
 */
export const getIndices = (faces: Face[]): number[] => [
  ...new Set(faces.flatMap((face) => face.points)),
]

/**
 * Builds one convex hull from triangles indexing the point list its surface part shares. See
 * {@link createFaces} for what the triangles have to satisfy.
 *
 * A {@link HullType.Skip} hull's {@link Hull.id} is a byte offset back to the node that owns it,
 * which only {@link writeSurface} can know, so it is left at zero and assigned on write.
 */
export const createHull = (
  id: number,
  points: readonly Vector3[],
  triangles: Iterable<TriangleIndices>,
  type: HullType = HullType.Enabled,
): Hull => ({
  id: type === HullType.Skip ? 0 : id,
  type,
  faces: createFaces(points, triangles, type === HullType.Skip),
  reserved: 0,
})

/**
 * Reads one hull from a cursor, rebuilding the half-edge adjacency as it goes.
 *
 * Faces are stored by their own index rather than in order, so the list is filled by position, not
 * appended to. `opposites` is stored as a signed slot delta and is converted to the flat edge index
 * `3f + v` this library uses.
 * @throws RangeError when the header's index count disagrees with the face count that follows,
 * which is the only self-check the record carries.
 */
export function readHull(view: BufferView): Hull {
  const id = view.readUint32()
  const hull = view.readUint32() // Hull header.
  const type = hull & 0xff

  const indexCount = hull >> 8

  const faces: Face[] = new Array(view.readUint16())
  const reserved = view.readUint16()

  let count = 0

  for (let i = 0; i < faces.length; i++) {
    /**
     * Virtual flag (1 bit), material index (7 bits), pierce index (12 bits unsigned),
     * face index (12 bits unsigned).
     */
    const header = view.readUint32()

    /** Face index. */
    const index = header & 0xfff

    const face: Face = (faces[index] = {
      material: (header >> 24) & 0x7f,
      virtual: header >>> 31 > 0,
      pierce: (header >> 12) & 0xfff,
      points: [0, 0, 0],
      opposites: [0, 0, 0],
      virtualEdges: [false, false, false],
    })

    for (let v = 0; v < 3; v++) {
      face.points[v] = view.readUint16()

      /** Virtual flag (1 bit), slot offset to the opposite edge (signed 15-bit integer). */
      const data = view.readUint16()
      face.virtualEdges[v] = data >> 15 > 0

      /** Sign-extend the low 15 bits. */
      const relative = (data & 0x3fff) - (data & 0x4000)

      face.opposites[v] = toEdgeIndex(count + relative)

      count++
    }

    count++
  }

  if (getIndexCount(faces.length) !== indexCount) throw new RangeError('Invalid hull index count')

  return { id, type, faces, reserved }
}

/**
 * Writes one hull at the cursor, converting the flat edge indices back to the signed slot deltas
 * IVP stores, and deriving the header's index count from the face count.
 */
export function writeHull(view: BufferView, hull: Hull): void {
  view.writeUint32(hull.id)
  view.writeUint32((getIndexCount(hull.faces.length) << 8) | (hull.type & 0xff))
  view.writeUint16(hull.faces.length)
  view.writeUint16(hull.reserved)

  let count = 0

  for (const [index, face] of hull.faces.entries()) {
    view.writeUint32(
      ((index & 0xfff) |
        ((face.pierce & 0xfff) << 12) |
        ((face.material & 0x7f) << 24) |
        (face.virtual ? 0x80000000 : 0)) >>>
        0,
    )

    for (let v = 0; v < 3; v++) {
      let data = (toSlot(face.opposites[v]!) - count) & 0x7fff
      if (face.virtualEdges[v]) data |= 0x8000

      view.writeUint16(face.points[v]!)
      view.writeUint16(data)
      count++
    }

    count++
  }
}
