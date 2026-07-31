export type TextureType =
  | 'none'
  | 'rgb24_888' // Uncompressed 24bpp image (gl.RGB, gl.UNSIGNED_BYTE).
  | 'rgba32_8888' // Uncompressed 32bpp image with 8-bit transparency (gl.RGBA, gl.UNSIGNED_BYTE).
  | 'rgb16_565' // Uncompressed 16bpp image (gl.RGB, gl.UNSIGNED_SHORT_5_6_5).
  | 'rgba16_4444' // Uncompressed 16bpp image with 4-bit transparency (gl.RGBA, gl.UNSIGNED_SHORT_4_4_4_4).
  | 'rgba16_5551' // Uncompressed 16bpp image with 1-bit transparency (gl.RGBA, gl.UNSIGNED_SHORT_5_5_5_1).
  | 'dxt1' // DXT1 compressed image (s3tc.COMPRESSED_RGB_S3TC_DXT1_EXT).
  | 'dxt1a' // DXT1a compressed image (s3tc.COMPRESSED_RGBA_S3TC_DXT1_EXT).
  | 'dxt3' // DXT3 compressed image (s3tc.COMPRESSED_RGBA_S3TC_DXT3_EXT).
  | 'dxt5' // DXT5 compressed image (s3tc.COMPRESSED_RGBA_S3TC_DXT5_EXT).

export interface Texture {
  name: string

  /** Texture type specifying layout of data buffers.  */
  type: TextureType

  /** Texture base width. */
  width: number

  /** Texture base height. */
  height: number

  /** Texture uses transparency. */
  alpha: boolean

  /** Flip vertically. */
  flip: boolean

  /** Texture mipmap buffers. */
  levels: Uint8Array[]
}
