import BufferView from '#/utility/bufferview.js'
import Directory from '#/utf/directory.js'
import File from '#/utf/file.js'
import { readVMeshGroup, writeVMeshGroup, type VMeshGroup } from './group.js'

/**
 * One mesh in a library: the vertex and index buffers, and the groups that draw from them.
 *
 * Neither buffer is typed beyond its element size. `indices` are raw `uint16` values relative to the
 * offsets a {@link VMeshRef} and a {@link VMeshGroup} supply, and `vertices` is bytes, because the
 * FVF word decides the attribute layout and stride at runtime. Interpreting them is
 * {@link vertexByteLength}'s and the consumer's.
 */
export interface VMeshData {
  name: string

  /** Mesh data version?. */
  type: 1

  /** Mesh primitive type. */
  primitive: Primitive

  /** Vertex format. */
  format: VertexFormat

  /** Mesh groups. */
  groups: VMeshGroup[]

  /** Element indices. */
  indices: Uint16Array

  /** Vertex attributes. */
  vertices: Uint8Array
}

/** Direct3D primitive type (D3DPRIMITIVETYPE). */
export enum Primitive {
  None,

  /** Point list `D3DPT_POINTLIST` */
  PointList,

  /** Line list `D3DPT_LINELIST` */
  LineList,

  /** Line strip `D3DPT_LINESTRIP` */
  LineStrip,

  /** Triangle list `D3DPT_TRIANGLELIST` */
  TriangleList,

  /** Triangle strip `D3DPT_TRIANGLESTRIP` */
  TriangleStrip,

  /** Triangle fan `D3DPT_TRIANGLEFAN` */
  TriangleFan,
}

/** Direct3D flexible vertex format (FVF). */
export enum VertexFormat {
  /** Vertex position `D3DFVF_XYZ` */
  Position = 0x02,

  /** Vertex normal `D3DFVF_NORMAL` */
  Normal = 0x10,

  /** Vertex point size `D3DFVF_PSIZE` */
  PointSize = 0x20,

  /** Vertex diffuse color `D3DFVF_DIFFUSE` */
  Diffuse = 0x40,

  /** Vertex specular color `D3DFVF_SPECULAR` */
  Specular = 0x80,

  /** Texture UVs count mask. */
  TextureCountMask = 0xf00,

  /** Texture UVs count shift. */
  TextureCountShift = 8,

  /** Vertex UV1 `D3DFVF_TEX1` */
  Texture1 = 0x100,

  /** Vertex UV2 `D3DFVF_TEX2` */
  Texture2 = 0x200,

  /** Vertex UV3 `D3DFVF_TEX3` */
  Texture3 = 0x300,

  /** Vertex UV4 `D3DFVF_TEX4` */
  Texture4 = 0x400,

  /** Vertex UV5 `D3DFVF_TEX5` */
  Texture5 = 0x500,

  /** Vertex UV6 `D3DFVF_TEX6` */
  Texture6 = 0x600,

  /** Vertex UV7 `D3DFVF_TEX7` */
  Texture7 = 0x700,

  /** Vertex UV8 `D3DFVF_TEX8` */
  Texture8 = 0x800,
}

/**
 * Calculates number of UV maps for the vertex format.
 * @param format FVF bitmask
 * @returns
 */
export const getMapCount = (format: VertexFormat) =>
  (format & VertexFormat.TextureCountMask) >> VertexFormat.TextureCountShift

/**
 * Calculates vertex byte length for the vertex format.
 * @param format FVF bitmask
 * @returns
 */
export function vertexByteLength(format: VertexFormat): number {
  let size = 0

  if (format & VertexFormat.Position) size += Float32Array.BYTES_PER_ELEMENT * 3
  if (format & VertexFormat.PointSize) size += Float32Array.BYTES_PER_ELEMENT
  if (format & VertexFormat.Normal) size += Float32Array.BYTES_PER_ELEMENT * 3
  if (format & VertexFormat.Diffuse) size += Uint32Array.BYTES_PER_ELEMENT
  if (format & VertexFormat.Specular) size += Uint32Array.BYTES_PER_ELEMENT

  size += Float32Array.BYTES_PER_ELEMENT * 2 * getMapCount(format)

  return size
}

/**
 * Reads one mesh from its own directory in a `VMeshLibrary`. The directory name is the mesh name
 * the CRC in a {@link VMeshRef} resolves against, so it is carried onto the result.
 *
 * Neither buffer is self-describing. The index count is a field, and the vertex buffer's length is
 * the vertex count times whatever {@link vertexByteLength} makes of the FVF word — so a format bit
 * misread desynchronizes the buffer rather than producing a wrong attribute.
 * @throws Error when the directory holds no `VMeshData` file.
 * @throws RangeError when the version field is not 1, the only value retail writes.
 */
export function readVMeshData(parent: Directory): VMeshData {
  const name = parent.name
  const file = parent.getFile('VMeshData')
  if (!file) throw new Error(`Missing VMeshData in ${parent.name}`)

  const view = BufferView.from(file)

  const version = view.readUint32()
  if (version !== 1) throw new RangeError('Mesh data type mismatch')

  const primitive = view.readUint32()
  const groups = new Array(view.readUint16())
  const indices = new Uint16Array(view.readUint16())
  const format = view.readUint16()
  const vertices = new Uint8Array(vertexByteLength(format) * view.readUint16())

  // Read mesh groups.
  for (let i = 0; i < groups.length; i++) groups[i] = readVMeshGroup(view)

  // Read element buffer.
  for (let i = 0; i < indices.length; i++) indices[i] = view.readUint16()

  // Read vertex buffer.
  view.readBuffer(vertices)

  return { name, type: 1, primitive, format, groups, indices, vertices }
}

/**
 * Writes one mesh as a directory named after it, holding a single `VMeshData` file.
 *
 * The index and vertex counts are derived from the buffers rather than carried, so they cannot
 * disagree with what follows them; the vertex count comes out of the buffer length divided by the
 * stride the format implies.
 */
export function writeVMeshData(data: VMeshData): Directory {
  const view = BufferView.join(
    BufferView.allocate(Uint32Array.BYTES_PER_ELEMENT * 4)
      .writeUint32(data.type)
      .writeUint32(data.primitive)
      .writeUint16(data.groups.length)
      .writeUint16(data.indices.length)
      .writeUint16(data.format)
      .writeUint16(data.vertices.byteLength / vertexByteLength(data.format)),
    ...data.groups.map((group) => writeVMeshGroup(group)),
    BufferView.allocate(data.indices.byteLength).writeBuffer(data.indices),
    BufferView.allocate(data.vertices.byteLength).writeBuffer(data.vertices),
  )

  const file = new File('VMeshData', view)
  return new Directory(data.name, [file])
}
