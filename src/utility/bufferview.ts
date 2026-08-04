/**
 * DataView with an internal byte offset, little-endian by default.
 *
 * A deliberate subset of utf2json's `BufferView` — BINI needs six primitives and a NUL-terminated
 * string read, and nothing else. When utf2json is published this should become an import rather
 * than a second implementation; until then the surface is kept small enough that the two cannot
 * drift in any way that matters.
 */
export default class BufferView<T extends ArrayBufferLike = ArrayBufferLike> extends DataView<T> {
  #offset

  constructor(
    buffer: T,
    byteOffset?: number,
    byteLength?: number,

    /** Current offset. */
    offset = 0,

    /** Default byte order. */
    public littleEndian = true,
  ) {
    super(buffer, byteOffset, byteLength)
    this.#offset = offset
  }

  get offset(): number {
    return this.#offset
  }

  set offset(value: number) {
    if (value < 0) value += this.byteLength
    this.#offset = value
  }

  /** Bytes remaining, clamped to the view. */
  get byteRemain(): number {
    return Math.min(Math.max(this.byteLength - this.#offset, 0), this.byteLength)
  }

  static allocate(length: number): BufferView<ArrayBuffer> {
    return new this(new ArrayBuffer(length))
  }

  /**
   * Wraps a view without copying its buffer.
   * @param value Buffer view or buffer.
   */
  static from<T extends ArrayBufferLike>(value: ArrayBufferView<T> | T): BufferView<T> {
    if (ArrayBuffer.isView(value)) {
      const { buffer, byteOffset, byteLength } = value
      return new this(buffer, byteOffset, byteLength)
    }

    return new this(value)
  }

  rewind(): this {
    this.offset = 0
    return this
  }

  readUint8(): number {
    const value = this.getUint8(this.#offset)
    this.#offset += Uint8Array.BYTES_PER_ELEMENT
    return value
  }

  writeUint8(value: number): this {
    this.setUint8(this.#offset, value)
    this.#offset += Uint8Array.BYTES_PER_ELEMENT
    return this
  }

  readUint16(littleEndian: boolean = this.littleEndian): number {
    const value = this.getUint16(this.#offset, littleEndian)
    this.#offset += Uint16Array.BYTES_PER_ELEMENT
    return value
  }

  writeUint16(value: number, littleEndian: boolean = this.littleEndian): this {
    this.setUint16(this.#offset, value, littleEndian)
    this.#offset += Uint16Array.BYTES_PER_ELEMENT
    return this
  }

  readUint32(littleEndian: boolean = this.littleEndian): number {
    const value = this.getUint32(this.#offset, littleEndian)
    this.#offset += Uint32Array.BYTES_PER_ELEMENT
    return value
  }

  writeUint32(value: number, littleEndian: boolean = this.littleEndian): this {
    this.setUint32(this.#offset, value, littleEndian)
    this.#offset += Uint32Array.BYTES_PER_ELEMENT
    return this
  }

  readInt32(littleEndian: boolean = this.littleEndian): number {
    const value = this.getInt32(this.#offset, littleEndian)
    this.#offset += Int32Array.BYTES_PER_ELEMENT
    return value
  }

  writeInt32(value: number, littleEndian: boolean = this.littleEndian): this {
    this.setInt32(this.#offset, value, littleEndian)
    this.#offset += Int32Array.BYTES_PER_ELEMENT
    return this
  }

  readFloat32(littleEndian: boolean = this.littleEndian): number {
    const value = this.getFloat32(this.#offset, littleEndian)
    this.#offset += Float32Array.BYTES_PER_ELEMENT
    return value
  }

  writeFloat32(value: number, littleEndian: boolean = this.littleEndian): this {
    this.setFloat32(this.#offset, value, littleEndian)
    this.#offset += Float32Array.BYTES_PER_ELEMENT
    return this
  }

  /** Bytes of this view, without copying. */
  get bytes(): Uint8Array {
    return new Uint8Array(this.buffer, this.byteOffset, this.byteLength)
  }

  /**
   * Writes bytes at the current offset.
   * @param source Buffer to copy from.
   */
  writeBuffer(source: ArrayBufferView): this {
    const bytes = new Uint8Array(source.buffer, source.byteOffset, source.byteLength)
    this.bytes.set(bytes, this.#offset)
    this.#offset += source.byteLength
    return this
  }

  /**
   * Finds the NUL terminating a string that starts at `offset`.
   * @param offset Byte offset of the first character.
   * @returns Byte offset of the terminator.
   */
  findTerminator(offset: number): number {
    const end = this.bytes.indexOf(0, offset)
    if (end < 0) throw new RangeError(`String at offset ${offset} has no NUL terminator`)
    return end
  }
}
