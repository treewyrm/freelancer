import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import { Document, Property, Section, formatOf, value } from './index.js'

const document = new Document(
  new Section(
    'Good',
    new Property('nickname', value.string('commodity_gold')),
    new Property('price', value.integer(100)),
  ),
)

describe('read', () => {
  // The signature decides, never the extension: 1,251 BINI files and one text file share it in
  // retail DATA, and three more text ones sit in EXE.
  it('picks the encoding by signature', () => {
    assert.equal(formatOf(document.write('binary')), 'binary')
    assert.equal(formatOf(document.write('text')), 'text')

    assert.deepEqual(Document.read(document.write('binary')), document)
    assert.deepEqual(Document.read(document.write('text')), document)
  })

  it('accepts text that is already decoded', () => {
    assert.deepEqual(
      Document.read('[Good]\nprice = 100\n'),
      new Document(new Section('Good', new Property('price', value.integer(100)))),
    )
  })

  it('decodes text bytes as windows-1252', () => {
    const bytes = new Uint8Array(
      [...'[S]\na = 1', 0xa0].map((c) => (typeof c === 'string' ? c.charCodeAt(0) : c)),
    )
    assert.deepEqual(Document.read(bytes).sections[0]?.properties[0]?.values, [value.integer(1)])
  })
})

describe('write', () => {
  it('defaults to binary', () => {
    assert.equal(formatOf(document.write()), 'binary')
  })

  it('round-trips through either encoding', () => {
    for (const format of ['binary', 'text'] as const)
      assert.deepEqual(Document.read(document.write(format)), document)
  })
})
