import { deepStrictEqual, strictEqual, throws } from 'node:assert/strict'
import { describe, it } from 'node:test'
import Directory from '#/utf/directory.js'
import {
  getMaterialAnim,
  getMaterialAnimDuration,
  readMaterialAnim,
  readMaterialAnimLibrary,
  writeMaterialAnim,
  writeMaterialAnimLibrary,
  type MaterialAnim,
  type MaterialTransform,
} from './materialanim.js'

const transform = (uOffset = 0, vOffset = 0): MaterialTransform => ({
  uOffset,
  vOffset,
  uScale: 0,
  vScale: 0,
})

const segment = (duration: number, start: MaterialTransform, velocity: MaterialTransform) => ({
  duration,
  start,
  velocity,
})

const single: MaterialAnim = {
  name: 'scroller',
  flags: 2,
  segments: [segment(8, transform(), transform(0, -0.25))],
}

const triple: MaterialAnim = {
  name: 'banner',
  flags: 2,
  segments: [
    segment(2, transform(), transform(1)),
    segment(0.5, transform(2), transform(4)),
    segment(2, transform(4), transform(1)),
  ],
}

describe('writeMaterialAnim', () => {
  it('names the directory after the material', () => {
    strictEqual(writeMaterialAnim(single).name, 'scroller')
  })

  it('writes MACount, MAFlags and MADeltas in retail order', () => {
    deepStrictEqual(
      writeMaterialAnim(single).children.map(({ name }) => name),
      ['MACount', 'MAFlags', 'MADeltas'],
    )
  })

  it('omits MAKeys entirely for a single segment rather than writing it empty', () => {
    strictEqual(writeMaterialAnim(single).getFile('MAKeys'), undefined)
  })

  it('appends MAKeys once there is more than one segment', () => {
    deepStrictEqual(
      writeMaterialAnim(triple).children.map(({ name }) => name),
      ['MACount', 'MAFlags', 'MADeltas', 'MAKeys'],
    )
  })

  it('writes five floats per segment, and four per start past the first', () => {
    const directory = writeMaterialAnim(triple)

    strictEqual(directory.getFile('MADeltas')?.byteLength, 3 * 5 * 4)
    strictEqual(directory.getFile('MAKeys')?.byteLength, 2 * 4 * 4)
    deepStrictEqual([...directory.getFile('MAKeys')!.readFloats()], [2, 0, 0, 0, 4, 0, 0, 0])
  })

  it('throws when there are no segments', () => {
    throws(() => writeMaterialAnim({ ...single, segments: [] }), RangeError)
  })

  // The file has no first key: the game starts from zero, and so must the model.
  it('throws when the first segment starts anywhere but zero', () => {
    throws(
      () => writeMaterialAnim({ ...single, segments: [segment(1, transform(1), transform())] }),
      /zero transform/,
    )
  })
})

describe('readMaterialAnim', () => {
  it('round-trips a single-segment animation', () => {
    deepStrictEqual(readMaterialAnim(writeMaterialAnim(single)), single)
  })

  it('round-trips segments, starts included', () => {
    deepStrictEqual(readMaterialAnim(writeMaterialAnim(triple)), triple)
  })

  it('takes the material name from the directory', () => {
    strictEqual(readMaterialAnim(writeMaterialAnim(triple)).name, 'banner')
  })

  it('throws when MACount is missing', () => {
    const directory = writeMaterialAnim(triple)
    directory.delete('MACount')

    throws(() => readMaterialAnim(directory), /MACount/)
  })

  const withCount = (anim: MaterialAnim, count: number) => {
    const directory = writeMaterialAnim(anim)
    directory.ensureFile('MACount').setIntegers(count)

    return directory
  }

  it('throws when MACount is not positive', () => {
    throws(() => readMaterialAnim(withCount(triple, 0)), RangeError)
  })

  it('throws when MADeltas is short of MACount keyframes', () => {
    throws(() => readMaterialAnim(withCount(triple, 4)), /MADeltas/)
  })

  it('throws when MAKeys is short of one key per segment past the first', () => {
    const directory = writeMaterialAnim(triple)
    directory.delete('MAKeys')

    throws(() => readMaterialAnim(directory), /MAKeys/)
  })

  it('defaults flags to zero when MAFlags is absent', () => {
    const directory = writeMaterialAnim(single)
    directory.delete('MAFlags')

    strictEqual(readMaterialAnim(directory).flags, 0)
  })
})

describe('material animation library', () => {
  it('reads an empty library when there is no MaterialAnim directory', () => {
    deepStrictEqual(readMaterialAnimLibrary(new Directory()), [])
  })

  it('round-trips a library through a file root', () => {
    const root = new Directory(undefined, [writeMaterialAnimLibrary([single, triple])])

    deepStrictEqual(readMaterialAnimLibrary(root), [single, triple])
  })

  it('names the container MaterialAnim', () => {
    strictEqual(writeMaterialAnimLibrary([single]).name, 'MaterialAnim')
  })

  it('finds an animation by name, case-insensitively', () => {
    const library = [single, triple]

    strictEqual(getMaterialAnim(library, 'BANNER'), triple)
    strictEqual(getMaterialAnim(library, 'missing'), undefined)
  })
})

describe('getMaterialAnimDuration', () => {
  it('sums the segment durations', () => {
    strictEqual(getMaterialAnimDuration(triple), 4.5)
  })

  it('is the single segment duration when there is only one', () => {
    strictEqual(getMaterialAnimDuration(single), 8)
  })
})
