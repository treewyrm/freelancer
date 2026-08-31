import BufferView from '#/utility/bufferview.js'

/**
 * One `DrawIndexedPrimitive` call's worth of a mesh — a material and the slice it draws.
 *
 * `vertexEnd` is **inclusive**: a group's index values are relative to `vertexStart`, so
 * `vertexStart + max(indices) === vertexEnd`, and treating it as exclusive drops a vertex per group.
 */
export interface VMeshGroup {
  materialId: number
  vertexStart: number
  vertexEnd: number
  elementCount: number
  padding: number
}

export const byteLength = 12

/** Reads one group record from a cursor — a single `DrawIndexedPrimitive`'s worth of the mesh. */
export function readVMeshGroup(view: BufferView): VMeshGroup {
  return {
    materialId: view.readInt32(),
    vertexStart: view.readUint16(),
    vertexEnd: view.readUint16(),
    elementCount: view.readUint16(),
    padding: view.readUint16(),
  }
}

/**
 * Writes one group record into a view of its own, for the mesh writer to join with the rest.
 * `padding` is unused alignment and is written back as carried rather than zeroed, so a round trip
 * cannot perturb it.
 */
export function writeVMeshGroup(group: VMeshGroup): BufferView {
  const view = BufferView.allocate(byteLength)

  view.writeInt32(group.materialId)
  view.writeUint16(group.vertexStart)
  view.writeUint16(group.vertexEnd)
  view.writeUint16(group.elementCount)
  view.writeUint16(group.padding)

  return view
}
