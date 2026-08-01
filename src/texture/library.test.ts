import { deepStrictEqual, ok, strictEqual, throws } from 'node:assert/strict'
import { describe, it } from 'node:test'
import Directory from '../directory.js'
import File from '../file.js'
import BufferView from '../utility/bufferview.js'
import { Compression, readDirectDrawSurface } from './dds.js'
import { readMIP, readMIPS, readTexture, readTextures } from './library.js'
import { readTargaImage, swapBGRtoRGB } from './targa.js'

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
}

/** Builds a DirectDrawSurface whose payload is filled with a per-level marker byte. */
const surface = ({
  width,
  height,
  levels,
  compression = Compression.NONE,
  bitCount = 32,
  mask = [0xff0000, 0xff00, 0xff, 0xff000000],
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

  const payload = sizes.reduce((sum, size) => sum + size, 0)
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

  // Fill each level with its own index, so a misread stride shows up as the wrong marker.
  for (let i = 0, offset = 128; i < sizes.length; i++) {
    buffer.fill(i + 1, offset, offset + sizes[i]!)
    offset += sizes[i]!
  }

  return { file: new File('MIPS', buffer), sizes }
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

    const { mipmaps } = readDirectDrawSurface(BufferView.from(file.data))

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
      const { mipmaps } = readDirectDrawSurface(BufferView.from(file.data))

      deepStrictEqual(
        mipmaps.map(({ byteLength }) => byteLength),
        [64, 16, 16, 16],
      )
    }
  })

  // A non-square chain hits 1 on one axis while the other is still descending.
  it('keeps rounding up once one axis reaches a single block', () => {
    const { file } = surface({ width: 16, height: 4, levels: 5, compression: Compression.DXT1 })
    const { mipmaps } = readDirectDrawSurface(BufferView.from(file.data))

    // 16x4 -> 4 blocks, 8x2 -> 2, 4x1 -> 1, 2x0 -> 1, 1x0 -> 1
    deepStrictEqual(
      mipmaps.map(({ byteLength }) => byteLength),
      [32, 16, 8, 8, 8],
    )
  })

  it('carries an uncompressed chain down to a single pixel', () => {
    const { file } = surface({ width: 4, height: 4, levels: 3, bitCount: 32 })
    const { mipmaps } = readDirectDrawSurface(BufferView.from(file.data))

    deepStrictEqual(
      mipmaps.map(({ byteLength }) => byteLength),
      [64, 16, 4],
    )
  })

  it('reads a single level when DDSD_MIPMAPCOUNT is absent', () => {
    const { file } = surface({ width: 4, height: 4, levels: 1, bitCount: 32 })

    strictEqual(readDirectDrawSurface(BufferView.from(file.data)).mipmaps.length, 1)
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
