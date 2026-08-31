/**
 * Case-folds ASCII only, which is what `stricmp` does and therefore what every name lookup in the
 * game does. `toLowerCase` would additionally fold characters windows-1252 can carry, silently
 * making two distinct names equal.
 */
export const fold = (value: string): string => value.replace(/[A-Z]/g, (c) => c.toLowerCase())

/** Compares two names the way the game compares them. */
export const equals = (a: string, b: string): boolean =>
  a.length === b.length && fold(a) === fold(b)

/**
 * Whitespace INI trims around names and values.
 *
 * `initialworld.ini` pads numbers with **U+00A0**, not spaces, so an ASCII-only trim leaves a
 * non-breaking space stuck to the value and every number in retail's one text data file fails to
 * parse. Retail is also the only place this shows up, which is what makes it a corpus finding
 * rather than something a hand-written fixture would ever have caught.
 */
const WHITESPACE = '[\\s\\u00a0]'

const TRIM = new RegExp(`^${WHITESPACE}+|${WHITESPACE}+$`, 'g')

/** Strips leading and trailing {@link WHITESPACE}, U+00A0 included. */
export const trim = (value: string): string => value.replace(TRIM, '')

/** Whether text is a `0x`-prefixed hexadecimal literal of at most eight digits, i.e. a `uint32`. */
export const isHex = (value: string): boolean => /^0x[A-Fa-f0-9]{1,8}$/.test(value)

/** Parses a `0x`-prefixed hexadecimal literal, `NaN` when it is not one. */
export const parseHex = (value: string): number =>
  isHex(value) ? parseInt(value.substring(2), 16) : NaN

/**
 * Formats a number as zero-padded uppercase hexadecimal, the way ids and CRCs are written in the
 * game's own files and in this library's diagnostics. The value is taken unsigned.
 * @param byteLength Width to pad to, in bytes — two hexadecimal digits each.
 * @param prefix Literal prefix, `0x` by default; pass an empty string to omit it.
 */
export const toHex = (value: number, byteLength = 4, prefix = '0x'): string =>
  prefix +
  (value >>> 0)
    .toString(16)
    .toUpperCase()
    .padStart(byteLength * 2, '0')
