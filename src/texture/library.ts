import BufferView from '#/utility/bufferview.js'
import Directory from '#/directory.js'
import File from '#/file.js'
import { readTargaImage, writeTargaImage } from './targa.js'
import { type Texture, type TextureType } from './types.js'
import { Compression, readDirectDrawSurface, writeDirectDrawSurface } from './dds.js'
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
  let type: TextureType = 'none'

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
  if (depth === 16) type = 'rgba16_5551'
  else if (depth === 24) type = 'rgb24_888'
  else if (depth === 32) type = 'rgba32_8888'
  else throw new RangeError(`Invalid targa mipmap bit depth: ${depth}`)

  return { name: parent.name, storage: 'targa', width, height, type, levels, flip: flip ?? false }
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
  const { type, width, height, flip, levels } = texture

  let depth: number

  switch (type) {
    case 'rgb24_888':
      depth = 24
      break
    case 'rgba32_8888':
      depth = 32
      break
    default:
      throw new RangeError(`Cannot store ${type} texture ${texture.name} as a targa chain`)
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

const getTypeByMask = (r: number, g: number, b: number, a: number): TextureType => {
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

/**
 * Cubemaps, stored as a DirectDrawSurface holding all six faces. Retail has exactly two —
 * `FX/envmapbasic.mat` and `FX/envmapglass.txm` — both 64x64 A8R8G8B8 with a single level and
 * `DDSCAPS2_CUBEMAP_ALL_FACES`. Not implemented; {@link Texture} has nowhere to put six faces.
 */
export function readCUBE(parent: Directory): Texture | undefined {
  const file = parent.getFile('CUBE')
  if (!file) return

  return
}

/**
 * Reads texture as mipmaps (uncompressed or DXTn) stored in DirectDrawSurface.
 * @param parent
 * @returns
 */
export function readMIPS(parent: Directory): Texture | undefined {
  const file = parent.getFile('MIPS')
  if (!file) return

  const { width, height, mask, compression, mipmaps } = readDirectDrawSurface(
    BufferView.from(file.data),
  )

  let type: TextureType = 'none'

  switch (compression) {
    case Compression.DXT1:
      type = 'dxt1'
      break
    case Compression.DXT3:
      type = 'dxt3'
      break
    case Compression.DXT5:
      type = 'dxt5'
      break
    case Compression.NONE:
      type = getTypeByMask(mask.r, mask.g, mask.b, mask.a)
      break
    default:
      throw new RangeError(`Unsupported compression method in texture`)
  }

  // DirectDrawSurface is always stored top row first.
  return { name: parent.name, storage: 'dds', width, height, type, levels: mipmaps, flip: true }
}

/** Pixel format {@link getTypeByMask} would decode back into the given type. */
const getMaskByType = (type: TextureType) => {
  switch (type) {
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
      throw new RangeError(`No DirectDrawSurface pixel format for ${type}`)
  }
}

/**
 * Writes texture as mipmaps (uncompressed or DXTn) stored in a DirectDrawSurface.
 *
 * `flip` must be set: DDS stores the top row first, unconditionally, so a bottom-up bitmap would
 * be written upside down. The rows are not reordered here, matching the readers, which report the
 * vertical origin rather than transforming it.
 * @param texture Texture to write
 * @returns
 */
export function writeMIPS(texture: Texture): File {
  const { type, width, height, flip, levels } = texture

  if (!flip)
    throw new RangeError(
      `Texture ${texture.name} is stored bottom row first and cannot be written as a DirectDrawSurface`,
    )

  let compression: Compression
  let bitCount = 0
  let mask = { r: 0, g: 0, b: 0, a: 0 }

  switch (type) {
    case 'dxt1':
      compression = Compression.DXT1
      break
    case 'dxt3':
      compression = Compression.DXT3
      break
    case 'dxt5':
      compression = Compression.DXT5
      break
    default:
      compression = Compression.NONE
      ;({ bitCount, mask } = getMaskByType(type))
  }

  return new File(
    'MIPS',
    writeDirectDrawSurface({ width, height, bitCount, compression, mask, mipmaps: levels }),
  )
}

/**
 * Reads one texture library entry. Returns undefined for entries in a form the game itself
 * cannot load: the eight paletted textures under the `openFLAME 3D N-mesh` trees left over from
 * Conquest: Frontier Wars are deliberately unsupported, not merely unimplemented.
 */
export function readTexture(parent: Directory): Texture | AnimatedTexture | undefined {
  let texture: Texture | AnimatedTexture | undefined

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

/**
 * Writes one texture library entry, in whichever form {@link Texture.storage} names.
 *
 * Cubemaps have no counterpart here, since {@link readCUBE} cannot produce one to write.
 */
export function writeTexture(texture: Texture | AnimatedTexture): Directory {
  if (texture.type === 'animated') return writeAnimatedTexture(texture)

  switch (texture.storage) {
    case 'dds':
      return new Directory(texture.name, [writeMIPS(texture)])
    case 'targa':
      return new Directory(texture.name, writeMIP(texture))
    default:
      throw new RangeError(`Unknown texture storage in ${texture.name}`)
  }
}

/**
 * Reads textures from directory.
 * Looks for `Texture library` directory within.
 * @param parent Parent directory (typically root)
 * @returns
 */
export function* readTextures(parent: Directory): Generator<Texture | AnimatedTexture> {
  const library = parent.getDirectory('Texture library')
  if (!library) return

  const errors: unknown[] = []

  for (const child of library.directories) {
    try {
      const texture = readTexture(child)
      if (texture) yield texture
    } catch (error) {
      errors.push({ name: child.name, error })
    }
  }

  if (errors.length) throw new AggregateError(errors, 'Error reading one or more textures')
}

export function writeTextures(textures: Iterable<Texture | AnimatedTexture>): Directory {
  return new Directory(
    'Texture library',
    [...textures].map((texture) => writeTexture(texture)),
  )
}
