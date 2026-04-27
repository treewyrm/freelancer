import crc32 from './crc32.js'
import id32 from './id32.js'

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

const encoder = new TextEncoder()

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
 * @param value Hashable value
 * @param caseSensitive Match character case
 * @returns Unsigned 8-bit integer buffer
 */
export const toBytes = (value: Exclude<Hashable, number>): Uint8Array => {
  if (typeof value === 'string') return encoder.encode(value)
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

/** Finds resource matching key value. */
export const getResource: FindByHash = (...args) => find(getResourceId, ...args)

export const filterResources: FilterByHash = (...args) => filter(getResourceId, ...args)

/** Sets resource in array (replaces existing resource matching key). */
export const setResource: SetByHash = (items, predicate, value, caseSensitive): void => {
  const match = getResourceId(predicate(value), caseSensitive)
  const index = items.findIndex((item) => getResourceId(predicate(item), caseSensitive) === match)
  index >= 0 ? items.splice(index, 1, value) : items.push(value)
}

/** Finds object matching key value. */
export const getObject: FindByHash = (...args) => find(getObjectId, ...args)

export const filterObjects: FilterByHash = (...args) => filter(getObjectId, ...args)

/**
 * Sets object in array.
 * @param items
 * @param predicate
 * @param value
 * @param caseSensitive
 */
export const setObject: SetByHash = (items, predicate, value, caseSensitive): void => {
  const match = getObjectId(predicate(value), caseSensitive)
  const index = items.findIndex((item) => getResourceId(predicate(item), caseSensitive) === match)
  index >= 0 ? items.splice(index, 1, value) : items.push(value)
}
