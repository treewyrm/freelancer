/**
 * Scene scripts as Lua source.
 *
 * Both directions, and the write path in full: the engine compiles source text when the bytecode
 * signature is absent, so what this emits runs in game. See [THN.md](../../../docs/THN.md).
 */
export { read } from './read.js'
export { write, type WriteOptions } from './write.js'
