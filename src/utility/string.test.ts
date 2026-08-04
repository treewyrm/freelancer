import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import { equals, fold, isHex, parseHex, toHex, trim } from './string.js'

describe('fold', () => {
  it('lowers ASCII', () => {
    assert.equal(fold('ObjList'), 'objlist')
  })

  // stricmp folds ASCII and nothing else. toLowerCase would additionally fold characters
  // windows-1252 can carry, making two distinct names compare equal.
  it('leaves non-ASCII alone', () => {
    assert.equal(fold('É'), 'É')
  })
})

describe('equals', () => {
  it('matches the retail spellings of one name', () => {
    assert.ok(equals('ObjList', 'Objlist'))
    assert.ok(equals('zone', 'Zone'))
    assert.ok(equals('Exclusion Zones', 'Exclusion zones'))
  })

  it('does not match different names', () => {
    assert.ok(!equals('zone', 'zones'))
  })
})

describe('trim', () => {
  it('strips spaces and tabs', () => {
    assert.equal(trim('  a\t'), 'a')
  })

  // initialworld.ini pads numbers with U+00A0, not spaces. An ASCII-only trim leaves it stuck to
  // the value and every number in retail's one text data file fails to parse.
  it('strips the non-breaking space initialworld.ini pads with', () => {
    assert.equal(trim(' 100 '), '100')
  })
})

describe('hex helpers', () => {
  it('recognises and parses', () => {
    assert.ok(isHex('0xDEADBEEF'))
    assert.ok(!isHex('DEADBEEF'))
    assert.equal(parseHex('0x10'), 16)
    assert.ok(Number.isNaN(parseHex('10')))
  })

  it('formats', () => {
    assert.equal(toHex(16), '0x00000010')
    assert.equal(toHex(255, 1), '0xFF')
  })
})
