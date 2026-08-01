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
 * Note the absence of a transparency flag. Whether a texture is drawn blended is decided by the
 * material that binds it — the `Oc`/`Ot` tokens in its `Type` string — never by the texture, so
 * a flag here would be both the wrong layer and fully implied by {@link TextureType}.
 */
export interface Texture {
  name: string

  /** Texture type specifying layout of data buffers.  */
  type: TextureType

  /** Texture base width. */
  width: number

  /** Texture base height. */
  height: number

  /** First row of each level is the top of the image, rather than the bottom. */
  flip: boolean

  /** Texture mipmap buffers. */
  levels: Uint8Array[]
}
