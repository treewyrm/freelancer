/**
 * Text encoding for both INI forms.
 *
 * The BINI dictionary is ASCII — measured, not assumed: not one byte above `0x7F` appears in any of
 * the 1,251 retail dictionaries. The text form is not, because `initialworld.ini` pads numbers with
 * **U+00A0**, which is `0xA0` in windows-1252 and a two-byte sequence in UTF-8. Decoding retail
 * text as UTF-8 therefore produces replacement characters, so windows-1252 is the default for both
 * directions and ASCII simply falls out of it as a subset.
 */

/**
 * Code points for bytes 0x80-0x9F, the only range where windows-1252 departs from latin-1.
 * `0` marks the five bytes the encoding leaves undefined; those fall back to the byte value, so a
 * decode never loses information and a re-encode returns the same byte.
 */
const HIGH = [
  0x20ac, 0, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152,
  0, 0x017d, 0, 0, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161,
  0x203a, 0x0153, 0, 0x017e, 0x0178,
]

const toChar = /* @__PURE__ */ (() => {
  const table = new Array<string>(256)

  for (let byte = 0; byte < 256; byte++) {
    const high = byte >= 0x80 && byte <= 0x9f ? HIGH[byte - 0x80]! : 0
    table[byte] = String.fromCharCode(high || byte)
  }

  return table
})()

const toByte = /* @__PURE__ */ (() => {
  const table = new Map<string, number>()
  for (let byte = 0; byte < 256; byte++) table.set(toChar[byte]!, byte)
  return table
})()

/** Decodes windows-1252 bytes. Never throws — every byte has a character. */
export const decode = (bytes: ArrayBufferView): string => {
  const view = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)

  // Chunked so a multi-megabyte file does not spread a million arguments.
  let result = ''
  const chunk = new Array<string>(0x1000)

  for (let start = 0; start < view.length; start += chunk.length) {
    const length = Math.min(chunk.length, view.length - start)
    for (let i = 0; i < length; i++) chunk[i] = toChar[view[start + i]!]!
    result += length === chunk.length ? chunk.join('') : chunk.slice(0, length).join('')
  }

  return result
}

/** Number of bytes {@link encode} produces for a string: windows-1252 is single-byte throughout. */
export const byteLengthOf = (value: string): number => value.length

/**
 * Encodes a string as windows-1252.
 * @throws RangeError on a character the encoding cannot represent, rather than substituting one —
 * a silently mangled nickname is a reference that stops resolving.
 */
export const encode = (value: string, into?: Uint8Array): Uint8Array => {
  const bytes = into ?? new Uint8Array(value.length)

  for (let i = 0; i < value.length; i++) {
    const byte = toByte.get(value[i]!)

    if (byte === undefined)
      throw new RangeError(
        `Character ${JSON.stringify(value[i])} at index ${i} is not representable in windows-1252`,
      )

    bytes[i] = byte
  }

  return bytes
}
