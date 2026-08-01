import BufferView from '#/utility/bufferview.js'
import { expandRGB } from './misc.js'

export interface TargaPixels {
  /** Image width. */
  width: number

  /** Image height. */
  height: number

  /** Image color depth (24 or 32, 16-bit is automatically expanded into 24). */
  depth: number

  /** Image bitmap. */
  bitmap: Uint8Array
}

export interface TargaBitmap extends TargaPixels {
  /**
   * First row of the bitmap is the top of the image rather than the bottom, per bit 5 of the
   * image descriptor. Targa defaults to a bottom-left origin; 84 images in retail set this bit.
   * Reported as read — the rows are never reordered here.
   */
  flip: boolean
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
  if (depth !== 24 && depth !== 32) throw new RangeError(`Invalid color depth`)

  const stride = depth >> 3
  const bitmap = new Uint8Array(array.length)

  for (let i = 0; i < array.byteLength; i += stride) {
    bitmap[i + 0] = array[i + 2]!
    bitmap[i + 1] = array[i + 1]!
    bitmap[i + 2] = array[i + 0]!

    if (stride === 4) bitmap[i + 3] = array[i + 3]!
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
): TargaPixels {
  const pixelCount = width * height

  // Read the palette and normalise it to RGB(A) order up front, so expanding the indices
  // below is a straight copy. Retail only ever uses 256 entries of BGR-888.
  let palette = new Uint8Array((paletteCount * paletteDepth) >> 3)
  view.readBuffer(palette)

  switch (paletteDepth) {
    case 16: // BGRA-5551 -> RGB-888
      palette = expandRGB(palette, paletteCount, 1, 24, 0x7c00, 0x3e0, 0x1f)
      paletteDepth = 24
      break
    case 24: // BGR-888 -> RGB-888
    case 32: // BGRA-8888 -> RGBA-8888
      palette = swapBGRtoRGB(palette, paletteDepth)
      break
    default:
      throw new RangeError(`Invalid color map palette bit depth: ${paletteDepth}`)
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
  const stride = paletteDepth >> 3
  const bitmap = new Uint8Array(pixelCount * stride)

  for (let i = 0, b = 0, t = 0; i < pixelCount; i++) {
    t = indices[i]! * stride

    for (let c = 0; c < stride; c++) bitmap[b++] = palette[t + c]!
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
): TargaPixels {
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

  /** Descriptor flag: low nibble is the attribute bit count, bit 5 the vertical origin. */
  const descriptor = view.readUint8()

  // Skip text section.
  view.offset += textLength

  /** Bit 5 clear (the default) puts the origin at the bottom left, so row 0 is the last row. */
  const flip = (descriptor & 0x20) !== 0

  switch (imageType) {
    case ImageType.COLORMAP:
      if (!colorMapType) throw new RangeError('Color-mapped image is missing color map type flag')

      return {
        ...readUncompressedColorMap(
          view,
          width,
          height,
          depth,
          paletteCount,
          paletteDepth,
          options,
        ),
        flip,
      }
    case ImageType.RGB:
      return { ...readUncompressedRGB(view, width, height, depth, options), flip }
    default:
      throw new RangeError(`Unsupported targa image type: ${imageType}`)
  }
}
