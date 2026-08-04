import { deepStrictEqual, strictEqual, throws } from 'node:assert/strict'
import { describe, it } from 'node:test'
import Directory from '#/utf/directory.js'
import File from '#/utf/file.js'
import { writeFloat32Array, writeUint32Array } from './arrays.js'
import { readGeometry, writeGeometry, type Geometry, type UVBone } from './geometry.js'

const geometry = (values: Partial<Geometry> = {}): Geometry => ({
  indices: Uint32Array.from([0, 1, 2]),
  points: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]),
  normals: Float32Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1]),
  uv0: {
    indices: Uint32Array.from([0, 1, 2]),
    coordinates: Float32Array.from([0, 0, 1, 0, 0, 1]),
  },
  boneFirst: Uint32Array.from([0, 1, 2]),
  boneCount: Uint32Array.from([1, 1, 2]),
  boneIds: Uint32Array.from([0, 1, 1, 2]),
  boneWeights: Float32Array.from([1, 1, 0.5, 0.5]),
  ...values,
})

/** Values are chosen to survive float32 exactly, so a round trip can be compared strictly. */
const uvBone = (): UVBone => ({
  bone: 41,
  scaleU: 0.5,
  scaleV: -0.5,
  minU: -0.25,
  maxU: 0.25,
  minV: -0.125,
  maxV: 0.125,
  distance: 1,
  vertices: Uint32Array.from([3, 4, 5]),
  defaults: Float32Array.from([0, 0, 0.5, 0.5, 1, 1]),
})

describe('readGeometry', () => {
  it('round-trips the point attributes and the bone chain', () => {
    const value = geometry()

    deepStrictEqual(readGeometry(writeGeometry(value)), value)
  })

  it('round-trips a second coordinate set', () => {
    const value = geometry({
      uv1: {
        indices: Uint32Array.from([2, 1, 0]),
        coordinates: Float32Array.from([1, 1, 0, 1, 1, 0]),
      },
    })

    deepStrictEqual(readGeometry(writeGeometry(value)), value)
  })

  it('round-trips the UV bone block', () => {
    const value = geometry({ uvBone: uvBone() })

    deepStrictEqual(readGeometry(writeGeometry(value)), value)
  })

  it('omits the optional parts rather than setting them undefined', () => {
    const value = readGeometry(writeGeometry(geometry()))

    strictEqual('uv1' in value, false)
    strictEqual('uvBone' in value, false)
  })

  it('throws when a required file is missing', () => {
    const directory = writeGeometry(geometry())
    directory.delete('Bone_id_chain')

    throws(() => readGeometry(directory), /Bone_id_chain/)
  })

  // Indices without coordinates address nothing, and coordinates without indices are addressed by
  // nothing. Reading half a set would silently drop the half that is there.
  it('throws on a half-present coordinate set', () => {
    const directory = writeGeometry(geometry())
    directory.children.push(writeUint32Array('UV1_indices', [0, 1, 2]))

    throws(() => readGeometry(directory), /UV1/)
  })

  it('throws when the UV bone block is missing one of its files', () => {
    const directory = writeGeometry(geometry({ uvBone: uvBone() }))
    directory.delete('Max_dv')

    throws(() => readGeometry(directory), /Max_dv/)
  })
})

describe('writeGeometry', () => {
  it('writes the file order the exporter uses', () => {
    deepStrictEqual(
      writeGeometry(
        geometry({
          uv1: { indices: Uint32Array.of(0), coordinates: Float32Array.of(0, 0) },
          uvBone: uvBone(),
        }),
      ).files.map(({ name }) => name),
      [
        'Point_indices',
        'UV0_indices',
        'UV1_indices',
        'Points',
        'Point_bone_first',
        'Point_bone_count',
        'Bone_id_chain',
        'Bone_weight_chain',
        'Vertex_normals',
        'UV0',
        'UV1',
        'UV_bone_id',
        'UV_vertex_count',
        'UV_plane_distance',
        'Bone_X_to_U_scale',
        'Bone_Y_to_V_scale',
        'Min_du',
        'Max_du',
        'Min_dv',
        'Max_dv',
        'UV_vertex_id',
        'UV_default_list',
      ],
    )
  })

  /** `UV_vertex_count` is derived, so it cannot disagree with the list it counts. */
  it('derives UV_vertex_count from the vertex list', () => {
    const directory = writeGeometry(geometry({ uvBone: uvBone() }))

    deepStrictEqual([...directory.getFile('UV_vertex_count')!.readIntegers()], [3])
  })
})

describe('arrays', () => {
  it('rejects a file that is not a whole number of elements', () => {
    const directory = writeGeometry(geometry())
    directory.setFile('Point_indices').data = new Uint8Array(3)

    throws(() => readGeometry(directory), /Point_indices/)
  })

  it('reads back a file it just wrote, rather than one positioned past its end', () => {
    deepStrictEqual([...writeFloat32Array('x', [1, 2]).readFloats()], [1, 2])
    deepStrictEqual([...writeUint32Array('x', [1, 2]).readIntegers()], [1, 2])
  })

  it('writes nothing for an empty array', () => {
    strictEqual(new File('x', writeUint32Array('x', []).data).byteLength, 0)
  })
})
