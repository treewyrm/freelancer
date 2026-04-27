import Directory from '#/directory.js'
import { getResourceId, type Hashable } from '#/hash.js'
import { readVMeshData, vertexByteLength, writeVMeshData, type VMeshData } from './data.js'
import type { VMeshRef } from './ref.js'

export type VMeshLibrary = Map<number, VMeshData>

export const getMesh = (library: VMeshLibrary, name: Hashable): VMeshData | undefined =>
  library.get(getResourceId(name))

export function* readVMeshLibrary(parent: Directory): Generator<VMeshData> {
  const directory = parent.getDirectory('VMeshLibrary')
  if (!directory) return

  for (const subdirectory of directory.directories) {
    const data = readVMeshData(subdirectory)
    if (!data) continue

    yield data
  }
}

export const writeVMeshLibrary = (values: Iterable<VMeshData>): Directory => {
  const directory = new Directory('VMeshLibrary')

  for (const data of values) directory.children.push(writeVMeshData(data))

  return directory
}

export function* getMeshDraw(library: VMeshLibrary, reference: VMeshRef) {
  const { meshId, groupStart, groupCount, indexStart } = reference

  const data = getMesh(library, meshId)
  if (!data) throw new RangeError(`Mesh ${meshId} not found.`)

  const { primitive, format } = data
  const size = vertexByteLength(format)

  let base = indexStart

  for (let g = 0; g < groupCount; g++) {
    const group = data.groups.at(g + groupStart)
    if (!group) continue

    const { materialId } = group
    const start = group.vertexStart * size
    const end = start + Math.max(0, group.vertexEnd - group.vertexStart) * size

    const elements = data.indices.subarray(base, base + group.elementCount)
    const vertices = data.vertices.subarray(start, end)

    yield { materialId, primitive, base, elements, format, size, vertices }

    base += group.elementCount
  }
}
