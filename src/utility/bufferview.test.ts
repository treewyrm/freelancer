import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import BufferView from './bufferview.js'

// ---------------------------------------------------------------------------
// Construction & static factories
// ---------------------------------------------------------------------------

describe('BufferView.allocate', () => {
  it('creates a zero-filled view of the requested byte length', () => {
    const view = BufferView.allocate(8)
    assert.equal(view.byteLength, 8)
    assert.equal(view.offset, 0)
    assert.equal(view.buffer.byteLength, 8)
  })

  it('default littleEndian is true', () => {
    const view = BufferView.allocate(4)
    assert.equal(view.littleEndian, true)
  })
})

describe('BufferView.from (string)', () => {
  it('encodes a UTF-8 string into a new buffer', () => {
    const view = BufferView.from('ABC')
    assert.equal(view.byteLength, 3)
    assert.equal(view.getUint8(0), 0x41) // A
    assert.equal(view.getUint8(1), 0x42) // B
    assert.equal(view.getUint8(2), 0x43) // C
  })
})

describe('BufferView.from (ArrayBufferView)', () => {
  it('wraps the same underlying buffer without copying', () => {
    const buf = new ArrayBuffer(4)
    const u8 = new Uint8Array(buf)
    u8[0] = 99
    const view = BufferView.from(u8)
    assert.equal(view.buffer, buf)
    assert.equal(view.getUint8(0), 99)
  })

  it('copies offset and littleEndian from a source BufferView', () => {
    const src = BufferView.allocate(8)
    src.offset = 4
    src.littleEndian = false
    const view = BufferView.from(src)
    assert.equal(view.offset, 4)
    assert.equal(view.littleEndian, false)
  })
})

describe('BufferView.join', () => {
  it('concatenates multiple views into one contiguous buffer', () => {
    const a = new Uint8Array([1, 2])
    const b = new Uint8Array([3, 4, 5])
    const view = BufferView.join(a, b)
    assert.equal(view.byteLength, 5)
    assert.equal(view.offset, 0) // rewind() is called
    assert.deepEqual(
      Array.from(new Uint8Array(view.buffer, view.byteOffset, view.byteLength)),
      [1, 2, 3, 4, 5],
    )
  })

  it('returns an empty view when called with no arguments', () => {
    const view = BufferView.join()
    assert.equal(view.byteLength, 0)
  })
})

// ---------------------------------------------------------------------------
// offset property
// ---------------------------------------------------------------------------

describe('offset', () => {
  it('starts at 0 by default', () => {
    assert.equal(BufferView.allocate(4).offset, 0)
  })

  it('can be set to a positive value', () => {
    const view = BufferView.allocate(8)
    view.offset = 5
    assert.equal(view.offset, 5)
  })

  it('negative offset wraps from end of view', () => {
    const view = BufferView.allocate(8)
    view.offset = -2
    assert.equal(view.offset, 6)
  })
})

// ---------------------------------------------------------------------------
// byteRemain
// ---------------------------------------------------------------------------

describe('byteRemain', () => {
  it('equals byteLength at the start', () => {
    const view = BufferView.allocate(10)
    assert.equal(view.byteRemain, 10)
  })

  it('decreases as offset advances', () => {
    const view = BufferView.allocate(10)
    view.offset = 3
    assert.equal(view.byteRemain, 7)
  })

  it('is 0 when offset equals byteLength', () => {
    const view = BufferView.allocate(4)
    view.offset = 4
    assert.equal(view.byteRemain, 0)
  })
})

// ---------------------------------------------------------------------------
// rewind
// ---------------------------------------------------------------------------

describe('rewind', () => {
  it('resets offset to 0 and returns the same instance', () => {
    const view = BufferView.allocate(8)
    view.offset = 6
    const result = view.rewind()
    assert.equal(view.offset, 0)
    assert.equal(result, view)
  })
})

// ---------------------------------------------------------------------------
// slice / subarray
// ---------------------------------------------------------------------------

describe('slice', () => {
  it('returns a new BufferView over a copy of the data', () => {
    const view = BufferView.from(new Uint8Array([10, 20, 30, 40]))
    const sliced = view.slice(1, 3)
    assert.equal(sliced.byteLength, 2)
    assert.equal(sliced.getUint8(0), 20)
    assert.equal(sliced.getUint8(1), 30)
    // Mutation on original must not affect slice (it's a copy)
    view.setUint8(1, 99)
    assert.equal(sliced.getUint8(0), 20)
  })
})

describe('subarray', () => {
  it('returns a view over the same buffer', () => {
    const view = BufferView.from(new Uint8Array([10, 20, 30, 40]))
    const sub = view.subarray(1, 3)
    assert.equal(sub.byteLength, 2)
    assert.equal(sub.buffer, view.buffer)
    assert.equal(sub.getUint8(0), 20)
    // Mutation on original must be visible in subarray (shared buffer)
    view.setUint8(1, 99)
    assert.equal(sub.getUint8(0), 99)
  })

  it('inherits littleEndian from parent', () => {
    const view = BufferView.allocate(8)
    view.littleEndian = false
    const sub = view.subarray(0, 4)
    assert.equal(sub.littleEndian, false)
  })
})

// ---------------------------------------------------------------------------
// Numeric read/write (Uint8 / Int8)
// ---------------------------------------------------------------------------

describe('readUint8 / writeUint8', () => {
  it('round-trips a value and advances offset by 1', () => {
    const view = BufferView.allocate(2)
    view.writeUint8(200)
    assert.equal(view.offset, 1)
    view.rewind()
    assert.equal(view.readUint8(), 200)
    assert.equal(view.offset, 1)
  })
})

describe('readInt8 / writeInt8', () => {
  it('round-trips a negative value', () => {
    const view = BufferView.allocate(1)
    view.writeInt8(-42)
    view.rewind()
    assert.equal(view.readInt8(), -42)
  })
})

// ---------------------------------------------------------------------------
// Numeric read/write (16-bit)
// ---------------------------------------------------------------------------

describe('readUint16 / writeUint16', () => {
  it('round-trips little-endian by default', () => {
    const view = BufferView.allocate(2)
    view.writeUint16(0x1234)
    view.rewind()
    assert.equal(view.readUint16(), 0x1234)
    assert.equal(view.offset, 2)
  })

  it('respects big-endian override', () => {
    const view = BufferView.allocate(2)
    view.writeUint16(0xabcd, false)
    view.rewind()
    assert.equal(view.readUint16(false), 0xabcd)
  })
})

describe('readInt16 / writeInt16', () => {
  it('round-trips a negative value', () => {
    const view = BufferView.allocate(2)
    view.writeInt16(-1000)
    view.rewind()
    assert.equal(view.readInt16(), -1000)
  })
})

// ---------------------------------------------------------------------------
// Numeric read/write (32-bit)
// ---------------------------------------------------------------------------

describe('readUint32 / writeUint32', () => {
  it('round-trips', () => {
    const view = BufferView.allocate(4)
    view.writeUint32(0xdeadbeef)
    view.rewind()
    assert.equal(view.readUint32(), 0xdeadbeef)
    assert.equal(view.offset, 4)
  })
})

describe('readInt32 / writeInt32', () => {
  it('round-trips a negative value', () => {
    const view = BufferView.allocate(4)
    view.writeInt32(-100_000)
    view.rewind()
    assert.equal(view.readInt32(), -100_000)
  })
})

// ---------------------------------------------------------------------------
// Numeric read/write (64-bit BigInt)
// ---------------------------------------------------------------------------

describe('readBigUint64 / writeBigUint64', () => {
  it('round-trips', () => {
    const view = BufferView.allocate(8)
    view.writeBigUint64(0xffffffffffffffffn)
    view.rewind()
    assert.equal(view.readBigUint64(), 0xffffffffffffffffn)
    assert.equal(view.offset, 8)
  })
})

describe('readBigInt64 / writeBigInt64', () => {
  it('round-trips a negative value', () => {
    const view = BufferView.allocate(8)
    view.writeBigInt64(-1n)
    view.rewind()
    assert.equal(view.readBigInt64(), -1n)
  })
})

// ---------------------------------------------------------------------------
// Numeric read/write (floats)
// ---------------------------------------------------------------------------

describe('readFloat32 / writeFloat32', () => {
  it('round-trips (within float32 precision)', () => {
    const view = BufferView.allocate(4)
    view.writeFloat32(1.5)
    view.rewind()
    assert.equal(view.readFloat32(), 1.5)
    assert.equal(view.offset, 4)
  })
})

describe('readFloat64 / writeFloat64', () => {
  it('round-trips', () => {
    const view = BufferView.allocate(8)
    view.writeFloat64(Math.PI)
    view.rewind()
    assert.equal(view.readFloat64(), Math.PI)
    assert.equal(view.offset, 8)
  })
})

// ---------------------------------------------------------------------------
// Buffer copy helpers (getBuffer / setBuffer)
// ---------------------------------------------------------------------------

describe('getBuffer / setBuffer', () => {
  it('setBuffer writes bytes at a given offset', () => {
    const view = BufferView.allocate(4)
    view.setBuffer(1, new Uint8Array([0xaa, 0xbb]))
    assert.equal(view.getUint8(1), 0xaa)
    assert.equal(view.getUint8(2), 0xbb)
  })

  it('getBuffer reads bytes from a given offset into target', () => {
    const view = BufferView.from(new Uint8Array([1, 2, 3, 4]))
    const target = new Uint8Array(2)
    view.getBuffer(1, target)
    assert.deepEqual(Array.from(target), [2, 3])
  })

  it('getBuffer / setBuffer do not change offset', () => {
    const view = BufferView.allocate(4)
    view.offset = 2
    view.setBuffer(0, new Uint8Array([7]))
    view.getBuffer(0, new Uint8Array(1))
    assert.equal(view.offset, 2)
  })
})

// ---------------------------------------------------------------------------
// Sequential buffer copy (readBuffer / writeBuffer)
// ---------------------------------------------------------------------------

describe('readBuffer / writeBuffer', () => {
  it('writeBuffer copies bytes and advances offset', () => {
    const view = BufferView.allocate(3)
    view.writeBuffer(new Uint8Array([0x0a, 0x0b, 0x0c]))
    assert.equal(view.offset, 3)
    view.rewind()
    assert.equal(view.getUint8(0), 0x0a)
    assert.equal(view.getUint8(2), 0x0c)
  })

  it('readBuffer fills target and advances offset', () => {
    const view = BufferView.from(new Uint8Array([10, 20, 30]))
    const target = new Uint8Array(2)
    view.readBuffer(target)
    assert.equal(view.offset, 2)
    assert.deepEqual(Array.from(target), [10, 20])
  })
})

// ---------------------------------------------------------------------------
// String helpers
// ---------------------------------------------------------------------------

describe('getString / setString', () => {
  it('setString writes UTF-8 bytes and returns bytes written', () => {
    const view = BufferView.allocate(5)
    const written = view.setString(0, 'hello')
    assert.equal(written, 5)
    assert.equal(view.getString(0, 5), 'hello')
  })

  it('does not advance offset', () => {
    const view = BufferView.allocate(4)
    view.offset = 2
    view.setString(0, 'hi')
    view.getString(0, 2)
    assert.equal(view.offset, 2)
  })
})

describe('readString / writeString', () => {
  it('round-trips ASCII text and advances offset', () => {
    const view = BufferView.allocate(5)
    view.writeString('hello')
    assert.equal(view.offset, 5)
    view.rewind()
    assert.equal(view.readString(5), 'hello')
    assert.equal(view.offset, 5)
  })
})

describe('readStringZ / writeStringZ', () => {
  it('writes string with NUL terminator and reads it back', () => {
    const view = BufferView.allocate(6) // "hello" + NUL
    view.writeStringZ('hello')
    assert.equal(view.offset, 6)
    view.rewind()
    assert.equal(view.readStringZ(), 'hello')
    assert.equal(view.offset, 6)
  })

  it('readStringZ throws when NUL terminator is absent', () => {
    const view = BufferView.from(new Uint8Array([0x41, 0x42, 0x43])) // "ABC", no NUL
    assert.throws(() => view.readStringZ(), RangeError)
  })

  it('handles empty string (just NUL byte)', () => {
    const view = BufferView.allocate(1)
    view.writeStringZ('')
    view.rewind()
    assert.equal(view.readStringZ(), '')
    assert.equal(view.offset, 1)
  })
})

// ---------------------------------------------------------------------------
// Hex helpers
// ---------------------------------------------------------------------------

describe('readHex / writeHex', () => {
  it('round-trips a hex string', () => {
    const view = BufferView.allocate(4)
    view.writeHex('deadbeef')
    assert.equal(view.offset, 4)
    view.rewind()
    assert.equal(view.readHex(4), 'deadbeef')
    assert.equal(view.offset, 4)
  })

  it('pads single-digit byte values with leading zero', () => {
    const view = BufferView.from(new Uint8Array([0x00, 0x0f, 0x10]))
    assert.equal(view.readHex(3), '000f10')
  })
})

// ---------------------------------------------------------------------------
// Chaining (write methods return `this`)
// ---------------------------------------------------------------------------

describe('method chaining', () => {
  it('write methods return the same instance', () => {
    const view = BufferView.allocate(16)
    const result = view
      .writeUint8(1)
      .writeUint16(2)
      .writeUint32(3)
      .writeString('ok')
      .writeUint8(0)
    assert.equal(result, view)
  })
})

// ---------------------------------------------------------------------------
// Sequential read/write across multiple types
// ---------------------------------------------------------------------------

describe('mixed sequential read/write', () => {
  it('preserves values when interleaving different types', () => {
    const view = BufferView.allocate(1 + 2 + 4 + 8)
    view.writeUint8(0xff)
    view.writeUint16(0x1234)
    view.writeUint32(0xdeadbeef)
    view.writeBigUint64(42n)

    view.rewind()
    assert.equal(view.readUint8(), 0xff)
    assert.equal(view.readUint16(), 0x1234)
    assert.equal(view.readUint32(), 0xdeadbeef)
    assert.equal(view.readBigUint64(), 42n)
  })
})
