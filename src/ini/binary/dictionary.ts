import { byteLengthOf, encode } from '../../utility/encoding.js'

/**
 * The names-and-values block at the end of a BINI, built the way the original compiler built it.
 *
 * **One table, not two.** Section names, property names and string values share it, so a string
 * value that happens to equal a property name reuses that name's offset rather than getting an
 * entry of its own. Splitting them into a names dictionary and a values dictionary produces a
 * working file — and a different one.
 *
 * Entries are shared on an exact match only. Folding case here would hand `Zone` the offset of an
 * earlier `zone` and rewrite the spelling, and retail spells six section names and 32 property
 * names more than one way.
 */
export default class Dictionary {
  readonly #entries: string[] = []
  readonly #offsets = new Map<string, number>()

  #byteLength = 0

  /** Total size of the block, including every NUL terminator. */
  get byteLength(): number {
    return this.#byteLength
  }

  /** Number of distinct strings. */
  get size(): number {
    return this.#entries.length
  }

  /**
   * Interns a string and returns its byte offset within the block.
   * @param value String to store.
   */
  push(value: string): number {
    let offset = this.#offsets.get(value)
    if (offset !== undefined) return offset

    offset = this.#byteLength

    this.#entries.push(value)
    this.#offsets.set(value, offset)
    this.#byteLength += byteLengthOf(value) + 1

    return offset
  }

  /** Serializes the block. */
  toBytes(): Uint8Array {
    const bytes = new Uint8Array(this.#byteLength)

    let offset = 0

    for (const entry of this.#entries) {
      encode(entry, bytes.subarray(offset, offset + entry.length))
      offset += entry.length + 1 // The NUL is already zero.
    }

    return bytes
  }
}
