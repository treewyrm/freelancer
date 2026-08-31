import { concatViews } from './view.js'

/**
 * Append-only cursor over a growing list of views, flattened only when the buffer is asked for.
 * Satisfies `ArrayBufferView`, so it can stand in wherever one is expected.
 */
export default class ChunkView implements ArrayBufferView {
  #chunks: ArrayBufferView[] = []

  /**
   * Running total, rather than a reduce over the chunks on every read.
   *
   * `Dictionary` asks for it once per name it stores, so the reduce made building the names block
   * quadratic in the number of entries. It never dominated a profile — the write queue did — but
   * the trees it would bite on reach 270k entries.
   */
  #byteLength = 0

  /** Always zero — the flattened buffer starts where the first chunk does. */
  get byteOffset() {
    return 0
  }

  /** Total bytes across every chunk pushed so far. */
  get byteLength() {
    return this.#byteLength
  }

  /** Every chunk concatenated into one buffer. Builds a copy on each access. */
  get buffer() {
    return concatViews(...this.#chunks)
  }

  /** Appends views to the end. Nothing is copied until {@link buffer} is read. */
  push(...views: ArrayBufferView[]): this {
    for (const view of views) {
      this.#chunks.push(view)
      this.#byteLength += view.byteLength
    }

    return this
  }
}
