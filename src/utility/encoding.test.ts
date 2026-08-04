import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import { byteLengthOf, decode, encode } from './encoding.js'

describe('decode', () => {
  it('decodes ASCII', () => {
    assert.equal(decode(new Uint8Array([0x5b, 0x53, 0x5d])), '[S]')
  })

  // The whole reason this module exists: initialworld.ini pads with 0xA0, which UTF-8 would turn
  // into a replacement character.
  it('decodes 0xA0 as a non-breaking space', () => {
    assert.equal(decode(new Uint8Array([0xa0])), ' ')
  })

  it('decodes the windows-1252 range that is not latin-1', () => {
    assert.equal(decode(new Uint8Array([0x80, 0x99])), '€™')
  })

  it('decodes the bytes windows-1252 leaves undefined as themselves', () => {
    assert.equal(decode(new Uint8Array([0x81])), '')
  })

  it('handles a buffer longer than its internal chunk', () => {
    const bytes = new Uint8Array(0x2801).fill(0x61)
    assert.equal(decode(bytes), 'a'.repeat(0x2801))
  })
})

describe('encode', () => {
  it('round-trips every byte', () => {
    const bytes = new Uint8Array(256)
    for (let byte = 0; byte < 256; byte++) bytes[byte] = byte

    assert.deepEqual(encode(decode(bytes)), bytes)
  })

  it('reports the byte length it will produce', () => {
    assert.equal(byteLengthOf('€ abc'), 5)
  })

  // Substituting a character silently rewrites a nickname into one that resolves to nothing.
  it('refuses a character the encoding cannot represent', () => {
    assert.throws(() => encode('日本'), RangeError)
  })
})
