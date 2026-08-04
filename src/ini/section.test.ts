import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import * as query from './section.js'
import type { Document } from './types.js'
import * as value from './value.js'

const document: Document = [
  {
    name: 'Good',
    properties: [
      { name: 'nickname', values: [value.string('commodity_gold')] },
      { name: 'price', values: [value.integer(100)] },
    ],
  },
  {
    name: 'Loadout',
    properties: [
      { name: 'nickname', values: [value.string('li_elite')] },
      { name: 'equip', values: [value.string('a')] },
      { name: 'equip', values: [value.string('b')] },
      { name: 'separable', values: [] },
    ],
  },
  { name: 'loadout', properties: [{ name: 'nickname', values: [value.string('li_freighter')] }] },
]

describe('section lookup', () => {
  // Six retail section names are spelled more than one way: ObjList and Objlist, zone and Zone.
  it('folds case', () => {
    assert.equal(query.findSection(document, 'LOADOUT')?.name, 'Loadout')
  })

  it('returns every match in file order', () => {
    assert.deepEqual(
      query.filterSections(document, 'loadout').map(({ name }) => name),
      ['Loadout', 'loadout'],
    )
  })

  it('returns undefined for a name that is not there', () => {
    assert.equal(query.findSection(document, 'Base'), undefined)
  })
})

describe('property lookup', () => {
  const loadout = query.findSection(document, 'Loadout')!

  // A repeated property is a list. equip repeats 16,074 times across retail.
  it('returns every repeat, not just the first', () => {
    assert.equal(query.filterProperties(loadout, 'equip').length, 2)
    assert.equal(query.findProperty(loadout, 'equip')?.values[0]?.value, 'a')
  })

  it('reads a value by index', () => {
    assert.deepEqual(query.getValue(loadout, 'nickname'), value.string('li_elite'))
    assert.equal(query.getValue(loadout, 'nickname', 1), undefined)
  })

  // A property present with no values is a flag that is set, and 1,063 retail properties are that.
  // An empty array and undefined are different answers.
  it('distinguishes a valueless property from a missing one', () => {
    assert.deepEqual(query.getValues(loadout, 'separable'), [])
    assert.equal(query.getValues(loadout, 'absent'), undefined)
    assert.ok(query.hasProperty(loadout, 'separable'))
    assert.ok(!query.hasProperty(loadout, 'absent'))
  })
})

describe('nicknames', () => {
  it('reads a nickname as text', () => {
    assert.equal(query.getNickname(document[0]!), 'commodity_gold')
  })

  // The game resolves a cross-file reference by hash, so a lookup that matches here matches there.
  it('finds a section by hashed nickname, folding case', () => {
    assert.equal(query.findByNickname(document, 'LI_ELITE')?.name, 'Loadout')
    assert.equal(query.findByNickname(document, 'li_freighter')?.name, 'loadout')
    assert.equal(query.findByNickname(document, 'nothing'), undefined)
  })
})

describe('building', () => {
  it('appends sections and properties in order', () => {
    const built: Document = []
    const section = query.addSection(built, 'Good')

    query.addProperty(section, 'nickname', [value.string('a')])
    query.addProperty(section, 'equip')

    assert.deepEqual(built, [
      {
        name: 'Good',
        properties: [
          { name: 'nickname', values: [value.string('a')] },
          { name: 'equip', values: [] },
        ],
      },
    ])
  })
})
