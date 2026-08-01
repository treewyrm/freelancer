import type { AnimatedTexture } from './animation.js'

/**
 * There is no `dxt1a`: the 3-colour punch-through mode is selected per block, by the endpoint
 * ordering inside the block itself, not per image. Nothing in the container distinguishes the
 * two — no retail DXT1 texture even sets `DDPF_ALPHAPIXELS` — and only ten of them contain a
 * punch-through block at all. `COMPRESSED_RGBA_S3TC_DXT1_EXT` decodes both modes correctly,
 * where the RGB variant would render those texels opaque black, so it is the only sane target.
 */
export type TextureType =
  | 'none'
  | 'rgb24_888' // Uncompressed 24bpp image (gl.RGB, gl.UNSIGNED_BYTE).
  | 'rgba32_8888' // Uncompressed 32bpp image with 8-bit transparency (gl.RGBA, gl.UNSIGNED_BYTE).
  | 'rgb16_565' // Uncompressed 16bpp image (gl.RGB, gl.UNSIGNED_SHORT_5_6_5).
  | 'rgba16_4444' // Uncompressed 16bpp image with 4-bit transparency (gl.RGBA, gl.UNSIGNED_SHORT_4_4_4_4).
  | 'rgba16_5551' // Uncompressed 16bpp image with 1-bit transparency (gl.RGBA, gl.UNSIGNED_SHORT_5_5_5_1).
  | 'dxt1' // DXT1 compressed image (s3tc.COMPRESSED_RGBA_S3TC_DXT1_EXT).
  | 'dxt3' // DXT3 compressed image (s3tc.COMPRESSED_RGBA_S3TC_DXT3_EXT).
  | 'dxt5' // DXT5 compressed image (s3tc.COMPRESSED_RGBA_S3TC_DXT5_EXT).

/**
 * Which on-disk form holds a texture's image data: one `MIPS` DirectDrawSurface, a `MIP0..n`
 * chain of uncompressed Targas, or a `CUBE` DirectDrawSurface holding six faces.
 *
 * Not derivable from {@link TextureType}, which is why it is carried rather than inferred on
 * write. Block compression implies `dds`, but retail authored `rgb24_888` both ways — 1,787
 * Targa chains against two surfaces.
 */
export type TextureStorage = 'dds' | 'targa' | 'cube'

/** What every texture entry carries, whatever form its image data takes. */
interface TextureBase {
  name: string

  /** Texture type specifying layout of data buffers.  */
  type: TextureType

  /** Which on-disk form the image data came from, and is written back as. */
  storage: TextureStorage

  /** Texture base width. */
  width: number

  /** Texture base height. */
  height: number

  /** First row of each level is the top of the image, rather than the bottom. */
  flip: boolean
}

/**
 * A flat texture: one mip chain, stored either as a DirectDrawSurface or a chain of Targas.
 *
 * Note the absence of a transparency flag. Whether a texture is drawn blended is decided by the
 * material that binds it — the `Oc`/`Ot` tokens in its `Type` string — never by the texture, so
 * a flag here would be both the wrong layer and fully implied by {@link TextureType}.
 */
export interface Texture extends TextureBase {
  storage: 'dds' | 'targa'

  /** Texture mipmap buffers. */
  levels: Uint8Array[]
}

/**
 * The six faces of a cubemap, in the order DirectDraw stores and flags them: +X, -X, +Y, -Y,
 * +Z, -Z. Each face holds its own mip chain, and all six share the dimensions and pixel format
 * of the surface that contains them.
 */
export type CubeFaces = [
  positiveX: Uint8Array[],
  negativeX: Uint8Array[],
  positiveY: Uint8Array[],
  negativeY: Uint8Array[],
  positiveZ: Uint8Array[],
  negativeZ: Uint8Array[],
]

/**
 * A cubemap, stored as a single DirectDrawSurface holding all six faces in a `CUBE` file.
 *
 * Separate from {@link Texture} rather than a flag on it: a cubemap has six mip chains where a
 * flat texture has one, and there is no honest way to put those in a `levels` field without one
 * face standing in for the whole and the other five hiding behind it. Consumers narrow on
 * {@link TextureStorage}, which is what makes uploading a cubemap as a 2D texture a type error
 * rather than a silently wrong render.
 *
 * Retail has exactly two — `FX/envmapbasic.mat` and `FX/envmapglass.txm` — both 64x64
 * `rgba32_8888` with a single level per face.
 */
export interface CubeTexture extends TextureBase {
  storage: 'cube'

  /** Mipmap buffers of each face. */
  faces: CubeFaces
}

/**
 * Any entry a `Texture library` holds. Narrow it on `type === 'animated'` first, since an
 * animation carries frames instead of pixels, then on {@link TextureStorage}.
 */
export type TextureEntry = Texture | CubeTexture | AnimatedTexture
