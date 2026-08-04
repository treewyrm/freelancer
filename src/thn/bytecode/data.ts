/**
 * Compiled Lua 3.2 chunk layout. **Big-endian throughout**, which is the single easiest thing to get
 * wrong here — every other binary format in this pair of packages is little-endian.
 *
 * The tables below are written for both directions even though only the reader exists: the opcode
 * list is the source of the index → name lookup a reader needs and the name → index lookup a writer
 * would need, and a writer would otherwise start by re-deriving all of it. See
 * [THN.md](../../../docs/THN.md) for what a writer is still missing.
 */

/** `ESC` `L` `u` `a`, then the version byte. Retail carries only `0x32`, and THORN embeds Lua 3.2. */
export const SIGNATURE = Uint8Array.of(0x1b, 0x4c, 0x75, 0x61, 0x32)

/** Lua 3.2. The version byte is the fifth of the signature. */
export const VERSION = 0x32

/**
 * Bytes 0–15 are identical in all 1,506 retail files, then a big-endian `uint32` code length at 15,
 * then two bytes that are not decoded — byte 19 varies with table nesting depth, byte 20 is always
 * zero. Code begins at 21 in every file.
 */
export const HEADER_BYTE_LENGTH = 21

/** Between `ENDCODE` and the constant count, in every file. Not decoded. */
export const GAP_BYTE_LENGTH = 4

/**
 * Lua 3.2's `lopcodes.h`, verbatim and in order — the order *is* the encoding, so nothing here may
 * be sorted or pruned.
 *
 * Each entry is `NAME:operands`, transcribed from the header's own trailing comments: `-` for no
 * operand, `b` for a `uint8`, `w` for a `uint16`, and a trailing `c` for the second `uint8` operand
 * that `SETLIST`, the calls and the closures carry. Read it against
 * `github.com/lua/lua/blob/v3.2/lopcodes.h` — `lua.org/source/3.2/lopcodes.h` is a 404, because
 * lua.org publishes only 5.x that way.
 *
 * Two things this table is not allowed to be inferred from. **The `W` suffix is not a reliable width
 * rule**: it holds everywhere except `SETTABLEPOP`, which ends in neither `W` nor `OP` and yet takes
 * no operand, so the obvious regex walks one byte too far on it. Nothing in retail emits it, which
 * is why that goes unnoticed until it does. And **the numbering is only confirmed by the corpus**:
 * the per-opcode counts over all 1,506 scripts reproduce THN.md's table exactly, which is what says
 * this is Lua 3.2's numbering rather than a plausible near-miss.
 */
const TABLE = `
  ENDCODE:-        RETCODE:b        CALL:bc          TAILCALL:bc      PUSHNIL:b
  POP:b            PUSHNUMBERW:w    PUSHNUMBER:b     PUSHNUMBERNEGW:w PUSHNUMBERNEG:b
  PUSHCONSTANTW:w  PUSHCONSTANT:b   PUSHUPVALUE:b    PUSHLOCAL:b      GETGLOBALW:w
  GETGLOBAL:b      GETTABLE:-       GETDOTTEDW:w     GETDOTTED:b      PUSHSELFW:w
  PUSHSELF:b       CREATEARRAYW:w   CREATEARRAY:b    SETLOCAL:b       SETGLOBALW:w
  SETGLOBAL:b      SETTABLEPOP:-    SETTABLE:b       SETLISTW:wc      SETLIST:bc
  SETMAP:b         NEQOP:-          EQOP:-           LTOP:-           LEOP:-
  GTOP:-           GEOP:-           ADDOP:-          SUBOP:-          MULTOP:-
  DIVOP:-          POWOP:-          CONCOP:-         MINUSOP:-        NOTOP:-
  ONTJMPW:w        ONTJMP:b         ONFJMPW:w        ONFJMP:b         JMPW:w
  JMP:b            IFFJMPW:w        IFFJMP:b         IFTUPJMPW:w      IFTUPJMP:b
  IFFUPJMPW:w      IFFUPJMP:b       CLOSUREW:wc      CLOSURE:bc       SETLINEW:w
  SETLINE:b        LONGARGW:w       LONGARG:b        CHECKSTACK:b
`

export interface Opcode {
  readonly name: string

  /** Width of the first operand in bytes. */
  readonly width: 0 | 1 | 2

  /** Whether a second `uint8` operand follows the first. */
  readonly count: boolean
}

/** Every opcode, indexed by its byte. */
export const OPCODES: readonly Opcode[] = TABLE.trim()
  .split(/\s+/)
  .map((entry) => {
    const [name = '', operands = ''] = entry.split(':')

    return {
      name,
      width: operands.startsWith('b') ? 1 : operands.startsWith('w') ? 2 : 0,
      count: operands.endsWith('c'),
    } as const
  })

/** Opcode name to its byte. The writer's direction; unused by the reader. */
export const OPCODE_BYTES: ReadonlyMap<string, number> = new Map(
  OPCODES.map(({ name }, index) => [name, index]),
)

/**
 * Constant pool entry tags. **Only two of them occur in 442,599 retail constants** — a third would
 * be a nested function prototype, and there is not one in any script.
 */
export const ConstantTag = {
  /** A `uint8` length, then that many bytes of decimal ASCII. No terminator. */
  Number: 0x01,

  /** A big-endian `uint32` length **including** the NUL, then the bytes. */
  String: 0x02,
} as const

export type ConstantTag = (typeof ConstantTag)[keyof typeof ConstantTag]
