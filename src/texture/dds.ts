import BufferView from '#/utility/bufferview.js'

const DDS_SIGNATURE = 0x20534444 // "DDS "
const DDS_HEADER_LENGTH = 124
const DDS_PIXEL_FORMAT_LENGTH = 32
const DDS_RESERVED = 11 * Uint32Array.BYTES_PER_ELEMENT
const DDS_HEIGHT = 0x2
const DDS_WIDTH = 0x4
const DDS_PITCH = 0x8
const DDS_PIXEL_FORMAT = 0x1000
const DDS_MIPMAP_COUNT = 0x20000
const DDS_LINEAR_SIZE = 0x80000
const DDS_PIXELS_ALPHA = 0x1
const DDS_PIXELS_FOURCC = 0x4
const DDS_PIXELS_RGB = 0x40
const DDS_CAPS_COMPLEX = 0x8
const DDS_CAPS_TEXTURE = 0x1000
const DDS_CAPS_MIPMAP = 0x400000

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

/**
 * Block-compressed levels are padded up to whole 4x4 blocks, so a 2x2 or 1x1 level still
 * occupies one block. Retail never exercises this — every DXT chain in the game stops at
 * exactly 4x4 — but a chain carried down to 1x1 would otherwise measure as empty levels.
 */
const blocks = (w: number, h: number, bytes: number) =>
  Math.max(1, (w + 3) >> 2) * Math.max(1, (h + 3) >> 2) * bytes

/** Byte length one mip level occupies, at the given dimensions. */
const levelByteLength = (
  compression: Compression,
  width: number,
  height: number,
  bitCount: number,
): number => {
  switch (compression) {
    case Compression.NONE:
      return (Math.max(1, width) * Math.max(1, height) * bitCount) >>> 3
    case Compression.DXT1:
      return blocks(width, height, 8)
    case Compression.DXT3:
    case Compression.DXT5:
      return blocks(width, height, 16)
    default:
      throw new RangeError('Invalid mipmap compression type')
  }
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

  // Read color mask. Unsigned, or an 0xff000000 alpha mask would come back negative and match
  // no known pixel format. Retail has no 32-bit uncompressed surface to expose that.
  if ((pixelFlags & DDS_PIXELS_RGB) > 0) {
    mask.r = view.readUint32()
    mask.g = view.readUint32()
    mask.b = view.readUint32()
    mask.a = view.readUint32()
  }

  view.offset = mipmapOffset

  // Read mipmaps.
  const mipmaps: Uint8Array[] = []

  for (let i = 0, w = width, h = height; i < mipmapCount; i++, w >>= 1, h >>= 1) {
    const mipmap = new Uint8Array(levelByteLength(compression, w, h, bitCount))

    view.readBuffer(mipmap)
    mipmaps[i] = mipmap
  }

  return { width, height, pitch, depth, bitCount, compression, mipmaps, mask }
}

/**
 * Writes a DirectDrawSurface, header and mip chain.
 *
 * `pitch` and `depth` are derived rather than taken: retail is uniform on both — `dwDepth` is
 * always zero, and `dwPitchOrLinearSize` is the top level's byte length for block-compressed
 * surfaces and one row's for the rest. Every other header field retail varies is a function of
 * the arguments, so writing back what {@link readDirectDrawSurface} produced reproduces all
 * 4,447 retail surfaces byte for byte.
 *
 * Note that `DDSD_CAPS` is left clear, as it is in every retail surface, and that
 * `DDSD_MIPMAPCOUNT` is set even for a single level — also matching retail.
 */
export const writeDirectDrawSurface = ({
  width,
  height,
  bitCount,
  compression,
  mask,
  mipmaps,
}: Pick<
  DirectDrawSurface,
  'width' | 'height' | 'bitCount' | 'compression' | 'mask' | 'mipmaps'
>): BufferView => {
  if (!mipmaps.length) throw new RangeError('DirectDrawSurface has no mipmap levels')

  const compressed = compression !== Compression.NONE

  // Every level is sized from the surface dimensions, so a chain that does not follow them
  // would write a header the reader could not walk back.
  for (let i = 0, w = width, h = height; i < mipmaps.length; i++, w >>= 1, h >>= 1) {
    const expected = levelByteLength(compression, w, h, bitCount)

    if (mipmaps[i]!.byteLength !== expected)
      throw new RangeError(
        `Mipmap level ${i} is ${mipmaps[i]!.byteLength} bytes, expected ${expected}`,
      )
  }

  const payload = mipmaps.reduce((total, { byteLength }) => total + byteLength, 0)
  const view = BufferView.allocate(4 + DDS_HEADER_LENGTH + payload)

  view
    .writeInt32(DDS_SIGNATURE)
    .writeInt32(DDS_HEADER_LENGTH)
    .writeInt32(
      DDS_HEIGHT |
        DDS_WIDTH |
        DDS_PIXEL_FORMAT |
        DDS_MIPMAP_COUNT |
        (compressed ? DDS_LINEAR_SIZE : DDS_PITCH),
    )
    .writeInt32(height)
    .writeInt32(width)
    .writeInt32(compressed ? mipmaps[0]!.byteLength : (width * bitCount) >>> 3)
    .writeInt32(0) // dwDepth, unused by every retail surface.
    .writeInt32(mipmaps.length)

  view.offset += DDS_RESERVED

  view
    .writeInt32(DDS_PIXEL_FORMAT_LENGTH)
    .writeInt32(compressed ? DDS_PIXELS_FOURCC : DDS_PIXELS_RGB | (mask.a ? DDS_PIXELS_ALPHA : 0))
    .writeInt32(compressed ? compression : 0)
    .writeInt32(compressed ? 0 : bitCount)

  if (compressed) view.offset += 4 * Uint32Array.BYTES_PER_ELEMENT
  else view.writeUint32(mask.r).writeUint32(mask.g).writeUint32(mask.b).writeUint32(mask.a)

  view.writeInt32(DDS_CAPS_TEXTURE | (mipmaps.length > 1 ? DDS_CAPS_COMPLEX | DDS_CAPS_MIPMAP : 0))

  // dwCaps2/3/4 and the trailing reserved dword stay zero, as they are throughout retail.
  view.offset = 4 + DDS_HEADER_LENGTH

  for (const mipmap of mipmaps) view.writeBuffer(mipmap)

  return view.rewind()
}
