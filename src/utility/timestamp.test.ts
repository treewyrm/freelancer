import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import { toDOSTimestamp, fromDOSTimestamp, toFileTime, fromFileTime } from './timestamp.js'

// ---------------------------------------------------------------------------
// DOS timestamp — encoding
// ---------------------------------------------------------------------------

describe('toDOSTimestamp', () => {
  it('encodes each field into the correct bit positions', () => {
    // 2003-03-05 12:34:56
    const ts = toDOSTimestamp(new Date(2003, 2, 5, 12, 34, 56))
    assert.equal((ts >>> 25) & 0x7f, 23)  // year: 2003 - 1980
    assert.equal((ts >>> 21) & 0x0f, 3)   // month: March (1-based)
    assert.equal((ts >>> 16) & 0x1f, 5)   // day
    assert.equal((ts >>> 11) & 0x1f, 12)  // hour
    assert.equal((ts >>> 5) & 0x3f, 34)   // minute
    assert.equal(ts & 0x1f, 28)           // second: 56 >> 1
  })

  it('encodes the earliest representable date (1980-01-01 00:00:00)', () => {
    const ts = toDOSTimestamp(new Date(1980, 0, 1, 0, 0, 0))
    assert.equal((ts >>> 25) & 0x7f, 0)
    assert.equal((ts >>> 21) & 0x0f, 1)
    assert.equal((ts >>> 16) & 0x1f, 1)
    assert.equal((ts >>> 11) & 0x1f, 0)
    assert.equal((ts >>> 5) & 0x3f, 0)
    assert.equal(ts & 0x1f, 0)
  })
})

// ---------------------------------------------------------------------------
// DOS timestamp — decoding
// ---------------------------------------------------------------------------

describe('fromDOSTimestamp', () => {
  it('decodes each field from the correct bit positions', () => {
    // Manually constructed: 2003-03-05 12:34:56
    const ts =
      28 |            // second: 56 >> 1 = 28
      (34 << 5) |     // minute
      (12 << 11) |    // hour
      (5 << 16) |     // day
      (3 << 21) |     // month (1-based)
      (23 << 25)      // year: 2003 - 1980

    const date = fromDOSTimestamp(ts)
    assert.equal(date.getFullYear(), 2003)
    assert.equal(date.getMonth(), 2)
    assert.equal(date.getDate(), 5)
    assert.equal(date.getHours(), 12)
    assert.equal(date.getMinutes(), 34)
    assert.equal(date.getSeconds(), 56)
  })
})

// ---------------------------------------------------------------------------
// DOS timestamp — round-trip
// ---------------------------------------------------------------------------

describe('toDOSTimestamp / fromDOSTimestamp round-trip', () => {
  it('preserves a typical date with even seconds', () => {
    const date = new Date(2003, 2, 5, 12, 34, 56)
    const result = fromDOSTimestamp(toDOSTimestamp(date))
    assert.equal(result.getFullYear(), 2003)
    assert.equal(result.getMonth(), 2)
    assert.equal(result.getDate(), 5)
    assert.equal(result.getHours(), 12)
    assert.equal(result.getMinutes(), 34)
    assert.equal(result.getSeconds(), 56)
  })

  it('truncates odd seconds down to the nearest even second', () => {
    // 7 seconds → stored as 3 → decoded as 6
    const result = fromDOSTimestamp(toDOSTimestamp(new Date(2000, 0, 1, 0, 0, 7)))
    assert.equal(result.getSeconds(), 6)
  })

  it('round-trips the max representable date (2107-12-31 23:59:58)', () => {
    const date = new Date(2107, 11, 31, 23, 59, 58)
    const result = fromDOSTimestamp(toDOSTimestamp(date))
    assert.equal(result.getFullYear(), 2107)
    assert.equal(result.getMonth(), 11)
    assert.equal(result.getDate(), 31)
    assert.equal(result.getHours(), 23)
    assert.equal(result.getMinutes(), 59)
    assert.equal(result.getSeconds(), 58)
  })

  it('round-trips the earliest representable date (1980-01-01 00:00:00)', () => {
    const date = new Date(1980, 0, 1, 0, 0, 0)
    const result = fromDOSTimestamp(toDOSTimestamp(date))
    assert.equal(result.getFullYear(), 1980)
    assert.equal(result.getMonth(), 0)
    assert.equal(result.getDate(), 1)
    assert.equal(result.getHours(), 0)
    assert.equal(result.getMinutes(), 0)
    assert.equal(result.getSeconds(), 0)
  })
})

// ---------------------------------------------------------------------------
// Windows FILETIME — encoding
// ---------------------------------------------------------------------------

describe('toFileTime', () => {
  it('returns a bigint', () => {
    assert.equal(typeof toFileTime(new Date()), 'bigint')
  })

  it('converts the Unix epoch (1970-01-01) to the correct 100-ns offset from 1601-01-01', () => {
    assert.equal(toFileTime(new Date(0)), 116444736000000000n)
  })

  it('encodes a later date larger than the Unix epoch FILETIME', () => {
    assert.ok(toFileTime(new Date(2003, 2, 5)) > 116444736000000000n)
  })
})

// ---------------------------------------------------------------------------
// Windows FILETIME — decoding
// ---------------------------------------------------------------------------

describe('fromFileTime', () => {
  it('converts the Unix epoch FILETIME back to 1970-01-01', () => {
    assert.equal(fromFileTime(116444736000000000n).getTime(), 0)
  })
})

// ---------------------------------------------------------------------------
// Windows FILETIME — round-trip
// ---------------------------------------------------------------------------

describe('toFileTime / fromFileTime round-trip', () => {
  it('preserves millisecond precision', () => {
    const date = new Date(2003, 2, 5, 12, 34, 56, 789)
    assert.equal(fromFileTime(toFileTime(date)).getTime(), date.getTime())
  })

  it('round-trips a date before the Unix epoch', () => {
    const date = new Date(1950, 5, 15, 8, 0, 0, 0)
    assert.equal(fromFileTime(toFileTime(date)).getTime(), date.getTime())
  })
})
