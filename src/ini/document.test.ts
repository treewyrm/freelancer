import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import { Document } from './document.js'
import { Property } from './property.js'
import { Section } from './section.js'
import * as value from './value.js'

const document = new Document(
  new Section(
    'Good',
    new Property('nickname', value.string('commodity_gold')),
    new Property('price', value.integer(100)),
  ),
  new Section(
    'Loadout',
    new Property('nickname', value.string('li_elite')),
    new Property('equip', value.string('a')),
    new Property('equip', value.string('b')),
    new Property('separable'),
  ),
  new Section('loadout', new Property('nickname', value.string('li_freighter'))),
)

describe('section lookup', () => {
  // Six retail section names are spelled more than one way: ObjList and Objlist, zone and Zone.
  it('folds case', () => {
    assert.equal(document.getSection('LOADOUT')?.name, 'Loadout')
  })

  it('returns every match in file order', () => {
    assert.deepEqual(
      document.filterSections('loadout').map(({ name }) => name),
      ['Loadout', 'loadout'],
    )
  })

  it('returns undefined for a name that is not there', () => {
    assert.equal(document.getSection('Base'), undefined)
  })
})

describe('iteration', () => {
  it('yields sections directly, skipping unparsed lines', () => {
    const withLines = new Document(new Section('A'), '; note', '', new Section('B'))
    assert.deepEqual(
      [...withLines].map(({ name }) => name),
      ['A', 'B'],
    )
  })
})

describe('nicknames', () => {
  // The game resolves a cross-file reference by hash, so a lookup that matches here matches there.
  it('finds a section by hashed nickname, folding case', () => {
    assert.equal(document.findByNickname('LI_ELITE')?.name, 'Loadout')
    assert.equal(document.findByNickname('li_freighter')?.name, 'loadout')
    assert.equal(document.findByNickname('nothing'), undefined)
  })
})

describe('building', () => {
  it('always appends a section, never find-or-replace', () => {
    const built = new Document()
    const section = built.addSection('Good')
    section.addProperty('nickname', value.string('a'))

    assert.equal(built.sections.length, 1)
    assert.equal(built.getSection('Good'), section)
  })

  it('appends unparsed lines alongside sections, preserving order', () => {
    const built = new Document()
    built.append(new Section('A'), '; note', new Section('B'))

    assert.equal(built.entries.length, 3)
    assert.equal(built.entries[1], '; note')
  })

  it('removes every section with a name, leaving unparsed lines untouched', () => {
    const built = new Document()
    built.append(new Section('A'), '; note', new Section('A'))
    built.deleteSection('A')

    assert.deepEqual(built.entries, ['; note'])
  })
})
