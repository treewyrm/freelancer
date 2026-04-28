import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import { at } from './animation.js'

// ---------------------------------------------------------------------------
// at
// ---------------------------------------------------------------------------

describe('at', () => {
  it('throws on empty iterable', () => {
    assert.throws(() => at([], 0), /Missing keyframe data/)
  })

  it('single keyframe: key before → start equals end, span is 0', () => {
    const kf = { key: 5 }
    const result = at([kf], 3)
    assert.equal(result.start, kf)
    assert.equal(result.end, kf)
    assert.ok(result.span === 0)
  })

  it('single keyframe: key exactly at → start equals end, span is 0', () => {
    const kf = { key: 5 }
    const result = at([kf], 5)
    assert.equal(result.start, kf)
    assert.equal(result.end, kf)
    assert.equal(result.span, 0)
  })

  it('single keyframe: key after → start equals end, span is 1', () => {
    const kf = { key: 5 }
    const result = at([kf], 10)
    assert.equal(result.start, kf)
    assert.equal(result.end, kf)
    assert.equal(result.span, 1)
  })

  it('two keyframes: key before first → start and end are first, span is 0', () => {
    const kf0 = { key: 0 }
    const kf1 = { key: 1 }
    const result = at([kf0, kf1], -1)
    assert.equal(result.start, kf0)
    assert.equal(result.end, kf0)
    assert.ok(result.span === 0)
  })

  it('two keyframes: key at first → start and end are first, span is 0', () => {
    const kf0 = { key: 0 }
    const kf1 = { key: 1 }
    const result = at([kf0, kf1], 0)
    assert.equal(result.start, kf0)
    assert.equal(result.end, kf0)
    assert.equal(result.span, 0)
  })

  it('two keyframes: key midway → start is first, end is second, span is 0.5', () => {
    const kf0 = { key: 0 }
    const kf1 = { key: 1 }
    const result = at([kf0, kf1], 0.5)
    assert.equal(result.start, kf0)
    assert.equal(result.end, kf1)
    assert.equal(result.span, 0.5)
  })

  it('two keyframes: key at second → start is first, end is second, span is 1', () => {
    const kf0 = { key: 0 }
    const kf1 = { key: 1 }
    const result = at([kf0, kf1], 1)
    assert.equal(result.start, kf0)
    assert.equal(result.end, kf1)
    assert.equal(result.span, 1)
  })

  it('two keyframes: key after last → start and end are last, span is 1', () => {
    const kf0 = { key: 0 }
    const kf1 = { key: 1 }
    const result = at([kf0, kf1], 2)
    assert.equal(result.start, kf1)
    assert.equal(result.end, kf1)
    assert.equal(result.span, 1)
  })

  it('span is proportional within keyframe interval', () => {
    const result = at([{ key: 2 }, { key: 6 }], 3)
    assert.equal(result.span, 0.25)
  })

  it('span is clamped to [0, 1] for out-of-range keys', () => {
    const frames = [{ key: 0 }, { key: 1 }]
    assert.ok(at(frames, -5).span >= 0)
    assert.ok(at(frames, 5).span <= 1)
  })

  it('preserves extra keyframe properties on start and end', () => {
    const kf0 = { key: 0, value: 10 }
    const kf1 = { key: 1, value: 20 }
    const result = at([kf0, kf1], 0.5)
    assert.equal(result.start.value, 10)
    assert.equal(result.end.value, 20)
  })

  it('works with any iterable', () => {
    function* frames() {
      yield { key: 0 }
      yield { key: 1 }
    }
    const result = at(frames(), 0.5)
    assert.equal(result.span, 0.5)
  })

  it('three keyframes: selects correct interval', () => {
    const kf0 = { key: 0 }
    const kf1 = { key: 1 }
    const kf2 = { key: 2 }
    const result = at([kf0, kf1, kf2], 1.5)
    assert.equal(result.start, kf1)
    assert.equal(result.end, kf2)
    assert.equal(result.span, 0.5)
  })
})
