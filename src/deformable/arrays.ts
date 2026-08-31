import File from '#/utf/file.js'
import BufferView from '#/utility/bufferview.js'

/**
 * Bulk numeric files in a deformable model carry no header: the element type comes from the file
 * name alone and the count from the byte length. Reading and writing go element by element rather
 * than casting the payload, because a `File` sits at whatever offset the data block put it at and
 * because UTF is little-endian regardless of what the host is.
 */

const count = (file: File, size: number): number => {
  if (file.byteLength % size)
    throw new RangeError(`${file.name} is not a whole number of ${size}-byte elements`)

  return file.byteLength / size
}

/**
 * Reads a `uint16` array. Element count comes from the byte length.
 * @throws RangeError when the payload is not a whole number of elements.
 */
export function readUint16Array(file: File): Uint16Array {
  const view = BufferView.from(file)
  const values = new Uint16Array(count(file, Uint16Array.BYTES_PER_ELEMENT))

  for (let i = 0; i < values.length; i++) values[i] = view.readUint16()

  return values
}

/**
 * Reads a `uint32` array. Element count comes from the byte length.
 * @throws RangeError when the payload is not a whole number of elements.
 */
export function readUint32Array(file: File): Uint32Array {
  const view = BufferView.from(file)
  const values = new Uint32Array(count(file, Uint32Array.BYTES_PER_ELEMENT))

  for (let i = 0; i < values.length; i++) values[i] = view.readUint32()

  return values
}

/**
 * Reads a `float32` array. Element count comes from the byte length.
 * @throws RangeError when the payload is not a whole number of elements.
 */
export function readFloat32Array(file: File): Float32Array {
  const view = BufferView.from(file)
  const values = new Float32Array(count(file, Float32Array.BYTES_PER_ELEMENT))

  for (let i = 0; i < values.length; i++) values[i] = view.readFloat32()

  return values
}

/** Writes a `uint16` array into a file. The name is the only thing that records the element type. */
export function writeUint16Array(name: string, values: ArrayLike<number>): File {
  const view = BufferView.allocate(values.length * Uint16Array.BYTES_PER_ELEMENT)

  for (let i = 0; i < values.length; i++) view.writeUint16(values[i]!)

  return new File(name, view.rewind())
}

/** Writes a `uint32` array into a file. The name is the only thing that records the element type. */
export function writeUint32Array(name: string, values: ArrayLike<number>): File {
  const view = BufferView.allocate(values.length * Uint32Array.BYTES_PER_ELEMENT)

  for (let i = 0; i < values.length; i++) view.writeUint32(values[i]!)

  return new File(name, view.rewind())
}

/** Writes a `float32` array into a file. The name is the only thing that records the element type. */
export function writeFloat32Array(name: string, values: ArrayLike<number>): File {
  const view = BufferView.allocate(values.length * Float32Array.BYTES_PER_ELEMENT)

  for (let i = 0; i < values.length; i++) view.writeFloat32(values[i]!)

  return new File(name, view.rewind())
}
