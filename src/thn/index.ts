import * as bytecode from './bytecode/index.js'
import * as text from './text/index.js'
import type { Document } from './types.js'
import { decode, encode } from '#/utility/encoding.js'

export * from './types.js'
export * as value from './value.js'

/** Which encoding a script is in. */
export type Format = 'bytecode' | 'text'

/**
 * Reads a scene script in whichever encoding it is in.
 *
 * The signature decides, never the extension: all 1,506 retail `.thn` files are compiled, but the
 * engine loads scripts with `dofile` and Lua's loader falls back to compiling source text, so a
 * plain-text one is equally a `.thn`. This does what the loader does.
 *
 * @param data File bytes, or source that has already been decoded.
 */
export const read = (data: ArrayBufferView | ArrayBufferLike | string): Document => {
  if (typeof data === 'string') return text.read(data)

  if (bytecode.isBytecode(data)) return bytecode.read(data)

  return text.read(decode(ArrayBuffer.isView(data) ? data : new Uint8Array(data)))
}

/**
 * Detects the encoding of a buffer without parsing it.
 * @param data File bytes.
 */
export const formatOf = (data: ArrayBufferView | ArrayBufferLike): Format =>
  bytecode.isBytecode(data) ? 'bytecode' : 'text'

/**
 * Writes a script as bytes.
 *
 * **`format` accepts only `'text'`, and that is the type doing its job rather than an oversight.**
 * There is no bytecode writer yet — it is deferred, not ruled out, and waits on the two undecoded
 * header fields recorded in [THN.md](../docs/THN.md). Naming the gap in the signature means asking
 * for bytecode fails to compile instead of throwing at run time, and widening this to the full
 * {@link Format} later is purely additive.
 *
 * Output is windows-1252, which is what the game reads. Use `text.write` when a string is what you
 * want.
 *
 * @param document Assignments to write.
 * @param format Encoding to write in.
 */
export const write = (
  document: Document,
  _format: Extract<Format, 'text'> = 'text',
  options?: text.WriteOptions,
): Uint8Array => encode(text.write(document, options))

export { bytecode, text }
