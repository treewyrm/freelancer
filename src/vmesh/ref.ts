import BufferView from '#/utility/bufferview.js'
import Directory from '#/utf/directory.js'
import File from '#/utf/file.js'
import type BoundingBox from '#/math/boundingbox.js'
import type BoundingSphere from '#/math/boundingsphere.js'

/**
 * A window into a mesh library: which mesh, and which slice of its groups, indices and vertices to
 * draw. The bounds are the part's own, not the whole mesh's.
 *
 * `meshId` is a CRC and stays one — a reference does not say which library holds its mesh, so
 * resolution is the caller's step.
 */
export interface VMeshRef {
  meshId: number
  vertexStart: number
  vertexCount: number
  indexStart: number
  indexCount: number
  groupStart: number
  groupCount: number
  boundingBox: BoundingBox
  boundingSphere: BoundingSphere
}

const byteLength = 60

/**
 * Reads a `VMeshRef` — the window into a mesh library a part draws through, plus its bounds.
 *
 * Nothing is resolved here: `meshId` is a CRC and stays one, because a reference does not say which
 * library holds its mesh. See `getMesh` for why that lookup is the caller's.
 *
 * The leading size field is read and discarded. It is 60 in all 9,322 retail references, but the
 * record is fixed-size so the field carries nothing the layout does not already give, and the
 * engine does not enforce it — hand-authored models that leave it zero load and render. Validating
 * it would reject those for a byte the game ignores.
 * @throws Error when the directory holds no `VMeshRef` file.
 * @throws RangeError when the file is shorter than the fixed 60 bytes.
 */
export function readVMeshRef(parent: Directory): VMeshRef {
  const file = parent.getFile('VMeshRef')
  if (!file) throw new Error('Missing VMeshRef')

  const view = BufferView.from(file)
  view.readUint32()

  const meshId = view.readInt32()
  const vertexStart = view.readUint16()
  const vertexCount = view.readUint16()
  const indexStart = view.readUint16()
  const indexCount = view.readUint16()
  const groupStart = view.readUint16()
  const groupCount = view.readUint16()

  const minimum = { x: 0, y: 0, z: 0 }
  const maximum = { x: 0, y: 0, z: 0 }

  maximum.x = view.readFloat32()
  minimum.x = view.readFloat32()
  maximum.y = view.readFloat32()
  minimum.y = view.readFloat32()
  maximum.z = view.readFloat32()
  minimum.z = view.readFloat32()

  return {
    meshId,
    vertexStart,
    vertexCount,
    indexStart,
    indexCount,
    groupStart,
    groupCount,
    boundingBox: {
      min: minimum,
      max: maximum,
    },
    boundingSphere: {
      center: {
        x: view.readFloat32(),
        y: view.readFloat32(),
        z: view.readFloat32(),
      },
      radius: view.readFloat32(),
    },
  } satisfies VMeshRef
}

/**
 * Writes a `VMeshRef` file. The record is fixed-size, so nothing here is derived.
 *
 * The size field is always the canonical 60, which normalizes a reference that arrived holding
 * something else. That is the one field a round trip does not reproduce verbatim, and it is safe
 * because the engine does not read it.
 */
export function writeVMeshRef(ref: VMeshRef): File {
  const view = BufferView.allocate(byteLength)

  view.writeUint32(byteLength)
  view.writeInt32(ref.meshId)
  view.writeUint16(ref.vertexStart)
  view.writeUint16(ref.vertexCount)
  view.writeUint16(ref.indexStart)
  view.writeUint16(ref.indexCount)
  view.writeUint16(ref.groupStart)
  view.writeUint16(ref.groupCount)
  // Components are interleaved as max, min per axis, not two contiguous vectors.
  view.writeFloat32(ref.boundingBox.max.x)
  view.writeFloat32(ref.boundingBox.min.x)
  view.writeFloat32(ref.boundingBox.max.y)
  view.writeFloat32(ref.boundingBox.min.y)
  view.writeFloat32(ref.boundingBox.max.z)
  view.writeFloat32(ref.boundingBox.min.z)
  view.writeFloat32(ref.boundingSphere.center.x)
  view.writeFloat32(ref.boundingSphere.center.y)
  view.writeFloat32(ref.boundingSphere.center.z)
  view.writeFloat32(ref.boundingSphere.radius)

  return new File('VMeshRef', view)
}
