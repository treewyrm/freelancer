export {
  HEADER_BYTE_LENGTH,
  MAX_NAME_OFFSET,
  MAX_PROPERTIES,
  MAX_VALUES,
  PROPERTY_BYTE_LENGTH,
  SECTION_BYTE_LENGTH,
  SIGNATURE,
  VALUE_BYTE_LENGTH,
  VERSION,
  ValueTag,
} from './data.js'
export { default as Dictionary } from './dictionary.js'
export { isBinary, read } from './read.js'
export { write } from './write.js'
