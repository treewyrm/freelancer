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

describe('inserting by identity', () => {
  // A `[LOD]` belongs to the section above it, not at the end of the file.
  it('inserts a section directly after the given one', () => {
    const built = new Document()
    const gun = new Section('Gun')
    const next = new Section('Gun')
    built.append(gun, next)

    const inserted = built.insertSection('LOD', gun)

    assert.deepEqual(built.entries, [gun, inserted, next])
  })

  it('inserts after a trailing comment rather than before it, when that is where the anchor is', () => {
    const built = new Document()
    const first = new Section('A')
    built.append(first, '; note')

    const inserted = built.insertSection('B', first)

    assert.deepEqual(built.entries, [first, inserted, '; note'])
  })

  it('appends when no anchor is given', () => {
    const built = new Document()
    const first = built.addSection('A')

    const inserted = built.insertSection('B')

    assert.deepEqual(built.entries, [first, inserted])
  })

  it('appends when the anchor belongs to another document', () => {
    const built = new Document()
    const inserted = built.insertSection('B', new Section('A'))

    assert.deepEqual(built.entries, [inserted])
  })
})

describe('removing by identity', () => {
  // Duplicate section names are legal — 156 retail files repeat one.
  it('removes only the given section, leaving its namesake and any comment above it', () => {
    const built = new Document()
    const first = new Section('A')
    const second = new Section('A')
    built.append(first, '; note', second)

    assert.ok(built.removeSection(second))
    assert.deepEqual(built.entries, [first, '; note'])
  })

  it('reports a section that is not in the document', () => {
    assert.ok(!new Document().removeSection(new Section('A')))
  })
})
