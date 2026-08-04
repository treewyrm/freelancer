import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import * as value from './value.js'
import type { TableValue } from './types.js'

describe('constructors', () => {
  it('takes a number literal verbatim and renders a JavaScript number', () => {
    assert.deepEqual(value.number('9e-006'), { type: 'number', literal: '9e-006' })
    assert.deepEqual(value.number(0.5), { type: 'number', literal: '0.5' })
  })

  it('composes identifiers', () => {
    assert.deepEqual(value.identifier('A', 'B'), { type: 'identifier', names: ['A', 'B'] })
  })

  it('drops undefined fields from a table so an optional property can be written inline', () => {
    assert.deepEqual(value.table({ a: 1, b: undefined }), {
      type: 'table',
      array: [],
      entries: [{ key: value.string('a'), value: value.number(1) }],
    })
  })

  // The ambiguity that would cost is a flag silently becoming a quoted word, so the identifier arm
  // is only ever reached by asking for it.
  it('infers a string from a string, never an identifier', () => {
    assert.deepEqual(value.from('SCENE'), value.string('SCENE'))
  })
})

describe('toNumber', () => {
  it('reads the literal as a quantity', () => {
    assert.equal(value.toNumber(value.number('9e-006')), 0.000009)
    assert.equal(value.toNumber(value.number('-0.9999900000000001')), -0.9999900000000001)
  })
})

describe('lookups', () => {
  // The only case-sensitive lookup in this package: these are Lua table keys read by a Lua
  // interpreter, not INI names read by a reader that folds them.
  it('finds a table entry, case-sensitively', () => {
    const table = value.table({ spatialprops: value.list(1) })

    assert.deepEqual(value.getEntry(table, 'spatialprops'), value.list(1))
    assert.equal(value.getEntry(table, 'SpatialProps'), undefined)
  })

  it('finds a global by name', () => {
    const document = [{ name: 'duration', value: value.number(1) }]

    assert.deepEqual(value.getGlobal(document, 'duration'), value.number(1))
    assert.equal(value.getGlobal(document, 'entities'), undefined)
  })
})

describe('equals', () => {
  it('recurses into tables', () => {
    assert.ok(
      value.equals(value.table({ a: value.list(1, 2) }), value.table({ a: value.list(1, 2) })),
    )
    assert.ok(!value.equals(value.table({ a: value.list(1) }), value.table({ a: value.list(2) })))
  })

  it('does not equate an identifier with the string of the same name', () => {
    assert.ok(!value.equals(value.identifier('SCENE'), value.string('SCENE')))
  })

  // Two literals that parse to the same quantity are still different files.
  it('compares numbers by literal, not by quantity', () => {
    assert.ok(!value.equals(value.number('1'), value.number('1.0')))
  })

  it('distinguishes an array part from a hash keyed the same way', () => {
    const keyed: TableValue = {
      type: 'table',
      array: [],
      entries: [{ key: value.number(1), value: value.number(7) }],
    }

    assert.ok(!value.equals(value.list(7), keyed))
  })
})
