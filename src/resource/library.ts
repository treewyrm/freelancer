import type { Resource, ResourceOptions } from './types.js'
import { CODE_PAGE_WINDOWS_1252, LANGUAGE_ENGLISH_US, LIBRARY_ID_RANGE, Type } from './data.js'
import { readInfocards, writeInfocards } from './infocards.js'
import { blockOf, readBlock, readStrings, writeStrings } from './strings.js'

/**
 * The id space `ids_name` and `ids_info` are numbered in.
 *
 * Every DLL contributes 0x10000 ids, so a global id is `index * 0x10000 + local`: the library is
 * `id >> 16` and the resource is `id & 0xffff`. Nothing in the file records its own index — it is
 * purely positional, which is why adding a DLL anywhere but the end renumbers everything after it.
 *
 * The order is `resources.dll` first, hardcoded into the executable, then the `[Resources] DLL =`
 * entries of `freelancer.ini` in the order they appear. Reading that list is the consumer's job —
 * parse the INI, prepend `resources.dll` — and this module takes the result. The two are kept apart
 * so a resource DLL can be read without an INI parser, and so a mod that reorders the list is not
 * fighting a constant compiled in here.
 */

/** Retail's order, as `freelancer.ini` gives it. A default and a reference, not a rule. */
export const RETAIL_LIBRARIES = [
  'resources.dll',
  'InfoCards.dll',
  'MiscText.dll',
  'NameResources.dll',
  'EquipResources.dll',
  'OfferBribeResources.dll',
  'MiscTextInfo2.dll',
] as const

/** Global id for a resource in the library at `index`. */
export const globalIdOf = (index: number, local: number): number => index * LIBRARY_ID_RANGE + local

/** Library index a global id falls in. */
export const libraryOf = (id: number): number => Math.floor(id / LIBRARY_ID_RANGE)

/** Local resource id within its library. */
export const localOf = (id: number): number => id % LIBRARY_ID_RANGE

/** Everything a set of libraries resolves, in the global id space. */
export interface Library {
  /** `ids_name` → text, from the `RT_STRING` tables. */
  names: Map<number, string>

  /** `ids_info` → RDL markup, from the `RT_HTML` resources. */
  infocards: Map<number, string>
}

/**
 * Merges libraries into one id space.
 *
 * The two maps are kept apart rather than merged, because the id spaces overlap: `ids_name` 196,608
 * and `ids_info` 196,608 are different resources in the same DLL, and only the field that referred
 * to one says which was meant.
 *
 * @param libraries Resource lists in load order, `resources.dll` first.
 * @param language LANGID to take, or every language when omitted.
 */
export const readLibrary = (libraries: readonly Resource[][], language?: number): Library => {
  const names = new Map<number, string>()
  const infocards = new Map<number, string>()

  libraries.forEach((resources, index) => {
    for (const [local, value] of readStrings(resources, language))
      names.set(globalIdOf(index, local), value)

    for (const [local, value] of readInfocards(resources, language))
      infocards.set(globalIdOf(index, local), value)
  })

  return { names, infocards }
}

/**
 * Whether {@link readStrings} and {@link readInfocards} consume this resource at `language`.
 *
 * All three conditions matter and the third is the one a restatement gets wrong: both readers skip
 * an entry whose id is a **name** rather than a number, because there is no local index to key it
 * by. Such an entry is never read, so anything that treats "string or html" as "already accounted
 * for" drops it on the next write.
 */
const consumes = (resource: Resource, language: number): boolean =>
  (resource.type === Type.String || resource.type === Type.Html) &&
  typeof resource.id === 'number' &&
  resource.language === language

/** Key identifying one data entry, for carrying its code page across a rewrite. */
const entryKey = ({ type, id, language }: Resource): string =>
  `${String(type)}/${String(id)}/${language}`

/**
 * The one language every content resource in a library shares, or `undefined` when they disagree.
 *
 * Only `RT_STRING` and `RT_HTML` are considered — the version block sits at `LANGUAGE_NEUTRAL` in
 * all seven retail libraries and in all nine of Discovery's, and counting it would make every
 * library look mixed. `undefined` for a library with no content at all: there is nothing to derive
 * from, and a caller minting a new one picks its own.
 *
 * This exists because {@link readLibrary} with no filter merges **per slot**, not per block — a
 * bilingual library would come back as a union taking the highest LANGID that filled each slot, and
 * writing that back stamps the mixture onto one language. A caller that cannot name a single
 * language should treat the library as read-only rather than guess.
 */
export const languageOf = (resources: readonly Resource[]): number | undefined => {
  let found: number | undefined

  for (const { type, language } of resources) {
    if (type !== Type.String && type !== Type.Html) continue
    if (found === undefined) found = language
    else if (found !== language) return undefined
  }

  return found
}

/**
 * Rebuilds a library's resource list around new strings and infocards.
 *
 * Everything the two readers did not consume is carried through verbatim — the version block, a
 * named type, a named entry id, and every resource at another language — so a library rewritten
 * with the text it was read with produces the resources it was read from, byte for byte. That is
 * the same guarantee `write` gives for the container, one layer up, and it is what makes an editor
 * that models only names and infocards safe to point at a file that holds more than those.
 *
 * The maps must be **complete for this library**. A string block is read positionally and
 * {@link writeStrings} writes all sixteen slots of any block it touches, so handing this only the
 * entries that changed blanks their block siblings.
 *
 * @param original The list as read, supplying both what to carry and the code pages to restore.
 * @param content Names and infocards by **local** id. Omitting one clears that type entirely.
 */
export const writeLibrary = (
  original: readonly Resource[],
  content: {
    names?: ReadonlyMap<number, string> | Iterable<readonly [number, string]>
    infocards?: ReadonlyMap<number, string> | Iterable<readonly [number, string]>
  },
  options: ResourceOptions = {},
): Resource[] => {
  const { language = LANGUAGE_ENGLISH_US, codePage = CODE_PAGE_WINDOWS_1252 } = options

  // Materialised because both are read twice — once to find which blocks the new text occupies,
  // once by the writer — and the parameter accepts a single-use iterable.
  const names = [...(content.names ?? [])]
  const infocards = [...(content.infocards ?? [])]

  const occupied = new Set(names.map(([index]) => blockOf(index)))

  /**
   * Whether a consumed block is one the maps cannot reproduce, and so must be carried.
   *
   * A string block whose sixteen slots are all holes decodes to nothing, so it leaves no trace in
   * the map and the writer never emits it — `offerbriberesources.dll` ships 141 of them, 61% of its
   * blocks. Invariant 3 puts them here: what the library does not model survives untouched.
   *
   * A block the caller emptied is a different thing and is *not* carried — it is absent from the
   * new map because the caller deleted its names, and resurrecting the original would undo that.
   * The two are told apart by reading the original: all holes when it was read, or emptied since.
   */
  const vacant = (resource: Resource): boolean =>
    resource.type === Type.String &&
    typeof resource.id === 'number' &&
    !occupied.has(resource.id) &&
    readBlock(resource.data, resource.id).size === 0

  // The code page is per data entry and nothing in the game appears to read it, so it is carried
  // rather than normalised: a value that is preserved costs nothing, and one that is invented
  // cannot be taken back. Both writers stamp a single page across their whole output, which is why
  // this is a restore pass over them rather than an argument to them.
  const pages = new Map(original.map((resource) => [entryKey(resource), resource.codePage]))

  const restore = (resource: Resource): Resource => {
    const page = pages.get(entryKey(resource))
    return page === undefined || page === resource.codePage
      ? resource
      : { ...resource, codePage: page }
  }

  return [
    ...original.filter((resource) => !consumes(resource, language) || vacant(resource)),
    ...writeStrings(names, { language, codePage }).map(restore),
    ...writeInfocards(infocards, { language, codePage }).map(restore),
  ]
}

/**
 * Splits a global map back into per-library maps of local ids, ready for the writers.
 *
 * Sparse by index: a library that nothing addresses comes back as an empty map rather than being
 * skipped, so the array positions still line up with the load order.
 *
 * @param entries Values by global id.
 * @param count Libraries to produce. Defaults to one past the highest index used.
 */
export const partition = <T>(
  entries: ReadonlyMap<number, T> | Iterable<readonly [number, T]>,
  count?: number,
): Map<number, T>[] => {
  const all = [...entries]
  const total = count ?? all.reduce((highest, [id]) => Math.max(highest, libraryOf(id) + 1), 0)
  const libraries = Array.from({ length: total }, () => new Map<number, T>())

  for (const [id, value] of all) {
    const library = libraries[libraryOf(id)]

    if (!library)
      throw new RangeError(
        `Id ${id} falls in library ${libraryOf(id)}, past the ${total} requested`,
      )

    library.set(localOf(id), value)
  }

  return libraries
}
