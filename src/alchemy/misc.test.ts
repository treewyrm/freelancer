import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import BufferView from '#/utility/bufferview.js'
import {
  BlendingMode,
  readArray,
  readBlending,
  readFloat,
  readInteger,
  readString,
  writeArray,
  writeBlending,
  writeFloat,
  writeInteger,
  writeString,
} from './misc.js'

const bytes = ({ buffer, byteOffset, byteLength }: ArrayBufferView) =>
  new Uint8Array(buffer, byteOffset, byteLength)

describe('integers and floats', () => {
  it('stores integers signed', () => {
    for (const value of [0, 1, -1, 0x7fffffff, -0x80000000])
      strictEqual(readInteger(writeInteger(value).rewind()), value)
  })

  it('rounds floats to single precision', () => {
    strictEqual(readFloat(writeFloat(0.1).rewind()), Math.fround(0.1))
    strictEqual(readFloat(writeFloat(0.5).rewind()), 0.5)
  })
})

describe('strings', () => {
  // The prefix counts the NUL terminator, and the payload is padded to an even length so that
  // whatever the reader picks up next stays on the 16-bit boundary the rest of the format uses.
  it('prefixes the length including the terminator and pads to even', () => {
    const odd = writeString('abc')

    strictEqual(odd.byteLength, 6)
    strictEqual(odd.rewind().readUint16(), 4, 'three characters and a NUL')

    const even = writeString('ab')

    strictEqual(even.byteLength, 6, 'two characters, a NUL and one byte of padding')
    strictEqual(even.rewind().readUint16(), 3)
  })

  it('round-trips both lengths and leaves the reader aligned', () => {
    const view = BufferView.join(writeString('abc'), writeString('ab'))

    strictEqual(readString(view), 'abc')
    strictEqual(readString(view), 'ab')
    strictEqual(view.byteRemain, 0)
  })

  it('reads either retail encoding of the empty string', () => {
    // What the writer emits: a prefix of 1, a NUL, and its padding byte.
    strictEqual(writeString('').byteLength, 4)
    strictEqual(readString(writeString('').rewind()), '')

    // What two retail files use: a bare zero prefix carrying no payload at all.
    strictEqual(readString(BufferView.allocate(2)), '')
  })
})

describe('blending', () => {
  it('stores source and target as a pair of 32-bit modes', () => {
    const blending = {
      source: BlendingMode.SourceAlpha,
      target: BlendingMode.InverseSourceAlpha,
    }

    const view = writeBlending(blending)

    strictEqual(view.byteLength, 8)
    deepStrictEqual(readBlending(view.rewind()), blending)
  })
})

describe('arrays', () => {
  it('reads a fixed count and writes them back unchanged', () => {
    const values = [1, 2, 3]
    const view = writeArray(values, writeInteger)

    strictEqual(view.byteLength, 12)
    deepStrictEqual(readArray(view.rewind(), readInteger, values.length), values)
  })

  it('writes nothing for an empty array', () => {
    strictEqual(writeArray([], writeInteger).byteLength, 0)
    deepStrictEqual(readArray(BufferView.allocate(0), readInteger, 0), [])
  })

  it('leaves the view positioned after the last element', () => {
    const view = BufferView.join(writeArray([1, 2], writeInteger), writeInteger(9))

    deepStrictEqual(readArray(view, readInteger, 2), [1, 2])
    strictEqual(readInteger(view), 9)
  })

  it('joins views without disturbing their contents', () => {
    deepStrictEqual(
      [...bytes(BufferView.join(writeInteger(1), writeInteger(-1)))],
      [1, 0, 0, 0, 255, 255, 255, 255],
    )
  })
})
