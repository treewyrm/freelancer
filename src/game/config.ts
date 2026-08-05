import type { Document } from '#/ini/types.js'
import { filterProperties, findSection, getValue } from '#/ini/section.js'
import { toText } from '#/ini/value.js'
import { directoryOf, resolve } from './path.js'

/**
 * `EXE/freelancer.ini`, which is where every load order in the game starts.
 *
 * Three of its sections matter and the rest are display, networking and logging settings the data
 * never reaches. `[Freelancer]` says where `DATA` is, `[Resources]` names the DLLs every `ids_name`
 * resolves through, and `[Data]` is the load list — 99 properties over 34 distinct keys in retail,
 * where the **property name selects the reader and the value is the path**.
 *
 * Three shapes in `[Data]` that a naive walk gets wrong, all of them present in retail:
 *
 * - **`bases` carries no value.** The file's own comment says so: "bases has no filename but the key
 *   specifies the load order". It is a marker for where base loading falls relative to everything
 *   else, and reading it as a path reads the empty string.
 * - **`fonts_dir` is a directory**, `fonts\files\`, not a file.
 * - **Repeats are ordered and additive**, not last-wins: `voices` ×18, `fuses` ×16, `effects` ×12,
 *   `sounds` ×7, `equipment` ×7, `goods` ×5, `loadouts` ×4, `markets` ×3, `ships` ×2. `explosions`
 *   and `debris` name the same file under two keys.
 *
 * Order is load-bearing across keys as well as within one, which is why {@link readEntries} yields
 * in file order and never groups. The file says why in a comment of its own — "must load solar
 * archetypes before universe. Universe inspects solar OBJECT_TYPE values" — and a second comment
 * warns that the order is part of the network protocol, since archetype ids are positional.
 *
 * Nothing here reads a file. It turns one already-parsed document into the questions the manager
 * then asks the resolver.
 */

/** Where the game looks for `[Resources]` DLL 0, which the file never lists. */
export const IMPLICIT_LIBRARY = 'resources.dll'

/** One `[Data]` entry, in file order. */
export interface DataEntry {
  /** Property name, which is what selects the reader. Kept in its authored case. */
  key: string

  /**
   * Path relative to the data directory, as authored — backslashes and all.
   *
   * Absent for a key that carries no value. `bases` is the only one in retail, and it marks a
   * position in the load order rather than naming a file.
   */
  path?: string
}

/** What `[Freelancer]` says about the install. */
export interface Settings {
  /**
   * The data directory, resolved against the directory holding the config.
   *
   * Retail writes `..\data`, because `EXE` is the game's working directory.
   */
  data: string

  /** `initial_world`, relative to the data directory. Note `[Data] groups` names it a second time. */
  initialWorld?: string

  /** `local_server`, relative to the directory holding the config. */
  localServer?: string
}

/**
 * Reads `[Freelancer]`.
 * @param document The parsed config.
 * @param path Where the config was read from, so `data path` has something to resolve against.
 */
export const readSettings = (document: Document, path: string): Settings => {
  const section = findSection(document, 'Freelancer')

  if (!section) throw new RangeError(`Config '${path}' has no [Freelancer] section`)

  const from = directoryOf(path)
  const text = (name: string): string | undefined => {
    const value = getValue(section, name)
    return value === undefined ? undefined : toText(value)
  }

  const data = text('data path')

  if (data === undefined)
    throw new RangeError(`Config '${path}' has no [Freelancer] data path property`)

  const initialWorld = text('initial_world')
  const localServer = text('local_server')

  return {
    data: resolve(from, data),
    ...(initialWorld !== undefined && { initialWorld }),
    ...(localServer !== undefined && { localServer }),
  }
}

/**
 * The resource DLLs in load order, relative to the directory holding the config.
 *
 * **`resources.dll` is prepended**, because it is library 0 and the file does not list it — the
 * executable has that name compiled in. Getting this wrong shifts every `ids_name` in the game by
 * 0x10000, which resolves to the wrong text rather than to nothing.
 *
 * @param document The parsed config.
 * @param path Where the config was read from.
 */
export const readLibraries = (document: Document, path: string): string[] => {
  const from = directoryOf(path)
  const section = findSection(document, 'Resources')
  const names = section
    ? filterProperties(section, 'DLL').flatMap(({ values }) => values.map(toText))
    : []

  return [IMPLICIT_LIBRARY, ...names].map((name) => resolve(from, name))
}

/**
 * Every `[Data]` entry, in file order.
 *
 * Yields rather than grouping by key, because two keys can name the same file (`explosions` and
 * `debris`), one key names many (`voices` ×18), and the order across keys is what the engine
 * depends on. A caller that wants them grouped can group them; a caller handed a grouping cannot
 * get the order back.
 */
export function* readEntries(document: Document): Generator<DataEntry> {
  const section = findSection(document, 'Data')
  if (!section) return

  for (const { name, values } of section.properties) {
    const [value] = values

    // A property with no values is a position in the load order, not a path. `bases` is the one.
    yield value === undefined ? { key: name } : { key: name, path: toText(value) }
  }
}

/**
 * Whether `[Data]` marks a position rather than naming a file.
 *
 * Kept as a predicate rather than left to `entry.path === undefined` at every call site, because the
 * distinction is a fact about the format and not an accident of the type.
 */
export const isMarker = (entry: DataEntry): boolean => entry.path === undefined
