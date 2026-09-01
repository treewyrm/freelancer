import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import * as value from './value.js'
import type { Value } from './types.js'

describe('constructors', () => {
  it('narrows a float to the precision the file stores', () => {
    assert.equal(value.float(0.1).value, Math.fround(0.1))
  })

  it('refuses an integer the field cannot hold', () => {
    assert.throws(() => value.integer(0x80000000), RangeError)
    assert.throws(() => value.integer(1.5), RangeError)
  })
})

describe('from', () => {
  it('infers integer for a whole number and float otherwise', () => {
    assert.equal(value.from(100).type, 'integer')
    assert.equal(value.from(100.5).type, 'float')
  })

  it('infers float for a whole number past int32', () => {
    assert.equal(value.from(4e9).type, 'float')
  })

  it('infers boolean and string from their primitives', () => {
    assert.equal(value.from(true).type, 'boolean')
    assert.equal(value.from('li_elite').type, 'string')
  })
})

describe('type guards', () => {
  // Every one of these is a test of the tag the file recorded, not of the number in it — which
  // is the whole reason Value carries a tag at all.
  const values = {
    boolean: value.boolean(true),
    integer: value.integer(100),
    float: value.float(100),
    string: value.string('100'),
  }

  const matched = (guard: (value: Value) => boolean) =>
    Object.entries(values)
      .filter(([, value]) => guard(value))
      .map(([type]) => type)

  it('matches exactly the tag each guard names', () => {
    assert.deepEqual(matched(value.isBoolean), ['boolean'])
    assert.deepEqual(matched(value.isInteger), ['integer'])
    assert.deepEqual(matched(value.isFloat), ['float'])
    assert.deepEqual(matched(value.isString), ['string'])
  })

  it('matches either numeric tag as a number', () => {
    assert.deepEqual(matched(value.isNumber), ['integer', 'float'])
  })

  // 14,209 retail floats hold an integral value, so the tag is the only thing separating these
  // two — a guard reading the number would call both of them integers.
  it('separates a float holding a whole number from an integer', () => {
    assert.equal(value.isFloat(value.float(100)), true)
    assert.equal(value.isInteger(value.float(100)), false)
  })

  // A flag in a retail file is the string `true`, not a boolean: booleans occur zero times in
  // 876,034 values, so isBoolean is a test for hand-built data and isString is what matches one.
  it('reads a retail flag as a string rather than a boolean', () => {
    assert.equal(value.isBoolean(value.string('true')), false)
    assert.equal(value.isString(value.string('true')), true)
  })
})

describe('toBoolean', () => {
  it('reads the string spellings the engine accepts, case-insensitively', () => {
    assert.equal(value.toBoolean(value.string('true')), true)
    assert.equal(value.toBoolean(value.string('TRUE')), true)
    assert.equal(value.toBoolean(value.string('false')), false)
  })

  // The engine falls through to atoi for anything that is not spelled true or false, so yes is
  // false. That is get_value_bool's behaviour, not an oversight here.
  it('reads yes as false, the way the engine does', () => {
    assert.equal(value.toBoolean(value.string('yes')), false)
  })

  it('reads a non-zero number as true', () => {
    assert.equal(value.toBoolean(value.integer(1)), true)
    assert.equal(value.toBoolean(value.integer(0)), false)
    assert.equal(value.toBoolean(value.float(0.5)), true)
  })

  it('reads a numeric string through atoi', () => {
    assert.equal(value.toBoolean(value.string('1')), true)
    assert.equal(value.toBoolean(value.string('0')), false)
  })
})

describe('toInteger', () => {
  // The engine reaches a float through __ftol, which truncates toward zero.
  it('truncates a float toward zero rather than rounding', () => {
    assert.equal(value.toInteger(value.float(1.9)), 1)
    assert.equal(value.toInteger(value.float(-1.9)), -1)
  })

  it('reads a string through atoi', () => {
    assert.equal(value.toInteger(value.string('12abc')), 12)
    assert.equal(value.toInteger(value.string('abc')), 0)
  })

  it('reads a boolean as 1 or 0', () => {
    assert.equal(value.toInteger(value.boolean(true)), 1)
    assert.equal(value.toInteger(value.boolean(false)), 0)
  })
})

describe('toFloat', () => {
  it('reads a string through atof', () => {
    assert.equal(value.toFloat(value.string('1.5')), 1.5)
    assert.equal(value.toFloat(value.string('abc')), 0)
  })

  it('reads an integer as itself', () => {
    assert.equal(value.toFloat(value.integer(-42)), -42)
  })
})

describe('toText', () => {
  it('keeps a float a float', () => {
    assert.equal(value.toText(value.float(3)), '3.0')
    assert.equal(value.toText(value.integer(3)), '3')
  })

  it('renders a string as itself', () => {
    assert.equal(value.toText(value.string('li_elite')), 'li_elite')
  })
})

describe('equals', () => {
  // The tag is part of the value. An integer 3 and a float 3 read the same and are different
  // values, which is exactly why the model carries the tag at all.
  it('does not equate an integer with a float of the same magnitude', () => {
    assert.ok(!value.equals(value.integer(3), value.float(3)))
  })

  it('equates identical values', () => {
    assert.ok(value.equals(value.string('a'), value.string('a')))
    assert.ok(value.equals(value.float(1.5), value.float(1.5)))
  })
})
