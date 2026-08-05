/**
 * The save encoding: text INI under a positional XOR mask.
 *
 * Retail carries two `.fl` files and only one of them is masked — `EXE/newplayer.fl` opens with
 * `FLS1`, `EXE/mpnewcharacter.fl` opens with `[Player]` and is plain text. So the signature is the
 * only handle here too, exactly as it is between BINI and text, and the extension says nothing.
 *
 * Read and write share one file because they share one function. The pad depends on nothing but
 * the position of the byte, so {@link mask} is its own inverse and there is no second routine to
 * put next to it: writing is masking what the text writer produced, reading is masking what is on
 * disk. Separating them would put a self-inverse function in a third module away from both callers.
 *
 * What is under the mask is ordinary text INI, so nothing here parses. `newplayer.fl` unmasks to
 * three sections — `[Player]`, `[StoryInfo]`, `[mPlayer]` — and 227 properties, and the text reader
 * takes it verbatim, U+00A0 column padding and all, the same as it takes `initialworld.ini`.
 */

import type { Document } from '#/ini/types.js'
import * as text from '#/ini/text/index.js'
import BufferView from '#/utility/bufferview.js'
import { decode, encode } from '#/utility/encoding.js'

/** `FLS1`, read as a little-endian `uint32`. */
export const SIGNATURE = 0x31534c46

/** The signature, and the whole of the header — there is no version field and no length. */
export const HEADER_BYTE_LENGTH = 4

/**
 * `Gene`, the four bytes the pad is built from.
 *
 * The word does not appear in any retail executable, so where it came from is unknown; it is a
 * constant rather than a parameter because nothing in the file selects it.
 */
const GENE = [0x47, 0x65, 0x6e, 0x65]

const bytesOf = (data: ArrayBufferView | ArrayBufferLike): Uint8Array =>
  ArrayBuffer.isView(data)
    ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    : new Uint8Array(data)

/** Whether a buffer starts with the `FLS1` signature. Check this, never the file extension. */
export const isSave = (data: ArrayBufferView | ArrayBufferLike): boolean => {
  const view = BufferView.from(data as ArrayBufferLike)
  return view.byteLength >= HEADER_BYTE_LENGTH && view.getUint32(0, true) === SIGNATURE
}

/**
 * Applies the mask to a body, and is its own inverse.
 *
 * The pad for byte `i` is `(GENE[i % 4] + i) % 256 | 0x80` and depends on nothing else — not on the
 * file length, not on a header field, not on the bytes around it. That makes it obfuscation rather
 * than encryption: the sequence repeats every 256 bytes, and one known section header recovers all
 * of it. The `| 0x80` is what keeps the result out of the printable range, which is the point of
 * the exercise — a save that does not look editable in a text editor.
 *
 * Position is counted from the start of the body, not of the file. The two agree anyway, because
 * the header is four bytes and the pad's period is a multiple of four.
 *
 * @param body Bytes after the header, masked or unmasked.
 * @param into Buffer to write into. Pass `body` itself to mask in place.
 */
export const mask = (body: Uint8Array, into = new Uint8Array(body.length)): Uint8Array => {
  for (let i = 0; i < body.length; i++) into[i] = body[i]! ^ (((GENE[i % 4]! + i) % 256) | 0x80)
  return into
}

/**
 * Reads a masked save into sections.
 *
 * @param data File bytes, including the signature.
 * @throws TypeError when the signature is absent — a plain-text `.fl` is `text.read`'s job, and
 * top-level {@link module:ini.read} routes it there.
 */
export const read = (data: ArrayBufferView | ArrayBufferLike): Document => {
  const bytes = bytesOf(data)

  if (!isSave(bytes)) throw new TypeError('Invalid FLS1 signature')

  return text.read(decode(mask(bytes.subarray(HEADER_BYTE_LENGTH))))
}

/**
 * Writes a document as a masked save.
 *
 * Text output is windows-1252, the same as the unmasked writer's, because the mask sits on top of
 * bytes rather than characters.
 *
 * @param document Sections to write.
 * @param options Passed through to the text writer.
 */
export const write = (document: Document, options?: text.WriteOptions): Uint8Array => {
  const body = encode(text.write(document, options))
  const bytes = new Uint8Array(HEADER_BYTE_LENGTH + body.length)

  new DataView(bytes.buffer).setUint32(0, SIGNATURE, true)
  mask(body, bytes.subarray(HEADER_BYTE_LENGTH))

  return bytes
}
