import { concatViews } from './view.js'

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

  get byteOffset() {
    return 0
  }

  get byteLength() {
    return this.#byteLength
  }

  get buffer() {
    return concatViews(...this.#chunks)
  }

  push(...views: ArrayBufferView[]): this {
    for (const view of views) {
      this.#chunks.push(view)
      this.#byteLength += view.byteLength
    }

    return this
  }
}
