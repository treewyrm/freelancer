import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import { Property } from './property.js'
import { Section } from './section.js'
import * as value from './value.js'

const loadout = new Section(
  'Loadout',
  new Property('nickname', value.string('li_elite')),
  new Property('equip', value.string('a')),
  '; disabled below',
  new Property('equip', value.string('b')),
  new Property('separable'),
)

describe('label', () => {
  it('is the case-folded name, leaving name untouched', () => {
    assert.equal(loadout.label, 'loadout')
    assert.equal(loadout.name, 'Loadout')
  })
})

describe('properties', () => {
  it('filters unparsed lines out of entries', () => {
    assert.deepEqual(
      loadout.properties.map(({ name }) => name),
      ['nickname', 'equip', 'equip', 'separable'],
    )
  })
})

describe('property lookup', () => {
  // A repeated property is a list. equip repeats 16,074 times across retail.
  it('returns every repeat, not just the first', () => {
    assert.equal(loadout.filterProperties('equip').length, 2)
    assert.equal(loadout.getProperty('equip')?.values[0]?.value, 'a')
  })

  it('reads a value by index', () => {
    assert.deepEqual(loadout.getValue('nickname'), value.string('li_elite'))
    assert.equal(loadout.getValue('nickname', 1), undefined)
  })

  // A property present with no values is a flag that is set, and 1,063 retail properties are that.
  // An empty array and undefined are different answers.
  it('distinguishes a valueless property from a missing one', () => {
    assert.deepEqual(loadout.getValues('separable'), [])
    assert.equal(loadout.getValues('absent'), undefined)
    assert.ok(loadout.hasProperty('separable'))
    assert.ok(!loadout.hasProperty('absent'))
  })
})

describe('nickname', () => {
  it('reads a nickname as text', () => {
    assert.equal(loadout.getNickname(), 'li_elite')
  })

  it('is undefined when the property is absent', () => {
    assert.equal(new Section('Empty').getNickname(), undefined)
  })
})

describe('building', () => {
  it('always appends a property, never find-or-replace', () => {
    const section = new Section('Good')

    section.addProperty('nickname', value.string('a'))
    section.addProperty('equip')
    section.addProperty('equip', value.string('b'))

    assert.deepEqual(
      section.properties.map(({ name }) => name),
      ['nickname', 'equip', 'equip'],
    )
  })

  it('appends unparsed lines alongside properties, preserving order', () => {
    const section = new Section('Good')
    section.append(new Property('a', value.integer(1)), '; note', new Property('b'))

    assert.equal(section.entries.length, 3)
    assert.equal(section.entries[1], '; note')
  })

  it('removes every property with a name, leaving unparsed lines untouched', () => {
    const section = new Section('Good')
    section.append(new Property('a', value.integer(1)), '; note', new Property('a', value.integer(2)))
    section.deleteProperty('a')

    assert.deepEqual(section.entries, ['; note'])
  })
})
