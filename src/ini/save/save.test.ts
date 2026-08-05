import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import { HEADER_BYTE_LENGTH, isSave, mask, read, write } from './index.js'
import { formatOf, read as readAny, write as writeAny } from '#/ini/index.js'
import type { Document } from '#/ini/types.js'

/** Masks a body by hand, so a reader test does not depend on the writer. */
const fls1 = (body: string): Uint8Array => {
  const gene = [0x47, 0x65, 0x6e, 0x65]
  const bytes = new Uint8Array(HEADER_BYTE_LENGTH + body.length)

  bytes.set([0x46, 0x4c, 0x53, 0x31])
  for (let i = 0; i < body.length; i++)
    bytes[HEADER_BYTE_LENGTH + i] = body.charCodeAt(i) ^ (((gene[i % 4]! + i) % 256) | 0x80)

  return bytes
}

describe('isSave', () => {
  it('recognises the signature and nothing else', () => {
    assert.ok(isSave(fls1('')))
    assert.ok(!isSave(new TextEncoder().encode('[Player]\r\n')))
    assert.ok(!isSave(new Uint8Array(3)))
  })
})

describe('mask', () => {
  // The whole reason read and write share one function.
  it('is its own inverse', () => {
    const body = Uint8Array.from({ length: 1024 }, (_, i) => i & 0xff)
    assert.deepEqual(mask(mask(body)), body)
  })

  // Only the position feeds the pad, so the same byte at the same offset masks the same way
  // whatever surrounds it. This is what makes it obfuscation rather than encryption.
  it('depends on position and nothing else', () => {
    const pad = mask(new Uint8Array(512))

    assert.deepEqual(pad.subarray(0, 256), pad.subarray(256))
    for (const byte of pad) assert.ok(byte >= 0x80, 'pad must stay out of the printable range')
  })

  it('masks in place when handed its own input', () => {
    const body = Uint8Array.from([1, 2, 3, 4, 5])
    const expected = mask(body)

    assert.equal(mask(body, body), body)
    assert.deepEqual(body, expected)
  })
})

describe('read', () => {
  it('reads a section and a property from under the mask', () => {
    assert.deepEqual(read(fls1('[Player]\r\nmoney = 500\r\n')), [
      {
        name: 'Player',
        properties: [{ name: 'money', values: [{ type: 'integer', value: 500 }] }],
      },
    ])
  })

  it('reads a signature-only file as an empty document', () => {
    assert.deepEqual(read(fls1('')), [])
  })

  it('refuses an unmasked buffer rather than unmasking it anyway', () => {
    assert.throws(() => read(new TextEncoder().encode('[Player]\r\n')), TypeError)
  })
})

describe('write', () => {
  it('round-trips a document', () => {
    const document = readAny('[Player]\r\nname = Trent\r\nhouse = 0.65, li_n_grp\r\n')
    assert.deepEqual(read(write(document)), document)
  })

  it('writes the signature and masks the body', () => {
    const bytes = write([{ name: 'Player', properties: [] }])

    assert.deepEqual(
      bytes.subarray(0, HEADER_BYTE_LENGTH),
      Uint8Array.from([0x46, 0x4c, 0x53, 0x31]),
    )
    assert.ok(isSave(bytes))
    for (const byte of bytes.subarray(HEADER_BYTE_LENGTH)) assert.ok(byte >= 0x80)
  })
})

describe('the top-level entry', () => {
  const document: Document = [
    { name: 'Player', properties: [{ name: 'rank', values: [{ type: 'integer', value: 0 }] }] },
  ]

  it('routes a masked buffer here without being told to', () => {
    const bytes = write(document)

    assert.equal(formatOf(bytes), 'save')
    assert.deepEqual(readAny(bytes), document)
  })

  // A document does not remember what it was read from, so the mask has to be asked for.
  it('never masks unless the format says so', () => {
    assert.ok(!isSave(writeAny(document, 'text')))
    assert.ok(!isSave(writeAny(document, 'binary')))
    assert.ok(isSave(writeAny(document, 'save')))
  })
})
