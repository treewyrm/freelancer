import BufferView from './utility/bufferview.js'

/** File entry in UTF structure. */
export default class File implements ArrayBufferView {
  constructor(
    /** File name. */
    public name: string,

    /** File data. */
    public data: ArrayBufferView = new Uint8Array(),
  ) {}

  get buffer() {
    return this.data.buffer
  }

  get byteOffset(): number {
    return this.data.byteOffset
  }

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

  /** Writes values as 32-bit signed integers. */
  writeIntegers(...values: number[]): this {
    const view = BufferView.allocate(values.length * Int32Array.BYTES_PER_ELEMENT)
    values.forEach((value) => view.writeInt32(value))
    return this.append(view)
  }

  /** Reads as 32-bit float point numbers. */
  *readFloats(): Iterable<number> {
    const view = BufferView.from(this.data)
    while (view.byteRemain >= Float32Array.BYTES_PER_ELEMENT) yield view.readFloat32()
  }

  /** Writes values as 32-bit float point numbers. */
  writeFloats(...values: number[]): this {
    const view = BufferView.allocate(values.length * Float32Array.BYTES_PER_ELEMENT)
    values.forEach((value) => view.writeFloat32(value))
    return this.append(view)
  }

  /** Writes values as NUL-terminated strings. */
  writeStrings(...values: string[]): this {
    return this.append(BufferView.from(values.join('\0') + '\0'))
  }

  /** Reads NUL-terminated strings. */
  *readStrings(): Iterable<string> {
    const view = BufferView.from(this.data)
    while (view.byteRemain > 0) yield view.readStringZ()
  }

  /** Appends buffer views to data. */
  append(...chunks: ArrayBufferView[]): this {
    this.data = BufferView.join(this.data, ...chunks)
    return this
  }
}
