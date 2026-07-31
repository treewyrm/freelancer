import BufferView from '#/utility/bufferview.js'

const DDS_SIGNATURE = 0x20534444 // "DDS "
const DDS_RESERVED = 11 * Uint32Array.BYTES_PER_ELEMENT
const DDS_PIXEL_FORMAT = 0x1000
const DDS_MIPMAP_COUNT = 0x20000
const DDS_PIXELS_ALPHA = 0x1
const DDS_PIXELS_FOURCC = 0x4
const DDS_PIXELS_RGB = 0x40

export enum Compression {
  NONE = 0,
  DXT1 = 0x31545844,
  DXT3 = 0x33545844,
  DXT5 = 0x35545844,
}

interface ColorMask {
  r: number
  g: number
  b: number
  a: number
}

export interface DirectDrawSurface {
  width: number
  height: number
  pitch: number
  depth: number
  bitCount: number
  compression: Compression
  mipmaps: Uint8Array[]
  mask: ColorMask
}

export const readDirectDrawSurface = (view: BufferView): DirectDrawSurface => {
  // Read main header.
  const signature = view.readInt32()
  if (signature !== DDS_SIGNATURE) throw new RangeError('Invalid DDS header')

  const mipmapOffset = view.offset + view.readInt32()
  const flags = view.readInt32()
  let height = view.readInt32()
  let width = view.readInt32()
  let pitch = view.readInt32()
  let depth = view.readInt32()
  let mipmapCount = view.readInt32()

  if (!(flags & DDS_PIXEL_FORMAT)) throw new Error('Missing pixel format header')
  if (!(flags & DDS_MIPMAP_COUNT)) mipmapCount = 1 // DDSD_MIPMAPCOUNT flag, if absent expect single mipmap.

  view.offset += DDS_RESERVED

  // Read pixel header.
  let pixelSize = view.readInt32()
  let pixelFlags = view.readInt32()
  let compression: Compression = view.readInt32()
  let bitCount = view.readInt32()

  if (!(pixelFlags & DDS_PIXELS_FOURCC)) compression = Compression.NONE

  const mask: ColorMask = { r: 0, g: 0, b: 0, a: 0 }

  // Read color mask.
  if ((pixelFlags & DDS_PIXELS_RGB) > 0) {
    mask.r = view.readInt32()
    mask.g = view.readInt32()
    mask.b = view.readInt32()
    mask.a = view.readInt32()
  }

  view.offset = mipmapOffset

  // Read mipmaps.
  const mipmaps: Uint8Array[] = []

  for (
    let i = 0, w = width, h = height, mipmap: Uint8Array;
    i < mipmapCount;
    i++, w >>= 1, h >>= 1
  ) {
    switch (compression) {
      case Compression.NONE:
        mipmap = new Uint8Array((w * h * bitCount) >>> 3)
        break
      case Compression.DXT1:
        mipmap = new Uint8Array((w >> 2) * (h >> 2) * 8)
        break
      case Compression.DXT3:
      case Compression.DXT5:
        mipmap = new Uint8Array((w >> 2) * (h >> 2) * 16)
        break
      default:
        throw new RangeError('Invalid mipmap compression type')
    }

    view.readBuffer(mipmap)
    mipmaps[i] = mipmap
  }

  return { width, height, pitch, depth, bitCount, compression, mipmaps, mask }
}
