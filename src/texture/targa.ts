import BufferView from '#/utility/bufferview.js'
import { expandRGB } from './misc.js'

export interface TargaBitmap {
  /** Image width. */
  width: number

  /** Image height. */
  height: number

  /** Image color depth (24 or 32, 16-bit is automatically expanded into 24). */
  depth: number

  /** Image bitmap. */
  bitmap: Uint8Array
}

export interface TargaOptions {
  reverseChannels?: boolean
}

export enum ImageType {
  NONE = 0,
  COLORMAP = 1,
  RGB = 2,
  GREYSCALE = 3,
  RLE_COLORMAP = 9,
  RLE_RGB = 10,
  COMPRESSED_GREYSCALE = 11,
  COMPRESSED_COLORMAP = 32,
  COMPRESSED_COLORMAP_QUAD = 33,
}

/**
 * Swaps blue and and red channel in 24 and 32 bit depth bitmaps.
 * @param array Input bitmap array
 * @param depth Bitmap color depth
 * @returns
 */
export const swapBGRtoRGB = (array: Uint8Array, depth: number) => {
  let bitmap = new Uint8Array(array.length)

  switch (depth) {
    case 24:
      for (let i = 0; i < array.byteLength; i += 3) {
        bitmap[i + 0] = array[i + 2]!
        bitmap[i + 1] = array[i + 1]!
        bitmap[i + 2] = array[i + 0]!
      }

      break
    case 32:
      for (let i = 0; i < array.byteLength; i += 4) {
        bitmap[i + 0] = array[i + 2]!
        bitmap[i + 1] = array[i + 1]!
        bitmap[i + 2] = array[i + 0]!
        bitmap[i + 3] = array[i + 3]!
      }

      break
    default:
      throw new RangeError(`Invalid color depth`)
  }

  for (let i = 0; i < array.byteLength; i += depth >> 3) {
    bitmap[i + 0] = array[i + 2]!
    bitmap[i + 1] = array[i + 1]!
    bitmap[i + 2] = array[i + 0]!

    if (depth === 32) bitmap[i + 3] = array[i + 3]!
  }

  return bitmap
}

/**
 * Reads uncompressed color map.
 * @param view Input buffer view
 * @param width Image width
 * @param height Image height
 * @param indexDepth Indices bit depth (usually 8)
 * @param paletteCount Palette color count
 * @param paletteDepth Palette bit depth
 * @param options Image options
 * @returns
 */
export function readUncompressedColorMap(
  view: BufferView,
  width: number,
  height: number,
  indexDepth: number,
  paletteCount: number,
  paletteDepth: number,
  options?: TargaOptions,
): TargaBitmap {
  const pixelCount = width * height

  // Read colors palette.
  let palette = new Uint8Array((paletteCount * paletteDepth) >> 3)
  view.readBuffer(palette)

  // Expand 16-bit (5551) palette into 24-bit.
  if (paletteDepth === 16) {
    palette = expandRGB(palette, width, height, 24, 0x7c00, 0x3e0, 0x1f)
    paletteDepth = 24
  }

  // Read index map.
  let indices: Uint8Array | Uint16Array

  switch (indexDepth) {
    case 8:
      indices = new Uint8Array(pixelCount)
      break
    case 16:
      indices = new Uint16Array(pixelCount)
      break
    default:
      throw new RangeError(`Invalid color map index bit depth: ${indexDepth}`)
  }

  view.readBuffer(indices)

  // Construct image.
  const bitmap = new Uint8Array((pixelCount * paletteDepth) >> 3)

  for (let i = 0, b = 0, t; i < bitmap.length; i++) {
    t = (indices[i]! * paletteDepth) >> 3

    bitmap[b++] = palette[t + 2]!
    bitmap[b++] = palette[t + 1]!
    bitmap[b++] = palette[t]!

    if (paletteDepth === 32) bitmap[b++] = palette[t + 3]!
  }

  return { width, height, depth: paletteDepth, bitmap }
}

/**
 * Reads uncompressed RGB(A) image.
 * @param view Input buffer view
 * @param width Image width
 * @param height Image height
 * @param depth Image bit depth
 * @param options Image options
 * @returns
 */
export function readUncompressedRGB(
  view: BufferView,
  width: number,
  height: number,
  depth: number,
  options?: TargaOptions,
): TargaBitmap {
  let bitmap = new Uint8Array((width * height * depth) >> 3)
  view.readBuffer(bitmap)

  switch (depth) {
    case 16: // BGRA-5551 -> RGB-888
      bitmap = expandRGB(bitmap, width, height, 24, 0x7c00, 0x3e0, 0x1f)
      depth = 24
      break
    case 24: // BGR-888 -> RGB-888
      bitmap = swapBGRtoRGB(bitmap, 24)
      break
    case 32: // BGRA-8888 -> RGBA-8888
      bitmap = swapBGRtoRGB(bitmap, 32)
      break
  }

  return {
    width,
    height,
    depth,
    bitmap,
  }
}

/**
 * Reads bitmap from targa file.
 * @param view Input buffer view
 * @param options Image options
 * @returns
 */
export function readTargaImage(view: BufferView, options?: TargaOptions): TargaBitmap {
  /** Text section length. */
  const textLength = view.readUint8()

  /** Color map presence flag. */
  const colorMapType = view.readUint8()

  /** Image data type. */
  const imageType: ImageType = view.readUint8()

  /** Color map palette offset. */
  const _paletteOffset = view.readUint16()

  /** Color map palette count. */
  const paletteCount = view.readUint16()

  /** Color map palette color depth. */
  const paletteDepth = view.readUint8()

  /** Image offset X. */
  const _originX = view.readUint16()

  /** Image offset Y. */
  const _originY = view.readUint16()

  /** Image width. */
  const width = view.readUint16()

  /** Image height. */
  const height = view.readUint16()

  /** Unmapped color bit depth or color map bit depth if present. */
  const depth = view.readUint8()

  /** Descriptor flag. */
  const _descriptor = view.readUint8()

  // Skip text section.
  view.offset += textLength

  switch (imageType) {
    case ImageType.COLORMAP:
      if (!colorMapType) throw new RangeError('Color-mapped image is missing color map type flag')

      return readUncompressedColorMap(
        view,
        width,
        height,
        depth,
        paletteCount,
        paletteDepth,
        options,
      )
    case ImageType.RGB:
      return readUncompressedRGB(view, width, height, depth, options)
    default:
      throw new RangeError(`Unsupported targa image type: ${imageType}`)
  }
}
