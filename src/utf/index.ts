/**
 * **UTF** (Universal Tree Format), the binary container most of Freelancer's assets ship in: a
 * fixed header, a block of 44-byte tree entries linked by sibling and child offsets, a block of
 * deduplicated NUL-terminated names, and a block of payloads.
 *
 * `Directory` and `File` are the interim layer, and they are public on purpose — an editor builds
 * a tree by hand out of them and writes out bytes the game reads. Their methods are structural:
 * they know how a tree is shaped, never what any payload means. The modules above this one
 * (`rigid`, `texture`, `material`, …) are what supply the meaning.
 */
export { default as Directory } from './directory.js'
export { default as File } from './file.js'
export type { Entry, Header } from './types.js'
