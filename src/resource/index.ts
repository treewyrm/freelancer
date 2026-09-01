/**
 * Win32 resource DLLs: the `ids_name` and `ids_info` numbers scattered through the INIs.
 *
 * A `ids_name` is a string in an `RT_STRING` table and an `ids_info` is RDL markup in an `RT_HTML`
 * resource, both living in the DLLs `freelancer.ini` lists — which are ordinary PE images carrying
 * no code at all, six of the seven of them with a null entry point. Reading them means walking a PE
 * resource directory, and writing them means emitting one, both of which this module does.
 *
 * Layered the same way the rest of the package is: `read`/`write` own the container and its bytes,
 * `strings`/`infocards` own what the two payload formats mean, and `library` owns the id space the
 * INIs actually reference.
 */
/**
 * **The PE image's own layout constants are deliberately not re-exported here.** `DOS_SIGNATURE`,
 * `SECTION_ALIGNMENT`, `RESOURCE_ENTRY_BYTE_LENGTH` and the twenty-three like them describe a
 * container the consumer never builds by hand: `write` mints the whole image, and no signature in
 * this module names one. They stay in `data.ts` for the reader and writer that do the work.
 *
 * What is exported below is what a caller can actually be handed or asked for — the resource type
 * of a `Resource`, the two LANGIDs and the code page that `ResourceOptions` defaults to, and the
 * two numbers the id space is arithmetic on.
 */
export {
  CODE_PAGE_WINDOWS_1252,
  LANGUAGE_ENGLISH_US,
  LANGUAGE_NEUTRAL,
  LIBRARY_ID_RANGE,
  STRING_BLOCK_LENGTH,
  Type,
} from './data.js'
export { readCard, readInfocards, writeCard, writeInfocards } from './infocards.js'
export {
  RETAIL_LIBRARIES,
  globalIdOf,
  languageOf,
  libraryOf,
  localOf,
  partition,
  readLibrary,
  writeLibrary,
  type Library,
} from './library.js'
export { inspect, isImage, read, type Image } from './read.js'
export { blockOf, indexOf, readBlock, readStrings, slotOf, writeStrings } from './strings.js'
export { type Resource, type ResourceId, type ResourceOptions } from './types.js'
export { write, writeSection, type WriteOptions } from './write.js'
