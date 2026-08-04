import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import { read } from './read.js'
import { write } from './write.js'
import * as value from '#/ini/value.js'

describe('read', () => {
  it('reads sections and properties in order', () => {
    const document = read('[Good]\nnickname = commodity_gold\nprice = 100\n')

    assert.equal(document.length, 1)
    assert.equal(document[0]?.name, 'Good')
    assert.deepEqual(
      document[0]?.properties.map(({ name }) => name),
      ['nickname', 'price'],
    )
  })

  it('keeps duplicate sections and properties', () => {
    const document = read('[Loadout]\nequip = a\nequip = b\n[Loadout]\nequip = c\n')

    assert.equal(document.length, 2)
    assert.equal(document[0]?.properties.length, 2)
  })

  it('infers integer, float and string', () => {
    const [section] = read('[S]\na = 100\nb = 100.0\nc = li_elite\n')

    assert.deepEqual(
      section?.properties.map(({ values }) => values[0]?.type),
      ['integer', 'float', 'string'],
    )
  })

  it('splits values on commas and trims each', () => {
    const [section] = read('[S]\npos = 1, 2 ,3\n')
    assert.deepEqual(section?.properties[0]?.values.map(value.toInteger), [1, 2, 3])
  })

  it('reads a property with no equals sign as zero values', () => {
    const [section] = read('[CollisionGroup]\nseparable\n')

    assert.equal(section?.properties[0]?.name, 'separable')
    assert.deepEqual(section?.properties[0]?.values, [])
  })

  it('reads an equals sign with nothing after it as zero values', () => {
    const [section] = read('[S]\nempty =\n')
    assert.deepEqual(section?.properties[0]?.values, [])
  })

  // Distinct from zero values: a lone comma is two empty strings, and retail carries 102 of those.
  it('reads a lone comma as two empty values', () => {
    const [section] = read('[S]\na = ,\n')
    assert.deepEqual(section?.properties[0]?.values, [value.string(''), value.string('')])
  })

  it('drops comments and blank lines', () => {
    const [section] = read('; header\n\n[S]\n; note\na = 1 ; trailing\n')

    assert.equal(section?.properties.length, 1)
    assert.deepEqual(section?.properties[0]?.values, [value.integer(1)])
  })

  it('ignores properties before any section', () => {
    assert.deepEqual(read('stray = 1\n'), [])
  })

  // EXE/freelancer.ini carries [;Display]: a section commented out by prefixing its name, which
  // therefore matches nothing. Testing for the comment character first would lose the section.
  it('keeps a section whose name starts with a semicolon', () => {
    const [section] = read('[;Display]\na = 1\n')

    assert.equal(section?.name, ';Display')
    assert.equal(section?.properties.length, 1)
  })

  // INTERFACE/keymap.ini carries [keymap=1.1]. A section name is opaque text, not an identifier.
  it('keeps an equals sign inside a section name', () => {
    assert.equal(read('[keymap=1.1]\n')[0]?.name, 'keymap=1.1')
  })

  it('keeps a space inside a section name', () => {
    assert.equal(read('[Exclusion Zones]\n')[0]?.name, 'Exclusion Zones')
  })

  // MISSIONS/M12/m12.ini carries [Trigger] system St02 — authoring residue the compiler preserved.
  it('keeps a space inside a property name', () => {
    assert.equal(read('[Trigger]\nsystem St02\n')[0]?.properties[0]?.name, 'system St02')
  })

  // initialworld.ini pads its numbers with U+00A0 rather than spaces.
  it('trims the non-breaking space initialworld.ini pads with', () => {
    const [section] = read('[S]\nlocked_gates = 100 , 200\n')
    assert.deepEqual(section?.properties[0]?.values, [value.integer(100), value.integer(200)])
  })

  it('accepts CRLF, LF and CR', () => {
    for (const newline of ['\r\n', '\n', '\r'])
      assert.equal(read(`[A]${newline}a = 1${newline}[B]${newline}`).length, 2)
  })
})

describe('write', () => {
  it('writes sections separated by a blank line', () => {
    const text = write([
      { name: 'A', properties: [{ name: 'a', values: [value.integer(1)] }] },
      { name: 'B', properties: [] },
    ])

    assert.equal(text, '[A]\r\na = 1\r\n\r\n[B]\r\n')
  })

  it('writes a property with no values as a bare name', () => {
    const text = write([{ name: 'S', properties: [{ name: 'separable', values: [] }] }], {
      newline: '\n',
    })

    assert.equal(text, '[S]\nseparable\n')
  })

  it('joins values with a comma and a space', () => {
    const text = write(
      [{ name: 'S', properties: [{ name: 'pos', values: value.list(1, 2, 3) }] }],
      { newline: '\n' },
    )

    assert.equal(text, '[S]\npos = 1, 2, 3\n')
  })

  it('writes nothing for an empty document', () => {
    assert.equal(write([]), '')
  })
})

describe('round-trip', () => {
  const document = [
    {
      name: 'Good',
      properties: [
        { name: 'nickname', values: [value.string('commodity_gold')] },
        { name: 'price', values: [value.integer(100)] },
        { name: 'bad_sell_price', values: [value.float(100)] },
        { name: 'lootable', values: [value.string('true')] },
        { name: 'separable', values: [] },
      ],
    },
  ]

  it('is a fixed point', () => {
    const once = write(document)
    assert.deepEqual(read(once), document)
    assert.equal(write(read(once)), once)
  })

  // The one type that does not survive, and the one type retail never uses: the text form has no
  // boolean syntax, so true comes back as the string the compiler would also have produced.
  it('loses a boolean to a string, as the format requires', () => {
    const [section] = read(
      write([{ name: 'S', properties: [{ name: 'a', values: [value.boolean(true)] }] }]),
    )
    assert.deepEqual(section?.properties[0]?.values, [value.string('true')])
  })
})
