/**
 * The interim document model, and the thing both encodings parse into.
 *
 * It is plain data — no classes, no cursors, no parent links. A script read from bytecode, parsed
 * from text or written by hand is the same value, and the writer accepts any of them. It is also
 * `JSON.stringify`-able as it stands, which is the whole point of the exercise.
 *
 * The model is a Lua value domain, not a THORN one: **a THN is a literal**. Disassembling all 1,506
 * retail scripts yields fifteen opcodes, every one of which pushes a value or builds a table — no
 * call, no branch, no local, and not one nested function prototype. There is no control flow to
 * model and no engine API to model, so what is left is four kinds of value and a list of
 * assignments. See [THN.md](../../docs/THN.md).
 */

/** Which of the four things a value is. */
export type ValueType = Value['type']

/**
 * A number, kept as **the literal text it was written as** rather than as a parsed number.
 *
 * The constant pool stores numbers as decimal ASCII, not as IEEE doubles: `1.333333`, `9e-006` and
 * `-0.9999900000000001` appear in retail verbatim. Parsing and reformatting `-0.9999900000000001`
 * yields `-0.99999`, which is the same quantity and a different file, so round-tripping is a
 * formatting problem rather than a precision one and the literal is what survives it.
 *
 * Use {@link module:value.toNumber} to get at the quantity.
 */
export interface NumberValue {
  readonly type: 'number'

  /** As authored, or as rendered from an inline operand. Never re-derived from a parse. */
  readonly literal: string
}

/** A quoted string: a file path, an entity name, a subtitle. */
export interface StringValue {
  readonly type: 'string'
  readonly value: string
}

/**
 * A bare identifier — an engine-defined global read, and the one value that has no JSON equivalent.
 *
 * `type = SCENE` compiles to `GETGLOBAL`, not `PUSHCONSTANT`, so it is a *read* of a global THORN
 * registered and not the string `"SCENE"`. Writing `type = "SCENE"` into a script hands the engine a
 * string where it expects a number, which is why this is its own arm rather than a string with a
 * convention attached. 155,259 identifier reads across retail resolve to 55 distinct names.
 *
 * **`Y` and `N` are the booleans.** Lua 3.2 predates Lua's boolean type, so THORN registers two
 * one-character globals for truth, and they are identifiers like any other. There is deliberately no
 * boolean arm in {@link Value}: folding `Y` into `true` would emit a global THORN does not define,
 * and the missing arm makes that a compile error rather than a bug found in game.
 */
export interface IdentifierValue {
  readonly type: 'identifier'

  /**
   * One name, or several composed with `+`.
   *
   * `+` is the only operator that occurs and it is only ever set union over flags —
   * `POSITION + ORIENTATION + ENTITY_RELATIVE`. All 9,557 retail `ADD`s take identifiers on both
   * sides; not once is a literal added to anything, so this never has to mean arithmetic.
   */
  readonly names: string[]
}

/** One `key = value` pair of a table's hash part, in insertion order. */
export interface Entry {
  /**
   * Usually a string, occasionally a number: some retail arrays are stored as a hash keyed `1..n`
   * rather than as an array part, which is the same table in Lua.
   */
  readonly key: Value

  readonly value: Value
}

/**
 * A Lua table, which is both of JSON's containers at once.
 *
 * The two parts are kept apart because the encodings fill them with different instructions —
 * `SETLIST` for the array part, `SETMAP` for the hash part — and a table can carry both.
 */
export interface TableValue {
  readonly type: 'table'

  /** The array part, in fill order. */
  readonly array: Value[]

  /** The hash part, in insertion order. Order is preserved because the writer reproduces it. */
  readonly entries: Entry[]
}

/** One value of one assignment or one table slot. */
export type Value = NumberValue | StringValue | IdentifierValue | TableValue

/** One top-level `name = value` assignment. */
export interface Global {
  readonly name: string
  readonly value: Value
}

/**
 * A whole script: an ordered sequence of assignments.
 *
 * Ordered, because the text writer reproduces the order, and a list rather than a
 * `{ duration, entities, events }` record even though **every one of the 1,506 retail scripts
 * assigns exactly those three names and nothing else** (`SETGLOBAL` fires 4,518 times, which is
 * 3 × 1,506). Modelling the invariant as a type would make a modded script with a fourth global
 * unreadable for no gain; it is asserted in the corpus suite instead, which is where the equivalent
 * INI facts are pinned.
 */
export type Document = Global[]
