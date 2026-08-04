import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import Directory from '#/utf/directory.js'
import { atRange, readMultiLevel, writeMultiLevel, type MultiLevel } from './multilevel.js'
import { writeVMeshPart, type VMeshPart } from './part.js'
import type { VMeshRef } from './ref.js'

const level = (meshId: number): VMeshPart => ({
  type: 'vmeshpart',
  reference: {
    meshId,
    vertexStart: 0,
    vertexCount: 3,
    indexStart: 0,
    indexCount: 3,
    groupStart: 0,
    groupCount: 1,
    boundingBox: { a: { x: -1, y: -1, z: -1 }, b: { x: 1, y: 1, z: 1 } },
    boundingSphere: { center: { x: 0, y: 0, z: 0 }, radius: 1 },
  } satisfies VMeshRef,
})

/** Three levels need four breakpoints: the retail files always carry levels + 1. */
const sample = (): MultiLevel => ({
  type: 'multilevel',
  ranges: [0, 100, 500, 1000],
  levels: [level(1), level(2), level(3)],
})

const wrap = (value: MultiLevel) => new Directory('part.3db', [writeMultiLevel(value)])

describe('writeMultiLevel', () => {
  it('names the directory MultiLevel and numbers levels from zero', () => {
    const directory = writeMultiLevel(sample())

    strictEqual(directory.name, 'MultiLevel')
    deepStrictEqual(
      directory.directories.map(({ name }) => name),
      ['Level0', 'Level1', 'Level2'],
    )
  })

  it('writes the breakpoints into Switch2 as float32', () => {
    const file = writeMultiLevel(sample()).getFile('Switch2')

    deepStrictEqual([...(file?.readFloats() ?? [])], [0, 100, 500, 1000])
  })

  it('wraps each level in its own VMeshPart directory', () => {
    const directory = writeMultiLevel(sample())

    strictEqual(directory.getDirectory('Level1')?.getDirectory('VMeshPart')?.name, 'VMeshPart')
  })
})

describe('readMultiLevel', () => {
  it('round-trips ranges and levels', () => {
    const value = sample()

    deepStrictEqual(readMultiLevel(wrap(value)), value)
  })

  it('returns undefined when there is no MultiLevel directory', () => {
    strictEqual(readMultiLevel(new Directory('part.3db')), undefined)
  })

  it('falls back to a single 0..1000 range when Switch2 is missing', () => {
    const directory = writeMultiLevel(sample())
    directory.delete('Switch2')

    deepStrictEqual(readMultiLevel(new Directory('part.3db', [directory]))?.ranges, [0, 1000])
  })

  // Four retail parts carry a MultiLevel holding a single empty LevelN directory
  // and no Switch2 at all. There is nothing to read, and it must not throw.
  it('tolerates a MultiLevel whose only level directory is empty', () => {
    const directory = new Directory('MultiLevel', [new Directory('Level0')])
    const value = readMultiLevel(new Directory('part.3db', [directory]))

    deepStrictEqual(value, { type: 'multilevel', ranges: [0, 1000], levels: [] })
  })

  it('stops at the first gap in the level numbering', () => {
    const directory = writeMultiLevel(sample())
    directory.delete('Level1')

    strictEqual(readMultiLevel(new Directory('part.3db', [directory]))?.levels.length, 1)
  })
})

describe('atRange', () => {
  const value = sample()

  it('selects the level whose bracket contains the distance', () => {
    strictEqual(atRange(value, 0), value.levels[0])
    strictEqual(atRange(value, 99), value.levels[0])
    strictEqual(atRange(value, 100), value.levels[1])
    strictEqual(atRange(value, 499), value.levels[1])
    strictEqual(atRange(value, 500), value.levels[2])
    strictEqual(atRange(value, 999), value.levels[2])
  })

  it('returns undefined past the last breakpoint', () => {
    strictEqual(atRange(value, 1000), undefined)
    strictEqual(atRange(value, 10000), undefined)
  })

  it('returns undefined below the first breakpoint', () => {
    strictEqual(atRange(value, -1), undefined)
  })

  it('treats a trailing Infinity breakpoint as unbounded', () => {
    const unbounded: MultiLevel = { ...value, ranges: [0, 100, 500, Infinity] }

    strictEqual(atRange(unbounded, 1e9), unbounded.levels[2])
  })
})
