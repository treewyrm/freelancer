import BufferView from '#/utility/bufferview.js'
import Directory from '#/directory.js'
import File from '#/file.js'
import type Vector3 from '#/math/vector3.js'

export interface BoundingBox {
  a: Vector3
  b: Vector3
}

export interface BoundingSphere {
  center: Vector3
  radius: number
}

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

export function readVMeshRef(parent: Directory) {
  const file = parent.getFile('VMeshRef')
  if (!file) throw new Error('Missing VMeshRef')

  const view = BufferView.from(file)
  if (view.readUint32() !== byteLength) throw new RangeError('Invalid mesh reference size')

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
      a: minimum,
      b: maximum,
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
  view.writeFloat32(ref.boundingBox.a.x)
  view.writeFloat32(ref.boundingBox.a.y)
  view.writeFloat32(ref.boundingBox.a.z)
  view.writeFloat32(ref.boundingBox.b.x)
  view.writeFloat32(ref.boundingBox.b.y)
  view.writeFloat32(ref.boundingBox.b.z)
  view.writeFloat32(ref.boundingSphere.center.x)
  view.writeFloat32(ref.boundingSphere.center.y)
  view.writeFloat32(ref.boundingSphere.center.z)
  view.writeFloat32(ref.boundingSphere.radius)

  return new File('VMeshRef', view)
}
