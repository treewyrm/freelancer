/**
 * Compiled Lua 3.2 chunks: the form all 1,506 retail scripts are in.
 *
 * **There is no writer here, and that is deferred rather than settled.** Nothing is blocked on it —
 * the engine loads a plain-text script just as happily, observed in the running game from a packed
 * install — so `../text/` is the whole write path today. What a bytecode writer still waits on is
 * two undecoded fields: the four bytes between `ENDCODE` and the constant count, and bytes 19–20 of
 * the header. Both are recorded in [THN.md](../../../docs/THN.md), and `data.ts` already carries the
 * name → byte direction of the opcode table so a writer does not start from nothing.
 */
export * from './data.js'
export * from './read.js'
