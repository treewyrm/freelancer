import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import { isBinary, read } from './read.js'
import { write } from './write.js'
import Dictionary from './dictionary.js'
import type { Document } from '../types.js'
import * as value from '../value.js'

/** Assembles a BINI by hand so a reader test does not depend on the writer. */
const bini = (sections: number[], dictionary: string): Uint8Array => {
  const names = new TextEncoder().encode(dictionary)
  const bytes = new Uint8Array(12 + sections.length + names.length)
  const view = new DataView(bytes.buffer)

  view.setUint32(0, 0x494e4942, true)
  view.setUint32(4, 1, true)
  view.setUint32(8, 12 + sections.length, true)

  bytes.set(sections, 12)
  bytes.set(names, 12 + sections.length)

  return bytes
}

describe('isBinary', () => {
  it('recognises the signature and nothing else', () => {
    assert.ok(isBinary(bini([], '')))
    assert.ok(!isBinary(new TextEncoder().encode('[Section]\n')))
    assert.ok(!isBinary(new Uint8Array(3)))
  })
})

describe('read', () => {
  it('reads a header-only file as an empty document', () => {
    assert.deepEqual(read(bini([], '')), [])
  })

  it('reads a section, a property and a string value', () => {
    const document = read(
      bini(
        [
          0x00,
          0x00, // section name at 0
          0x01,
          0x00, // one property
          0x0a,
          0x00, // property name at 10
          0x01, // one value
          0x03, // string
          0x10,
          0x00,
          0x00,
          0x00, // value at 16
        ],
        'MySection\0MyKey\0MyValue\0',
      ),
    )

    assert.deepEqual(document, [
      { name: 'MySection', properties: [{ name: 'MyKey', values: [value.string('MyValue')] }] },
    ])
  })

  // The game addresses a value as base + index * 5 before it looks at any tag, and skips a property
  // with count * 5. A boolean is four payload bytes of which only the first is read.
  it('reads a boolean from payload byte 0 and still advances five bytes', () => {
    const [section] = read(
      bini(
        [
          0x00,
          0x00,
          0x01,
          0x00,
          0x02,
          0x00,
          0x02,
          0x00,
          0x01,
          0xff,
          0xff,
          0xff, // boolean, byte 0 set, high bytes noise
          0x01,
          0x2a,
          0x00,
          0x00,
          0x00, // integer 42, only reachable if the stride was 5
        ],
        'A\0B\0',
      ),
    )

    assert.deepEqual(section?.properties[0]?.values, [value.boolean(true), value.integer(42)])
  })

  it('reads a boolean with a zero first byte as false however the rest is set', () => {
    const [section] = read(
      bini([0x00, 0x00, 0x01, 0x00, 0x02, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x80], 'A\0B\0'),
    )

    assert.deepEqual(section?.properties[0]?.values, [value.boolean(false)])
  })

  it('reads integers and floats', () => {
    const bytes = bini(
      [0x00, 0x00, 0x01, 0x00, 0x02, 0x00, 0x02, 0x01, 0, 0, 0, 0, 0x02, 0, 0, 0, 0],
      'A\0B\0',
    )

    // Header 12, section 4, property 3, then tag bytes at 19 and 24 with their payloads after.
    new DataView(bytes.buffer).setInt32(20, -42, true)
    new DataView(bytes.buffer).setFloat32(25, 1.5, true)

    assert.deepEqual(read(bytes)[0]?.properties[0]?.values, [value.integer(-42), value.float(1.5)])
  })

  it('rejects a bad signature, version and value type', () => {
    const good = bini([0x00, 0x00, 0x00, 0x00], 'A\0')

    const badSignature = good.slice()
    badSignature[0] = 0
    assert.throws(() => read(badSignature), TypeError)

    const badVersion = good.slice()
    new DataView(badVersion.buffer).setUint32(4, 2, true)
    assert.throws(() => read(badVersion), RangeError)

    assert.throws(
      () => read(bini([0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x04, 0, 0, 0, 0], 'A\0')),
      TypeError,
    )
  })

  it('rejects a dictionary offset outside the file', () => {
    const bytes = bini([], '')
    new DataView(bytes.buffer).setUint32(8, 0xffff, true)
    assert.throws(() => read(bytes), RangeError)
  })

  it('rejects records that overrun the dictionary', () => {
    // Declares one property but the section block ends immediately.
    assert.throws(() => read(bini([0x00, 0x00, 0x01, 0x00], 'A\0')), RangeError)
  })
})

describe('Dictionary', () => {
  it('returns sequential offsets and shares an exact repeat', () => {
    const dictionary = new Dictionary()

    assert.equal(dictionary.push('Root'), 0)
    assert.equal(dictionary.push('Child'), 5)
    assert.equal(dictionary.push('Root'), 0)
    assert.equal(dictionary.byteLength, 11)
  })

  // Six retail section names and 32 property names are spelled more than one way. Folding here
  // would hand one the other's offset and rewrite the spelling.
  it('gives names differing only in case an entry each', () => {
    const dictionary = new Dictionary()

    assert.notEqual(dictionary.push('zone'), dictionary.push('Zone'))
    assert.equal(dictionary.byteLength, 10)
  })
})

describe('write', () => {
  const document: Document = [
    {
      name: 'Good',
      properties: [
        { name: 'nickname', values: [value.string('commodity_gold')] },
        { name: 'price', values: [value.integer(100)] },
        { name: 'bad_sell_price', values: [value.float(100)] },
        { name: 'separable', values: [] },
      ],
    },
  ]

  it('round-trips a document', () => {
    assert.deepEqual(read(write(document)), document)
  })

  it('is a fixed point', () => {
    const once = write(document)
    assert.deepEqual(write(read(once)), once)
  })

  // 14,209 retail values are float-typed with an integral value. A model that dropped the tag would
  // write these back as integers.
  it('keeps an integral float a float', () => {
    const [section] = read(
      write([{ name: 'S', properties: [{ name: 'a', values: [value.float(3)] }] }]),
    )
    assert.equal(section?.properties[0]?.values[0]?.type, 'float')
  })

  it('shares one dictionary entry between a name and an equal string value', () => {
    const bytes = write([{ name: 'a', properties: [{ name: 'a', values: [value.string('a')] }] }])

    // Header, one 4-byte section, one 3-byte property, one 5-byte value, then "a\0" once.
    assert.equal(bytes.length, 12 + 4 + 3 + 5 + 2)
  })

  it('places every name ahead of every value', () => {
    const bytes = write([{ name: 'S', properties: [{ name: 'p', values: [value.string('v')] }] }])

    const dictionary = new TextDecoder().decode(bytes.subarray(12 + 4 + 3 + 5))
    assert.equal(dictionary, 'S\0p\0v\0')
  })

  it('refuses more values than the count field holds', () => {
    const values = Array.from({ length: 256 }, () => value.integer(0))
    assert.throws(() => write([{ name: 'S', properties: [{ name: 'p', values }] }]), RangeError)
  })

  it('refuses a name block past the uint16 limit', () => {
    // Each section name is unique and 200 bytes, so the name block passes 64 KiB well before the end.
    const document: Document = Array.from({ length: 400 }, (_, index) => ({
      name: String(index).padStart(200, 'x'),
      properties: [],
    }))

    assert.throws(() => write(document), RangeError)
  })
})
