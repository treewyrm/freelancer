import { deepStrictEqual, strictEqual, throws } from 'node:assert/strict'
import { describe, it } from 'node:test'
import Directory from '../utf/directory.js'
import File from '../utf/file.js'
import { readFaceGroup, writeFaceGroup, type Edge, type FaceGroup } from './facegroup.js'
import { writeFloat32Array, writeUint16Array } from './arrays.js'

const group = (values: Partial<FaceGroup> = {}): FaceGroup => ({
  material: 'skin',
  type: 'strip',
  indices: Uint16Array.from([0, 1, 2, 3]),
  ...values,
})

const directory = (...files: File[]) =>
  new Directory('Group0', [new File('Material_name').writeStrings('skin'), ...files])

describe('readFaceGroup', () => {
  it('reads a triangle strip', () => {
    const value = readFaceGroup(directory(writeUint16Array('Tristrip_indices', [0, 1, 2])))

    strictEqual(value.type, 'strip')
    deepStrictEqual([...value.indices], [0, 1, 2])
  })

  it('reads a triangle list', () => {
    const value = readFaceGroup(directory(writeUint16Array('Face_indices', [0, 1, 2])))

    strictEqual(value.type, 'list')
    deepStrictEqual([...value.indices], [0, 1, 2])
  })

  // The two are alternatives, and a group holding both would be ambiguous. Retail writes strips
  // only, so preferring them costs nothing and keeps the choice deterministic.
  it('prefers the strip when a group somehow holds both', () => {
    strictEqual(
      readFaceGroup(
        directory(
          writeUint16Array('Tristrip_indices', [0, 1, 2]),
          writeUint16Array('Face_indices', [3, 4, 5]),
        ),
      ).type,
      'strip',
    )
  })

  it('throws when a group names no material', () => {
    throws(
      () => readFaceGroup(new Directory('Group0', [writeUint16Array('Tristrip_indices', [0])])),
      /material name/i,
    )
  })

  it('throws when a group has neither index file', () => {
    throws(() => readFaceGroup(directory()), /face indices/i)
  })

  it('pairs edge indices with their angles', () => {
    const value = readFaceGroup(
      directory(
        writeUint16Array('Tristrip_indices', [0, 1, 2]),
        writeUint16Array('Edge_indices', [4, 5, 6, 7]),
        writeFloat32Array('Edge_angles', [1, 2]),
      ),
    )

    deepStrictEqual(value.edges, [
      { a: 4, b: 5, angle: 1 },
      { a: 6, b: 7, angle: 2 },
    ] satisfies Edge[])
  })

  it('throws when the two edge files disagree on how many edges there are', () => {
    throws(
      () =>
        readFaceGroup(
          directory(
            writeUint16Array('Tristrip_indices', [0, 1, 2]),
            writeUint16Array('Edge_indices', [4, 5, 6, 7]),
            writeFloat32Array('Edge_angles', [1]),
          ),
        ),
      /edge/i,
    )
  })

  it('leaves edges absent when only one of the two files is there', () => {
    strictEqual(
      readFaceGroup(
        directory(
          writeUint16Array('Tristrip_indices', [0, 1, 2]),
          writeUint16Array('Edge_indices', [4, 5]),
        ),
      ).edges,
      undefined,
    )
  })
})

describe('writeFaceGroup', () => {
  it('round-trips a strip group', () => {
    deepStrictEqual(readFaceGroup(writeFaceGroup(group())), group())
  })

  it('round-trips a list group', () => {
    const value = group({ type: 'list' })

    deepStrictEqual(readFaceGroup(writeFaceGroup(value)), value)
  })

  it('round-trips edges', () => {
    const value = group({ edges: [{ a: 1, b: 2, angle: 0.5 }] })

    deepStrictEqual(readFaceGroup(writeFaceGroup(value)), value)
  })

  it('writes the file order the exporter uses', () => {
    deepStrictEqual(
      writeFaceGroup(group({ edges: [{ a: 1, b: 2, angle: 0.5 }] })).files.map(({ name }) => name),
      ['Material_name', 'Tristrip_indices', 'Edge_indices', 'Edge_angles'],
    )
  })

  it('names the directory by index', () => {
    strictEqual(writeFaceGroup(group(), 3).name, 'Group3')
  })
})
