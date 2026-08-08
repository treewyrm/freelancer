import type { Document } from '#/ini/document.js'
import type { Section } from '#/ini/section.js'
import type { Value } from '#/ini/types.js'
import BufferView from '#/utility/bufferview.js'
import {
  HEADER_BYTE_LENGTH,
  MAX_NAME_OFFSET,
  MAX_PROPERTIES,
  MAX_VALUES,
  PROPERTY_BYTE_LENGTH,
  SECTION_BYTE_LENGTH,
  SIGNATURE,
  VALUE_BYTE_LENGTH,
  ValueTag,
  VERSION,
} from './data.js'
import Dictionary from './dictionary.js'

/**
 * Writes sections as a BINI, reproducing the original compiler's byte layout.
 *
 * The dictionary is filled in two passes: every section and property name in first-use order, then
 * every string value in first-use order, both walking the document in order and sharing one dedup
 * table. That rule is not a convention picked for tidiness — re-emitting the retail corpus under it
 * reproduces **all 1,251 files byte for byte**, so the original order is derivable and nothing has
 * to be carried alongside the document to reproduce a file exactly.
 *
 * Doing the names first is also what keeps them addressable. A name offset is a `uint16` while a
 * string value offset is a `uint32`, so a dictionary past 64 KiB can hold values that are reachable
 * and names that are not. Retail never reaches it — the largest dictionary is 64,492 bytes, about a
 * kilobyte short — which makes it a hazard worth failing loudly on rather than one worth ignoring.
 *
 * @param document Sections to write.
 */
export const write = (document: Document): Uint8Array => {
  const sections = document.sections
  const dictionary = new Dictionary()

  /** Interns a name and refuses one the `uint16` field could not address. */
  const name = (value: string): number => {
    const offset = dictionary.push(value)

    if (offset > MAX_NAME_OFFSET)
      throw new RangeError(
        `Name "${value}" lands at dictionary offset ${offset}, past the uint16 limit of ${MAX_NAME_OFFSET}. ` +
          `The name block has outgrown 64 KiB and the game would misread this file.`,
      )

    return offset
  }

  // First pass: names only, so they occupy the low offsets.
  for (const section of sections) {
    if (section.properties.length > MAX_PROPERTIES)
      throw new RangeError(
        `Section "${section.name}" has ${section.properties.length} properties, past the limit of ${MAX_PROPERTIES}`,
      )

    name(section.name)

    for (const property of section.properties) {
      if (property.values.length > MAX_VALUES)
        throw new RangeError(
          `Property "${property.name}" has ${property.values.length} values, past the limit of ${MAX_VALUES}`,
        )

      name(property.name)
    }
  }

  const view = BufferView.allocate(HEADER_BYTE_LENGTH + byteLengthOf(sections))

  view.writeUint32(SIGNATURE)
  view.writeUint32(VERSION)
  view.writeUint32(view.byteLength) // The section block runs right up to the dictionary.

  // Second pass: records, interning string values as they are reached.
  for (const section of sections) {
    view.writeUint16(dictionary.push(section.name))
    view.writeUint16(section.properties.length)

    for (const property of section.properties) {
      view.writeUint16(dictionary.push(property.name))
      view.writeUint8(property.values.length)

      for (const value of property.values) writeValue(view, value, dictionary)
    }
  }

  const bytes = new Uint8Array(view.byteLength + dictionary.byteLength)

  bytes.set(view.bytes)
  bytes.set(dictionary.toBytes(), view.byteLength)

  return bytes
}

/** Size of the section block, which is also the dictionary's offset once the header is added. */
const byteLengthOf = (sections: Section[]): number =>
  sections.reduce(
    (total, { properties }) =>
      total +
      SECTION_BYTE_LENGTH +
      properties.reduce(
        (total, { values }) => total + PROPERTY_BYTE_LENGTH + values.length * VALUE_BYTE_LENGTH,
        0,
      ),
    0,
  )

/**
 * Writes one value in its five bytes.
 *
 * A boolean writes `01 00 00 00` or four zeroes. The game reads byte 0 and ignores the rest, but
 * leaving the other three as whatever was in memory is how a format ends up with a payload nobody
 * can characterise afterwards. **Nothing here should ever emit one**: retail contains zero values
 * of this type across 876,034, and the case that looks like it wants a boolean — a flag — is
 * written as a property with no values at all, 1,063 times.
 */
const writeValue = (view: BufferView, value: Value, dictionary: Dictionary): void => {
  switch (value.type) {
    case 'boolean':
      view.writeUint8(ValueTag.Boolean)
      view.writeUint32(value.value ? 1 : 0)
      break

    case 'integer':
      view.writeUint8(ValueTag.Integer)
      view.writeInt32(value.value)
      break

    case 'float':
      view.writeUint8(ValueTag.Float)
      view.writeFloat32(value.value)
      break

    case 'string':
      view.writeUint8(ValueTag.String)
      view.writeUint32(dictionary.push(value.value))
      break
  }
}
