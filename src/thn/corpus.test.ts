import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import * as corpus from '../corpus.js'
import * as bytecode from './bytecode/index.js'
import * as text from './text/index.js'
import { formatOf, read } from './index.js'
import type { Document, Value } from './types.js'

/**
 * The scene script readers against the retail install.
 *
 * Every count asserted here was measured before the code existed and is written down in
 * [THN.md](../../docs/THN.md), so a failure means the reader drifted rather than that the number
 * needs updating. Skips itself with a reason when no install is present.
 */
describe('retail scene scripts', { skip: corpus.skip }, () => {
  const assets = corpus.load(corpus.root, '**/*.thn')
  const documents = new Map<string, Document>()

  it('holds 1,506 scripts, all of them compiled Lua 3.2', () => {
    assert.equal(assets.length, 1506)
    assert.equal(assets.filter(({ data }) => formatOf(data) === 'bytecode').length, 1506)
  })

  it('reads every one of them', () => {
    for (const { path, data } of assets) documents.set(path, read(data))

    assert.equal(documents.size, 1506)
  })

  // `SETGLOBAL` fires 4,518 times, which is 3 × 1,506: the whole format is `duration` plus two
  // arrays of records, and nothing in retail assigns a fourth name.
  it('assigns exactly duration, entities and events in every script', () => {
    const shapes = new Set<string>()
    let assignments = 0

    for (const document of documents.values()) {
      assignments += document.length
      shapes.add(document.map(({ name }) => name).join(','))
    }

    assert.equal(assignments, 4518)
    assert.deepEqual([...shapes], ['duration,entities,events'])
  })

  /** Walks every value in every script once. */
  const walk = (visit: (value: Value) => void): void => {
    const descend = (value: Value): void => {
      visit(value)

      if (value.type !== 'table') return

      for (const item of value.array) descend(item)
      for (const { key, value: item } of value.entries) {
        descend(key)
        descend(item)
      }
    }

    for (const document of documents.values()) for (const { value } of document) descend(value)
  }

  // The value domain, and the reason identifiers are their own arm: 155,259 reads over 55 names.
  it('resolves 155,259 identifier reads to 55 distinct names', () => {
    const names = new Set<string>()
    let reads = 0

    walk((value) => {
      if (value.type !== 'identifier') return
      reads += value.names.length
      for (const name of value.names) names.add(name)
    })

    assert.equal(reads, 155259)
    assert.equal(names.size, 55)
  })

  // `+` is set union over flags and nothing else, so a composition is the only way a value carries
  // more than one name. 9,557 `ADD`s compose 9,557 extra names onto some identifier.
  it('composes flags 9,557 times and never adds a literal', () => {
    let additions = 0

    walk((value) => {
      if (value.type === 'identifier') additions += value.names.length - 1
    })

    assert.equal(additions, 9557)
  })

  // Lua 3.2 has no boolean type; THORN registers `Y` and `N`. They must not become `true`/`false`,
  // which the model enforces by having no boolean arm, and these are the keys retail uses them on.
  it('uses Y and N as the booleans, on three keys', () => {
    const counts = new Map<string, number>()

    walk((value) => {
      if (value.type !== 'table') return

      for (const { key, value: item } of value.entries)
        if (key.type === 'string' && item.type === 'identifier' && item.names.length === 1) {
          const name = item.names[0]!
          if (name === 'Y' || name === 'N')
            counts.set(`${key.value}=${name}`, (counts.get(`${key.value}=${name}`) ?? 0) + 1)
        }
    })

    assert.equal(counts.get('on=Y'), 1747)
    assert.equal(counts.get('on=N'), 621)
    assert.equal(counts.get('fogon=Y'), 76)
    assert.equal(counts.get('fogon=N'), 28)
    assert.equal(counts.get('fogtable=Y'), undefined)
    assert.equal(counts.get('fogtable=N'), 10)
  })

  // 442,599 constants, and only two tags in any of them — a third would be a nested function
  // prototype, and there is not one in any script.
  it('holds 442,599 pool constants under two tags', () => {
    let numbers = 0
    let strings = 0

    for (const { data } of assets) {
      const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

      // Find the pool the way the reader does, by walking the code to `ENDCODE`.
      let offset = bytecode.HEADER_BYTE_LENGTH

      for (;;) {
        const opcode = bytecode.OPCODES[bytes[offset++]!]!
        if (opcode.width === 2) offset += 2
        else if (opcode.width === 1) offset += 1
        if (opcode.count) offset += 1
        if (opcode.name === 'ENDCODE') break
      }

      offset += bytecode.GAP_BYTE_LENGTH
      const total = view.getUint32(offset, false)
      offset += 4

      for (let index = 0; index < total; index++) {
        const tag = bytes[offset++]!

        if (tag === bytecode.ConstantTag.Number) {
          numbers++
          offset += bytes[offset]! + 1
        } else {
          strings++
          offset += view.getUint32(offset, false) + 4
        }
      }
    }

    assert.equal(numbers, 282234)
    assert.equal(strings, 160365)
    assert.equal(numbers + strings, 442599)
  })

  /**
   * The strict round-trip, and a stronger one than THN.md anticipated when it was written: it
   * expected compiled → JSON → plain text → compiled to be unavailable without a bytecode writer,
   * but a *text reader* closes the loop from the other side. Every scalar survives as its literal,
   * so this compares exactly rather than approximately.
   */
  it('round-trips every script through text', () => {
    for (const [path, document] of documents)
      assert.deepEqual(text.read(text.write(document)), document, path)
  })

  /**
   * 355 scripts are a **different export form**: they carry the resolved numbers where the other
   * 1,151 carry the symbolic globals — `type = 9` for `type = SCENE`, `up = 1` for `up = Y_AXIS`,
   * `fogon = 0` for `fogon = N` — and store what reads like an array as a hash keyed `1..n`.
   *
   * It is asserted rather than normalised because the two forms are different instructions in the
   * bytecode, and the writer preserves whichever a script used. It is also the lead on THN.md's open
   * question about the identifiers' numeric values: those files hold the answers by correspondence.
   */
  it('holds 355 scripts written in the numeric form', () => {
    let keyed = 0
    const numeric = new Set<string>()

    for (const [path, document] of documents) {
      const descend = (value: Value): void => {
        if (value.type !== 'table') return

        if (value.entries.length && value.entries.every(({ key }) => key.type === 'number')) {
          keyed++
          numeric.add(path)
        }

        for (const item of value.array) descend(item)
        for (const { value: item } of value.entries) descend(item)
      }

      for (const { value } of document) descend(value)
    }

    assert.equal(numeric.size, 355)
    assert.equal(keyed, 76447)
  })

  // No retail table fills both parts, which is why the two can be written back in that order.
  it('never mixes an array part and a hash part in one table', () => {
    walk((value) => {
      if (value.type === 'table') assert.ok(!(value.array.length && value.entries.length))
    })
  })
})
