import { concatViews } from './view.js'

export default class ChunkView implements ArrayBufferView {
  #chunks: ArrayBufferView[] = []

  get byteOffset() {
    return 0
  }

  get byteLength() {
    return this.#chunks.reduce((total, { byteLength }) => total + byteLength, 0)
  }

  get buffer() {
    return concatViews(...this.#chunks)
  }

  push(...views: ArrayBufferView[]): this {
    this.#chunks.push(...views)
    return this
  }
}
