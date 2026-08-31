import ChunkView from './chunkview.js'

/**
 * Simple string dictionary.
 *
 * Entries are shared between names that match exactly, and only exactly. Path lookups fold case
 * and so does Freelancer, but the dictionary is the one place the spelling itself is stored:
 * folding here would hand `fix` the offset of an earlier `Fix` and rewrite the name. 52 retail
 * assets carry a pair of names differing only in case, most of them texture references.
 */
export default class Dictionary implements ArrayBufferView {
  protected words = new ChunkView()

  /** Offset of every string written so far, keyed by the string itself. */
  protected offsets = new Map<string, number>()

  constructor(
    /** Text encoder. */
    protected encoder: TextEncoder = new TextEncoder(),
  ) {}

  /** Always zero — the block starts at the first name written. */
  get byteOffset(): number {
    return this.words.byteOffset
  }

  /** Bytes the block occupies so far, terminators included. */
  get byteLength(): number {
    return this.words.byteLength
  }

  /** The names block as one buffer, ready to be written into a file. */
  get buffer(): ArrayBuffer {
    return this.words.buffer
  }

  /**
   * Stores a name and returns the offset an entry should point at. A name already stored comes back
   * at the offset it was given the first time, which is what deduplicates the block.
   */
  push(value: string): number {
    let offset = this.offsets.get(value)
    if (offset !== undefined) return offset

    offset = this.words.byteLength

    this.words.push(this.encoder.encode(value + '\0'))
    this.offsets.set(value, offset)

    return offset
  }
}
