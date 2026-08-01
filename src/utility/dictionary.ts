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

  get byteOffset(): number {
    return this.words.byteOffset
  }

  get byteLength(): number {
    return this.words.byteLength
  }

  get buffer(): ArrayBuffer {
    return this.words.buffer
  }

  push(value: string): number {
    let offset = this.offsets.get(value)
    if (offset !== undefined) return offset

    offset = this.words.byteLength

    this.words.push(this.encoder.encode(value + '\0'))
    this.offsets.set(value, offset)

    return offset
  }
}
