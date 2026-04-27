import BufferView from '#/utility/bufferview.js'

export interface VMeshGroup {
  materialId: number
  vertexStart: number
  vertexEnd: number
  elementCount: number
  padding: number
}

export const byteLength = 12

export const readVMeshGroup = (view: BufferView): VMeshGroup => ({
  materialId: view.readInt32(),
  vertexStart: view.readUint16(),
  vertexEnd: view.readUint16(),
  elementCount: view.readUint16(),
  padding: view.readUint16(),
})

export const writeVMeshGroup = (group: VMeshGroup): BufferView =>
  BufferView.allocate(byteLength)
    .writeInt32(group.materialId)
    .writeUint16(group.vertexStart)
    .writeUint16(group.vertexEnd)
    .writeUint16(group.elementCount)
    .writeUint16(group.padding)
