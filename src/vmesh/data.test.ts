import { deepStrictEqual, strictEqual, throws } from 'node:assert/strict'
import { describe, it } from 'node:test'
import Directory from '#/utf/directory.js'
import File from '#/utf/file.js'
import BufferView from '#/utility/bufferview.js'
import {
  VertexFormat,
  Primitive,
  getMapCount,
  readVMeshData,
  vertexByteLength,
  writeVMeshData,
  type VMeshData,
} from './data.js'
import type { VMeshGroup } from './group.js'

const group = (materialId: number, vertexStart: number, vertexEnd: number, elementCount: number) =>
  ({ materialId, vertexStart, vertexEnd, elementCount, padding: 0 }) satisfies VMeshGroup

/** Two groups over a six-vertex, twelve-index Position|Normal|Tex1 mesh. */
const sample = (): VMeshData => ({
  name: 'body.lod0.vms',
  type: 1,
  primitive: Primitive.TriangleList,
  format: VertexFormat.Position | VertexFormat.Normal | VertexFormat.Texture1,
  groups: [group(0x11111111, 0, 2, 6), group(-1, 3, 5, 6)],
  indices: Uint16Array.from([0, 1, 2, 2, 1, 0, 3, 4, 5, 5, 4, 3]),
  vertices: Uint8Array.from({ length: 6 * 32 }, (_, i) => i & 0xff),
})

const wrap = (data: VMeshData) => new Directory('VMeshLibrary', [writeVMeshData(data)])

describe('getMapCount', () => {
  it('extracts the UV set count from bits 8..11', () => {
    strictEqual(getMapCount(VertexFormat.Position), 0)
    strictEqual(getMapCount(VertexFormat.Position | VertexFormat.Texture1), 1)
    strictEqual(getMapCount(VertexFormat.Position | VertexFormat.Texture2), 2)
    strictEqual(getMapCount(VertexFormat.Position | VertexFormat.Texture8), 8)
  })

  it('ignores the non-texture flags', () => {
    const format = VertexFormat.Position | VertexFormat.Normal | VertexFormat.Diffuse | VertexFormat.Specular
    strictEqual(getMapCount(format | VertexFormat.Texture3), 3)
  })
})

describe('vertexByteLength', () => {
  // Every vertex format present in the retail game files, with the stride D3D
  // computes for it. A wrong stride desynchronises the whole vertex buffer.
  const formats: [number, number][] = [
    [0x002, 12], // position
    [0x012, 24], // position, normal
    [0x102, 20], // position, uv1
    [0x112, 32], // position, normal, uv1
    [0x142, 24], // position, diffuse, uv1
    [0x152, 36], // position, normal, diffuse, uv1
    [0x212, 40], // position, normal, uv2
    [0x252, 44], // position, normal, diffuse, uv2
  ]

  for (const [format, size] of formats)
    it(`measures format 0x${format.toString(16).padStart(3, '0')} as ${size} bytes`, () => {
      strictEqual(vertexByteLength(format), size)
    })

  it('counts point size and specular, which the game files never use', () => {
    strictEqual(vertexByteLength(VertexFormat.Position | VertexFormat.PointSize), 16)
    strictEqual(vertexByteLength(VertexFormat.Position | VertexFormat.Specular), 16)
  })
})

describe('writeVMeshData', () => {
  it('takes the directory name from the mesh name and the file name is VMeshData', () => {
    const directory = writeVMeshData(sample())

    strictEqual(directory.name, 'body.lod0.vms')
    strictEqual(directory.getFile('VMeshData')?.name, 'VMeshData')
  })

  it('writes a 16-byte header of version, primitive, and four counters', () => {
    const view = BufferView.from(writeVMeshData(sample()).getFile('VMeshData')!)

    strictEqual(view.readUint32(), 1)
    strictEqual(view.readUint32(), Primitive.TriangleList)
    deepStrictEqual([...new Uint16Array(view.buffer, 8, 4)], [2, 12, 0x112, 6])
  })

  it('sizes the file as header, groups, indices, then vertices with nothing left over', () => {
    const data = sample()
    const file = writeVMeshData(data).getFile('VMeshData')!

    strictEqual(file.byteLength, 16 + 2 * 12 + data.indices.byteLength + data.vertices.byteLength)
  })

  it('derives the vertex count from the buffer length and the format stride', () => {
    const data = sample()
    data.vertices = new Uint8Array(9 * vertexByteLength(data.format))

    const view = BufferView.from(writeVMeshData(data).getFile('VMeshData')!)
    view.offset = 14

    strictEqual(view.readUint16(), 9)
  })
})

describe('readVMeshData', () => {
  it('round-trips every field', () => {
    const data = sample()

    deepStrictEqual(readVMeshData(wrap(data).directories[0]!), data)
  })

  it('takes the mesh name from the owning directory, not from the payload', () => {
    const directory = writeVMeshData(sample())
    directory.name = 'renamed.vms'

    strictEqual(readVMeshData(directory).name, 'renamed.vms')
  })

  it('throws when the directory has no VMeshData file', () => {
    throws(() => readVMeshData(new Directory('body.lod0.vms')), /Missing VMeshData/)
  })

  it('throws RangeError on a version other than 1', () => {
    const file = writeVMeshData(sample()).getFile('VMeshData')!
    BufferView.from(file).writeUint32(2)

    throws(() => readVMeshData(new Directory('mesh', [file])), RangeError)
  })

  it('reads a mesh with no groups and no geometry', () => {
    const data: VMeshData = {
      name: 'empty.vms',
      type: 1,
      primitive: Primitive.TriangleList,
      format: VertexFormat.Position,
      groups: [],
      indices: new Uint16Array(0),
      vertices: new Uint8Array(0),
    }

    deepStrictEqual(readVMeshData(wrap(data).directories[0]!), data)
  })

  it('preserves trailing bytes it does not consume by simply ignoring them', () => {
    const data = sample()
    const original = writeVMeshData(data).getFile('VMeshData')!
    const padded = new File(
      'VMeshData',
      BufferView.join(original, BufferView.allocate(8).writeUint32(0xdeadbeef)),
    )

    deepStrictEqual(readVMeshData(new Directory(data.name, [padded])), data)
  })
})
