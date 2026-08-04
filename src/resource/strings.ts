import type { Resource, ResourceOptions } from './types.js'
import { CODE_PAGE_WINDOWS_1252, LANGUAGE_ENGLISH_US, STRING_BLOCK_LENGTH, Type } from './data.js'

/**
 * `RT_STRING` tables: what every `ids_name` resolves to.
 *
 * A string resource is not one string. The table is blocked sixteen to an entry — string `index`
 * lives in resource `(index >> 4) + 1` at slot `index & 15` — and a block is a bare sequence of
 * sixteen counted UTF-16LE runs with no terminators, no offsets and no slot numbers, so it is only
 * addressable by reading it from the start. Absent strings are present as zero-length runs, which
 * is why a table with one string in it still costs a full block.
 *
 * The count is in **UTF-16 code units**, not characters and not bytes, so a run holding an
 * astral-plane character counts it as two. Reading and writing both work on code units for that
 * reason, and a lone surrogate survives the round trip.
 */

/** Resource id of the block holding a string, and the slot within it. */
export const blockOf = (index: number): number => (index >> 4) + 1
export const slotOf = (index: number): number => index & (STRING_BLOCK_LENGTH - 1)

/** Lowest string index a block covers. */
export const indexOf = (block: number, slot: number): number =>
  (block - 1) * STRING_BLOCK_LENGTH + slot

/**
 * Decodes one block into up to sixteen strings, keyed by string index.
 *
 * Stops at the end of the payload rather than insisting on sixteen runs: retail always writes all
 * sixteen, but the format's own rule is that a block ends where its data does, and a linker that
 * truncated the trailing empties would still be producing a readable table.
 *
 * @param data Block payload.
 * @param block Resource id the payload came from.
 */
export const readBlock = (data: Uint8Array, block: number): Map<number, string> => {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const strings = new Map<number, string>()
  let offset = 0

  for (let slot = 0; slot < STRING_BLOCK_LENGTH && offset + 2 <= data.byteLength; slot++) {
    const length = view.getUint16(offset, true)
    offset += 2

    if (offset + length * 2 > data.byteLength)
      throw new RangeError(`String block ${block} slot ${slot} runs past the end of its payload`)

    if (length > 0) {
      let value = ''
      for (let i = 0; i < length; i++)
        value += String.fromCharCode(view.getUint16(offset + i * 2, true))
      strings.set(indexOf(block, slot), value)
    }

    offset += length * 2
  }

  return strings
}

/**
 * Collects every string in a resource list, keyed by its **local** index within this DLL.
 *
 * A zero-length slot is a hole, not an empty string, and is left out of the map — the two are
 * indistinguishable in the file, and a hole is what fifteen of the sixteen slots in a sparse table
 * are.
 *
 * @param resources Entries to read, typically all of a DLL's.
 * @param language LANGID to take, or every language when omitted. With more than one present and
 * no filter, the later entry wins.
 */
export const readStrings = (resources: Resource[], language?: number): Map<number, string> => {
  const strings = new Map<number, string>()

  for (const resource of resources) {
    if (resource.type !== Type.String) continue
    if (typeof resource.id !== 'number') continue
    if (language !== undefined && resource.language !== language) continue

    for (const [index, value] of readBlock(resource.data, resource.id)) strings.set(index, value)
  }

  return strings
}

/**
 * Encodes strings as `RT_STRING` resources, one per block of sixteen.
 *
 * Every slot in a touched block is written, holes included as zero-length runs, because a block is
 * read positionally and a missing run shifts every slot after it.
 *
 * @param strings Strings by local index.
 */
export const writeStrings = (
  strings: ReadonlyMap<number, string> | Iterable<readonly [number, string]>,
  options: ResourceOptions = {},
): Resource[] => {
  const { language = LANGUAGE_ENGLISH_US, codePage = CODE_PAGE_WINDOWS_1252 } = options
  const blocks = new Map<number, string[]>()

  for (const [index, value] of strings) {
    if (!Number.isInteger(index) || index < 0)
      throw new RangeError(`String index ${index} is not a non-negative integer`)

    const block = blockOf(index)
    let slots = blocks.get(block)
    if (!slots) blocks.set(block, (slots = new Array<string>(STRING_BLOCK_LENGTH).fill('')))

    slots[slotOf(index)] = value
  }

  return [...blocks]
    .sort(([a], [b]) => a - b)
    .map(([block, slots]) => {
      const data = new Uint8Array(slots.reduce((total, value) => total + 2 + value.length * 2, 0))

      const view = new DataView(data.buffer)
      let offset = 0

      for (const value of slots) {
        view.setUint16(offset, value.length, true)
        offset += 2

        for (let i = 0; i < value.length; i++)
          view.setUint16(offset + i * 2, value.charCodeAt(i), true)

        offset += value.length * 2
      }

      return { type: Type.String, id: block, language, codePage, data }
    })
}
