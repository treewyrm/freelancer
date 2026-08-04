import type { Value } from './types.js'
import { atof, atoi, formatFloat32, formatInt32, isInt32 } from '#/utility/number.js'
import { fold } from '#/utility/string.js'

/** A `boolean` value. Retail contains none — see {@link boolean} in the binary writer's notes. */
export const boolean = (value: boolean): Value => ({ type: 'boolean', value })

/**
 * An `int32` value.
 * @throws RangeError when the number is not an integer inside `int32`.
 */
export const integer = (value: number): Value => {
  if (!isInt32(value)) throw new RangeError(`Integer value ${value} is not an int32`)
  return { type: 'integer', value }
}

/** A `float32` value, narrowed to the precision the file will store it at. */
export const float = (value: number): Value => ({ type: 'float', value: Math.fround(value) })

/** A string value. */
export const string = (value: string): Value => ({ type: 'string', value })

/**
 * Infers a value from a JavaScript primitive.
 *
 * A number becomes an integer when it is one and fits `int32`, and a float otherwise — the same
 * rule the compiler applied to `100` and `100.5`. Use {@link float} directly when you mean `100.0`;
 * the distinction is invisible here but survives into the file.
 */
export const from = (value: boolean | number | string): Value => {
  switch (typeof value) {
    case 'boolean':
      return boolean(value)
    case 'number':
      return isInt32(value) ? integer(value) : float(value)
    case 'string':
      return string(value)
  }
}

/** Infers a list of values from primitives. */
export const list = (...values: (boolean | number | string)[]): Value[] => values.map(from)

export const isBoolean = (value: Value): boolean => value.type === 'boolean'
export const isInteger = (value: Value): boolean => value.type === 'integer'
export const isFloat = (value: Value): boolean => value.type === 'float'
export const isNumber = (value: Value): boolean => isInteger(value) || isFloat(value)
export const isString = (value: Value): boolean => value.type === 'string'

/**
 * Reads a value as a boolean, the way `INI_Reader::get_value_bool` does.
 *
 * A string is compared case-insensitively against `true` and `false` and otherwise falls through to
 * `atoi`, so `yes` is **false** — that is the engine's behaviour, not an oversight here. The string
 * form is also how flags are actually written: **12,699 retail values are the strings `true` or
 * `false`**, against zero values of boolean type.
 */
export const toBoolean = (value: Value): boolean => {
  switch (value.type) {
    case 'boolean':
      return value.value
    case 'integer':
    case 'float':
      return value.value !== 0
    case 'string': {
      const text = fold(value.value)
      if (text === 'true') return true
      if (text === 'false') return false
      return atoi(value.value) !== 0
    }
  }
}

/**
 * Reads a value as an `int32`, the way `INI_Reader::get_value_int` does.
 *
 * A float truncates toward zero rather than rounding, because the engine reaches it through
 * `__ftol`. A string goes through `atoi`, which yields `0` rather than failing.
 */
export const toInteger = (value: Value): number => {
  switch (value.type) {
    case 'boolean':
      return value.value ? 1 : 0
    case 'integer':
      return value.value
    case 'float':
      return Math.trunc(value.value)
    case 'string':
      return atoi(value.value)
  }
}

/**
 * Reads a value as a `float32`, the way `INI_Reader::get_value_float` does.
 *
 * A string goes through `atof`, which yields `0` rather than failing.
 */
export const toFloat = (value: Value): number => {
  switch (value.type) {
    case 'boolean':
      return value.value ? 1 : 0
    case 'integer':
    case 'float':
      return value.value
    case 'string':
      return atof(value.value)
  }
}

/**
 * Renders a value as the text an INI would carry.
 *
 * Not what the engine's own `get_value_string` produces — that uses `%d` and `%g`, and `%g` is six
 * significant digits and therefore lossy. Matching it would be the wrong target: this text is an
 * input to this library's own parser as much as to the game's, so a float renders as the shortest
 * decimal that reads back as the same `float32`, always carrying a `.` so it stays a float.
 *
 * A boolean renders as `true`/`false`, which the engine reads back as a boolean by string
 * comparison — but the text parser here will read it back as a *string*, since that is what the
 * compiler did with those 12,699 retail values. Boolean is the one type that does not survive a
 * round-trip through text, and the one type retail never uses.
 */
export const toText = (value: Value): string => {
  switch (value.type) {
    case 'boolean':
      return value.value ? 'true' : 'false'
    case 'integer':
      return formatInt32(value.value)
    case 'float':
      return formatFloat32(value.value)
    case 'string':
      return value.value
  }
}

/** Structural equality, tag included. Two values that read the same but were typed differently are not equal. */
export const equals = (a: Value, b: Value): boolean =>
  a.type === b.type && (Object.is(a.value, b.value) || a.value === b.value)
