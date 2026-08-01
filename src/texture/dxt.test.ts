import { deepStrictEqual, throws } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { decompress, decompressAlphaDXT3, decompressAlphaDXT5, decompressRGB } from './dxt.js'

/**
 * S3TC decoding for consumers whose renderer has no native support. Nothing in this library
 * calls it, and the corpus only proves the compressed payloads round-trip as bytes, so the
 * decode itself is pinned entirely by constructed blocks here.
 *
 * Every block is 4x4 pixels. DXT1 is eight bytes — two RGB-565 endpoints then sixteen 2-bit
 * indices; DXT3 and DXT5 prefix that with eight bytes of alpha.
 */

/** Builds a DXT1 colour block: two endpoints, then one index byte per row. */
const block = (color0: number, color1: number, rows: [number, number, number, number]) =>
  new Uint8Array([color0 & 0xff, color0 >> 8, color1 & 0xff, color1 >> 8, ...rows])

/** A row of four pixels all taking the same index. */
const row = (index: number) => index | (index << 2) | (index << 4) | (index << 6)

/** Splits a decoded block into per-pixel tuples. */
const pixels = (target: Uint8Array, channels: number) =>
  Array.from({ length: target.byteLength / channels }, (_, i) => [
    ...target.subarray(i * channels, i * channels + channels),
  ])

const RED = 0xf800
const GREEN = 0x07e0
const BLUE = 0x001f
const WHITE = 0xffff
const BLACK = 0x0000

describe('decompressRGB', () => {
  // color0 > color1 selects the opaque four-colour mode: the two interpolants sit at one and
  // two thirds between the endpoints.
  it('interpolates two thirds and one third in four-colour mode', () => {
    const target = new Uint8Array(64)

    decompressRGB(block(RED, BLUE, [row(0), row(1), row(2), row(3)]), target, 0)

    const decoded = pixels(target, 4)

    deepStrictEqual(decoded[0], [255, 0, 0, 255])
    deepStrictEqual(decoded[4], [0, 0, 255, 255])
    deepStrictEqual(decoded[8], [170, 0, 85, 255])
    deepStrictEqual(decoded[12], [85, 0, 170, 255])
  })

  // color0 <= color1 selects punch-through: one midpoint, and index 3 is transparent black.
  // The mode is a property of the block, not of the container, which is why there is no
  // separate `dxt1a` texture type for it.
  it('gives a midpoint and a transparent black in punch-through mode', () => {
    const target = new Uint8Array(64)

    decompressRGB(block(BLUE, RED, [row(0), row(1), row(2), row(3)]), target, 0)

    const decoded = pixels(target, 4)

    deepStrictEqual(decoded[0], [0, 0, 255, 255])
    deepStrictEqual(decoded[4], [255, 0, 0, 255])
    deepStrictEqual(decoded[8], [127, 0, 127, 255])
    deepStrictEqual(decoded[12], [0, 0, 0, 0])
  })

  it('reads indices least significant pair first, left to right', () => {
    const target = new Uint8Array(64)

    // First row takes index 0, 1, 2 then 3; the remaining rows are all index 0.
    decompressRGB(block(RED, BLUE, [0b11100100, 0, 0, 0]), target, 0)

    deepStrictEqual(pixels(target, 4).slice(0, 4), [
      [255, 0, 0, 255],
      [0, 0, 255, 255],
      [170, 0, 85, 255],
      [85, 0, 170, 255],
    ])
  })

  // A 48-byte target takes RGB and a 64-byte one RGBA; the channel count comes from the size.
  it('writes three channels into an RGB target', () => {
    const target = new Uint8Array(48)

    decompressRGB(block(RED, BLUE, [row(0), row(1), row(2), row(3)]), target, 0)

    const decoded = pixels(target, 3)

    deepStrictEqual(decoded[0], [255, 0, 0])
    deepStrictEqual(decoded[8], [170, 0, 85])
  })

  it('decodes at an offset into a larger buffer', () => {
    const source = new Uint8Array(16)
    source.set(block(GREEN, BLACK, [0, 0, 0, 0]), 8)

    const target = new Uint8Array(64)
    decompressRGB(source, target, 8)

    deepStrictEqual(pixels(target, 4)[0], [0, 255, 0, 255])
  })

  it('rejects a target that is neither RGB nor RGBA', () => {
    const source = block(RED, BLUE, [0, 0, 0, 0])

    throws(() => decompressRGB(source, new Uint8Array(32), 0), RangeError)
    throws(() => decompressRGB(source, new Uint8Array(80), 0), RangeError)
  })
})

describe('decompressAlphaDXT3', () => {
  // Four bits per pixel, two pixels per byte, low nibble first. Each nibble is replicated into
  // both halves of the byte so that 0xf reaches 0xff rather than 0xf0.
  it('expands each nibble to a full byte', () => {
    const target = new Uint8Array(64)

    decompressAlphaDXT3(new Uint8Array([0x0f, 0, 0, 0, 0, 0, 0, 0]), target, 0)

    const decoded = pixels(target, 4)

    deepStrictEqual(decoded[0]?.[3], 255)
    deepStrictEqual(decoded[1]?.[3], 0)
  })

  it('takes the low nibble as the even pixel and the high as the odd', () => {
    const target = new Uint8Array(64)

    decompressAlphaDXT3(new Uint8Array([0xf0, 0, 0, 0, 0, 0, 0, 0]), target, 0)

    const decoded = pixels(target, 4)

    deepStrictEqual(decoded[0]?.[3], 0)
    deepStrictEqual(decoded[1]?.[3], 255)
  })

  it('replicates a mid-scale nibble into both halves', () => {
    const target = new Uint8Array(64)

    decompressAlphaDXT3(new Uint8Array(8).fill(0x88), target, 0)

    for (const [, , , alpha] of pixels(target, 4)) deepStrictEqual(alpha, 0x88)
  })

  it('leaves the colour channels alone', () => {
    const target = new Uint8Array(64).fill(0x40)

    decompressAlphaDXT3(new Uint8Array(8).fill(0xff), target, 0)

    for (const [r, g, b, alpha] of pixels(target, 4)) {
      deepStrictEqual([r, g, b], [0x40, 0x40, 0x40])
      deepStrictEqual(alpha, 0xff)
    }
  })
})

describe('decompressAlphaDXT5', () => {
  /**
   * Sixteen 3-bit indices over six bytes, read as two little-endian 24-bit groups of eight.
   * These three bytes spell out indices 0 through 7 in order.
   */
  const ramp = [0x88, 0xc6, 0xfa] as const

  const alphas = (target: Uint8Array) => pixels(target, 4).map(([, , , alpha]) => alpha)

  // alpha0 > alpha1 selects the eight-value mode: six interpolants over sevenths, no endpoints
  // reserved. Values truncate rather than round.
  it('interpolates over sevenths when alpha0 exceeds alpha1', () => {
    const target = new Uint8Array(64)

    decompressAlphaDXT5(new Uint8Array([0xff, 0x00, ...ramp, ...ramp]), target, 0)

    deepStrictEqual(alphas(target).slice(0, 8), [255, 0, 218, 182, 145, 109, 72, 36])
  })

  // alpha0 <= alpha1 selects the six-value mode, where indices 6 and 7 are fully transparent
  // and fully opaque instead of interpolants.
  it('reserves indices six and seven when alpha0 does not exceed alpha1', () => {
    const target = new Uint8Array(64)

    decompressAlphaDXT5(new Uint8Array([0x00, 0xff, ...ramp, ...ramp]), target, 0)

    deepStrictEqual(alphas(target).slice(0, 8), [0, 255, 51, 102, 153, 204, 0, 255])
  })

  it('applies the second index group to the last eight pixels', () => {
    const target = new Uint8Array(64)

    decompressAlphaDXT5(new Uint8Array([0xff, 0x00, ...ramp, 0, 0, 0]), target, 0)

    // The second group is all zeroes, so every pixel there takes alpha0.
    deepStrictEqual(alphas(target).slice(8), [255, 255, 255, 255, 255, 255, 255, 255])
  })

  it('leaves the colour channels alone', () => {
    const target = new Uint8Array(64).fill(0x40)

    decompressAlphaDXT5(new Uint8Array([0xff, 0xff, 0, 0, 0, 0, 0, 0]), target, 0)

    for (const [r, g, b] of pixels(target, 4)) deepStrictEqual([r, g, b], [0x40, 0x40, 0x40])
  })
})

describe('decompress', () => {
  /** A block painted entirely in one endpoint colour. */
  const solid = (color: number) => block(color, BLACK, [0, 0, 0, 0])

  /** Reads a pixel out of a decoded image. */
  const at = (image: Uint8Array, width: number, channels: number, x: number, y: number) => [
    ...image.subarray((y * width + x) * channels, (y * width + x) * channels + channels),
  ]

  // The block walk is the part most likely to be wrong: blocks arrive in row-major order, and
  // each one has to be scattered across four separate image rows.
  it('places blocks in row-major order across the image', () => {
    const source = new Uint8Array([...solid(RED), ...solid(GREEN), ...solid(BLUE), ...solid(WHITE)])

    const image = decompress(source, 8, 8, 'dxt1', false)

    deepStrictEqual(image.byteLength, 8 * 8 * 3)

    // Four quadrants, one per block.
    deepStrictEqual(at(image, 8, 3, 0, 0), [255, 0, 0])
    deepStrictEqual(at(image, 8, 3, 3, 3), [255, 0, 0])
    deepStrictEqual(at(image, 8, 3, 4, 0), [0, 255, 0])
    deepStrictEqual(at(image, 8, 3, 7, 3), [0, 255, 0])
    deepStrictEqual(at(image, 8, 3, 0, 4), [0, 0, 255])
    deepStrictEqual(at(image, 8, 3, 3, 7), [0, 0, 255])
    deepStrictEqual(at(image, 8, 3, 4, 4), [255, 255, 255])
    deepStrictEqual(at(image, 8, 3, 7, 7), [255, 255, 255])
  })

  it('handles an image one block tall', () => {
    const image = decompress(new Uint8Array([...solid(RED), ...solid(BLUE)]), 8, 4, 'dxt1', false)

    deepStrictEqual(image.byteLength, 8 * 4 * 3)
    deepStrictEqual(at(image, 8, 3, 0, 0), [255, 0, 0])
    deepStrictEqual(at(image, 8, 3, 4, 0), [0, 0, 255])
    deepStrictEqual(at(image, 8, 3, 3, 3), [255, 0, 0])
    deepStrictEqual(at(image, 8, 3, 7, 3), [0, 0, 255])
  })

  it('emits four channels when asked for alpha', () => {
    const image = decompress(solid(RED), 4, 4, 'dxt1', true)

    deepStrictEqual(image.byteLength, 4 * 4 * 4)
    deepStrictEqual(at(image, 4, 4, 0, 0), [255, 0, 0, 255])
  })

  // DXT3 and DXT5 blocks are sixteen bytes: the alpha half first, then the same colour block
  // DXT1 uses. A stride misread would run off the end long before the last block.
  it('reads the colour half of a DXT3 block past its alpha', () => {
    const source = new Uint8Array([...new Uint8Array(8).fill(0xff), ...solid(GREEN)])
    const image = decompress(source, 4, 4, 'dxt3', true)

    deepStrictEqual(image.byteLength, 4 * 4 * 4)
    deepStrictEqual(at(image, 4, 4, 0, 0), [0, 255, 0, 255])
  })

  it('reads the colour half of a DXT5 block past its alpha', () => {
    const source = new Uint8Array([0x00, 0x00, 0, 0, 0, 0, 0, 0, ...solid(GREEN)])
    const image = decompress(source, 4, 4, 'dxt5', true)

    deepStrictEqual(at(image, 4, 4, 0, 0), [0, 255, 0, 0])
  })

  it('skips the alpha half when the target has no alpha channel', () => {
    const source = new Uint8Array([...new Uint8Array(8).fill(0x00), ...solid(GREEN)])
    const image = decompress(source, 4, 4, 'dxt5', false)

    deepStrictEqual(image.byteLength, 4 * 4 * 3)
    deepStrictEqual(at(image, 4, 3, 0, 0), [0, 255, 0])
  })

  it('rejects dimensions that are not whole blocks', () => {
    throws(() => decompress(new Uint8Array(8), 5, 4, 'dxt1', false), RangeError)
    throws(() => decompress(new Uint8Array(8), 4, 6, 'dxt1', false), RangeError)
  })

  it('rejects an unknown compression type', () => {
    throws(() => decompress(new Uint8Array(16), 4, 4, 'dxt2' as 'dxt3', false), TypeError)
  })
})
