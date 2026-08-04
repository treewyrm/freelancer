import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import { atof, atoi, classify, formatFloat32, formatInt32, isInt32 } from './number.js'

describe('atoi', () => {
  it('reads a leading integer', () => {
    assert.equal(atoi('42'), 42)
    assert.equal(atoi('-42'), -42)
    assert.equal(atoi('+42'), 42)
  })

  it('stops at the first character that is not a digit', () => {
    assert.equal(atoi('12abc'), 12)
    assert.equal(atoi('3.9'), 3)
  })

  it('skips leading whitespace', () => {
    assert.equal(atoi('   7'), 7)
  })

  it('yields 0 for anything unparseable rather than failing', () => {
    assert.equal(atoi('abc'), 0)
    assert.equal(atoi(''), 0)
  })

  // The engine reaches strings through atoi, which knows no prefixes. Reading 0x10 as 16 here would
  // disagree with the game, which sees 0.
  it('does not recognise a hexadecimal prefix', () => {
    assert.equal(atoi('0x10'), 0)
  })
})

describe('atof', () => {
  it('reads a leading float', () => {
    assert.equal(atof('1.5'), 1.5)
    assert.equal(atof('-1.5'), -1.5)
    assert.equal(atof('.5'), 0.5)
  })

  it('reads an exponent', () => {
    assert.equal(atof('1e3'), 1000)
  })

  it('stops at the first character that does not belong', () => {
    assert.equal(atof('1.5x'), 1.5)
  })

  it('yields 0 for anything unparseable', () => {
    assert.equal(atof('abc'), 0)
  })
})

describe('isInt32', () => {
  it('accepts the bounds', () => {
    assert.ok(isInt32(0x7fffffff))
    assert.ok(isInt32(-0x80000000))
  })

  it('rejects past the bounds and non-integers', () => {
    assert.ok(!isInt32(0x80000000))
    assert.ok(!isInt32(-0x80000001))
    assert.ok(!isInt32(1.5))
  })
})

describe('formatInt32', () => {
  it('round-trips', () => {
    assert.equal(formatInt32(0), '0')
    assert.equal(formatInt32(-42), '-42')
    assert.equal(formatInt32(0x7fffffff), '2147483647')
  })
})

describe('formatFloat32', () => {
  // String(0.1 widened from float32) is 0.10000000149011612. The shortest form that reads back as
  // the same float32 is what the source text said.
  it('finds the shortest decimal that reads back as the same float32', () => {
    assert.equal(formatFloat32(Math.fround(0.1)), '0.1')
    assert.equal(formatFloat32(Math.fround(1 / 3)), '0.33333334')
  })

  // 14,209 retail values are float-typed with an integral value. Printing one as `3` would have it
  // re-read as an integer, changing the type tag and costing byte-exactness back to BINI.
  it('keeps an integral float a float', () => {
    assert.equal(formatFloat32(3), '3.0')
    assert.equal(formatFloat32(-96), '-96.0')
    assert.equal(formatFloat32(0), '0.0')
  })

  it('distinguishes negative zero', () => {
    assert.equal(formatFloat32(-0), '-0.0')
  })

  it('round-trips every value it prints', () => {
    for (const value of [0.1, 1 / 3, 1e-8, 1.5e20, 123.456, -7.25, 65504, 1e-38])
      assert.equal(Math.fround(Number(formatFloat32(Math.fround(value)))), Math.fround(value))
  })

  it('refuses values with no text form', () => {
    assert.throws(() => formatFloat32(NaN), RangeError)
    assert.throws(() => formatFloat32(Infinity), RangeError)
  })
})

describe('classify', () => {
  it('reads decimal integers as integers', () => {
    assert.equal(classify('100'), 'integer')
    assert.equal(classify('-100'), 'integer')
  })

  it('reads anything with a point or an exponent as a float', () => {
    assert.equal(classify('100.0'), 'float')
    assert.equal(classify('.5'), 'float')
    assert.equal(classify('1e3'), 'float')
  })

  // initialworld.ini writes locked_gate = 2926089285, a uint32 nickname hash. As a float32 that
  // comes back 2926089248 — a different object. Keeping the digits beats inventing a type.
  it('leaves a whole number too large for int32 a string', () => {
    assert.equal(classify('4000000000'), 'string')
    assert.equal(classify('2926089285'), 'string')
  })

  it('still reads a large number written with a point as a float', () => {
    assert.equal(classify('4000000000.0'), 'float')
  })

  // 12,699 retail string values are spelled true or false. Promoting them to booleans would rewrite
  // their type tag, and the game reads them as flags by string comparison anyway.
  it('leaves true and false as strings', () => {
    assert.equal(classify('true'), 'string')
    assert.equal(classify('false'), 'string')
  })

  it('leaves hexadecimal and everything else as strings', () => {
    assert.equal(classify('0x10'), 'string')
    assert.equal(classify('li_elite'), 'string')
    assert.equal(classify(''), 'string')
  })
})
