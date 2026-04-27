import ChunkView from './chunkview.js'
import { getResourceId } from '../hash.js'

/** Simple string dictionary. */
export default class Dictionary implements ArrayBufferView {
  protected words = new ChunkView()

  /** Hash map of string offsets. */
  protected offsets = new Map<number, number>()

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
    const crc = getResourceId(value)
    const offset = this.offsets.get(crc) ?? this.words.byteLength

    if (offset === this.words.byteLength) {
      this.words.push(this.encoder.encode(value + '\0'))
      this.offsets.set(crc, offset)
    }

    return offset
  }
}
