import type { Document, Property, Section, Value } from '../types.js'
import BufferView from '../utility/bufferview.js'
import { decode } from '../utility/encoding.js'
import { HEADER_BYTE_LENGTH, SIGNATURE, VALUE_BYTE_LENGTH, ValueTag, VERSION } from './data.js'

/** Whether a buffer starts with the `BINI` signature. Check this, never the file extension. */
export const isBinary = (data: ArrayBufferView | ArrayBufferLike): boolean => {
  const view = BufferView.from(data as ArrayBufferLike)
  return view.byteLength >= HEADER_BYTE_LENGTH && view.getUint32(0, true) === SIGNATURE
}

/**
 * Reads a BINI into sections.
 *
 * The section block has no count and no terminator — it simply runs until the dictionary begins,
 * so this loops on the cursor. Reaching the dictionary at anything other than exactly its first
 * byte means the records and the header disagree, and the file is rejected rather than truncated.
 *
 * @param data BINI bytes.
 */
export const read = (data: ArrayBufferView | ArrayBufferLike): Document => {
  const view = BufferView.from(data as ArrayBufferLike)

  if (view.byteLength < HEADER_BYTE_LENGTH)
    throw new RangeError(`Buffer of ${view.byteLength} bytes is too short to be a BINI`)

  if (view.readUint32() !== SIGNATURE) throw new TypeError('Invalid BINI signature')

  // The game does not read this field at all — it validates the signature and the dictionary offset
  // and nothing else. Retail has only ever carried 1, so a different value more likely means a
  // misidentified file than a dialect, and refusing it is this reader's rule rather than the game's.
  const version = view.readUint32()
  if (version !== VERSION) throw new RangeError(`Unsupported BINI version ${version}`)

  const namesOffset = view.readUint32()

  if (namesOffset < HEADER_BYTE_LENGTH || namesOffset > view.byteLength)
    throw new RangeError(
      `Dictionary offset ${namesOffset} is outside a ${view.byteLength} byte file`,
    )

  const bytes = view.bytes

  /** Reads a NUL-terminated string from the dictionary. */
  const string = (offset: number): string => {
    const start = namesOffset + offset

    if (start >= view.byteLength)
      throw new RangeError(`String offset ${offset} is outside the dictionary`)

    return decode(bytes.subarray(start, view.findTerminator(start)))
  }

  const document: Document = []

  while (view.offset < namesOffset) {
    const name = string(view.readUint16())
    const count = view.readUint16()
    const properties: Property[] = []

    for (let index = 0; index < count; index++) {
      if (view.offset + 3 > namesOffset)
        throw new RangeError(`Section "${name}" declares more properties than the file holds`)

      const property: Property = { name: string(view.readUint16()), values: [] }
      const values = view.readUint8()

      if (view.offset + values * VALUE_BYTE_LENGTH > namesOffset)
        throw new RangeError(`Property "${property.name}" declares more values than the file holds`)

      for (let index = 0; index < values; index++) property.values.push(readValue(view, string))

      properties.push(property)
    }

    document.push({ name, properties } satisfies Section)
  }

  if (view.offset !== namesOffset)
    throw new RangeError(
      `Section block ends at ${view.offset}, ${view.offset - namesOffset} bytes past the dictionary`,
    )

  return document
}

/**
 * Reads one value.
 *
 * The stride is five bytes whatever the tag is — the game computes a value's address as
 * `base + index * 5` before it has looked at the tag, and skips a whole property with `count * 5`
 * without looking at tags at all. A boolean therefore occupies four payload bytes of which only the
 * first is read, rather than being a short record.
 */
const readValue = (view: BufferView, string: (offset: number) => string): Value => {
  const tag = view.readUint8()

  switch (tag) {
    case ValueTag.Boolean: {
      // Byte 0, not the most significant bit: the game's arm for this tag is `movb 0x1(%edi), %bl`.
      const value = view.readUint8() !== 0
      view.offset += 3
      return { type: 'boolean', value }
    }

    case ValueTag.Integer:
      return { type: 'integer', value: view.readInt32() }

    case ValueTag.Float:
      return { type: 'float', value: view.readFloat32() }

    case ValueTag.String:
      return { type: 'string', value: string(view.readUint32()) }

    default:
      throw new TypeError(`Unknown BINI value type ${tag}`)
  }
}
