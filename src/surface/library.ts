import BufferView from '#/utility/bufferview.js'
import { readPart, writePart, type Part } from './part.js'

const SIGNATURE = 0x73726576 // 'vers'
const VERSION = Math.fround(2.0)

export function readSurfaceLibrary(view: BufferView): Part[] {
  const parts: Part[] = []

  if (view.readUint32() !== SIGNATURE) throw new Error('Invalid SUR header')
  if (view.readFloat32() !== VERSION) throw new RangeError('Invalid SUR version')

  while (view.byteRemain) parts.push(readPart(view))
  return parts
}

export function writeSurfaceLibrary(parts: Part[]): BufferView {
  const view = BufferView.allocate(8).writeUint32(SIGNATURE).writeFloat32(VERSION)

  return BufferView.concat([view, ...parts.map(writePart)])
}
