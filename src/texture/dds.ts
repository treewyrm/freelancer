import BufferView from '#/utility/bufferview.js'

const DDS_SIGNATURE = 0x20534444 // "DDS "
const DDS_HEADER_LENGTH = 124
const DDS_PIXEL_FORMAT_LENGTH = 32
const DDS_RESERVED = 11 * Uint32Array.BYTES_PER_ELEMENT
const DDS_CAPS = 0x1
const DDS_HEIGHT = 0x2
const DDS_WIDTH = 0x4
const DDS_PITCH = 0x8
const DDS_PIXEL_FORMAT = 0x1000
const DDS_MIPMAP_COUNT = 0x20000
const DDS_LINEAR_SIZE = 0x80000
const DDS_PIXELS_ALPHA = 0x1
const DDS_PIXELS_FOURCC = 0x4
const DDS_PIXELS_RGB = 0x40
const DDS_CAPS_ALPHA = 0x2
const DDS_CAPS_COMPLEX = 0x8
const DDS_CAPS_TEXTURE = 0x1000
const DDS_CAPS_MIPMAP = 0x400000

/** `dwCaps2`, past the pixel format block and `dwCaps`. Not reached by sequential reading. */
const DDS_CAPS2_OFFSET = 4 + 108
const DDS_CAPS2_CUBEMAP = 0x200

/** `DDSCAPS2_CUBEMAP_POSITIVEX` through `NEGATIVEZ`, in the order the faces are stored. */
const DDS_CAPS2_CUBEMAP_FACES = [0x400, 0x800, 0x1000, 0x2000, 0x4000, 0x8000] as const

/** `DDSCAPS2_CUBEMAP_ALL_FACES`, the only combination retail authors. */
const DDS_CAPS2_CUBEMAP_ALL_FACES = DDS_CAPS2_CUBEMAP_FACES.reduce((bits, bit) => bits | bit, 0)

/** How many faces a cubemap holds. */
export const CUBEMAP_FACES = DDS_CAPS2_CUBEMAP_FACES.length

/** `DDPF_FOURCC` code of a surface's pixel format, or `NONE` for an uncompressed one. */
export enum Compression {
  NONE = 0,
  DXT1 = 0x31545844,
  DXT3 = 0x33545844,
  DXT5 = 0x35545844,
}

/** Per-channel bit masks of an uncompressed pixel format, as `DDPIXELFORMAT` records them. */
interface ColorMask {
  r: number
  g: number
  b: number
  a: number
}

/**
 * A DDS image: one header, and one mip chain per surface it stores.
 *
 * Everything but {@link surfaces} describes the single header the whole file shares, so a cubemap's
 * six faces cannot differ in size or format.
 */
export interface DirectDrawSurface {
  width: number
  height: number
  pitch: number
  depth: number
  bitCount: number
  compression: Compression
  mask: ColorMask

  /**
   * Mip chains, one per surface stored in the file: a single chain for an ordinary texture, six
   * for a cubemap — `DDSCAPS2_CUBEMAP_POSITIVEX` first, `NEGATIVEZ` last. All of them share the
   * dimensions, pixel format and level count of the one header.
   *
   * A cubemap is not a flag here because the count already says it: nothing else in the format
   * stores more than one surface, and reading the face bits back out of a boolean would be
   * inventing a distinction the header does not make.
   */
  surfaces: Uint8Array[][]
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

/**
 * Reads a DDS image and its mip chain out of a `MIPS` payload.
 *
 * Nothing in the file says where one mip level ends, so each level's byte length is derived from the
 * compression, its own dimensions and the bit count; an absent `DDSD_MIPMAPCOUNT` means one level.
 * `dwCaps2` is sought out rather than read in sequence — it is the only field saying whether six
 * faces follow the header instead of one, and it sits past where the header stops being read.
 * @throws RangeError on a bad signature, a compression with no size rule, or a partial cubemap.
 * @throws Error when the pixel format header is missing, without which nothing else can be read.
 */
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

  // Read surface complexity. Sequential reading stops at the pixel format, so dwCaps2 has to be
  // sought out; it is the only field saying whether six faces follow the header instead of one.
  view.offset = DDS_CAPS2_OFFSET

  const caps2 = view.readInt32()
  const cubemap = (caps2 & DDS_CAPS2_CUBEMAP) > 0

  // A cubemap missing a face would leave the remaining chains at the wrong offsets, and neither
  // retail cubemap is partial. Refusing beats guessing which faces the flags meant.
  if (cubemap && (caps2 & DDS_CAPS2_CUBEMAP_ALL_FACES) !== DDS_CAPS2_CUBEMAP_ALL_FACES)
    throw new RangeError('Partial cubemaps are unsupported')

  view.offset = mipmapOffset

  // Read mipmaps, one whole chain per face.
  const surfaces: Uint8Array[][] = []

  for (let face = 0; face < (cubemap ? CUBEMAP_FACES : 1); face++) {
    const mipmaps: Uint8Array[] = []

    for (let i = 0, w = width, h = height; i < mipmapCount; i++, w >>= 1, h >>= 1) {
      const mipmap = new Uint8Array(levelByteLength(compression, w, h, bitCount))

      view.readBuffer(mipmap)
      mipmaps[i] = mipmap
    }

    surfaces[face] = mipmaps
  }

  return { width, height, pitch, depth, bitCount, compression, surfaces, mask }
}

/**
 * Writes a DirectDrawSurface, header and mip chains.
 *
 * `pitch` and `depth` are derived rather than taken: retail is uniform on both — `dwDepth` is
 * always zero, and `dwPitchOrLinearSize` is the top level's byte length for block-compressed
 * surfaces and one row's for the rest. Every other header field retail varies is a function of
 * the arguments, so writing back what {@link readDirectDrawSurface} produced reproduces all
 * 4,447 retail surfaces and both cubemaps byte for byte.
 *
 * The two forms disagree on more of the header than the face count, and each follows the retail
 * files it has. A flat surface leaves `DDSD_CAPS` clear, sets `DDSD_MIPMAPCOUNT` even for a
 * single level, and declares a pitch. Both retail cubemaps do the opposite on all three —
 * `DDSD_CAPS` set, no mip count and a zero `dwMipMapCount`, no pitch — and add `DDSCAPS_COMPLEX`
 * and `DDSCAPS_ALPHA` to `dwCaps`. Neither is a rule the format imposes; they are what the two
 * tools that wrote this data did.
 *
 * `DDSCAPS_ALPHA` is emitted for a cubemap whose pixel format carries an alpha mask, mirroring
 * `DDPF_ALPHAPIXELS`. Both retail cubemaps are `A8R8G8B8`, so "when the format has alpha" and
 * "always, on a cubemap" fit the evidence equally; the flat surfaces settle nothing either, since
 * the `rgba16_5551` ones carry an alpha mask and set no such bit.
 */
export const writeDirectDrawSurface = ({
  width,
  height,
  bitCount,
  compression,
  mask,
  surfaces,
}: Pick<
  DirectDrawSurface,
  'width' | 'height' | 'bitCount' | 'compression' | 'mask' | 'surfaces'
>): BufferView => {
  if (!surfaces.length) throw new RangeError('DirectDrawSurface has no surfaces')

  const cubemap = surfaces.length > 1

  if (cubemap && surfaces.length !== CUBEMAP_FACES)
    throw new RangeError(
      `A cubemap DirectDrawSurface holds ${CUBEMAP_FACES} faces, not ${surfaces.length}`,
    )

  const levels = surfaces[0]!.length
  if (!levels) throw new RangeError('DirectDrawSurface has no mipmap levels')

  const compressed = compression !== Compression.NONE

  // One header describes every face, so the chains have to agree on their length, and every
  // level is sized from the surface dimensions — a chain that does not follow them would write
  // a header the reader could not walk back.
  for (const [face, mipmaps] of surfaces.entries()) {
    if (mipmaps.length !== levels)
      throw new RangeError(
        `Cubemap face ${face} has ${mipmaps.length} mipmap levels, expected ${levels}`,
      )

    for (let i = 0, w = width, h = height; i < mipmaps.length; i++, w >>= 1, h >>= 1) {
      const expected = levelByteLength(compression, w, h, bitCount)

      if (mipmaps[i]!.byteLength !== expected)
        throw new RangeError(
          `Mipmap level ${i} is ${mipmaps[i]!.byteLength} bytes, expected ${expected}`,
        )
    }
  }

  const payload = surfaces.flat().reduce((total, { byteLength }) => total + byteLength, 0)

  const view = BufferView.allocate(4 + DDS_HEADER_LENGTH + payload)

  // A cubemap carries its mip count only when there is a chain to count, matching the two
  // retail files, which store a single level per face and leave the field zero.
  const counted = !cubemap || levels > 1

  view
    .writeInt32(DDS_SIGNATURE)
    .writeInt32(DDS_HEADER_LENGTH)
    .writeInt32(
      DDS_HEIGHT |
        DDS_WIDTH |
        DDS_PIXEL_FORMAT |
        (cubemap ? DDS_CAPS : compressed ? DDS_LINEAR_SIZE : DDS_PITCH) |
        (counted ? DDS_MIPMAP_COUNT : 0),
    )
    .writeInt32(height)
    .writeInt32(width)
    .writeInt32(cubemap ? 0 : compressed ? surfaces[0]![0]!.byteLength : (width * bitCount) >>> 3)
    .writeInt32(0) // dwDepth, unused by every retail surface.
    .writeInt32(counted ? levels : 0)

  view.offset += DDS_RESERVED

  view
    .writeInt32(DDS_PIXEL_FORMAT_LENGTH)
    .writeInt32(compressed ? DDS_PIXELS_FOURCC : DDS_PIXELS_RGB | (mask.a ? DDS_PIXELS_ALPHA : 0))
    .writeInt32(compressed ? compression : 0)
    .writeInt32(compressed ? 0 : bitCount)

  if (compressed) view.offset += 4 * Uint32Array.BYTES_PER_ELEMENT
  else view.writeUint32(mask.r).writeUint32(mask.g).writeUint32(mask.b).writeUint32(mask.a)

  view
    .writeInt32(
      DDS_CAPS_TEXTURE |
        (cubemap ? DDS_CAPS_COMPLEX | (mask.a ? DDS_CAPS_ALPHA : 0) : 0) |
        (levels > 1 ? DDS_CAPS_COMPLEX | DDS_CAPS_MIPMAP : 0),
    )
    .writeInt32(cubemap ? DDS_CAPS2_CUBEMAP | DDS_CAPS2_CUBEMAP_ALL_FACES : 0)

  // dwCaps3/4 and the trailing reserved dword stay zero, as they are throughout retail.
  view.offset = 4 + DDS_HEADER_LENGTH

  for (const mipmap of surfaces.flat()) view.writeBuffer(mipmap)

  return view.rewind()
}
