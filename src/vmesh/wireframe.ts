import Directory from '#/directory.js'
import File from '#/file.js'
import BufferView from '#/utility/bufferview.js'

const byteLength = 0x10

/**
 * Wireframe line data.
 *
 * `vertexStart`, `vertexCount` and `vertexRange` are stored as authored and are never recomputed on
 * write, so files round-trip byte-exactly whichever exporter produced them. Exporters disagree on
 * `vertexRange`; see [VMESH.md](../../docs/VMESH.md) for the canonical formulas to use when
 * authoring new data.
 */
export interface VWireData {
  /** Mesh buffer id. */
  meshId: number

  /** Base vertex offset in the mesh vertex buffer. Indices are relative to it. */
  vertexStart: number

  /** Number of unique vertex ids referenced by indices. */
  vertexCount: number

  /** Vertex span covering the referenced vertices, matching Direct3D NumVertices. */
  vertexRange: number

  /** Wireframe element (LineList) indices, relative to vertexStart. */
  indices: Uint16Array
}

export interface VMeshWire {
  data: VWireData
}

export function readVMeshWire(parent: Directory): VMeshWire | undefined {
  const directory = parent.getDirectory('VMeshWire')
  if (!directory) return

  const file = directory.getFile('VWireData')
  if (!file) throw new Error(`Missing VWireData in ${parent.name}`)

  const view = BufferView.from(file)

  if (view.readUint32() !== byteLength) throw new RangeError('Invalid VWireData size.')
  const meshId = view.readInt32()

  const vertexStart = view.readUint16()
  const vertexCount = view.readUint16()
  const indices = new Uint16Array(view.readUint16())
  const vertexRange = view.readUint16()

  for (let i = 0; i < indices.length; i++) indices[i] = view.readUint16()

  return {
    data: {
      meshId,
      vertexStart,
      vertexCount,
      vertexRange,
      indices,
    },
  }
}

export function writeVMeshWire(data: VMeshWire): Directory {
  const {
    data: { meshId, vertexStart, vertexCount, indices, vertexRange },
  } = data

  const view = BufferView.join(
    BufferView.allocate(Uint32Array.BYTES_PER_ELEMENT * 4)
      .writeUint32(byteLength)
      .writeInt32(meshId)
      .writeUint16(vertexStart)
      .writeUint16(vertexCount)
      .writeUint16(indices.length)
      .writeUint16(vertexRange),
    BufferView.allocate(indices.byteLength).writeBuffer(indices),
  )

  return new Directory('VMeshWire', [new File('VWireData', view)])
}
