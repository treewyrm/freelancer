import BufferView from '#/utility/bufferview.js'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export type Read<T> = (view: BufferView) => T
export type Write<T> = (value: T) => BufferView

/** Reads signed 32-bit integer. */
export const readInteger: Read<number> = (view) => view.readInt32()

/** Writes signed 32-bit integer. */
export const writeInteger: Write<number> = (value) =>
  BufferView.allocate(Int32Array.BYTES_PER_ELEMENT).writeInt32(value)

/** Reads 32-bit float point number. */
export const readFloat: Read<number> = (view) => view.readFloat32()

/** Writes 32-bit float point number. */
export const writeFloat: Write<number> = (value) =>
  BufferView.allocate(Float32Array.BYTES_PER_ELEMENT).writeFloat32(value)

/** Reads prefixed NUL-terminated string. */
export const readString: Read<string> = (view) => {
  // String length in prefix includes NUL termination byte.
  const length = view.readUint16()

  // However the actual buffer will always have even length.
  const buffer = new Uint8Array(length + (length & 1))
  view.readBuffer(buffer)

  return decoder.decode(buffer.subarray(0, buffer.indexOf(0)))
}

/** Writes prefixed NUL-terminated string. */
export const writeString: Write<string> = (value) => {
  const buffer = encoder.encode(value)
  const length = buffer.byteLength + 1
  return BufferView.allocate(2 + length + (length & 1))
    .writeUint16(length)
    .writeBuffer(buffer)
}

export enum BlendingMode {
  None,
  Zero,
  One,
  SourceColor,
  InverseSourceColor,
  SourceAlpha,
  InverseSourceAlpha,
  DestinationAlpha,
  InverseDestinationAlpha,
  DestinationColor,
  InverseDestinationColor,
  SourceAlphaSAT,
}

export interface Blending {
  source: BlendingMode
  target: BlendingMode
}

/** Reads blending mode. */
export const readBlending: Read<Blending> = (view) => ({
  source: view.readUint32(),
  target: view.readUint32(),
})

/** Writes blending mode. */
export const writeBlending: Write<Blending> = ({ source, target }) =>
  BufferView.allocate(Uint32Array.BYTES_PER_ELEMENT * 2)
    .writeUint32(source)
    .writeUint32(target)

/** Reads array of elements. */
export const readArray = <T>(view: BufferView, read: Read<T>, count = Infinity) => {
  const array: T[] = []
  while (count--) array.push(read(view))
  return array
}

/** Writes array of elements. */
export const writeArray = <T>(array: T[], write: Write<T>) =>
  BufferView.join(...array.map((value) => write(value)))
