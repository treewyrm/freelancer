import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import { read } from './read.js'
import { write } from './write.js'
import { Document } from '#/ini/document.js'
import { Property } from '#/ini/property.js'
import { Section } from '#/ini/section.js'
import * as value from '#/ini/value.js'

describe('read', () => {
  it('reads sections and properties in order', () => {
    const document = read('[Good]\nnickname = commodity_gold\nprice = 100\n')

    assert.equal(document.sections.length, 1)
    assert.equal(document.sections[0]?.name, 'Good')
    assert.deepEqual(
      document.sections[0]?.properties.map(({ name }) => name),
      ['nickname', 'price'],
    )
  })

  it('keeps duplicate sections and properties', () => {
    const document = read('[Loadout]\nequip = a\nequip = b\n[Loadout]\nequip = c\n')

    assert.equal(document.sections.length, 2)
    assert.equal(document.sections[0]?.properties.length, 2)
  })

  it('infers integer, float and string', () => {
    const [section] = read('[S]\na = 100\nb = 100.0\nc = li_elite\n').sections

    assert.deepEqual(
      section?.properties.map(({ values }) => values[0]?.type),
      ['integer', 'float', 'string'],
    )
  })

  it('splits values on commas and trims each', () => {
    const [section] = read('[S]\npos = 1, 2 ,3\n').sections
    assert.deepEqual(section?.properties[0]?.values.map(value.toInteger), [1, 2, 3])
  })

  it('reads a property with no equals sign as zero values', () => {
    const [section] = read('[CollisionGroup]\nseparable\n').sections

    assert.equal(section?.properties[0]?.name, 'separable')
    assert.deepEqual(section?.properties[0]?.values, [])
  })

  it('reads an equals sign with nothing after it as zero values', () => {
    const [section] = read('[S]\nempty =\n').sections
    assert.deepEqual(section?.properties[0]?.values, [])
  })

  // Distinct from zero values: a lone comma is two empty strings, and retail carries 102 of those.
  it('reads a lone comma as two empty values', () => {
    const [section] = read('[S]\na = ,\n').sections
    assert.deepEqual(section?.properties[0]?.values, [value.string(''), value.string('')])
  })

  it('keeps a comment-only line and a blank line, in position', () => {
    const document = read('; header\n\n[S]\n; note\na = 1\n')

    assert.deepEqual(document.entries.slice(0, 2), ['; header', ''])

    const [section] = document.sections
    assert.deepEqual(section?.entries[0], '; note')
    assert.ok(section?.entries[1] instanceof Property)
  })

  it('keeps a trailing comment on a property line', () => {
    const [section] = read('[S]\na = 1 ; note\n').sections
    assert.equal(section?.getProperty('a')?.comment, 'note')
  })

  it('keeps a trailing comment on a section header line', () => {
    const [section] = read('[S] ; note\na = 1\n').sections
    assert.equal(section?.comment, 'note')
  })

  // A line before any section has nowhere to attach a property, so it is kept verbatim rather than
  // parsed — this is also where a game-ignored stray line ends up now, preserved instead of dropped.
  it('keeps a line before any section as a document-level line', () => {
    const document = read('stray = 1\n')
    assert.deepEqual(document.entries, ['stray = 1'])
  })

  // EXE/freelancer.ini carries [;Display]: a section commented out by prefixing its name, which
  // therefore matches nothing. Testing for the comment character first would lose the section.
  it('keeps a section whose name starts with a semicolon', () => {
    const [section] = read('[;Display]\na = 1\n').sections

    assert.equal(section?.name, ';Display')
    assert.equal(section?.properties.length, 1)
  })

  // INTERFACE/keymap.ini carries [keymap=1.1]. A section name is opaque text, not an identifier.
  it('keeps an equals sign inside a section name', () => {
    assert.equal(read('[keymap=1.1]\n').sections[0]?.name, 'keymap=1.1')
  })

  it('keeps a space inside a section name', () => {
    assert.equal(read('[Exclusion Zones]\n').sections[0]?.name, 'Exclusion Zones')
  })

  // MISSIONS/M12/m12.ini carries [Trigger] system St02 — authoring residue the compiler preserved.
  it('keeps a space inside a property name', () => {
    assert.equal(read('[Trigger]\nsystem St02\n').sections[0]?.properties[0]?.name, 'system St02')
  })

  // initialworld.ini pads its numbers with U+00A0 rather than spaces.
  it('trims the non-breaking space initialworld.ini pads with', () => {
    const [section] = read('[S]\nlocked_gates = 100 , 200\n').sections
    assert.deepEqual(section?.properties[0]?.values, [value.integer(100), value.integer(200)])
  })

  it('accepts CRLF, LF and CR', () => {
    for (const newline of ['\r\n', '\n', '\r'])
      assert.equal(read(`[A]${newline}a = 1${newline}[B]${newline}`).sections.length, 2)
  })
})

describe('write', () => {
  it('writes sections back to back, with no blank line unless one is data', () => {
    const text = write(
      new Document(new Section('A', new Property('a', value.integer(1))), new Section('B')),
    )

    assert.equal(text, '[A]\r\na = 1\r\n[B]\r\n')
  })

  it('writes a blank line entry as a blank line', () => {
    const text = write(
      new Document(new Section('A', new Property('a', value.integer(1))), '', new Section('B')),
    )

    assert.equal(text, '[A]\r\na = 1\r\n\r\n[B]\r\n')
  })

  it('writes a property with no values as a bare name', () => {
    const text = write(new Document(new Section('S', new Property('separable'))), {
      newline: '\n',
    })

    assert.equal(text, '[S]\nseparable\n')
  })

  it('joins values with a comma and a space', () => {
    const text = write(new Document(new Section('S', new Property('pos', ...value.list(1, 2, 3)))), {
      newline: '\n',
    })

    assert.equal(text, '[S]\npos = 1, 2, 3\n')
  })

  it('writes a trailing comment after a property and after a section header', () => {
    const section = new Section('S', new Property('a', value.integer(1)))
    section.comment = 'section note'
    section.properties[0]!.comment = 'property note'

    const text = write(new Document(section), { newline: '\n' })
    assert.equal(text, '[S] ; section note\na = 1 ; property note\n')
  })

  it('writes nothing for an empty document', () => {
    assert.equal(write(new Document()), '')
  })
})

describe('round-trip', () => {
  const document = new Document(
    new Section(
      'Good',
      new Property('nickname', value.string('commodity_gold')),
      new Property('price', value.integer(100)),
      new Property('bad_sell_price', value.float(100)),
      new Property('lootable', value.string('true')),
      new Property('separable'),
    ),
  )

  it('is a fixed point', () => {
    const once = write(document)
    assert.deepEqual(read(once), document)
    assert.equal(write(read(once)), once)
  })

  // The one type that does not survive, and the one type retail never uses: the text form has no
  // boolean syntax, so true comes back as the string the compiler would also have produced.
  it('loses a boolean to a string, as the format requires', () => {
    const [section] = read(write(new Document(new Section('S', new Property('a', value.boolean(true)))))).sections
    assert.deepEqual(section?.properties[0]?.values, [value.string('true')])
  })

  it('preserves comments and blank lines through a read-write round trip', () => {
    const text =
      '; header\r\n\r\n[Good]\r\n; note\r\nprice = 100 ; gold\r\n\r\n[Bad]\r\n'
    assert.equal(write(read(text), { newline: '\r\n' }), text)
  })
})
