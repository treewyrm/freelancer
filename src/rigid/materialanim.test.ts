import { deepStrictEqual, strictEqual, throws } from 'node:assert/strict'
import { describe, it } from 'node:test'
import Directory from '../directory.js'
import {
  getMaterialAnim,
  getMaterialAnimDuration,
  readMaterialAnim,
  readMaterialAnimLibrary,
  writeMaterialAnim,
  writeMaterialAnimLibrary,
  type MaterialAnim,
} from './materialanim.js'

const keyframe = (time: number, uOffsetSpeed = 0, vOffsetSpeed = 0) => ({
  time,
  uOffsetSpeed,
  vOffsetSpeed,
  uScaleSpeed: 0,
  vScaleSpeed: 0,
})

const single: MaterialAnim = {
  name: 'scroller',
  flags: 2,
  keyframes: [keyframe(8, 0, -0.25)],
  keys: [],
}

const triple: MaterialAnim = {
  name: 'banner',
  flags: 2,
  keyframes: [keyframe(2, 1), keyframe(0.5, 4), keyframe(2, 1)],
  keys: [
    { uOffset: 2, vOffset: 0, uScale: 0, vScale: 0 },
    { uOffset: 4, vOffset: 0, uScale: 0, vScale: 0 },
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

  it('omits MAKeys entirely for a single keyframe rather than writing it empty', () => {
    strictEqual(writeMaterialAnim(single).getFile('MAKeys'), undefined)
  })

  it('appends MAKeys once there is more than one keyframe', () => {
    deepStrictEqual(
      writeMaterialAnim(triple).children.map(({ name }) => name),
      ['MACount', 'MAFlags', 'MADeltas', 'MAKeys'],
    )
  })

  it('writes five floats per keyframe and four per key', () => {
    const directory = writeMaterialAnim(triple)

    strictEqual(directory.getFile('MADeltas')?.byteLength, 3 * 5 * 4)
    strictEqual(directory.getFile('MAKeys')?.byteLength, 2 * 4 * 4)
  })

  it('throws when there are no keyframes', () => {
    throws(() => writeMaterialAnim({ ...single, keyframes: [] }), RangeError)
  })

  it('throws when the key count does not trail the keyframe count by one', () => {
    throws(() => writeMaterialAnim({ ...triple, keys: [] }), RangeError)
  })
})

describe('readMaterialAnim', () => {
  it('round-trips a single-keyframe animation', () => {
    deepStrictEqual(readMaterialAnim(writeMaterialAnim(single)), single)
  })

  it('round-trips keyframes and keys', () => {
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

  // `writeIntegers` appends, so a count has to be removed before it can be replaced.
  const withCount = (anim: MaterialAnim, count: number) => {
    const directory = writeMaterialAnim(anim)
    directory.delete('MACount')
    directory.setFile('MACount').writeIntegers(count)

    return directory
  }

  it('throws when MACount is not positive', () => {
    throws(() => readMaterialAnim(withCount(triple, 0)), RangeError)
  })

  it('throws when MADeltas is short of MACount keyframes', () => {
    throws(() => readMaterialAnim(withCount(triple, 4)), /MADeltas/)
  })

  it('throws when MAKeys is short of one key per keyframe past the first', () => {
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
