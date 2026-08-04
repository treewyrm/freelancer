import { expand565to888 } from './misc.js'

/**
 * Decompress RGB channels.
 * Target 8bpp 4x4 pixel block size must be either 48 bytes for RGB or 64 bytes for RGBA.
 * @param source Compressed data block
 * @param target 4x4 pixel block
 * @param offset Offset to compressed data
 */
export const decompressRGB = (source: Uint8Array, target: Uint8Array, offset: number): void => {
  const colors = new Uint8Array(16) // Block colors
  const indices = new Uint8Array(16) // Block indices

  // Pick two colors, set alpha flag and target buffer number of channels
  let a = (source[offset + 1]! << 8) | source[offset]!
  let b = (source[offset + 3]! << 8) | source[offset + 2]!
  let c = 0
  let d = 0
  let alpha = a <= b
  let channels = target.byteLength >> 4

  // Accepts RGB or RGBA
  if (channels < 3 || channels > 4)
    throw new RangeError(`Invalid decompression block size: ${target.byteLength} bytes`)

  // Unpack 565 colors into color table
  ;[colors[0], colors[1], colors[2]] = expand565to888(a)
  ;[colors[4], colors[5], colors[6]] = expand565to888(b)
  colors[3] = colors[7] = 0xff

  // Decode RGB into color table
  for (let i = 0; i < 3; i++) {
    c = colors[i]!
    d = colors[4 + i]!

    colors[i + 8] = alpha ? (c + d) / 2 : (2 * c + d) / 3
    colors[i + 12] = alpha ? 0 : (c + 2 * d) / 3
  }

  // Decode alpha into color table
  colors[8 + 3] = 0xff
  colors[12 + 3] = alpha ? 0 : 0xff

  // Unpack to indices
  for (let i = 0, p = 0; i < 4; i++) {
    p = source[offset + i + 4]!

    indices[i * 4] = p & 0x3
    indices[i * 4 + 1] = (p >> 2) & 0x3
    indices[i * 4 + 2] = (p >> 4) & 0x3
    indices[i * 4 + 3] = (p >> 6) & 0x3
  }

  // Write color channels to output buffer
  for (let i = 0, m = 0, o = 0; i < indices.length; i++) {
    o = 4 * indices[i]!

    target[m++] = colors[o]! // Red
    target[m++] = colors[o + 1]! // Green
    target[m++] = colors[o + 2]! // Blue
    if (channels == 4) target[m++] = colors[o + 3]! // Alpha
  }
}

/**
 * Decompress DXT3 alpha channel.
 * @param source Compressed data block
 * @param target 4x4 pixel block
 * @param offset Offset to compressed data
 */
export const decompressAlphaDXT3 = (
  source: Uint8Array,
  target: Uint8Array,
  offset: number,
): void => {
  for (let i = 0, q = 0, l = 0, h = 0; i < 8; i++) {
    q = source[offset + i]!
    l = q & 0x0f
    h = q & 0xf0

    // Override alpha in target pixel block
    target[i * 8 + 3] = l | (l << 4)
    target[i * 8 + 7] = h | (h >> 4)
  }
}

/**
 * Decompress DXT5 alpha channel
 * @param source Compressed data block
 * @param target 4x4 pixel block
 * @param offset Offset to compressed data
 */
export const decompressAlphaDXT5 = (
  source: Uint8Array,
  target: Uint8Array,
  offset: number,
): void => {
  const alphas = new Uint8Array(8) // Alpha table
  const indices = new Uint8Array(16)
  const alpha0 = source[offset]!
  const alpha1 = source[offset + 1]!

  alphas[0] = alpha0
  alphas[1] = alpha1
  alphas[6] = 0x00 // 5 point alpha min
  alphas[7] = 0xff // 5 point alpha max

  // Decode 5/7-point alphas
  if (alpha0 > alpha1)
    for (let i = 1; i < 7; i++) alphas[i + 1] = ((7 - i) * alpha0 + i * alpha1) / 7
  else for (let i = 1; i < 5; i++) alphas[i + 1] = ((5 - i) * alpha0 + i * alpha1) / 5

  offset += 2

  // Pair of three bytes
  for (let i = 0, s = 0, a = 0; i < 2; i++) {
    for (let k = 0; k < 3; k++) a |= source[offset++]! << (8 * k)
    for (let k = 0; k < 8; k++) indices[s++] = (a >> (3 * k)) & 0x7
    a = 0 // Reset
  }

  // Override alpha in target pixel block
  for (let i = 0; i < indices.length; i++) target[i * 4 + 3] = alphas[indices[i]!]!
}

/**
 * DXT1/3/5 compression algorithm operates on 4x4 pixel block.
 * Each compressed data block is decompressed individually and mapped to target RGB(A) pixel buffer.
 * @param source Compressed data buffer
 * @param width Image width
 * @param height Image height
 * @param type Compression method (DXT1, DXT3 or DXT5)
 * @param alpha Creates 32-bit color buffer (RGBA) instead of 24-bit (RGB)
 */
export function decompress(
  source: Uint8Array,
  width: number,
  height: number,
  type: 'dxt1' | 'dxt3' | 'dxt5',
  alpha: boolean,
): Uint8Array {
  if (width % 4 != 0 || height % 4 != 0)
    throw new RangeError(`Invalid compressed texture resolution: ${width}x${height}`)

  const colorLength = alpha ? 4 : 3 // Bytes per color
  const strideLength = width * colorLength // Bytes per image line
  const blockLength = type === 'dxt1' ? 8 : 16 // Compressed block length
  const lineLength = 4 * colorLength // Bytes per pixel block line
  const buffer = new Uint8Array(16 * colorLength) // Decompressed 4x4 pixel block buffer
  const target = new Uint8Array(width * height * colorLength) // Decompressed image buffer

  // Loop through each block in compressed data buffer
  for (
    let blockOffset = 0, targetOffset = 0;
    blockOffset < source.byteLength;
    blockOffset += blockLength
  ) {
    switch (type) {
      case 'dxt1':
        decompressRGB(source, buffer, blockOffset)
        break
      case 'dxt3':
        decompressRGB(source, buffer, blockOffset + 8)
        if (alpha) decompressAlphaDXT3(source, buffer, blockOffset)
        break
      case 'dxt5':
        decompressRGB(source, buffer, blockOffset + 8)
        if (alpha) decompressAlphaDXT5(source, buffer, blockOffset)
        break
      default:
        throw new TypeError(`Invalid texture type: ${type}`)
    }

    // Copy decompressed block buffer to target buffer
    for (
      let lineOffset = 0, pixelOffset = targetOffset;
      lineOffset < buffer.byteLength;
      lineOffset += lineLength
    ) {
      target.set(buffer.subarray(lineOffset, lineOffset + lineLength), pixelOffset)
      pixelOffset += strideLength
    }

    // Skip three lines for next line of blocks
    if ((targetOffset += lineLength) % strideLength == 0) targetOffset += strideLength * 3
  }

  return target
}
