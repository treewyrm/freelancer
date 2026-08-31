import BufferView from '#/utility/bufferview.js'
import { readPart, writePart, type Part } from './part.js'

const SIGNATURE = 0x73726576 // 'vers'
const VERSION = Math.fround(2.0)

/**
 * Reads a whole `.sur` file: the `vers` header, then parts until the buffer runs out.
 *
 * There is no part count anywhere in the format, so the end of the buffer is the only terminator —
 * which is why this takes a view over the file and not over something longer.
 * @throws Error when the signature is not `vers`.
 * @throws RangeError when the version is not 2.0.
 */
export function readSurfaceLibrary(view: BufferView): Part[] {
  const parts: Part[] = []

  if (view.readUint32() !== SIGNATURE) throw new Error('Invalid SUR header')
  if (view.readFloat32() !== VERSION) throw new RangeError('Invalid SUR version')

  while (view.byteRemain) parts.push(readPart(view))
  return parts
}

/** Writes a whole `.sur` file: the `vers` header followed by each part's chunks in order. */
export function writeSurfaceLibrary(parts: Part[]): BufferView {
  const view = BufferView.allocate(8).writeUint32(SIGNATURE).writeFloat32(VERSION)

  return BufferView.concat([view, ...parts.map(writePart)])
}
