import { deepStrictEqual, strictEqual, throws } from 'node:assert/strict'
import { describe, it } from 'node:test'
import Directory from '#/utf/directory.js'
import type { Geometry } from './geometry.js'
import { readLevel, readLevels, writeLevel, writeLevels, type Level } from './level.js'

const geometry = (): Geometry => ({
  indices: Uint32Array.from([0, 1, 2]),
  points: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]),
  normals: Float32Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1]),
  uv0: { indices: Uint32Array.from([0, 1, 2]), coordinates: Float32Array.from([0, 0, 1, 0, 0, 1]) },
  boneFirst: Uint32Array.from([0, 1, 2]),
  boneCount: Uint32Array.from([1, 1, 1]),
  boneIds: Uint32Array.from([0, 0, 0]),
  boneWeights: Float32Array.from([1, 1, 1]),
})

const level = (fraction: number): Level => ({
  fraction,
  groups: [{ material: 'skin', type: 'strip', indices: Uint16Array.from([0, 1, 2]) }],
  geometry: geometry(),
})

describe('readLevel', () => {
  it('round-trips a level', () => {
    const value = level(0.8)

    deepStrictEqual(readLevel(writeLevel(value), 0.8), value)
  })

  it('throws when a mesh has no face groups', () => {
    const directory = writeLevel(level(1))
    directory.delete('Face_groups')

    throws(() => readLevel(directory, 1), /face groups/i)
  })

  it('throws when a mesh has no geometry', () => {
    const directory = writeLevel(level(1))
    directory.delete('Geometry')

    throws(() => readLevel(directory, 1), /geometry/i)
  })
})

describe('writeLevel', () => {
  it('names the directory by index', () => {
    strictEqual(writeLevel(level(1), 2).name, 'Mesh2')
  })

  it('leads the face groups with a derived Count', () => {
    const groups = writeLevel({
      ...level(1),
      groups: [...level(1).groups, ...level(1).groups],
    }).getDirectory('Face_groups')!

    strictEqual(groups.children[0]?.name, 'Count')
    deepStrictEqual([...groups.getFile('Count')!.readIntegers()], [2])
    deepStrictEqual(
      groups.directories.map(({ name }) => name),
      ['Group0', 'Group1'],
    )
  })

  it('writes the face groups before the geometry', () => {
    deepStrictEqual(
      writeLevel(level(1)).children.map(({ name }) => name),
      ['Face_groups', 'Geometry'],
    )
  })
})

describe('readLevels', () => {
  it('round-trips a level list, fraction by fraction', () => {
    const levels = [level(1), level(0.5)]
    const root = new Directory(undefined, [writeLevels(levels)])

    deepStrictEqual(readLevels(root), levels)
  })

  it('reads no levels from a root without a MultiLevel directory', () => {
    deepStrictEqual(readLevels(new Directory()), [])
  })

  // A level with no fraction has no switch point, which is not a value to invent.
  it('throws when the fractions and the meshes disagree in count', () => {
    const directory = writeLevels([level(1), level(0.5)])
    directory.setFile('Fractions').data = new Uint8Array()

    throws(() => readLevels(new Directory(undefined, [directory])), /fraction/i)
  })
})

describe('writeLevels', () => {
  it('writes the fractions ahead of the meshes, in level order', () => {
    const directory = writeLevels([level(1), level(0.8), level(0.6)])

    deepStrictEqual(
      directory.children.map(({ name }) => name),
      ['Fractions', 'Mesh0', 'Mesh1', 'Mesh2'],
    )
    deepStrictEqual(
      [...directory.getFile('Fractions')!.readFloats()].map((value) => value.toFixed(1)),
      ['1.0', '0.8', '0.6'],
    )
  })
})
