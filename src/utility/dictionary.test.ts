import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import Dictionary from './dictionary.js'
import BufferView from './bufferview.js'

describe('Dictionary initial state', () => {
  it('starts with byteLength of 0', () => {
    assert.equal(new Dictionary().byteLength, 0)
  })

  it('byteOffset is 0', () => {
    assert.equal(new Dictionary().byteOffset, 0)
  })
})

describe('Dictionary.push', () => {
  it('returns 0 for the first string', () => {
    const dict = new Dictionary()
    assert.equal(dict.push('Root'), 0)
  })

  it('grows byteLength by string length plus NUL terminator', () => {
    const dict = new Dictionary()
    dict.push('Root')  // 4 chars + NUL = 5 bytes
    assert.equal(dict.byteLength, 5)
  })

  it('returns sequential byte offsets for successive distinct strings', () => {
    const dict = new Dictionary()
    const off0 = dict.push('Root')    // 0, 5 bytes
    const off1 = dict.push('Child')   // 5, 6 bytes
    const off2 = dict.push('Leaf')    // 11, 5 bytes
    assert.equal(off0, 0)
    assert.equal(off1, 5)
    assert.equal(off2, 11)
    assert.equal(dict.byteLength, 16)
  })

  it('returns the same offset for a duplicate string', () => {
    const dict = new Dictionary()
    const first = dict.push('Root')
    const second = dict.push('Root')
    assert.equal(first, second)
    assert.equal(dict.byteLength, 5)  // no growth
  })

  it('deduplicates case-insensitively', () => {
    const dict = new Dictionary()
    const lower = dict.push('root')
    const upper = dict.push('ROOT')
    assert.equal(lower, upper)
    assert.equal(dict.byteLength, 5)  // only one entry stored
  })
})

describe('Dictionary buffer contents', () => {
  it('stores strings as NUL-terminated bytes', () => {
    const dict = new Dictionary()
    dict.push('Hi')

    const bytes = new Uint8Array(dict.buffer, dict.byteOffset, dict.byteLength)
    assert.deepEqual([...bytes], [0x48, 0x69, 0x00])  // 'H', 'i', NUL
  })

  it('stores multiple strings contiguously', () => {
    const dict = new Dictionary()
    dict.push('AB')
    dict.push('CD')

    const bytes = new Uint8Array(dict.buffer, dict.byteOffset, dict.byteLength)
    assert.deepEqual([...bytes], [0x41, 0x42, 0x00, 0x43, 0x44, 0x00])
  })

  it('strings are readable back via BufferView.readStringZ', () => {
    const dict = new Dictionary()
    const off0 = dict.push('Alpha')
    const off1 = dict.push('Beta')

    const view = BufferView.from(new Uint8Array(dict.buffer, dict.byteOffset, dict.byteLength))
    view.offset = off0
    assert.equal(view.readStringZ(), 'Alpha')
    view.offset = off1
    assert.equal(view.readStringZ(), 'Beta')
  })
})
