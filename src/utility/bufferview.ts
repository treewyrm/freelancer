const encoder = new TextEncoder()
const decoder = new TextDecoder()

/**
 * DataView class extended to have internal byte offset pointer to read and write values.
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

  /** Bytes remain in view. Clamped to range of 0 and view byte length. */
  get byteRemain(): number {
    return Math.min(Math.max(this.byteLength - this.#offset, 0), this.byteLength)
  }

  /**
   * Allocates array buffer in buffer view.
   * @param length Buffer byte length
   * @returns
   */
  static allocate(length: number): BufferView<ArrayBuffer> {
    return new this(new ArrayBuffer(length))
  }

  /**
   * Creates new buffer from view(s).
   * Data is copied from views to new ArrayBuffer.
   * @param views Buffer views
   * @returns
   */
  static join(...views: ArrayBufferView[]): BufferView<ArrayBuffer> {
    const view = this.allocate(views.reduce((total, { byteLength }) => total + byteLength, 0))
    for (const value of views) view.writeBuffer(value)
    return view.rewind()
  }

  /**
   * Creates new view from another view or string.
   *
   * - Does not copy underlying buffer.
   * - Copies offset and endianess if value is a BufferView.
   * @param value String or buffer view
   * @returns
   */
  static from(value: string): BufferView<ArrayBuffer>
  static from<T extends ArrayBufferLike>(view: ArrayBufferView<T>): BufferView<T>
  static from(value: ArrayBufferView | string): BufferView {
    if (typeof value === 'string') value = encoder.encode(value)

    const { buffer, byteOffset, byteLength } = value

    let offset = 0
    let littleEndian: boolean | undefined

    if (value instanceof BufferView) ({ offset, littleEndian } = value)

    return new this(buffer, byteOffset, byteLength, offset, littleEndian)
  }

  rewind(): this {
    this.offset = 0
    return this
  }

  slice(begin?: number, end?: number) {
    const view = new Uint8Array(this.buffer, this.byteOffset, this.byteLength).slice(begin, end)
    return new BufferView(view.buffer)
  }

  /**
   * Create new buffer view from begin to end offsets. Does not affect the offset.
   * @param start Start byte offset.
   * @param end End byte offset.
   * @returns
   */
  subarray(start?: number, end?: number): BufferView<T> {
    // Just so we don't recreate full logic behind begin/end properties.
    const view = new Uint8Array(this.buffer, this.byteOffset, this.byteLength).subarray(start, end)
    return new BufferView(
      this.buffer,
      view.byteOffset,
      view.byteLength,
      undefined,
      this.littleEndian,
    )
  }

  /**
   * Reads the Uint8 value at the current byte offset.
   * @returns
   */
  readUint8(): number {
    const value = this.getUint8(this.offset)
    this.offset += Uint8Array.BYTES_PER_ELEMENT
    return value
  }

  /**
   * Writes an Uint8 at the current byte offset.
   * @param value Value to write.
   * @returns
   */
  writeUint8(value: number): this {
    this.setUint8(this.offset, value)
    this.offset += Uint8Array.BYTES_PER_ELEMENT
    return this
  }

  /**
   * Reads the Int8 value at the current byte offset.
   * @returns
   */
  readInt8(): number {
    const value = this.getInt8(this.offset)
    this.offset += Int8Array.BYTES_PER_ELEMENT
    return value
  }

  /**
   * Writes an Int8 at the current byte offset.
   * @param value Value to write.
   * @returns
   */
  writeInt8(value: number): this {
    this.setInt8(this.offset, value)
    this.offset += Int8Array.BYTES_PER_ELEMENT
    return this
  }

  /**
   * Reads the Uint16 value at the current byte offset.
   * @param littleEndian Overrides default endianness setting of the view.
   * @returns
   */
  readUint16(littleEndian: boolean = this.littleEndian): number {
    const value = this.getUint16(this.offset, littleEndian)
    this.offset += Uint16Array.BYTES_PER_ELEMENT
    return value
  }

  /**
   * Writes an Uint16 at the current byte offset.
   * @param value Value to write.
   * @param littleEndian Overrides default endianness setting of the view.
   * @returns
   */
  writeUint16(value: number, littleEndian: boolean = this.littleEndian): this {
    this.setUint16(this.offset, value, littleEndian)
    this.offset += Uint16Array.BYTES_PER_ELEMENT
    return this
  }

  /**
   * Reads the Int16 value at the current byte offset.
   * @param littleEndian Overrides default endianness setting of the view.
   * @returns
   */
  readInt16(littleEndian: boolean = this.littleEndian): number {
    const value = this.getInt16(this.offset, littleEndian)
    this.offset += Int16Array.BYTES_PER_ELEMENT
    return value
  }

  /**
   * Writes an Int16 at the current byte offset.
   * @param value Value to write.
   * @param littleEndian Overrides default endianness setting of the view.
   * @returns
   */
  writeInt16(value: number, littleEndian: boolean = this.littleEndian): this {
    this.setInt16(this.offset, value, littleEndian)
    this.offset += Int16Array.BYTES_PER_ELEMENT
    return this
  }

  /**
   * Reads the Uint32 value at the current byte offset.
   * @param littleEndian Overrides default endianness setting of the view.
   * @returns
   */
  readUint32(littleEndian: boolean = this.littleEndian): number {
    const value = this.getUint32(this.offset, littleEndian)
    this.offset += Uint32Array.BYTES_PER_ELEMENT
    return value
  }

  /**
   * Writes an Uint32 at the current byte offset.
   * @param value Value to write.
   * @param littleEndian Overrides default endianness setting of the view.
   * @returns
   */
  writeUint32(value: number, littleEndian: boolean = this.littleEndian): this {
    this.setUint32(this.offset, value, littleEndian)
    this.offset += Uint32Array.BYTES_PER_ELEMENT
    return this
  }

  /**
   * Reads the Int32 value at the current byte offset.
   * @param littleEndian Overrides default endianness setting of the view.
   * @returns
   */
  readInt32(littleEndian: boolean = this.littleEndian): number {
    const value = this.getInt32(this.offset, littleEndian)
    this.offset += Int32Array.BYTES_PER_ELEMENT
    return value
  }

  /**
   * Writes an Int32 at the current byte offset.
   * @param value Value to write.
   * @param littleEndian Overrides default endianness setting of the view.
   * @returns
   */
  writeInt32(value: number, littleEndian: boolean = this.littleEndian): this {
    this.setInt32(this.offset, value, littleEndian)
    this.offset += Int32Array.BYTES_PER_ELEMENT
    return this
  }

  /**
   * Reads the Uint64 value at the current byte offset.
   * @param littleEndian Overrides default endianness setting of the view.
   * @returns
   */
  readBigUint64(littleEndian: boolean = this.littleEndian): bigint {
    const value = this.getBigUint64(this.offset, littleEndian)
    this.offset += BigUint64Array.BYTES_PER_ELEMENT
    return value
  }

  /**
   * Writes an Uint64 at the current byte offset.
   * @param value Value to write.
   * @param littleEndian Overrides default endianness setting of the view.
   * @returns
   */
  writeBigUint64(value: bigint, littleEndian: boolean = this.littleEndian): this {
    this.setBigUint64(this.offset, value, littleEndian)
    this.offset += BigUint64Array.BYTES_PER_ELEMENT
    return this
  }

  /**
   * Reads the Int64 value at the current byte offset.
   * @param littleEndian Overrides default endianness setting of the view.
   * @returns
   */
  readBigInt64(littleEndian: boolean = this.littleEndian): bigint {
    const value = this.getBigInt64(this.offset, littleEndian)
    this.offset += BigInt64Array.BYTES_PER_ELEMENT
    return value
  }

  /**
   * Writes an Int64 at the current byte offset.
   * @param value Value to write.
   * @param littleEndian Overrides default endianness setting of the view.
   * @returns
   */
  writeBigInt64(value: bigint, littleEndian: boolean = this.littleEndian): this {
    this.setBigInt64(this.offset, value, littleEndian)
    this.offset += BigInt64Array.BYTES_PER_ELEMENT
    return this
  }

  /**
   * Reads the Float32 value at the current byte offset.
   * @param littleEndian
   * @returns
   */
  readFloat32(littleEndian: boolean = this.littleEndian): number {
    const value = this.getFloat32(this.offset, littleEndian)
    this.offset += Float32Array.BYTES_PER_ELEMENT
    return value
  }

  /**
   * Writes a Float32 at the current byte offset.
   * @param value Value to write.
   * @param littleEndian Overrides default endianness setting of the view.
   * @returns
   */
  writeFloat32(value: number, littleEndian: boolean = this.littleEndian): this {
    this.setFloat32(this.offset, value, littleEndian)
    this.offset += Float32Array.BYTES_PER_ELEMENT
    return this
  }

  /**
   * Reads the Float64 value at the current byte offset.
   * @param littleEndian
   * @returns
   */
  readFloat64(littleEndian: boolean = this.littleEndian): number {
    const value = this.getFloat64(this.offset, littleEndian)
    this.offset += Float64Array.BYTES_PER_ELEMENT
    return value
  }

  /**
   * Writes a Float64 at the current byte offset.
   * @param value Value to write.
   * @param littleEndian Overrides default endianness setting of the view.
   * @returns
   */
  writeFloat64(value: number, littleEndian: boolean = this.littleEndian): this {
    this.setFloat64(this.offset, value, littleEndian)
    this.offset += Float64Array.BYTES_PER_ELEMENT
    return this
  }

  /**
   * Reads bytes into target view from specified byte offset.
   * @param offset
   * @param target
   * @returns
   */
  getBuffer(offset: number, target: ArrayBufferView): this {
    const view = new Uint8Array(this.buffer, this.byteOffset + offset, target.byteLength)
    new Uint8Array(target.buffer, target.byteOffset, target.byteLength).set(view)
    return this
  }

  /**
   * Writes bytes from source view from specified byte offset.
   * @param offset
   * @param source
   * @returns
   */
  setBuffer(offset: number, source: ArrayBufferView): this {
    const view = new Uint8Array(source.buffer, source.byteOffset, source.byteLength)
    new Uint8Array(this.buffer, this.byteOffset + offset, source.byteLength).set(view)
    return this
  }

  /**
   * Reads bytes into specified buffer from the current byte offset.
   * @param target Buffer to copy into.
   * @returns
   */
  readBuffer(target: ArrayBufferView): this {
    this.getBuffer(this.offset, target)
    this.offset += target.byteLength
    return this
  }

  /**
   * Writes bytes from specified buffer at the current byte offset.
   * @param source Buffer to copy from.
   * @returns
   */
  writeBuffer(source: ArrayBufferView): this {
    this.setBuffer(this.offset, source)
    this.offset += source.byteLength
    return this
  }

  getString(offset: number, length: number): string {
    const view = new Uint8Array(this.buffer, this.byteOffset, this.byteLength)
    return decoder.decode(view.subarray(offset, offset + length))
  }

  setString(offset: number, value: string): number {
    const view = new Uint8Array(this.buffer, this.byteOffset, this.byteLength)
    return encoder.encodeInto(value, view.subarray(offset)).written
  }

  readString(length: number): string {
    const value = this.getString(this.offset, length)
    this.offset += length
    return value
  }

  writeString(value: string): this {
    this.offset += this.setString(this.offset, value)
    return this
  }

  /**
   * Reads ASCIIZ string from the current byte offset.
   * @returns
   */
  readStringZ(): string {
    const view = new Uint8Array(this.buffer, this.byteOffset, this.byteLength)
    const end = view.indexOf(0, this.offset)
    if (end < 0) throw new RangeError(`String NUL terminator not found from offset ${this.offset}`)
    const value = this.readString(end - this.offset)
    this.#offset++
    return value
  }

  /**
   * Writes ASCIIZ string at the current byte offset.
   * @param value
   */
  writeStringZ(value: string): this {
    return this.writeString(value).writeUint8(0)
  }

  readHex(length: number): string {
    const view = new Uint8Array(length)
    this.readBuffer(view)

    return Array.from(view)
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('')
  }

  writeHex(value: string): this {
    const view = new Uint8Array(value.length / 2)

    for (let i = 0, o = 0; i < value.length; i += 2)
      view[o++] = parseInt(value.substring(i, i + 2), 16)

    return this.writeBuffer(view)
  }
}
