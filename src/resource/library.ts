import type { Resource } from './types.js'
import { LIBRARY_ID_RANGE } from './data.js'
import { readInfocards } from './infocards.js'
import { readStrings } from './strings.js'

/**
 * The id space `ids_name` and `ids_info` are numbered in.
 *
 * Every DLL contributes 0x10000 ids, so a global id is `index * 0x10000 + local`: the library is
 * `id >> 16` and the resource is `id & 0xffff`. Nothing in the file records its own index — it is
 * purely positional, which is why adding a DLL anywhere but the end renumbers everything after it.
 *
 * The order is `resources.dll` first, hardcoded into the executable, then the `[Resources] DLL =`
 * entries of `freelancer.ini` in the order they appear. Reading that list is `./game`'s job —
 * `readLibraries` there, which prepends `resources.dll` — and this one takes the result. The two are
 * kept apart so a resource DLL can be read without an INI parser, and so a mod that reorders the
 * list is not fighting a constant compiled in here.
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
