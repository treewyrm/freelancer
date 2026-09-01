import File from './file.js'
import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'

describe('File constructor', () => {
  it('stores name and defaults to empty data', () => {
    const f = new File('test.txt')
    assert.equal(f.name, 'test.txt')
    assert.equal(f.byteLength, 0)
  })

  it('stores provided data', () => {
    const data = new Uint8Array([1, 2, 3])
    const f = new File('blob', data)
    assert.equal(f.byteLength, 3)
    assert.equal(f.buffer, data.buffer)
  })
})

describe('File byteOffset / buffer', () => {
  it('delegates to the underlying data view', () => {
    const buf = new ArrayBuffer(8)
    const view = new Uint8Array(buf, 2, 4)
    const f = new File('x', view)
    assert.equal(f.buffer, buf)
    assert.equal(f.byteOffset, 2)
    assert.equal(f.byteLength, 4)
  })
})

describe('File.writeIntegers / readIntegers', () => {
  it('round-trips multiple 32-bit integers', () => {
    const f = new File('ints')
    f.writeIntegers(1, -2, 0x7fffffff)
    assert.deepEqual([...f.readIntegers()], [1, -2, 0x7fffffff])
  })

  it('yields Int16 for a 2-byte remainder after Int32 reads', () => {
    const f = new File('mixed')
    f.writeIntegers(100) // 4 bytes
    f.append(new Uint8Array([0x01, 0x00])) // 2 more bytes (LE Int16 = 1)
    const values = [...f.readIntegers()]
    assert.equal(values.length, 2)
    assert.equal(values[0], 100)
    assert.equal(values[1], 1)
  })

  it('yields Int8 for a 1-byte remainder after Int32 reads', () => {
    const f = new File('mixed')
    f.writeIntegers(100) // 4 bytes
    f.append(new Uint8Array([7])) // 1 more byte (Int8 = 7)
    const values = [...f.readIntegers()]
    assert.equal(values.length, 2)
    assert.equal(values[0], 100)
    assert.equal(values[1], 7)
  })

  it('yields nothing for an empty file', () => {
    assert.deepEqual([...new File('empty').readIntegers()], [])
  })
})

describe('File.writeFloats / readFloats', () => {
  it('round-trips 32-bit floats', () => {
    const f = new File('floats')
    f.writeFloats(1.0, -0.5, 3.14)
    const result = [...f.readFloats()]
    assert.equal(result.length, 3)
    assert.ok(Math.abs(result[0]! - 1.0) < 1e-6)
    assert.ok(Math.abs(result[1]! - -0.5) < 1e-6)
    assert.ok(Math.abs(result[2]! - 3.14) < 1e-4)
  })

  it('ignores a trailing sub-4-byte remainder', () => {
    const f = new File('floats')
    f.writeFloats(1.0) // 4 bytes
    f.append(new Uint8Array([0])) // 1 trailing byte — ignored
    assert.equal([...f.readFloats()].length, 1)
  })

  it('yields nothing for an empty file', () => {
    assert.deepEqual([...new File('empty').readFloats()], [])
  })
})

describe('File.writeStrings / readStrings', () => {
  it('round-trips a single string', () => {
    const f = new File('s')
    f.writeStrings('hello')
    assert.deepEqual([...f.readStrings()], ['hello'])
  })

  it('round-trips multiple strings', () => {
    const f = new File('s')
    f.writeStrings('alpha', 'beta', 'gamma')
    assert.deepEqual([...f.readStrings()], ['alpha', 'beta', 'gamma'])
  })

  it('round-trips an empty string', () => {
    const f = new File('s')
    f.writeStrings('')
    assert.deepEqual([...f.readStrings()], [''])
  })

  // Six Discovery models size the payload to the text exactly. Retail never does, but the game
  // reads them, so the terminator delimits rather than being required on the last run.
  it('reads a payload with no trailing NUL', () => {
    const f = new File('s', new Uint8Array([0x41, 0x42, 0x43])) // "ABC"

    assert.deepEqual([...f.readStrings()], ['ABC'])
  })

  it('reads a payload whose last run is unterminated', () => {
    const f = new File('s', new Uint8Array([0x41, 0x00, 0x42, 0x43])) // "A\0BC"

    assert.deepEqual([...f.readStrings()], ['A', 'BC'])
  })

  // The consequence: a rewrite normalizes the payload rather than reproducing it.
  it('appends the terminator a rewrite was missing', () => {
    const f = new File('s', new Uint8Array([0x41, 0x42, 0x43]))
    const result = new File('s').writeStrings(...f.readStrings())

    assert.equal(result.byteLength, 4)
    assert.deepEqual([...f.readStrings()], [...result.readStrings()])
  })
})

describe('File.append', () => {
  it('concatenates multiple buffer views', () => {
    const f = new File('x')
    f.append(new Uint8Array([1, 2]), new Uint8Array([3, 4, 5]))
    assert.equal(f.byteLength, 5)
    assert.deepEqual([...new Uint8Array(f.buffer, f.byteOffset, f.byteLength)], [1, 2, 3, 4, 5])
  })

  it('returns this for chaining', () => {
    const f = new File('x')
    assert.equal(f.append(new Uint8Array(1)), f)
  })
})

describe('File method chaining', () => {
  it('write methods return this', () => {
    const f = new File('x')
    assert.equal(f.writeIntegers(1), f)
    assert.equal(f.writeFloats(1.0), f)
    assert.equal(f.writeStrings('ok'), f)
  })
})
