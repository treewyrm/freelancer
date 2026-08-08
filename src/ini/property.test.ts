import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import { Property } from './property.js'
import * as value from './value.js'

describe('label', () => {
  // Six retail property names are spelled more than one way — nothing folds `name` in place.
  it('is the case-folded name, leaving name untouched', () => {
    const property = new Property('Zone')
    assert.equal(property.label, 'zone')
    assert.equal(property.name, 'Zone')
  })
})

describe('format', () => {
  it('coerces values positionally', () => {
    const property = new Property('pos', value.integer(1), value.string('a'), value.boolean(true))
    assert.deepEqual(property.format('float', 'string', 'boolean'), [1, 'a', true])
  })

  // A missing value comes back undefined, never a fabricated default.
  it('leaves a missing value undefined rather than defaulting it', () => {
    const property = new Property('a', value.integer(1))
    assert.deepEqual(property.format('integer', 'string'), [1, undefined])
  })
})
