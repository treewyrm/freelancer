/**
 * How Freelancer names things, and how a name resolves to a reference.
 *
 * Two hashes, and picking the wrong one yields a number rather than an error — the whole reason
 * they live side by side here rather than one per format module:
 *
 * - {@link getResourceId} is plain CRC32 over the table in `EXE/dacom.dll`, and hashes what UTF
 *   files reference — model parts, material and texture names, mesh library entries, Alchemy nodes.
 * - {@link getObjectId} is the byte-swapped variant, and hashes INI nicknames — archetypes, system
 *   objects, the voice files under `DATA/AUDIO`.
 *
 * Both fold case by default, because the game compares names with `stricmp`. Alchemy is the one
 * place that does not: see `alchemy/`, which passes `caseSensitive`.
 *
 * Nothing here reads or interprets a format. That is the boundary this module keeps.
 */
import crc32 from './crc32.js'
import id32 from './id32.js'
import { encode } from './utility/encoding.js'

export type Hashable = number | string | ArrayBufferView | ArrayBufferLike

export type Hasher<T> = (value: T) => Hashable

export type Hash = (value: Hashable, caseSensitive?: boolean) => number

type FindByHash = <T>(
  items: Array<T>,
  predicate: Hasher<T>,
  value: Hashable,
  caseSensitive?: boolean,
) => T | undefined

type FilterByHash = <T>(
  items: Array<T>,
  predicate: Hasher<T>,
  value: Hashable,
  caseSensitive?: boolean,
) => Array<T>

type SetByHash = <T>(items: T[], predicate: Hasher<T>, value: T, caseSensitive?: boolean) => void

/**
 * Converts ascii characters in buffer to lower case for case insensitive match.
 * @param bytes
 * @param caseSensitive
 * @returns
 */
const convertCase = (bytes: Readonly<Uint8Array>, caseSensitive = false): Uint8Array =>
  caseSensitive ? bytes : bytes.map((byte) => (byte >= 0x41 && byte <= 0x5a ? byte | 0x20 : byte))

/**
 * Converts hashables into bytes.
 *
 * A string is encoded as **windows-1252**, which is the byte sequence the game hashed. UTF-8 agrees
 * on ASCII, and every name in retail is ASCII, so this only matters for a name a mod invents — but
 * there the two disagree by whole bytes and the reference stops resolving.
 * @param value Hashable value
 * @returns Unsigned 8-bit integer buffer
 * @throws RangeError on a character windows-1252 cannot represent, which is a name the game could
 * not have stored.
 */
export const toBytes = (value: Exclude<Hashable, number>): Uint8Array => {
  if (typeof value === 'string') return encode(value)
  if (ArrayBuffer.isView(value))
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  throw new TypeError('Cannot convert value to byte array')
}

/**
 * Gets asset/resource id (model parts, material and texture references, alchemy nodes).
 * Generally any resource referenced in UTF files.
 * @param value Hashable value
 * @param caseSensitive Match character case
 * @returns Signed 32-bit integer
 */
export const getResourceId: Hash = (value, caseSensitive = false) =>
  typeof value === 'number' ? value | 0 : crc32(convertCase(toBytes(value), caseSensitive))

/**
 * Gets object id (archetypes, system objects, etc).
 * Generally most resources referenced in INI files.
 * @param value
 * @param caseSensitive
 * @returns
 */
export const getObjectId: Hash = (value, caseSensitive = false) =>
  typeof value === 'number' ? value | 0 : id32(convertCase(toBytes(value), caseSensitive))

/**
 * Finds entry by hash function.
 * @param hash
 * @param items
 * @param predicate
 * @param value
 * @param caseSensitive
 * @returns
 */
const find = <T>(
  hash: Hash,
  items: Array<T>,
  predicate: Hasher<T>,
  value: Hashable,
  caseSensitive?: boolean,
) => (
  (value = hash(value, caseSensitive)),
  items.find((item) => hash(predicate(item), caseSensitive) === value)
)

/**
 * Filters entries by hash function.
 * @param hash
 * @param items
 * @param predicate
 * @param value
 * @param caseSensitive
 * @returns
 */
const filter = <T>(
  hash: Hash,
  items: Array<T>,
  predicate: Hasher<T>,
  value: Hashable,
  caseSensitive?: boolean,
) => (
  (value = hash(value, caseSensitive)),
  items.filter((item) => hash(predicate(item), caseSensitive) === value)
)

/**
 * Replaces entry matching key by hash function, appending it when nothing matches.
 *
 * Shared by both key kinds: hashing the value with one function and scanning with the other
 * matches nothing and appends every time.
 * @param hash
 * @param items
 * @param predicate
 * @param value
 * @param caseSensitive
 */
const set = <T>(
  hash: Hash,
  items: T[],
  predicate: Hasher<T>,
  value: T,
  caseSensitive?: boolean,
): void => {
  const match = hash(predicate(value), caseSensitive)
  const index = items.findIndex((item) => hash(predicate(item), caseSensitive) === match)

  index >= 0 ? items.splice(index, 1, value) : items.push(value)
}

/** Finds resource matching key value. */
export const getResource: FindByHash = (...args) => find(getResourceId, ...args)

export const filterResources: FilterByHash = (...args) => filter(getResourceId, ...args)

/** Sets resource in array (replaces existing resource matching key). */
export const setResource: SetByHash = (...args) => set(getResourceId, ...args)

/** Finds object matching key value. */
export const getObject: FindByHash = (...args) => find(getObjectId, ...args)

export const filterObjects: FilterByHash = (...args) => filter(getObjectId, ...args)

/** Sets object in array (replaces existing object matching key). */
export const setObject: SetByHash = (...args) => set(getObjectId, ...args)
