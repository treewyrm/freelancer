import BufferView from '#/utility/bufferview.js'
import Directory from '#/utf/directory.js'
import File from '#/utf/file.js'
import { readTargaImage, writeTargaImage } from './targa.js'
import {
  type CubeFaces,
  type CubeTexture,
  type Texture,
  type TextureEntry,
  type TextureFormat,
  type TextureLibrary,
} from './types.js'
import { Compression, CUBEMAP_FACES, readDirectDrawSurface, writeDirectDrawSurface } from './dds.js'
import { readAnimatedTexture, writeAnimatedTexture, type AnimatedTexture } from './animation.js'

/**
 * Reads texture as sequence of uncompressed Targa images.
 * @param parent Texture directory
 * @returns
 */
export function readMIP(parent: Directory): Texture | undefined {
  let width: number | undefined
  let height: number | undefined
  let depth: number | undefined
  let flip: boolean | undefined
  let format: TextureFormat = 'none'

  const levels: Uint8Array[] = []

  // TODO: Check targa image dimensions.
  // TODO: Check targa mipmap dimensions being half the previous.

  for (let level = 0; ; level++) {
    const mipmap = parent.getFile(`MIP${level}`)
    if (!mipmap) break

    const image = readTargaImage(BufferView.from(mipmap.data))

    width ??= image.width
    height ??= image.height
    depth ??= image.depth
    flip ??= image.flip

    if (depth !== image.depth) throw new RangeError(`Invalid bit depth on level ${level}`)
    if (flip !== image.flip) throw new RangeError(`Invalid vertical origin on level ${level}`)

    levels[level] = image.bitmap
  }

  if (!width || !height || !depth) return

  // Set type according to bit depth.
  // Note: depth === 16 should not occur as readTarga is expected to expand 16-bit images to 24.
  if (depth === 16) format = 'rgba16_5551'
  else if (depth === 24) format = 'rgb24_888'
  else if (depth === 32) format = 'rgba32_8888'
  else throw new RangeError(`Invalid targa mipmap bit depth: ${depth}`)

  return {
    name: parent.name,
    type: 'image',
    storage: 'targa',
    width,
    height,
    format,
    levels,
    flip: flip ?? false,
  }
}

/**
 * Writes texture as a sequence of uncompressed Targa images, one file per level.
 *
 * Level dimensions are derived by halving, since {@link readMIP} keeps only the base size: every
 * retail chain follows that, and a level whose buffer disagrees is rejected by
 * {@link writeTargaImage} rather than written at the wrong stride.
 * @param texture Texture to write
 * @returns
 */
export function writeMIP(texture: Texture): File[] {
  const { format, width, height, flip, levels } = texture

  let depth: number

  switch (format) {
    case 'rgb24_888':
      depth = 24
      break
    case 'rgba32_8888':
      depth = 32
      break
    default:
      throw new RangeError(`Cannot store ${format} texture ${texture.name} as a targa chain`)
  }

  return levels.map(
    (bitmap, level) =>
      new File(
        `MIP${level}`,
        writeTargaImage({
          width: Math.max(1, width >> level),
          height: Math.max(1, height >> level),
          depth,
          flip,
          bitmap,
        }),
      ),
  )
}

const getFormatByMask = (r: number, g: number, b: number, a: number): TextureFormat => {
  switch (true) {
    case r === 0xf800 && g === 0x7e0 && b === 0x1f && a === 0:
      return 'rgb16_565'
    case r === 0xf00 && g === 0xf0 && b === 0xf && a === 0xf000:
      return 'rgba16_4444'
    case r === 0x7c00 && g === 0x3e0 && b === 0x1f && a === 0x8000:
      return 'rgba16_5551'
    case r === 0xff0000 && g === 0xff00 && b === 0xff && a === 0:
      return 'rgb24_888'
    case r === 0xff0000 && g === 0xff00 && b === 0xff && a === 0xff000000:
      return 'rgba32_8888'
    default:
      throw new RangeError('Unsupported DirectDrawSurface color mask')
  }
}

/** Texture format a surface's compression and pixel format decode to. */
const getSurfaceTextureFormat = (
  compression: Compression,
  mask: { r: number; g: number; b: number; a: number },
): TextureFormat => {
  switch (compression) {
    case Compression.DXT1:
      return 'dxt1'
    case Compression.DXT3:
      return 'dxt3'
    case Compression.DXT5:
      return 'dxt5'
    case Compression.None:
      return getFormatByMask(mask.r, mask.g, mask.b, mask.a)
    default:
      throw new RangeError(`Unsupported compression method in texture`)
  }
}

/**
 * Reads a cubemap, stored as one DirectDrawSurface holding all six faces. Retail has exactly two —
 * `FX/envmapbasic.mat` and `FX/envmapglass.txm` — both 64x64 A8R8G8B8 with a single level per
 * face and `DDSCAPS2_CUBEMAP_ALL_FACES`.
 * @param parent Texture directory
 * @returns
 */
export function readCUBE(parent: Directory): CubeTexture | undefined {
  const file = parent.getFile('CUBE')
  if (!file) return

  const { width, height, mask, compression, surfaces } = readDirectDrawSurface(
    BufferView.from(file.data),
  )

  // A `CUBE` file whose surface declares no faces is not a cubemap, whatever it is filed as.
  if (surfaces.length !== CUBEMAP_FACES)
    throw new RangeError(`Cubemap ${parent.name} holds ${surfaces.length} faces`)

  // DirectDrawSurface is always stored top row first.
  return {
    name: parent.name,
    type: 'cube',
    width,
    height,
    format: getSurfaceTextureFormat(compression, mask),
    faces: surfaces as CubeFaces,
    flip: true,
  }
}

/**
 * Reads texture as mipmaps (uncompressed or DXTn) stored in DirectDrawSurface.
 * @param parent
 * @returns
 */
export function readMIPS(parent: Directory): Texture | undefined {
  const file = parent.getFile('MIPS')
  if (!file) return

  const { width, height, mask, compression, surfaces } = readDirectDrawSurface(
    BufferView.from(file.data),
  )

  // Nothing in retail stores a cubemap under `MIPS`, and the extra faces would be dropped
  // silently if one did.
  if (surfaces.length !== 1)
    throw new RangeError(`Texture ${parent.name} holds ${surfaces.length} surfaces under MIPS`)

  // DirectDrawSurface is always stored top row first.
  return {
    name: parent.name,
    type: 'image',
    storage: 'dds',
    width,
    height,
    format: getSurfaceTextureFormat(compression, mask),
    levels: surfaces[0]!,
    flip: true,
  }
}

/** Pixel format {@link getFormatByMask} would decode back into the given texture format. */
const getMaskByFormat = (format: TextureFormat) => {
  switch (format) {
    case 'rgb16_565':
      return { bitCount: 16, mask: { r: 0xf800, g: 0x7e0, b: 0x1f, a: 0 } }
    case 'rgba16_4444':
      return { bitCount: 16, mask: { r: 0xf00, g: 0xf0, b: 0xf, a: 0xf000 } }
    case 'rgba16_5551':
      return { bitCount: 16, mask: { r: 0x7c00, g: 0x3e0, b: 0x1f, a: 0x8000 } }
    case 'rgb24_888':
      return { bitCount: 24, mask: { r: 0xff0000, g: 0xff00, b: 0xff, a: 0 } }
    case 'rgba32_8888':
      return { bitCount: 32, mask: { r: 0xff0000, g: 0xff00, b: 0xff, a: 0xff000000 } }
    default:
      throw new RangeError(`No DirectDrawSurface pixel format for ${format}`)
  }
}

/** Compression and pixel format a texture format is stored back as. */
const getSurfaceFormat = (format: TextureFormat) => {
  switch (format) {
    case 'dxt1':
      return { compression: Compression.DXT1, bitCount: 0, mask: { r: 0, g: 0, b: 0, a: 0 } }
    case 'dxt3':
      return { compression: Compression.DXT3, bitCount: 0, mask: { r: 0, g: 0, b: 0, a: 0 } }
    case 'dxt5':
      return { compression: Compression.DXT5, bitCount: 0, mask: { r: 0, g: 0, b: 0, a: 0 } }
    default:
      return { compression: Compression.None, ...getMaskByFormat(format) }
  }
}

/**
 * DDS stores the top row first, unconditionally, so a bottom-up bitmap would be written upside
 * down. The rows are not reordered here, matching the readers, which report the vertical origin
 * rather than transforming it.
 */
const assertTopDown = ({ name, flip }: Texture | CubeTexture) => {
  if (!flip)
    throw new RangeError(
      `Texture ${name} is stored bottom row first and cannot be written as a DirectDrawSurface`,
    )
}

/**
 * Writes texture as mipmaps (uncompressed or DXTn) stored in a DirectDrawSurface.
 * @param texture Texture to write
 * @returns
 */
export function writeMIPS(texture: Texture): File {
  const { format, width, height, levels } = texture

  assertTopDown(texture)

  return new File(
    'MIPS',
    writeDirectDrawSurface({ width, height, ...getSurfaceFormat(format), surfaces: [levels] }),
  )
}

/**
 * Writes a cubemap as one DirectDrawSurface holding all six faces.
 * @param texture Cubemap to write
 * @returns
 */
export function writeCUBE(texture: CubeTexture): File {
  const { format, width, height, faces } = texture

  assertTopDown(texture)

  return new File(
    'CUBE',
    writeDirectDrawSurface({ width, height, ...getSurfaceFormat(format), surfaces: faces }),
  )
}

/**
 * Reads one texture library entry. Returns undefined for entries in a form the game itself
 * cannot load: the eight paletted textures under the `openFLAME 3D N-mesh` trees left over from
 * Conquest: Frontier Wars are deliberately unsupported, not merely unimplemented.
 */
export function readTexture(parent: Directory): TextureEntry | undefined {
  let texture: TextureEntry | undefined

  // Try to read animated texture.
  texture = readAnimatedTexture(parent)
  if (texture) return texture

  // Try to read cubemap (stored as DirectDrawSurface cubemap).
  texture = readCUBE(parent)
  if (texture) return texture

  // Try to read texture as DirectDrawSurface.
  texture = readMIPS(parent)
  if (texture) return texture

  // Try to read texture as sequence of uncompressed Targa images.
  texture = readMIP(parent)
  return texture
}

/** Writes one texture library entry, in whichever form its `type` and `storage` name. */
export function writeTexture(texture: TextureEntry): Directory {
  if (texture.type === 'animated') return writeAnimatedTexture(texture)
  if (texture.type === 'cube') return new Directory(texture.name, [writeCUBE(texture)])

  // Captured before the switch narrows the union away, so the unreachable branch still reports
  // which entry carried the bad storage.
  const { name } = texture

  switch (texture.storage) {
    case 'dds':
      return new Directory(texture.name, [writeMIPS(texture)])
    case 'targa':
      return new Directory(texture.name, writeMIP(texture))
    default:
      throw new RangeError(`Unknown texture storage in ${name}`)
  }
}

/**
 * Reads textures from directory, empty when it holds no `Texture library`.
 *
 * Only the root level is searched. Every entry is attempted before anything throws, so the one
 * error names each entry that failed.
 * @param parent Parent directory (typically root)
 * @throws AggregateError when any entry fails to read.
 */
export function readTextureLibrary(parent: Directory): TextureLibrary {
  const textures: TextureLibrary = []
  const library = parent.getDirectory('Texture library')
  if (!library) return textures

  const errors: unknown[] = []

  for (const child of library.directories) {
    try {
      const texture = readTexture(child)
      if (texture) textures.push(texture)
    } catch (error) {
      errors.push({ name: child.name, error })
    }
  }

  if (errors.length) throw new AggregateError(errors, 'Error reading one or more textures')

  return textures
}

/**
 * Writes a `Texture library` directory, one entry per texture. Each entry writes itself in whichever
 * of the forms it carries, so nothing here decides how the pixels are laid out.
 */
export function writeTextureLibrary(textures: Iterable<TextureEntry>): Directory {
  return new Directory(
    'Texture library',
    [...textures].map((texture) => writeTexture(texture)),
  )
}
