import { strictEqual, throws } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { TextureAddress, getAddress, getMapIndex, setAddress, setMapIndex } from './flags.js'

describe('getAddress', () => {
  it('reads each axis from its own two bits', () => {
    strictEqual(getAddress(0x40, 'u'), TextureAddress.Wrap)
    strictEqual(getAddress(0x4a, 'u'), TextureAddress.Clamp)
    strictEqual(getAddress(0x4a, 'v'), TextureAddress.Clamp)
    strictEqual(getAddress(0x42, 'v'), TextureAddress.Wrap)
  })

  it('reads both bits of an axis as border, not mirror and clamp', () => {
    strictEqual(getAddress(0x43, 'u'), TextureAddress.Border)
    strictEqual(getAddress(0x4c, 'v'), TextureAddress.Border)
  })
})

describe('setAddress', () => {
  it('writes one axis and leaves the rest of the word', () => {
    strictEqual(setAddress(0x40, 'u', TextureAddress.Mirror), 0x41)
    strictEqual(setAddress(0x4a, 'v', TextureAddress.Wrap), 0x42)
    strictEqual(setAddress(0x50, 'v', TextureAddress.Border), 0x5c)
  })

  it('refuses a mode the field cannot hold', () => {
    throws(() => setAddress(0x40, 'u', 4 as TextureAddress), RangeError)
  })
})

describe('getMapIndex', () => {
  it('reads the field 4 above the index', () => {
    strictEqual(getMapIndex(0x40), 0)
    strictEqual(getMapIndex(0x5a), 1)
    strictEqual(getMapIndex(0x70), 3)
  })

  it('reads any field below 4 as UV0', () => {
    strictEqual(getMapIndex(0x00), 0)
    strictEqual(getMapIndex(0x30), 0)
  })
})

describe('setMapIndex', () => {
  it('writes the biased field and leaves the address bits', () => {
    strictEqual(setMapIndex(0x4a, 1), 0x5a)
    strictEqual(setMapIndex(0x5a, 0), 0x4a)
    strictEqual(setMapIndex(0x0a, 0), 0x4a)
  })

  it('refuses an index past eight UV maps', () => {
    throws(() => setMapIndex(0x40, 8), RangeError)
    throws(() => setMapIndex(0x40, -1), RangeError)
  })
})
