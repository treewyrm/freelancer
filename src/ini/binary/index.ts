/**
 * **The record layout is not re-exported.** `SIGNATURE`, `VERSION` and the four `*_BYTE_LENGTH`
 * sizes describe how this module walks a BINI, and a caller never lays out a record: `isBinary`
 * answers the only question the signature is good for, and the version is what the writer emits
 * rather than something to choose. They stay in `data.ts` for the reader and writer.
 *
 * The three `MAX_*` ceilings do get out, because a hand-built `Document` can exceed them and
 * `write` throws when it does — they let a caller check first, or explain the throw.
 */
export { MAX_NAME_OFFSET, MAX_PROPERTIES, MAX_VALUES, ValueTag } from './data.js'
export { default as Dictionary } from './dictionary.js'
export { isBinary, read } from './read.js'
export { write } from './write.js'
