import BufferView from '#/utility/bufferview.js'

/** File entry in UTF structure. */
export default class File implements ArrayBufferView {
  constructor(
    /** File name. */
    public name: string,

    /** File data. */
    public data: ArrayBufferView = new Uint8Array(),
  ) {}

  /** Underlying buffer of the payload, which a file shares with the tree it was read from. */
  get buffer() {
    return this.data.buffer
  }

  /** Where the payload starts in that buffer, which for a file read from a tree is its data offset. */
  get byteOffset(): number {
    return this.data.byteOffset
  }

  /** Payload size in bytes. */
  get byteLength(): number {
    return this.data.byteLength
  }

  /** Reads as 32-bit signed integers. Remaining unaligned bytes are read as 16-bit or 8-bit integers. */
  *readIntegers(): Iterable<number> {
    const view = BufferView.from(this.data)

    while (true) {
      if (view.byteRemain >= Int32Array.BYTES_PER_ELEMENT) yield view.readInt32()
      else if (view.byteRemain >= Int16Array.BYTES_PER_ELEMENT) yield view.readInt16()
      else if (view.byteRemain >= Int8Array.BYTES_PER_ELEMENT) yield view.readInt8()
      else break
    }
  }

  /** Replaces the payload with values as 32-bit signed integers. */
  setIntegers(...values: number[]): this {
    const view = BufferView.allocate(values.length * Int32Array.BYTES_PER_ELEMENT)
    values.forEach((value) => view.writeInt32(value))
    return this.replace(view)
  }

  /** Reads as 32-bit float point numbers. */
  *readFloats(): Iterable<number> {
    const view = BufferView.from(this.data)
    while (view.byteRemain >= Float32Array.BYTES_PER_ELEMENT) yield view.readFloat32()
  }

  /** Replaces the payload with values as 32-bit float point numbers. */
  setFloats(...values: number[]): this {
    const view = BufferView.allocate(values.length * Float32Array.BYTES_PER_ELEMENT)
    values.forEach((value) => view.writeFloat32(value))
    return this.replace(view)
  }

  /** Replaces the payload with values as NUL-terminated strings. */
  setStrings(...values: string[]): this {
    return this.replace(BufferView.from(values.join('\0') + '\0'))
  }

  /** Reads NUL-terminated strings. */
  *readStrings(): Iterable<string> {
    const view = BufferView.from(this.data)
    while (view.byteRemain > 0) yield view.readStringZ()
  }

  /**
   * Makes a written view the payload. As bytes rather than as the view itself, whose cursor sits at
   * the end after writing and would carry over into every later read.
   */
  private replace({ buffer, byteOffset, byteLength }: BufferView): this {
    this.data = new Uint8Array(buffer, byteOffset, byteLength)
    return this
  }

  /** Appends buffer views to data. The one method here that keeps what the payload held. */
  append(...chunks: ArrayBufferView[]): this {
    this.data = BufferView.join(this.data, ...chunks)
    return this
  }
}
