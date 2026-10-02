import { deepStrictEqual, strictEqual, throws } from 'node:assert/strict'
import { describe, it } from 'node:test'
import Directory from '#/utf/directory.js'
import { getLevel, readMultiLevel, writeMultiLevel, type MultiLevel } from './multilevel.js'
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
    boundingBox: { min: { x: -1, y: -1, z: -1 }, max: { x: 1, y: 1, z: 1 } },
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

  // The game leaves such a part uninitialised rather than assuming a range, and a directory read
  // without Switch2 must be written back without one.
  it('leaves ranges off when Switch2 is missing, and writes none back', () => {
    const directory = writeMultiLevel(sample())
    directory.delete('Switch2')

    const value = readMultiLevel(new Directory('part.3db', [directory]))!

    strictEqual('ranges' in value, false)
    strictEqual(writeMultiLevel(value).getFile('Switch2'), undefined)
    strictEqual(getLevel(value, 0), undefined)
  })

  // Retail parts carry a MultiLevel holding a single empty LevelN directory and no Switch2 at
  // all. There is nothing to read, and it must not throw.
  it('tolerates a MultiLevel whose only level directory is empty', () => {
    const directory = new Directory('MultiLevel', [new Directory('Level0')])
    const value = readMultiLevel(new Directory('part.3db', [directory]))

    deepStrictEqual(value, { type: 'multilevel', levels: [] })
  })

  it('refuses to write breakpoints that do not number one more than the levels', () => {
    throws(() => writeMultiLevel({ ...sample(), ranges: [0, 1000] }), RangeError)
  })

  it('stops at the first gap in the level numbering', () => {
    const directory = writeMultiLevel(sample())
    directory.delete('Level1')

    strictEqual(readMultiLevel(new Directory('part.3db', [directory]))?.levels.length, 1)
  })
})

describe('getLevel', () => {
  const value = sample()

  it('selects the first level whose upper end is at least the metric, inclusive', () => {
    strictEqual(getLevel(value, 0), value.levels[0])
    strictEqual(getLevel(value, 100), value.levels[0])
    strictEqual(getLevel(value, 100.5), value.levels[1])
    strictEqual(getLevel(value, 500), value.levels[1])
    strictEqual(getLevel(value, 501), value.levels[2])
    strictEqual(getLevel(value, 1000), value.levels[2])
  })

  it('returns undefined past the last end', () => {
    strictEqual(getLevel(value, 1000.5), undefined)
    strictEqual(getLevel(value, 10000), undefined)
  })

  it('never reads a lower bound', () => {
    const raised: MultiLevel = { ...value, ranges: [50, 100, 500, 1000] }

    strictEqual(getLevel(raised, 0), raised.levels[0])
    strictEqual(getLevel(raised, 49), raised.levels[0])
  })

  it('returns undefined for a negative metric', () => {
    strictEqual(getLevel(value, -1), undefined)
  })

  it('returns undefined when ranges is absent', () => {
    strictEqual(getLevel({ type: 'multilevel', levels: value.levels }, 0), undefined)
  })

  it('walks the list as given, skipping an end the metric passes', () => {
    const junk: MultiLevel = { ...value, ranges: [0, 100, 1e-40, 1000] }

    strictEqual(getLevel(junk, 200), junk.levels[2])
  })

  it('stops at the last level the part holds', () => {
    const short: MultiLevel = { ...value, levels: [level(1)] }

    strictEqual(getLevel(short, 200), undefined)
  })

  it('treats a trailing Infinity breakpoint as unbounded', () => {
    const unbounded: MultiLevel = { ...value, ranges: [0, 100, 500, Infinity] }

    strictEqual(getLevel(unbounded, 1e9), unbounded.levels[2])
  })
})
