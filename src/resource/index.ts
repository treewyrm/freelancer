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
export * from './data.js'
export * from './infocards.js'
export * from './library.js'
export * from './read.js'
export * from './strings.js'
export * from './types.js'
export * from './write.js'
