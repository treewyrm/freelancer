export {
  type Material,
  type MaterialLibrary,
  type MaterialType,
  type KnownMaterialType,
  type TextureReference,
  DEFAULT_NOMAD_TEXTURE_NAME,
  MATERIAL_TYPES,
  MAPPED_MATERIAL_TYPES,
} from './types.js'
export {
  type TextureAxis,
  TextureAddress,
  ADDRESS_U_MASK,
  ADDRESS_U_SHIFT,
  ADDRESS_V_MASK,
  ADDRESS_V_SHIFT,
  MAP_INDEX_MASK,
  MAP_INDEX_SHIFT,
  getAddress,
  setAddress,
  getMapIndex,
  setMapIndex,
} from './flags.js'
export { readMaterial, writeMaterial } from './material.js'
export { getMaterial, readMaterialLibrary, writeMaterialLibrary } from './library.js'
