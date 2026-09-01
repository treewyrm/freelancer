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
/**
 * **Only the opcode table gets out.** `SIGNATURE` and `VERSION` are what `isBytecode` is for,
 * `HEADER_BYTE_LENGTH` and `GAP_BYTE_LENGTH` are this reader's walk — the gap is not even decoded —
 * and `ConstantTag` types nothing a caller receives, since a `Document` is `Global[]` and a `Value`
 * carries no tag. `OPCODE_BYTES` is the writer's direction and there is no writer, so nothing reads
 * it at all. All of them stay in `data.js`.
 */
export { OPCODES, type Opcode } from './data.js'
export { isBytecode, read } from './read.js'
