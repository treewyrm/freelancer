import { deepStrictEqual, strictEqual, throws } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { expand565to888, expandRGB, expandRGBtoRGBA, swapRB16, swapRB24, swapRB32 } from './misc.js'

/**
 * These helpers are exported for consumers rather than called from the readers — only
 * {@link expandRGB} has an internal caller, in the 16-bit Targa path. Nothing in the corpus
 * exercises the rest, so the layouts they assume are pinned here instead.
 */

describe('channel swaps', () => {
  // ARGB-1555, the layout `readPixelFormat` recognises and the 16-bit Targa path expands:
  // alpha 0x8000, red 0x7c00, green 0x3e0, blue 0x1f. GL's UNSIGNED_SHORT_5_5_5_1 packs the
  // same channels one bit lower with alpha at the bottom, and is deliberately not what this is.
  describe('swapRB16', () => {
    it('moves red into blue and back', () => {
      strictEqual(swapRB16(0x7c00), 0x001f)
      strictEqual(swapRB16(0x001f), 0x7c00)
    })

    it('leaves green in place', () => {
      strictEqual(swapRB16(0x03e0), 0x03e0)
    })

    it('passes the alpha bit through', () => {
      strictEqual(swapRB16(0x8000), 0x8000)
      strictEqual(swapRB16(0xffff), 0xffff)
    })

    it('swaps a mixed pixel without disturbing the other channels', () => {
      // alpha set, red 00011, green 01010, blue 10000.
      const pixel = 0x8000 | (0x03 << 10) | (0x0a << 5) | 0x10

      strictEqual(swapRB16(pixel), 0x8000 | (0x10 << 10) | (0x0a << 5) | 0x03)
    })

    it('is its own inverse', () => {
      for (const pixel of [0x0000, 0xffff, 0x1234, 0x8421, 0x7fff, 0xa5a5])
        strictEqual(swapRB16(swapRB16(pixel)), pixel, `0x${pixel.toString(16)}`)
    })
  })

  describe('swapRB24', () => {
    it('moves red into blue and back', () => {
      strictEqual(swapRB24(0xff0000), 0x0000ff)
      strictEqual(swapRB24(0x0000ff), 0xff0000)
    })

    it('leaves green in place', () => {
      strictEqual(swapRB24(0x00ff00), 0x00ff00)
    })

    it('swaps the outer bytes of a mixed pixel', () => {
      strictEqual(swapRB24(0x123456), 0x563412)
    })

    it('is its own inverse', () => {
      for (const pixel of [0x000000, 0xffffff, 0x123456, 0xa5005a])
        strictEqual(swapRB24(swapRB24(pixel)), pixel, `0x${pixel.toString(16)}`)
    })
  })

  describe('swapRB32', () => {
    it('moves red into blue and back, keeping alpha and green', () => {
      strictEqual(swapRB32(0x12345678), 0x12785634)
      strictEqual(swapRB32(0x12785634), 0x12345678)
    })

    // The `&` chain produces a signed int32, so without the final `>>> 0` every pixel at or
    // above half alpha came back negative — 0xff000000 as -16777216.
    it('returns an unsigned value at full alpha', () => {
      strictEqual(swapRB32(0xff000000), 0xff000000)
      strictEqual(swapRB32(0xff8040c0), 0xffc04080)
      strictEqual(swapRB32(0xffffffff), 0xffffffff)
    })

    it('is its own inverse', () => {
      for (const pixel of [0x00000000, 0xffffffff, 0x12345678, 0x80ff0000])
        strictEqual(swapRB32(swapRB32(pixel)), pixel, `0x${pixel.toString(16)}`)
    })
  })
})

describe('expand565to888', () => {
  // Bit replication, not a bare shift: the top bits of the source repeat into the vacated low
  // bits so that a saturated channel reaches 0xff rather than 0xf8.
  it('takes each channel to full scale', () => {
    deepStrictEqual(expand565to888(0xf800), [255, 0, 0])
    deepStrictEqual(expand565to888(0x07e0), [0, 255, 0])
    deepStrictEqual(expand565to888(0x001f), [0, 0, 255])
    deepStrictEqual(expand565to888(0xffff), [255, 255, 255])
  })

  it('leaves black at zero', () => {
    deepStrictEqual(expand565to888(0x0000), [0, 0, 0])
  })

  it('replicates the high bits of a mid-scale pixel', () => {
    // r = 10000, g = 100000, b = 10000
    deepStrictEqual(expand565to888(0x8410), [132, 130, 132])
  })

  it('gives green the extra bit of precision', () => {
    // The 6-bit green channel resolves a step the 5-bit channels cannot.
    const [, low] = expand565to888(0x0020)
    const [, high] = expand565to888(0x0040)

    strictEqual(low, 4)
    strictEqual(high, 8)
  })
})

describe('expandRGBtoRGBA', () => {
  it('inserts an opaque alpha byte after every triple', () => {
    const source = new Uint8Array([1, 2, 3, 4, 5, 6])

    deepStrictEqual([...expandRGBtoRGBA(source, 2, 1)], [1, 2, 3, 0xff, 4, 5, 6, 0xff])
  })

  it('takes a custom alpha', () => {
    const source = new Uint8Array([1, 2, 3])

    deepStrictEqual([...expandRGBtoRGBA(source, 1, 1, 0x80)], [1, 2, 3, 0x80])
  })

  // Writes past the end of a typed array are discarded silently, so a source that disagrees
  // with the dimensions would truncate without complaint.
  it('rejects a source that does not match the dimensions', () => {
    throws(() => expandRGBtoRGBA(new Uint8Array(5), 2, 1), RangeError)
    throws(() => expandRGBtoRGBA(new Uint8Array(12), 2, 1), RangeError)
  })
})

describe('expandRGB', () => {
  /** Packs 16-bit pixels the way a stored bitmap holds them, little-endian. */
  const pixels = (...values: number[]) => {
    const array = new Uint8Array(values.length * 2)
    const view = new DataView(array.buffer)

    values.forEach((value, i) => view.setUint16(i * 2, value, true))
    return array
  }

  // The masks the Targa path passes for a 16-bit image.
  const argb1555 = [0x7c00, 0x3e0, 0x1f] as const

  it('takes each 1555 channel to full scale', () => {
    deepStrictEqual([...expandRGB(pixels(0x7c00), 1, 1, 24, ...argb1555)], [255, 0, 0])
    deepStrictEqual([...expandRGB(pixels(0x03e0), 1, 1, 24, ...argb1555)], [0, 255, 0])
    deepStrictEqual([...expandRGB(pixels(0x001f), 1, 1, 24, ...argb1555)], [0, 0, 255])
  })

  it('takes each 565 channel to full scale', () => {
    deepStrictEqual([...expandRGB(pixels(0xf800), 1, 1, 24, 0xf800, 0x7e0, 0x1f)], [255, 0, 0])
    deepStrictEqual([...expandRGB(pixels(0x07e0), 1, 1, 24, 0xf800, 0x7e0, 0x1f)], [0, 255, 0])
    deepStrictEqual([...expandRGB(pixels(0x001f), 1, 1, 24, 0xf800, 0x7e0, 0x1f)], [0, 0, 255])
  })

  it('walks a multi-pixel bitmap in order', () => {
    deepStrictEqual(
      [...expandRGB(pixels(0x7c00, 0x03e0, 0x001f, 0x0000), 2, 2, 24, ...argb1555)],
      [255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0],
    )
  })

  it('expands the alpha mask at 32bpp', () => {
    deepStrictEqual([...expandRGB(pixels(0x8000), 1, 1, 32, ...argb1555, 0x8000)], [0, 0, 0, 255])
    deepStrictEqual([...expandRGB(pixels(0x0000), 1, 1, 32, ...argb1555, 0x8000)], [0, 0, 0, 0])
  })

  // A 32bpp target with no alpha mask is opaque rather than transparent, which is what makes
  // the widened bitmap usable without the caller having to patch the channel afterwards.
  it('fills alpha with 0xff at 32bpp when no mask is given', () => {
    deepStrictEqual([...expandRGB(pixels(0x7c00), 1, 1, 32, ...argb1555)], [255, 0, 0, 255])
  })

  it('accepts a Uint16Array source directly', () => {
    deepStrictEqual([...expandRGB(new Uint16Array([0x7c00]), 1, 1, 24, ...argb1555)], [255, 0, 0])
  })

  it('rejects a source that does not match the dimensions', () => {
    throws(() => expandRGB(pixels(0x7c00, 0x03e0), 4, 4, 24, ...argb1555), RangeError)
  })
})
