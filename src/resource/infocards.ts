import type { Resource, ResourceOptions } from './types.js'
import { CODE_PAGE_WINDOWS_1252, LANGUAGE_ENGLISH_US, Type } from './data.js'

/**
 * `RT_HTML` resources: what every `ids_info` resolves to.
 *
 * Unlike a string table these are not blocked — the resource id **is** the infocard's local number,
 * one card per entry — and the payload is UTF-16LE text rather than a counted run. Every one of the
 * 5,307 in retail opens with a byte order mark followed by
 * `<?xml version="1.0" encoding="UTF-16"?>`, none is empty, and none has an odd byte length.
 *
 * The mark is stripped on read and restored on write, because it belongs to the encoding rather
 * than the document. The declaration is **not** touched: it is part of the text, it is what the
 * game's RDL parser reads first, and a card written without one is the caller's decision to make.
 */

/** Byte order mark, U+FEFF, as the one code unit it occupies in UTF-16. */
const BYTE_ORDER_MARK = 0xfeff

/**
 * Decodes one payload as UTF-16LE, dropping a leading byte order mark.
 *
 * Decoded a code unit at a time rather than through `TextDecoder`, so that an unpaired surrogate —
 * which `TextDecoder` replaces with U+FFFD — survives and re-encodes to the bytes it came from.
 */
export const readCard = (data: Uint8Array): string => {
  if (data.byteLength % 2)
    throw new RangeError(`Infocard payload of ${data.byteLength} bytes is not whole UTF-16 units`)

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const units = data.byteLength / 2

  let text = ''
  let start = 0

  if (units > 0 && view.getUint16(0, true) === BYTE_ORDER_MARK) start = 1
  for (let i = start; i < units; i++) text += String.fromCharCode(view.getUint16(i * 2, true))

  return text
}

/** Encodes text as UTF-16LE with a leading byte order mark. */
export const writeCard = (text: string): Uint8Array => {
  const data = new Uint8Array((text.length + 1) * 2)
  const view = new DataView(data.buffer)

  view.setUint16(0, BYTE_ORDER_MARK, true)
  for (let i = 0; i < text.length; i++) view.setUint16((i + 1) * 2, text.charCodeAt(i), true)

  return data
}

/**
 * Collects every infocard in a resource list, keyed by its **local** id within this DLL.
 *
 * @param resources Entries to read, typically all of a DLL's.
 * @param language LANGID to take, or every language when omitted.
 */
export const readInfocards = (resources: Resource[], language?: number): Map<number, string> => {
  const cards = new Map<number, string>()

  for (const resource of resources) {
    if (resource.type !== Type.Html) continue
    if (typeof resource.id !== 'number') continue
    if (language !== undefined && resource.language !== language) continue

    cards.set(resource.id, readCard(resource.data))
  }

  return cards
}

/**
 * Encodes infocards as `RT_HTML` resources, one per id.
 *
 * @param cards Card text by local id.
 */
export const writeInfocards = (
  cards: ReadonlyMap<number, string> | Iterable<readonly [number, string]>,
  options: ResourceOptions = {},
): Resource[] => {
  const { language = LANGUAGE_ENGLISH_US, codePage = CODE_PAGE_WINDOWS_1252 } = options

  return [...cards]
    .sort(([a], [b]) => a - b)
    .map(([id, text]) => {
      if (!Number.isInteger(id) || id < 0)
        throw new RangeError(`Infocard id ${id} is not a non-negative integer`)

      return { type: Type.Html, id, language, codePage, data: writeCard(text) }
    })
}
