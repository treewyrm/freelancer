import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import { isBytecode, read } from './read.js'
import { ConstantTag, OPCODE_BYTES, OPCODES } from './data.js'
import * as value from '#/thn/value.js'

/**
 * A constant pool entry: a number as decimal ASCII, or a string with a length that counts the NUL.
 *
 * `{ literal }` writes a number constant from text the way the compiler stored it, which is the only
 * way to build one whose literal a JavaScript number could not have produced.
 */
const constant = (item: number | string | { literal: string }): number[] => {
  const numeric = typeof item === 'number' || typeof item === 'object'
  const bytes = [
    ...new TextEncoder().encode(typeof item === 'object' ? item.literal : String(item)),
  ]

  return numeric
    ? [ConstantTag.Number, bytes.length, ...bytes]
    : [
        ConstantTag.String,
        ...[24, 16, 8, 0].map((shift) => ((bytes.length + 1) >>> shift) & 0xff),
        ...bytes,
        0,
      ]
}

/** Assembles a chunk by hand, so a reader test never leans on a writer that does not exist. */
const chunk = (
  code: (number | string)[],
  pool: (number | string | { literal: string })[] = [],
): Uint8Array => {
  const bytes = [
    0x1b,
    0x4c,
    0x75,
    0x61,
    0x32,
    ...new Array<number>(16).fill(0),
    ...code.map((item) => {
      if (typeof item === 'number') return item
      const byte = OPCODE_BYTES.get(item)
      assert.ok(byte !== undefined, `${item} is not an opcode`)
      return byte
    }),
    ...new Array<number>(4).fill(0),
    ...[24, 16, 8, 0].map((shift) => (pool.length >>> shift) & 0xff),
    ...pool.flatMap(constant),
  ]

  return Uint8Array.from(bytes)
}

describe('isBytecode', () => {
  it('recognises the Lua signature and nothing else', () => {
    assert.ok(isBytecode(chunk(['ENDCODE'])))
    assert.ok(!isBytecode(new TextEncoder().encode('duration = 1\n')))
    assert.ok(!isBytecode(new Uint8Array(3)))
  })
})

describe('the opcode table', () => {
  // The order is the encoding, so these three anchor it: the first, the one whose operand width the
  // `W` suffix gets wrong, and the last.
  it('is Lua 3.2, in order', () => {
    assert.equal(OPCODES.length, 64)
    assert.deepEqual(OPCODES[0], { name: 'ENDCODE', width: 0, count: false })
    assert.deepEqual(OPCODES[63], { name: 'CHECKSTACK', width: 1, count: false })
  })

  // `SETTABLEPOP` ends in neither `W` nor `OP` and yet takes no operand, so a width rule inferred
  // from the name walks one byte too far on it. Nothing in retail emits it, which is exactly why
  // this is pinned here rather than found later.
  it('gives SETTABLEPOP no operand', () => {
    assert.deepEqual(OPCODES[26], { name: 'SETTABLEPOP', width: 0, count: false })
  })

  it('gives SETLIST a second count operand and SETMAP none', () => {
    assert.equal(OPCODES[29]?.count, true)
    assert.equal(OPCODES[30]?.count, false)
  })
})

describe('read', () => {
  it('reads an empty chunk as an empty script', () => {
    assert.deepEqual(read(chunk(['ENDCODE'])), [])
  })

  it('rejects anything without the signature', () => {
    assert.throws(() => read(new TextEncoder().encode('duration = 1\n')), RangeError)
  })

  it('assigns a global from an inline number', () => {
    const globals = read(chunk(['PUSHNUMBER', 42, 'SETGLOBAL', 0, 'ENDCODE'], ['duration']))

    assert.deepEqual(globals, [{ name: 'duration', value: value.number(42) }])
  })

  // The pool stores numbers as text, and the text is what round-trips: parsing and reformatting
  // this literal yields `-0.99999`, which is a different file.
  it('keeps a pool number as the literal it was stored as', () => {
    const [global] = read(
      chunk(
        ['PUSHCONSTANT', 1, 'SETGLOBAL', 0, 'ENDCODE'],
        ['x', { literal: '-0.9999900000000001' }],
      ),
    )

    assert.deepEqual(global?.value, value.number('-0.9999900000000001'))
  })

  it('negates an inline number', () => {
    const [global] = read(chunk(['PUSHNUMBERNEG', 7, 'SETGLOBAL', 0, 'ENDCODE'], ['x']))

    assert.deepEqual(global?.value, value.number(-7))
  })

  // The distinction the whole model exists for: the same word is a string through one opcode and an
  // identifier through the other.
  it('reads a global read as an identifier and a pool string as a string', () => {
    const globals = read(
      chunk(
        ['GETGLOBAL', 1, 'SETGLOBAL', 0, 'PUSHCONSTANT', 1, 'SETGLOBAL', 2, 'ENDCODE'],
        ['a', 'SCENE', 'b'],
      ),
    )

    assert.deepEqual(globals, [
      { name: 'a', value: value.identifier('SCENE') },
      { name: 'b', value: value.string('SCENE') },
    ])
  })

  it('fills the array part in order, ignoring the flush offset', () => {
    const [global] = read(
      chunk(
        [
          'CREATEARRAY',
          3,
          'PUSHNUMBER',
          1,
          'PUSHNUMBER',
          2,
          'SETLIST',
          0,
          2,
          'SETGLOBAL',
          0,
          'ENDCODE',
        ],
        ['x'],
      ),
    )

    assert.deepEqual(global?.value, value.list(1, 2))
  })

  // The operand is pairs minus one, which the Lua header does not say — `SETMAP 1` is two pairs.
  it('reads SETMAP’s operand as pairs minus one', () => {
    const [global] = read(
      chunk(
        [
          'CREATEARRAY',
          0,
          'PUSHCONSTANT',
          1,
          'PUSHNUMBER',
          10,
          'PUSHCONSTANT',
          2,
          'PUSHNUMBER',
          20,
          'SETMAP',
          1,
          'SETGLOBAL',
          0,
          'ENDCODE',
        ],
        ['x', 'a', 'b'],
      ),
    )

    assert.deepEqual(global?.value, value.table({ a: 10, b: 20 }))
  })

  it('keeps a numeric table key rather than folding it into the array part', () => {
    const [global] = read(
      chunk(
        [
          'CREATEARRAY',
          0,
          'PUSHNUMBER',
          1,
          'PUSHNUMBER',
          9,
          'SETMAP',
          0,
          'SETGLOBAL',
          0,
          'ENDCODE',
        ],
        ['x'],
      ),
    )

    assert.deepEqual(global?.value, {
      type: 'table',
      array: [],
      entries: [{ key: value.number(1), value: value.number(9) }],
    })
  })

  it('composes flags with `+`', () => {
    const [global] = read(
      chunk(
        ['GETGLOBAL', 1, 'GETGLOBAL', 2, 'ADDOP', 'SETGLOBAL', 0, 'ENDCODE'],
        ['x', 'POSITION', 'ORIENTATION'],
      ),
    )

    assert.deepEqual(global?.value, value.identifier('POSITION', 'ORIENTATION'))
  })

  it('rejects `+` over something that is not an identifier', () => {
    assert.throws(
      () =>
        read(chunk(['PUSHNUMBER', 1, 'PUSHNUMBER', 2, 'ADDOP', 'SETGLOBAL', 0, 'ENDCODE'], ['x'])),
      RangeError,
    )
  })

  // A script with control flow is not this format, and approximating one would produce a plausible
  // wrong answer rather than an error.
  it('rejects an opcode a scene script is not made of', () => {
    assert.throws(() => read(chunk(['JMP', 0, 'ENDCODE'])), /not one a scene script is made of/)
  })

  it('rejects a constant tag that is not a number or a string', () => {
    const bytes = chunk(['ENDCODE'], ['x'])
    bytes[bytes.length - 4] = 0x03
    assert.throws(() => read(bytes), RangeError)
  })

  // A pool that does not end at EOF is how a desynchronised walk announces itself.
  it('rejects a pool that does not end at the end of the file', () => {
    assert.throws(() => read(Uint8Array.of(...chunk(['ENDCODE']), 0)), /file is/)
  })

  it('rejects values left on the stack', () => {
    assert.throws(() => read(chunk(['PUSHNUMBER', 1, 'ENDCODE'])), /left on the stack/)
  })
})
