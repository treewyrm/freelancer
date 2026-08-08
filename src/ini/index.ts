import * as binary from './binary/index.js'
import type { Document } from './document.js'
import * as save from './save/index.js'
import * as text from './text/index.js'
import { decode, encode } from '#/utility/encoding.js'

export * from './types.js'
export * from './property.js'
export * from './section.js'
export * from './document.js'
export * as value from './value.js'

/**
 * Which encoding a document came from, or should be written in.
 *
 * `save` is text under a positional XOR mask and nothing else — same grammar, same character set,
 * so a document read from one form writes to any of the three.
 */
export type Format = 'binary' | 'text' | 'save'

/**
 * Reads an INI in whichever encoding it is in.
 *
 * The signature decides, never the extension or the location — retail `DATA` holds 1,251 BINI files
 * and one text file all named `.ini`, `EXE/` holds three more text ones, and of the two `.fl` there
 * only one is masked. The game does exactly this: it checks for `BINI` and falls through to the
 * text parser when it is absent.
 *
 * @param data File bytes, or text that has already been decoded.
 */
export const read = (data: ArrayBufferView | ArrayBufferLike | string): Document => {
  if (typeof data === 'string') return text.read(data)

  if (binary.isBinary(data)) return binary.read(data)

  if (save.isSave(data)) return save.read(data)

  return text.read(decode(ArrayBuffer.isView(data) ? data : new Uint8Array(data)))
}

/**
 * Detects the encoding of a buffer without parsing it.
 * @param data File bytes.
 */
export const formatOf = (data: ArrayBufferView | ArrayBufferLike): Format =>
  binary.isBinary(data) ? 'binary' : save.isSave(data) ? 'save' : 'text'

/**
 * Writes a document as bytes.
 *
 * Text output is windows-1252, which is what the game reads and what retail's one text data file
 * is. Use `text.write` directly when a string is what you want.
 *
 * The mask is never applied unless it is asked for. Round-tripping a save means passing `'save'`
 * back, because a document does not remember what it was read from and the default stays `binary`.
 *
 * @param document Sections to write.
 * @param format Encoding to write in.
 */
export const write = (
  document: Document,
  format: Format = 'binary',
  options?: text.WriteOptions,
): Uint8Array =>
  format === 'binary'
    ? binary.write(document)
    : format === 'save'
      ? save.write(document, options)
      : encode(text.write(document, options))

export { binary, save, text }
