import { deepStrictEqual, ok, strictEqual, throws } from 'node:assert/strict'
import { describe, it } from 'node:test'
import Directory from '../utf/directory.js'
import File from '../utf/file.js'
import BufferView from '../utility/bufferview.js'
import { readAnimatedTexture, writeAnimatedTexture, type AnimatedTexture } from './animation.js'
import { Compression, readDirectDrawSurface, writeDirectDrawSurface } from './dds.js'
import {
  readCUBE,
  readMIP,
  readMIPS,
  readTexture,
  readTextures,
  writeMIP,
  writeMIPS,
  writeTexture,
  writeTextures,
} from './library.js'
import { readTargaImage, swapBGRtoRGB, writeTargaImage } from './targa.js'
import type { Texture, TextureType } from './types.js'

/**
 * These cover what the retail corpus cannot reach. Every DXT chain in the game stops at 4x4 and
 * every colour map is 256 entries of BGR-888, so the sub-block levels and the wider pixel formats
 * only ever appear in content authored elsewhere.
 */

interface SurfaceOptions {
  width: number
  height: number
  levels: number
  compression?: Compression
  bitCount?: number
  mask?: [r: number, g: number, b: number, a: number]

  /** Six writes a cubemap, into a `CUBE` file rather than a `MIPS` one. */
  faces?: number

  /** Face bits to declare, when they should not be all six. */
  caps2?: number
}

/**
 * Builds a DirectDrawSurface whose payload is filled with a marker byte unique to each level of
 * each face, so a misread stride or a face read at the wrong offset shows up as the wrong marker.
 */
const surface = ({
  width,
  height,
  levels,
  compression = Compression.NONE,
  bitCount = 32,
  mask = [0xff0000, 0xff00, 0xff, 0xff000000],
  faces = 1,
  caps2 = faces > 1 ? 0xfe00 : 0,
}: SurfaceOptions) => {
  const sizes: number[] = []

  for (let i = 0, w = width, h = height; i < levels; i++, w >>= 1, h >>= 1) {
    const blocks = Math.max(1, (w + 3) >> 2) * Math.max(1, (h + 3) >> 2)

    sizes.push(
      compression === Compression.NONE
        ? (Math.max(1, w) * Math.max(1, h) * bitCount) >>> 3
        : blocks * (compression === Compression.DXT1 ? 8 : 16),
    )
  }

  const payload = sizes.reduce((sum, size) => sum + size, 0) * faces
  const buffer = new Uint8Array(128 + payload)
  const view = new DataView(buffer.buffer)
  const u32 = (offset: number, value: number) => view.setUint32(offset, value, true)

  u32(0, 0x20534444) // 'DDS '
  u32(4, 124)
  u32(8, 0x1000 | (levels > 1 ? 0x20000 : 0)) // DDSD_PIXELFORMAT | DDSD_MIPMAPCOUNT
  u32(12, height)
  u32(16, width)
  u32(28, levels)
  u32(76, 32)

  if (compression === Compression.NONE) {
    u32(80, 0x40) // DDPF_RGB
    u32(88, bitCount)
    u32(92, mask[0])
    u32(96, mask[1])
    u32(100, mask[2])
    u32(104, mask[3])
  } else {
    u32(80, 0x4) // DDPF_FOURCC
    u32(84, compression)
  }

  u32(112, caps2)

  for (let face = 0, offset = 128; face < faces; face++)
    for (let i = 0; i < sizes.length; i++) {
      buffer.fill(face * levels + i + 1, offset, offset + sizes[i]!)
      offset += sizes[i]!
    }

  return { file: new File(faces > 1 ? 'CUBE' : 'MIPS', buffer), sizes }
}

interface TargaOptions {
  width: number
  height: number
  depth: number
  flip?: boolean
  palette?: number[]
  paletteDepth?: number
  pixels: number[]
}

const targa = ({
  width,
  height,
  depth,
  flip = false,
  palette,
  paletteDepth = 24,
  pixels,
}: TargaOptions) => {
  const count = palette ? palette.length / (paletteDepth >> 3) : 0
  const buffer = new Uint8Array(18 + (palette?.length ?? 0) + pixels.length)
  const view = new DataView(buffer.buffer)

  view.setUint8(1, palette ? 1 : 0)
  view.setUint8(2, palette ? 1 : 2) // COLORMAP or RGB
  view.setUint16(5, count, true)
  view.setUint8(7, palette ? paletteDepth : 0)
  view.setUint16(12, width, true)
  view.setUint16(14, height, true)
  view.setUint8(16, depth)
  view.setUint8(17, flip ? 0x20 : 0)

  buffer.set(palette ?? [], 18)
  buffer.set(pixels, 18 + (palette?.length ?? 0))

  return buffer
}

const entry = (name: string, ...children: (Directory | File)[]) => new Directory(name, children)

describe('readDirectDrawSurface', () => {
  // The regression the retail corpus cannot catch: a level below 4x4 still occupies one whole
  // block, so truncating the block count to `w >> 2` would decode these as empty.
  it('gives sub-4x4 DXT1 levels a whole 8-byte block each', () => {
    const { file, sizes } = surface({
      width: 8,
      height: 8,
      levels: 4,
      compression: Compression.DXT1,
    })

    deepStrictEqual(sizes, [32, 8, 8, 8])

    const mipmaps = readDirectDrawSurface(BufferView.from(file.data)).surfaces[0]!

    deepStrictEqual(
      mipmaps.map(({ byteLength }) => byteLength),
      [32, 8, 8, 8],
    )

    // Each level carries its own marker, so the levels are not merely the right size but
    // are also cut at the right offsets.
    deepStrictEqual(
      mipmaps.map((level) => level[0]),
      [1, 2, 3, 4],
    )
  })

  it('gives sub-4x4 DXT3 and DXT5 levels a whole 16-byte block each', () => {
    for (const compression of [Compression.DXT3, Compression.DXT5]) {
      const { file } = surface({ width: 8, height: 8, levels: 4, compression })
      const mipmaps = readDirectDrawSurface(BufferView.from(file.data)).surfaces[0]!

      deepStrictEqual(
        mipmaps.map(({ byteLength }) => byteLength),
        [64, 16, 16, 16],
      )
    }
  })

  // A non-square chain hits 1 on one axis while the other is still descending.
  it('keeps rounding up once one axis reaches a single block', () => {
    const { file } = surface({ width: 16, height: 4, levels: 5, compression: Compression.DXT1 })
    const mipmaps = readDirectDrawSurface(BufferView.from(file.data)).surfaces[0]!

    // 16x4 -> 4 blocks, 8x2 -> 2, 4x1 -> 1, 2x0 -> 1, 1x0 -> 1
    deepStrictEqual(
      mipmaps.map(({ byteLength }) => byteLength),
      [32, 16, 8, 8, 8],
    )
  })

  it('carries an uncompressed chain down to a single pixel', () => {
    const { file } = surface({ width: 4, height: 4, levels: 3, bitCount: 32 })
    const mipmaps = readDirectDrawSurface(BufferView.from(file.data)).surfaces[0]!

    deepStrictEqual(
      mipmaps.map(({ byteLength }) => byteLength),
      [64, 16, 4],
    )
  })

  it('reads a single level when DDSD_MIPMAPCOUNT is absent', () => {
    const { file } = surface({ width: 4, height: 4, levels: 1, bitCount: 32 })

    strictEqual(readDirectDrawSurface(BufferView.from(file.data)).surfaces[0]!.length, 1)
  })

  it('throws on a buffer that is not a DirectDrawSurface', () => {
    throws(() => readDirectDrawSurface(BufferView.from(new Uint8Array(128))), RangeError)
  })
})

describe('readMIPS', () => {
  it('maps each FourCC onto its texture type', () => {
    const types = [
      [Compression.DXT1, 'dxt1'],
      [Compression.DXT3, 'dxt3'],
      [Compression.DXT5, 'dxt5'],
    ] as const

    for (const [compression, type] of types) {
      const { file } = surface({ width: 4, height: 4, levels: 1, compression })

      strictEqual(readMIPS(entry('texture', file))?.type, type)
    }
  })

  it('recognises the uncompressed masks, including the two retail never authored', () => {
    const masks = [
      [16, [0xf800, 0x7e0, 0x1f, 0], 'rgb16_565'],
      [16, [0xf00, 0xf0, 0xf, 0xf000], 'rgba16_4444'],
      [16, [0x7c00, 0x3e0, 0x1f, 0x8000], 'rgba16_5551'],
      [24, [0xff0000, 0xff00, 0xff, 0], 'rgb24_888'],
      [32, [0xff0000, 0xff00, 0xff, 0xff000000], 'rgba32_8888'],
    ] as const

    for (const [bitCount, mask, type] of masks) {
      const { file } = surface({
        width: 4,
        height: 4,
        levels: 1,
        bitCount,
        mask: [...mask] as [number, number, number, number],
      })

      strictEqual(readMIPS(entry('texture', file))?.type, type, type)
    }
  })

  it('throws on a colour mask no texture type covers', () => {
    const { file } = surface({
      width: 4,
      height: 4,
      levels: 1,
      bitCount: 16,
      mask: [0x1f, 0x3e0, 0x7c00, 0],
    })

    throws(() => readMIPS(entry('texture', file)), RangeError)
  })

  it('always reports a top-down origin, since that is how DDS stores rows', () => {
    const { file } = surface({ width: 4, height: 4, levels: 1 })

    strictEqual(readMIPS(entry('texture', file))?.flip, true)
  })

  it('returns undefined when there is no MIPS file', () => {
    strictEqual(readMIPS(entry('texture')), undefined)
  })

  // Retail files one under `MIPS` and the other under `CUBE`, so the surface a `MIPS` file holds
  // is always flat. Reading one anyway would drop five faces without saying so.
  it('refuses a cubemap filed under MIPS rather than dropping five faces', () => {
    const { file } = surface({ width: 4, height: 4, levels: 1, faces: 6 })

    throws(() => readMIPS(entry('texture', new File('MIPS', file.data))), RangeError)
  })
})

describe('readCUBE', () => {
  const cube = (options: Omit<SurfaceOptions, 'faces'>) =>
    readCUBE(entry('texture', surface({ ...options, faces: 6 }).file))

  it('splits the surface into six faces, each with its own chain', () => {
    const texture = cube({ width: 4, height: 4, levels: 3 })

    strictEqual(texture?.storage, 'cube')
    strictEqual(texture.type, 'rgba32_8888')
    strictEqual(texture.width, 4)
    strictEqual(texture.height, 4)
    strictEqual(texture.faces.length, 6)

    for (const [face, chain] of texture.faces.entries()) {
      deepStrictEqual(
        chain.map(({ byteLength }) => byteLength),
        [64, 16, 4],
      )

      // Markers run face by face, so a face cut at the wrong offset carries another's bytes.
      deepStrictEqual(
        chain.map((level) => level[0]),
        [face * 3 + 1, face * 3 + 2, face * 3 + 3],
      )
    }
  })

  it('always reports a top-down origin, since that is how DDS stores rows', () => {
    strictEqual(cube({ width: 4, height: 4, levels: 1 })?.flip, true)
  })

  /** A missing face bit would leave every later face at the wrong offset. */
  it('refuses a partial cubemap rather than reading the faces at the wrong offsets', () => {
    // DDSCAPS2_CUBEMAP with the negative Z face missing.
    throws(() => cube({ width: 4, height: 4, levels: 1, caps2: 0x7e00 }), RangeError)
  })

  it('refuses a CUBE file whose surface declares no faces at all', () => {
    const { file } = surface({ width: 4, height: 4, levels: 1 })

    throws(() => readCUBE(entry('texture', new File('CUBE', file.data))), RangeError)
  })

  it('returns undefined when there is no CUBE file', () => {
    strictEqual(readCUBE(entry('texture')), undefined)
  })
})

describe('readTargaImage', () => {
  it('reports a bottom-left origin as unflipped and bit 5 as flipped', () => {
    const pixels = [0x11, 0x22, 0x33]
    const origin = (flip: boolean) =>
      readTargaImage(BufferView.from(targa({ width: 1, height: 1, depth: 24, flip, pixels }))).flip

    strictEqual(origin(false), false)
    strictEqual(origin(true), true)
  })

  it('swaps a 24-bit image from BGR into RGB', () => {
    const image = readTargaImage(
      BufferView.from(targa({ width: 1, height: 1, depth: 24, pixels: [0x11, 0x22, 0x33] })),
    )

    deepStrictEqual([...image.bitmap], [0x33, 0x22, 0x11])
    strictEqual(image.depth, 24)
  })

  it('expands a 16-bit 5551 image into 24-bit RGB', () => {
    // 0x7c00 is red at full intensity, stored little-endian.
    const image = readTargaImage(
      BufferView.from(targa({ width: 1, height: 1, depth: 16, pixels: [0x00, 0x7c] })),
    )

    deepStrictEqual([...image.bitmap], [0xff, 0, 0])
    strictEqual(image.depth, 24, 'a 16-bit image is expanded rather than reported as 16-bit')
  })

  // Retail is uniformly 8-bit indices into 256 BGR-888 entries.
  it('resolves an 8-bit colour map through its palette, in RGB order', () => {
    const image = readTargaImage(
      BufferView.from(
        targa({
          width: 2,
          height: 1,
          depth: 8,
          palette: [0x11, 0x22, 0x33, 0x44, 0x55, 0x66],
          pixels: [1, 0],
        }),
      ),
    )

    deepStrictEqual([...image.bitmap], [0x66, 0x55, 0x44, 0x33, 0x22, 0x11])
    strictEqual(image.depth, 24)
  })

  it('keeps the alpha byte when the palette is 32-bit', () => {
    const image = readTargaImage(
      BufferView.from(
        targa({
          width: 1,
          height: 1,
          depth: 8,
          paletteDepth: 32,
          palette: [0x11, 0x22, 0x33, 0x44],
          pixels: [0],
        }),
      ),
    )

    deepStrictEqual([...image.bitmap], [0x33, 0x22, 0x11, 0x44])
    strictEqual(image.depth, 32)
  })

  it('throws on a compressed image type, which the reader does not implement', () => {
    const buffer = targa({ width: 1, height: 1, depth: 24, pixels: [0, 0, 0] })
    buffer[2] = 10 // RLE_RGB

    throws(() => readTargaImage(BufferView.from(buffer)), RangeError)
  })
})

describe('swapBGRtoRGB', () => {
  it('rejects a depth that is neither 24 nor 32', () => {
    throws(() => swapBGRtoRGB(new Uint8Array(4), 16), RangeError)
  })
})

describe('readMIP', () => {
  const level = (width: number, height: number, flip = false, depth = 24) =>
    targa({ width, height, depth, flip, pixels: new Array((width * height * depth) >> 3).fill(0) })

  it('collects the chain until a level is missing', () => {
    const texture = readMIP(
      entry(
        'texture',
        new File('MIP0', level(4, 4)),
        new File('MIP1', level(2, 2)),
        new File('MIP2', level(1, 1)),
      ),
    )

    strictEqual(texture?.levels.length, 3)
    strictEqual(texture.width, 4)
    strictEqual(texture.type, 'rgb24_888')
  })

  it('takes the vertical origin from the chain rather than assuming bottom-left', () => {
    strictEqual(readMIP(entry('texture', new File('MIP0', level(1, 1, true))))?.flip, true)
    strictEqual(readMIP(entry('texture', new File('MIP0', level(1, 1, false))))?.flip, false)
  })

  it('throws when levels disagree on their origin or depth', () => {
    throws(
      () =>
        readMIP(
          entry(
            'texture',
            new File('MIP0', level(2, 2, false)),
            new File('MIP1', level(1, 1, true)),
          ),
        ),
      RangeError,
    )

    throws(
      () =>
        readMIP(
          entry(
            'texture',
            new File('MIP0', level(2, 2, false, 24)),
            new File('MIP1', level(1, 1, false, 32)),
          ),
        ),
      RangeError,
    )
  })

  it('returns undefined when there is no chain at all', () => {
    strictEqual(readMIP(entry('texture')), undefined)
  })
})

describe('readTexture', () => {
  it('prefers a DirectDrawSurface over a Targa chain when an entry carries both', () => {
    const { file } = surface({ width: 4, height: 4, levels: 1, compression: Compression.DXT1 })
    const chain = new File(
      'MIP0',
      targa({ width: 4, height: 4, depth: 24, pixels: new Array(48).fill(0) }),
    )

    strictEqual(readTexture(entry('texture', file, chain))?.type, 'dxt1')
  })

  it('returns undefined for an entry in no recognised form', () => {
    strictEqual(readTexture(entry('texture', new File('Image X size'))), undefined)
  })
})

describe('readTextures', () => {
  const library = (...children: Directory[]) =>
    new Directory('', [new Directory('Texture library', children)])

  it('finds the library however it is capitalised', () => {
    const root = new Directory('', [
      new Directory('texture library', [
        entry('texture', surface({ width: 4, height: 4, levels: 1 }).file),
      ]),
    ])

    strictEqual([...readTextures(root)].length, 1)
  })

  it('yields nothing when there is no library', () => {
    deepStrictEqual([...readTextures(new Directory(''))], [])
  })

  // The handler used to reference an undefined `name`, so every malformed texture surfaced as a
  // ReferenceError and discarded the real cause along with the AggregateError.
  it('reports a failing entry by name, and still yields the entries that read', () => {
    const good = entry('good', surface({ width: 4, height: 4, levels: 1 }).file)
    const bad = entry('bad', new File('MIPS', new Uint8Array(200)))

    let yielded: string[] = []

    throws(
      () => {
        for (const texture of readTextures(library(good, bad))) yielded.push(texture.name)
      },
      (error: unknown) => {
        ok(error instanceof AggregateError)
        strictEqual(error.errors.length, 1)
        strictEqual(error.errors[0].name, 'bad')
        ok(error.errors[0].error instanceof RangeError)
        return true
      },
    )

    deepStrictEqual(yielded, ['good'])
  })
})

/**
 * Writing. The retail corpus pins the round-trip for everything the game itself ships; these
 * cover what it cannot reach — sub-4x4 block levels, the two pixel formats retail never
 * authored, and every way a caller can hand the writers something incoherent.
 */

const image = (
  type: TextureType,
  {
    width = 4,
    height = 4,
    levels = 1,
    flip = true,
    bytes,
  }: { width?: number; height?: number; levels?: number; flip?: boolean; bytes: number[] },
): Texture => ({
  name: 'texture',
  type,
  storage: type === 'rgb24_888' || type === 'rgba32_8888' ? 'targa' : 'dds',
  width,
  height,
  flip,
  levels: Array.from({ length: levels }, (_, level) =>
    new Uint8Array(bytes[level] ?? bytes[0]!).fill(level + 1),
  ),
})

describe('writeDirectDrawSurface', () => {
  const roundTrip = (options: SurfaceOptions) => {
    const source = readDirectDrawSurface(BufferView.from(surface(options).file.data))
    const written = writeDirectDrawSurface(source)

    return readDirectDrawSurface(written)
  }

  it('reproduces a block-compressed chain that descends past a single block', () => {
    for (const compression of [Compression.DXT1, Compression.DXT3, Compression.DXT5]) {
      const mipmaps = roundTrip({ width: 8, height: 8, levels: 4, compression }).surfaces[0]!

      deepStrictEqual(
        mipmaps.map(({ byteLength }) => byteLength),
        compression === Compression.DXT1 ? [32, 8, 8, 8] : [64, 16, 16, 16],
      )

      deepStrictEqual(
        mipmaps.map((level) => level[0]),
        [1, 2, 3, 4],
      )
    }
  })

  it('reproduces the uncompressed pixel formats, masks and all', () => {
    const { bitCount, mask, surfaces } = roundTrip({
      width: 4,
      height: 4,
      levels: 3,
      bitCount: 32,
      mask: [0xff0000, 0xff00, 0xff, 0xff000000],
    })

    strictEqual(bitCount, 32)
    deepStrictEqual(mask, { r: 0xff0000, g: 0xff00, b: 0xff, a: 0xff000000 })
    deepStrictEqual(
      surfaces[0]!.map(({ byteLength }) => byteLength),
      [64, 16, 4],
    )
  })

  it('reproduces all six faces of a cubemap, in order', () => {
    const { surfaces } = roundTrip({ width: 4, height: 4, levels: 1, faces: 6 })

    strictEqual(surfaces.length, 6)

    // Every face carries its own marker, so a face read or written at the wrong offset shows up
    // as another face's bytes rather than as the right size in the wrong place.
    deepStrictEqual(
      surfaces.map((face) => face[0]![0]),
      [1, 2, 3, 4, 5, 6],
    )
  })

  it('rejects a surface count that is neither one nor six', () => {
    for (const count of [2, 5, 7])
      throws(
        () =>
          writeDirectDrawSurface({
            width: 4,
            height: 4,
            bitCount: 32,
            compression: Compression.NONE,
            mask: { r: 0xff0000, g: 0xff00, b: 0xff, a: 0xff000000 },
            surfaces: Array.from({ length: count }, () => [new Uint8Array(64)]),
          }),
        RangeError,
      )
  })

  // One header describes every face, so a shorter chain would leave the rest misaligned.
  it('rejects cubemap faces whose chains disagree in length', () => {
    throws(
      () =>
        writeDirectDrawSurface({
          width: 4,
          height: 4,
          bitCount: 32,
          compression: Compression.NONE,
          mask: { r: 0xff0000, g: 0xff00, b: 0xff, a: 0xff000000 },
          surfaces: Array.from({ length: 6 }, (_, face) =>
            face === 3 ? [new Uint8Array(64)] : [new Uint8Array(64), new Uint8Array(16)],
          ),
        }),
      RangeError,
    )
  })

  // The header records only the base size, so a chain that does not halve from it would be
  // walked back at the wrong offsets rather than read as written.
  it('rejects a level whose buffer does not match the dimensions it will be read at', () => {
    throws(
      () =>
        writeDirectDrawSurface({
          width: 4,
          height: 4,
          bitCount: 32,
          compression: Compression.NONE,
          mask: { r: 0xff0000, g: 0xff00, b: 0xff, a: 0xff000000 },
          surfaces: [[new Uint8Array(64), new Uint8Array(64)]],
        }),
      RangeError,
    )
  })

  it('rejects a surface with no levels at all', () => {
    throws(
      () =>
        writeDirectDrawSurface({
          width: 4,
          height: 4,
          bitCount: 32,
          compression: Compression.NONE,
          mask: { r: 0, g: 0, b: 0, a: 0 },
          surfaces: [],
        }),
      RangeError,
    )
  })
})

describe('writeTargaImage', () => {
  it('reproduces a 24-bit image, channel order and origin included', () => {
    for (const flip of [false, true]) {
      const written = writeTargaImage({
        width: 2,
        height: 1,
        depth: 24,
        flip,
        bitmap: new Uint8Array([0x11, 0x22, 0x33, 0x44, 0x55, 0x66]),
      })

      const image = readTargaImage(written)

      strictEqual(image.width, 2)
      strictEqual(image.height, 1)
      strictEqual(image.depth, 24)
      strictEqual(image.flip, flip)
      deepStrictEqual([...image.bitmap], [0x11, 0x22, 0x33, 0x44, 0x55, 0x66])
    }
  })

  it('reproduces a 32-bit image without disturbing its alpha byte', () => {
    const bitmap = new Uint8Array([0x11, 0x22, 0x33, 0x44])
    const image = readTargaImage(
      writeTargaImage({ width: 1, height: 1, depth: 32, flip: false, bitmap }),
    )

    strictEqual(image.depth, 32)
    deepStrictEqual([...image.bitmap], [...bitmap])
  })

  // 16-bit sources are expanded to 24-bit on read and the palette of a colour-mapped image is
  // not carried at all, so neither can be written back in its original form.
  it('refuses a depth it cannot store, rather than guessing at a palette', () => {
    for (const depth of [8, 16]) {
      throws(
        () =>
          writeTargaImage({
            width: 1,
            height: 1,
            depth,
            flip: false,
            bitmap: new Uint8Array(depth >> 3),
          }),
        RangeError,
      )
    }
  })

  it('rejects a bitmap that is not the size its dimensions imply', () => {
    throws(
      () =>
        writeTargaImage({ width: 2, height: 2, depth: 24, flip: false, bitmap: new Uint8Array(3) }),
      RangeError,
    )
  })
})

describe('writeMIPS', () => {
  it('writes a pixel format each texture type reads back as itself', () => {
    const sizes: Partial<Record<TextureType, number>> = {
      dxt1: 8,
      dxt3: 16,
      dxt5: 16,
      rgb16_565: 32,
      rgba16_4444: 32,
      rgba16_5551: 32,
      rgb24_888: 48,
      rgba32_8888: 64,
    }

    for (const [type, size] of Object.entries(sizes) as [TextureType, number][]) {
      const texture = image(type, { bytes: [size] })
      const written = readMIPS(entry('texture', writeMIPS(texture)))

      strictEqual(written?.type, type, type)
      strictEqual(written.storage, 'dds', type)
      strictEqual(written.width, 4, type)
      strictEqual(written.height, 4, type)
      deepStrictEqual(written.levels, texture.levels, type)
    }
  })

  // DDS stores the top row first, unconditionally, and neither reader reorders rows — so a
  // bottom-up bitmap written here would silently come back upside down.
  it('refuses a texture whose rows run bottom-up', () => {
    throws(() => writeMIPS(image('dxt1', { flip: false, bytes: [8] })), RangeError)
  })

  it('refuses a texture type no pixel format covers', () => {
    throws(() => writeMIPS(image('none', { bytes: [8] })), RangeError)
  })
})

describe('writeMIP', () => {
  it('halves the dimensions down the chain, and reads back as it was written', () => {
    const texture = image('rgb24_888', {
      width: 4,
      height: 2,
      levels: 3,
      flip: false,
      bytes: [24, 6, 3],
    })

    const files = writeMIP(texture)

    deepStrictEqual(
      files.map(({ name }) => name),
      ['MIP0', 'MIP1', 'MIP2'],
    )

    // 4x2, 2x1, then 1x1 — the height has bottomed out while the width is still descending.
    deepStrictEqual(
      files.map((file) => {
        const view = new DataView(file.buffer, file.byteOffset, file.byteLength)
        return [view.getUint16(12, true), view.getUint16(14, true)]
      }),
      [
        [4, 2],
        [2, 1],
        [1, 1],
      ],
    )

    const written = readMIP(entry('texture', ...files))

    strictEqual(written?.type, 'rgb24_888')
    strictEqual(written.storage, 'targa')
    strictEqual(written.flip, false)
    deepStrictEqual(written.levels, texture.levels)
  })

  it('keeps a 32-bit chain 32-bit', () => {
    const texture = image('rgba32_8888', { width: 2, height: 2, bytes: [16] })

    strictEqual(readMIP(entry('texture', ...writeMIP(texture)))?.type, 'rgba32_8888')
  })

  it('refuses the types a Targa cannot hold', () => {
    for (const type of ['dxt1', 'dxt5', 'rgb16_565', 'rgba16_5551'] as const)
      throws(() => writeMIP(image(type, { bytes: [64] })), RangeError)
  })
})

describe('writeAnimatedTexture', () => {
  const animation = (frames: number[], rate = 15): AnimatedTexture => ({
    name: 'anim',
    type: 'animated',
    rate,
    frames: frames.map((index) => ({ index, u1: 0, v1: 1, u2: 1, v2: 0 })),
  })

  const count = (directory: ReturnType<typeof writeAnimatedTexture>, name: string) => {
    const file = directory.getFile(name)!
    return new DataView(file.buffer, file.byteOffset, file.byteLength).getInt32(0, true)
  }

  // Texture count names the sibling atlases, so it follows the highest index rather than the
  // number of frames — a tiled animation runs many frames off one atlas.
  it('derives Texture count from the highest frame index, not the frame count', () => {
    const written = writeAnimatedTexture(animation([0, 0, 0, 0]))

    strictEqual(count(written, 'Texture count'), 1)
    strictEqual(count(written, 'Frame count'), 4)

    strictEqual(count(writeAnimatedTexture(animation([2, 0, 1])), 'Texture count'), 3)
  })

  it('counts no atlases when there are no frames', () => {
    strictEqual(count(writeAnimatedTexture(animation([])), 'Texture count'), 0)
  })

  it('reads back as the animation it was given', () => {
    const source = animation([0, 1], 30)
    const written = readAnimatedTexture(writeAnimatedTexture(source))

    strictEqual(written?.rate, 30)
    deepStrictEqual(written.frames, source.frames)
  })
})

describe('writeTexture', () => {
  it('picks the on-disk form from storage, not from the texture type', () => {
    const dds = writeTexture({ ...image('rgb24_888', { bytes: [48] }), storage: 'dds' })
    const targa = writeTexture({ ...image('rgb24_888', { bytes: [48] }), storage: 'targa' })

    deepStrictEqual(
      dds.children.map(({ name }) => name),
      ['MIPS'],
    )

    deepStrictEqual(
      targa.children.map(({ name }) => name),
      ['MIP0'],
    )
  })

  it('writes an animated entry without any pixel data', () => {
    const written = writeTexture({
      name: 'anim',
      type: 'animated',
      rate: 15,
      frames: [{ index: 0, u1: 0, v1: 0, u2: 1, v2: 1 }],
    })

    deepStrictEqual(
      written.children.map(({ name }) => name),
      ['Texture count', 'Frame count', 'FPS', 'Frame rects'],
    )
  })

  it('writes a cubemap into a CUBE file that reads back face for face', () => {
    const texture = readCUBE(
      entry('texture', surface({ width: 4, height: 4, levels: 2, faces: 6 }).file),
    )
    ok(texture)

    const written = writeTexture(texture)

    deepStrictEqual(
      written.children.map(({ name }) => name),
      ['CUBE'],
    )

    deepStrictEqual(readCUBE(written), texture)
  })

  it('refuses a cubemap whose rows run bottom-up', () => {
    const texture = readCUBE(
      entry('texture', surface({ width: 4, height: 4, levels: 1, faces: 6 }).file),
    )
    ok(texture)

    throws(() => writeTexture({ ...texture, flip: false }), RangeError)
  })
})

describe('writeTextures', () => {
  it('builds a library the reader finds again', () => {
    const textures = [
      { ...image('dxt1', { bytes: [8] }), name: 'compressed' },
      { ...image('rgba32_8888', { bytes: [64] }), name: 'raw' },
    ]

    const root = new Directory('', [writeTextures(textures)])

    deepStrictEqual(
      [...readTextures(root)].map(({ name, type }) => [name, type]),
      [
        ['compressed', 'dxt1'],
        ['raw', 'rgba32_8888'],
      ],
    )
  })
})
