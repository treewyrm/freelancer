/** Inclusive bounds of the `int32` a BINI integer value holds. */
export const INT32_MIN = -0x80000000
export const INT32_MAX = 0x7fffffff

/** Whether a number is a whole number the `int32` a BINI integer value holds can carry. */
export const isInt32 = (value: number): boolean =>
  Number.isInteger(value) && value >= INT32_MIN && value <= INT32_MAX

/**
 * C `atoi`: leading whitespace, an optional sign, then digits until the first character that is not
 * one. No prefix is special — `atoi("0x10")` is `0`, not 16. Anything unparseable is `0`, because
 * that is what the game gets, and a reader that threw here would reject data the game accepts.
 */
export const atoi = (value: string): number => {
  const match = /^[\s]*([+-]?\d+)/.exec(value)
  if (!match) return 0

  const result = Number(match[1])
  return result > INT32_MAX || result < INT32_MIN ? result | 0 : result
}

/**
 * C `atof`: leading whitespace, then as much of a decimal or exponential float as parses. `0` when
 * nothing does. Narrowed to float32, since that is the precision every consumer of this value has.
 */
export const atof = (value: string): number => {
  const match = /^[\s]*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/.exec(value)
  if (!match) return 0

  const result = Number(match[1])
  return Number.isFinite(result) ? Math.fround(result) : 0
}

/** Text that parses back as exactly the same `int32`. */
export const formatInt32 = (value: number): string => String(value | 0)

/**
 * Shortest decimal text that reads back as exactly the same `float32`, always carrying a `.` or an
 * exponent.
 *
 * Both halves matter. `String(0.1)` on a float32 widened to a double prints
 * `0.10000000149011612`, so the shortest form has to be searched for rather than taken. And a
 * float whose value happens to be integral must not print as `3` — **14,209 retail values are
 * exactly that**, and a bare `3` re-reads as an integer, changing the value's type tag and costing
 * byte-exactness on the way back to BINI. `3.0` is what the original source text said and what this
 * returns.
 *
 * @throws RangeError on NaN or an infinity, neither of which has a text form the game would read
 * back. No retail value is either.
 */
export const formatFloat32 = (value: number): string => {
  if (!Number.isFinite(value))
    throw new RangeError(`Float value ${value} has no text representation`)

  // -0 survives a round-trip through float32 and is not the same value as 0.
  if (Object.is(value, -0)) return '-0.0'

  let text = String(value)

  for (let digits = 1; digits <= 9; digits++) {
    const candidate = String(Number(value.toPrecision(digits)))

    if (Math.fround(Number(candidate)) === value) {
      text = candidate
      break
    }
  }

  return /[.e]/i.test(text) ? text : `${text}.0`
}

/** Decimal integer syntax, the form the compiler turned into an `int32` value. */
const INTEGER = /^[+-]?\d+$/

/** Decimal or exponential float syntax. */
const FLOAT = /^[+-]?(?:\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?$/

/**
 * Classifies a text token the way the BINI compiler did.
 *
 * `100` became an integer and `100.0` a float, which is why the same field is authored both ways
 * across retail. Anything else stayed a string — including `true` and `false`, which are **12,699
 * retail string values** and must not be promoted to booleans here: doing so would rewrite their
 * type tag, and the game reads them as flags by string comparison anyway.
 *
 * Hexadecimal is deliberately not recognised. The engine's `is_number` accepts `0x` and character
 * literals, but the *compiler*'s behaviour on them is unmeasured — no retail string value parses as
 * a number at all — and guessing wrong turns `0x10` into 16 where the game's `atoi` sees 0.
 *
 * A whole number too large for `int32` stays a string rather than becoming a float, because the
 * alternative loses data. `initialworld.ini` is written `locked_gate = 2926089285`, and those are
 * `uint32` nicknames hashes: as a float32 that value comes back 2,926,089,248, a different object.
 * Leaving it a string keeps the digits exact, and the game reads a text value through `atoi`
 * regardless of what this thinks it is.
 */
export const classify = (token: string): 'integer' | 'float' | 'string' => {
  if (INTEGER.test(token)) return isInt32(Number(token)) ? 'integer' : 'string'

  return FLOAT.test(token) && Number.isFinite(Number(token)) ? 'float' : 'string'
}
