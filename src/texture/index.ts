export {
  type CubeFaces,
  type CubeTexture,
  type Texture,
  type TextureEntry,
  type TextureType,
  type TextureStorage,
} from './types.js'
export {
  type AnimatedTexture,
  type AnimatedTextureFrame,
  getTextureCount,
  readAnimatedTexture,
  writeAnimatedTexture,
} from './animation.js'
export {
  type DirectDrawSurface,
  Compression,
  CUBEMAP_FACES,
  readDirectDrawSurface,
  writeDirectDrawSurface,
} from './dds.js'
export {
  type TargaBitmap,
  type TargaPixels,
  ImageType,
  readTargaImage,
  writeTargaImage,
} from './targa.js'
export {
  readCUBE,
  readMIP,
  readMIPS,
  readTexture,
  readTextures,
  writeCUBE,
  writeMIP,
  writeMIPS,
  writeTexture,
  writeTextures,
} from './library.js'

/**
 * Pixel helpers, exported for consumers rather than used here. A renderer without S3TC — mobile
 * GL, typically — has to expand a `dxt1`/`dxt3`/`dxt5` texture itself, and one without a
 * packed 16-bit format has to widen `rgb16_565` and friends. Both are the caller's job, but the
 * data comes out of this library, so the conversions live beside it.
 */
export { decompress, decompressAlphaDXT3, decompressAlphaDXT5, decompressRGB } from './dxt.js'
export { expand565to888, expandRGB, expandRGBtoRGBA, swapRB16, swapRB24, swapRB32 } from './misc.js'
