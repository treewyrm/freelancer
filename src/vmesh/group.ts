import BufferView from '#/utility/bufferview.js'

export interface VMeshGroup {
  materialId: number
  vertexStart: number
  vertexEnd: number
  elementCount: number
  padding: number
}

export const byteLength = 12

export function readVMeshGroup(view: BufferView): VMeshGroup {
  return {
    materialId: view.readInt32(),
    vertexStart: view.readUint16(),
    vertexEnd: view.readUint16(),
    elementCount: view.readUint16(),
    padding: view.readUint16(),
  }
}

export function writeVMeshGroup(group: VMeshGroup): BufferView {
  const view = BufferView.allocate(byteLength)

  view.writeInt32(group.materialId)
  view.writeUint16(group.vertexStart)
  view.writeUint16(group.vertexEnd)
  view.writeUint16(group.elementCount)
  view.writeUint16(group.padding)

  return view
}
