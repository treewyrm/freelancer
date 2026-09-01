import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import Directory from '#/utf/directory.js'
import { getResourceId } from '#/hash.js'
import { VertexFormat, Primitive, vertexByteLength, type VMeshData } from './data.js'
import { getMesh, getMeshDraw, readVMeshLibrary, writeVMeshLibrary } from './library.js'
import type { VMeshGroup } from './group.js'
import type { VMeshRef } from './ref.js'

const stride = vertexByteLength(VertexFormat.Position | VertexFormat.Normal | VertexFormat.Texture1)

const group = (materialId: number, vertexStart: number, vertexEnd: number, elementCount: number) =>
  ({ materialId, vertexStart, vertexEnd, elementCount, padding: 0 }) satisfies VMeshGroup

/**
 * Six vertices split into two groups of three. vertexEnd is the last vertex of
 * the group, so the groups are 0..2 and 3..5 and together cover the buffer.
 */
const mesh = (name: string): VMeshData => ({
  name,
  type: 1,
  primitive: Primitive.TriangleList,
  format: VertexFormat.Position | VertexFormat.Normal | VertexFormat.Texture1,
  groups: [group(0x11111111, 0, 2, 3), group(0x22222222, 3, 5, 6)],
  indices: Uint16Array.from([0, 1, 2, 3, 4, 5, 5, 4, 3]),
  vertices: Uint8Array.from({ length: 6 * stride }, (_, i) => i & 0xff),
})

const reference = (name: string, overrides: Partial<VMeshRef> = {}): VMeshRef => ({
  meshId: getResourceId(name),
  vertexStart: 0,
  vertexCount: 6,
  indexStart: 0,
  indexCount: 9,
  groupStart: 0,
  groupCount: 2,
  boundingBox: { a: { x: 0, y: 0, z: 0 }, b: { x: 1, y: 1, z: 1 } },
  boundingSphere: { center: { x: 0, y: 0, z: 0 }, radius: 1 },
  ...overrides,
})

describe('writeVMeshLibrary', () => {
  it('names the directory VMeshLibrary and gives each mesh its own subdirectory', () => {
    const directory = writeVMeshLibrary([mesh('a.vms'), mesh('b.vms')])

    strictEqual(directory.name, 'VMeshLibrary')
    deepStrictEqual(
      directory.directories.map(({ name }) => name),
      ['a.vms', 'b.vms'],
    )
  })

  it('accepts any iterable, not just an array', () => {
    const directory = writeVMeshLibrary(new Set([mesh('a.vms')]))

    strictEqual(directory.directories.length, 1)
  })

  it('writes an empty directory for an empty library', () => {
    strictEqual(writeVMeshLibrary([]).children.length, 0)
  })
})

describe('readVMeshLibrary', () => {
  it('round-trips a library in order', () => {
    const library = [mesh('a.vms'), mesh('b.vms')]
    const parent = new Directory('\\', [writeVMeshLibrary(library)])

    deepStrictEqual(readVMeshLibrary(parent), library)
  })

  // Retail INTERFACE models carry a VMeshPart whose mesh lives in another file,
  // so an absent library is normal rather than an error.
  it('returns an empty library when there is no VMeshLibrary directory', () => {
    deepStrictEqual(readVMeshLibrary(new Directory('\\')), [])
  })

  it('ignores loose files sitting alongside the mesh subdirectories', () => {
    const directory = writeVMeshLibrary([mesh('a.vms')])
    directory.setFile('Notes').writeStrings('ignored')

    strictEqual(readVMeshLibrary(new Directory('\\', [directory])).length, 1)
  })
})

describe('getMesh', () => {
  const library = [mesh('a.vms'), mesh('b.vms')]

  it('finds a mesh by the CRC a reference names it with', () => {
    strictEqual(getMesh(library, getResourceId('b.vms')), library[1])
  })

  it('finds a mesh by name, case-insensitively', () => {
    strictEqual(getMesh(library, 'A.VMS'), library[0])
  })

  // Absence is normal: 530 retail references resolve into a library file of their own.
  it('returns undefined when the library does not hold the mesh', () => {
    strictEqual(getMesh(library, 'missing.vms'), undefined)
  })
})

describe('getMeshDraw', () => {
  const data = mesh('a.vms')

  it('yields one draw call per group in the reference slice', () => {
    const draws = [...getMeshDraw(data, reference('a.vms'))]

    strictEqual(draws.length, 2)
    deepStrictEqual(
      draws.map(({ materialId }) => materialId),
      [0x11111111, 0x22222222],
    )
  })

  it('walks the index buffer forward by each group element count', () => {
    const draws = [...getMeshDraw(data, reference('a.vms'))]

    deepStrictEqual(
      draws.map(({ startIndex, elementCount }) => [startIndex, elementCount]),
      [
        [0, 3],
        [3, 6],
      ],
    )
  })

  it('starts from indexStart rather than the beginning of the buffer', () => {
    const [draw] = [...getMeshDraw(data, reference('a.vms', { indexStart: 6, groupCount: 1 }))]

    strictEqual(draw?.startIndex, 6)
  })

  it('skips to groupStart and stops after groupCount groups', () => {
    const draws = [...getMeshDraw(data, reference('a.vms', { groupStart: 1, groupCount: 1 }))]

    strictEqual(draws.length, 1)
    strictEqual(draws[0]?.materialId, 0x22222222)
  })

  // Both offsets apply. Read with group.vertexStart alone, every reference into a shared
  // mesh bases at 0 and they overlap instead of tiling — 6,535 of 8,792 retail references.
  it('bases each group at ref.vertexStart plus group.vertexStart', () => {
    const draws = [...getMeshDraw(data, reference('a.vms', { vertexStart: 100 }))]

    deepStrictEqual(
      draws.map(({ baseVertex }) => baseVertex),
      [100, 103],
    )
  })

  it('bases at group.vertexStart alone when the reference starts at zero', () => {
    const draws = [...getMeshDraw(data, reference('a.vms'))]

    deepStrictEqual(
      draws.map(({ baseVertex }) => baseVertex),
      [0, 3],
    )
  })

  // vertexEnd is the last vertex of the group, so a group spanning 0..2 covers
  // three vertices. Treating it as exclusive silently drops the final one.
  it('counts the vertex at vertexEnd', () => {
    const draws = [...getMeshDraw(data, reference('a.vms'))]

    for (const { numVertices } of draws) strictEqual(numVertices, 3)
  })

  it('reports no vertices for a degenerate group whose end precedes its start', () => {
    const broken = mesh('c.vms')
    broken.groups = [group(0, 5, 1, 3)]

    const [draw] = [...getMeshDraw(broken, reference('c.vms', { groupCount: 1 }))]
    strictEqual(draw?.numVertices, 0)
  })

  it('stops early when groupCount runs past the end of the group list', () => {
    const draws = [...getMeshDraw(data, reference('a.vms', { groupCount: 5 }))]

    strictEqual(draws.length, 2)
  })
})
