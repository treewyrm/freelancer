import { deepStrictEqual, ok, strictEqual, throws } from 'node:assert/strict'
import { describe, it } from 'node:test'
import Directory from '../utf/directory.js'
import { getResourceId } from '../hash.js'
import { Format, Primitive, vertexByteLength, type VMeshData } from './data.js'
import { getMeshDraw, readVMeshLibrary, writeVMeshLibrary } from './library.js'
import type { VMeshGroup } from './group.js'
import type { VMeshRef } from './ref.js'

const stride = vertexByteLength(Format.Position | Format.Normal | Format.Texture1)

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
  format: Format.Position | Format.Normal | Format.Texture1,
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

describe('getMeshDraw', () => {
  const library = [mesh('a.vms'), mesh('b.vms')]

  it('yields one draw call per group in the reference slice', () => {
    const draws = [...getMeshDraw(library, reference('a.vms'))]

    strictEqual(draws.length, 2)
    deepStrictEqual(
      draws.map(({ materialId }) => materialId),
      [0x11111111, 0x22222222],
    )
  })

  it('resolves the mesh by CRC of its name, case-insensitively', () => {
    const draws = [...getMeshDraw(library, reference('A.VMS'))]

    strictEqual(draws[0]?.materialId, 0x11111111)
  })

  it('throws RangeError when the mesh is not in the library', () => {
    throws(() => [...getMeshDraw(library, reference('missing.vms'))], RangeError)
  })

  it('walks the index buffer forward by each group element count', () => {
    const draws = [...getMeshDraw(library, reference('a.vms'))]

    deepStrictEqual(
      draws.map(({ base }) => base),
      [0, 3],
    )
    deepStrictEqual([...draws[0]!.elements], [0, 1, 2])
    deepStrictEqual([...draws[1]!.elements], [3, 4, 5, 5, 4, 3])
  })

  it('starts from indexStart rather than the beginning of the buffer', () => {
    const [draw] = [...getMeshDraw(library, reference('a.vms', { indexStart: 6, groupCount: 1 }))]

    strictEqual(draw?.base, 6)
    deepStrictEqual([...draw.elements], [5, 4, 3])
  })

  it('skips to groupStart and stops after groupCount groups', () => {
    const draws = [...getMeshDraw(library, reference('a.vms', { groupStart: 1, groupCount: 1 }))]

    strictEqual(draws.length, 1)
    strictEqual(draws[0]?.materialId, 0x22222222)
  })

  // vertexEnd is the last vertex of the group, so a group spanning 0..2 covers
  // three vertices. Treating it as exclusive silently drops the final one.
  it('includes the vertex at vertexEnd in the slice', () => {
    const draws = [...getMeshDraw(library, reference('a.vms'))]

    for (const { vertices } of draws) strictEqual(vertices.byteLength, 3 * stride)
  })

  it('slices the vertex buffer from vertexStart', () => {
    const [, second] = [...getMeshDraw(library, reference('a.vms'))]
    const { vertices } = library[0]!

    ok(second)
    deepStrictEqual([...second.vertices], [...vertices.subarray(3 * stride, 6 * stride)])
  })

  it('yields an empty vertex slice for a degenerate group whose end precedes its start', () => {
    const broken = mesh('c.vms')
    broken.groups = [group(0, 5, 1, 3)]

    const [draw] = [...getMeshDraw([broken], reference('c.vms', { groupCount: 1 }))]
    strictEqual(draw?.vertices.byteLength, 0)
  })

  it('reports the format and stride alongside the geometry', () => {
    const [draw] = [...getMeshDraw(library, reference('a.vms'))]

    strictEqual(draw?.format, Format.Position | Format.Normal | Format.Texture1)
    strictEqual(draw.size, stride)
    strictEqual(draw.primitive, Primitive.TriangleList)
  })

  it('stops early when groupCount runs past the end of the group list', () => {
    const draws = [...getMeshDraw(library, reference('a.vms', { groupCount: 5 }))]

    strictEqual(draws.length, 2)
  })
})
