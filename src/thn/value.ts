import type {
  Document,
  Entry,
  IdentifierValue,
  NumberValue,
  StringValue,
  TableValue,
  Value,
} from './types.js'

/**
 * A number.
 *
 * Given a string it is taken as the literal and stored verbatim, which is what the readers do and
 * what keeps `9e-006` from becoming `0.000009`. Given a number it is rendered with `String`, which
 * is the shortest form that reads back as the same double — fine for authoring, and the only option
 * for an inline `PUSHNUMBER` operand, which never reaches the constant pool and so has no literal of
 * its own.
 */
export const number = (value: number | string): NumberValue => ({
  type: 'number',
  literal: typeof value === 'string' ? value : String(value),
})

/** A quoted string. */
export const string = (value: string): StringValue => ({ type: 'string', value })

/**
 * An identifier, or several composed with `+`.
 *
 * `identifier('POSITION', 'ORIENTATION')` is `POSITION + ORIENTATION`. Composition is set union over
 * flags and nothing else — see {@link IdentifierValue}.
 */
export const identifier = (...names: string[]): IdentifierValue => ({ type: 'identifier', names })

/**
 * A table.
 *
 * The convenience form covers the shape retail actually uses — string keys, in order — and drops
 * `undefined` fields so an optional property can be written inline. Build the object literal by hand
 * for the rest: a numeric key, or a key that is not a Lua identifier.
 */
export const table = (
  fields: Record<string, Value | number | string | undefined> = {},
  array: Value[] = [],
): TableValue => ({
  type: 'table',
  array,
  entries: Object.entries(fields).flatMap<Entry>(([key, value]) =>
    value === undefined ? [] : [{ key: string(key), value: from(value) }],
  ),
})

/** A table with only an array part. */
export const list = (...values: (Value | number | string)[]): TableValue => ({
  type: 'table',
  array: values.map(from),
  entries: [],
})

/**
 * Infers a value from a JavaScript primitive.
 *
 * A string becomes a **string**, never an identifier — the ambiguity that costs is the one where a
 * flag silently becomes a quoted word, so the identifier arm is only ever reached by asking for it.
 */
export const from = (value: Value | number | string): Value =>
  typeof value === 'object' ? value : typeof value === 'number' ? number(value) : string(value)

/** Narrows to a number, whose literal {@link toNumber} reads as a quantity. */
export const isNumber = (value: Value): value is NumberValue => value.type === 'number'

/** Narrows to a quoted string — text the engine takes as text. */
export const isString = (value: Value): value is StringValue => value.type === 'string'

/**
 * Narrows to an identifier — an unquoted name the engine resolves as a global *read*. `SCENE` and
 * `Y` are identifiers; the same words quoted are strings, and the engine does not treat them alike.
 */
export const isIdentifier = (value: Value): value is IdentifierValue => value.type === 'identifier'

/** Narrows to a table, which may carry an array part, keyed entries, or both. */
export const isTable = (value: Value): value is TableValue => value.type === 'table'

/**
 * Reads a number's literal as a quantity.
 *
 * Takes a {@link NumberValue} rather than any value, because unlike INI this format has no engine
 * coercion table to imitate: THORN hands Lua values to C functions that want a number, and a table
 * where a number belongs is an authoring error, not a value to be coerced. Narrow with
 * {@link isNumber} first, and the wrong call fails to compile.
 *
 * **Not `utility/number`'s `atof`**, which narrows to `float32` because that is the precision every
 * consumer of an INI value has. A Lua 3.2 number is a `double`, and retail proves it: literals like
 * `-0.9999900000000001` carry more significant digits than a `float32` can hold, and rounding them
 * to one would quietly change the value on the way out.
 */
export const toNumber = (value: NumberValue): number => Number(value.literal)

/**
 * Finds a table's entry by name.
 *
 * **Case-sensitive**, and the only lookup in this package that is: these are Lua table keys read by
 * a Lua interpreter, not INI names read by a reader that folds them. `SpatialProps` does not find
 * `spatialprops`.
 */
export const getEntry = (value: TableValue, key: string): Value | undefined =>
  value.entries.find(({ key: k }) => isString(k) && k.value === key)?.value

/** Finds a top-level assignment by name. Case-sensitive, for the same reason. */
export const getGlobal = (document: Document, name: string): Value | undefined =>
  document.find((global) => global.name === name)?.value

/** Structural equality, tag included, recursing into tables. */
export const equals = (a: Value, b: Value): boolean => {
  if (a.type !== b.type) return false

  switch (a.type) {
    case 'number':
      return a.literal === (b as NumberValue).literal
    case 'string':
      return a.value === (b as StringValue).value
    case 'identifier': {
      const names = (b as IdentifierValue).names
      return a.names.length === names.length && a.names.every((name, i) => name === names[i])
    }
    case 'table': {
      const other = b as TableValue
      return (
        a.array.length === other.array.length &&
        a.entries.length === other.entries.length &&
        a.array.every((value, i) => equals(value, other.array[i]!)) &&
        a.entries.every(
          ({ key, value }, i) =>
            equals(key, other.entries[i]!.key) && equals(value, other.entries[i]!.value),
        )
      )
    }
  }
}
