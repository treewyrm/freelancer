import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import { read } from './read.js'
import { write } from './write.js'
import type { Globals } from '#/thn/types.js'
import * as value from '#/thn/value.js'

describe('read', () => {
  it('reads assignments in order', () => {
    assert.deepEqual(read('duration = 1\nentities = {}\n'), [
      { name: 'duration', value: value.number('1') },
      { name: 'entities', value: { type: 'table', array: [], entries: [] } },
    ])
  })

  // The distinction the format turns on: a bare word is a global read, a quoted one is a string.
  it('separates an identifier from a string', () => {
    assert.deepEqual(read('a = SCENE\nb = "SCENE"\n'), [
      { name: 'a', value: value.identifier('SCENE') },
      { name: 'b', value: value.string('SCENE') },
    ])
  })

  it('does not fold Y and N into booleans', () => {
    assert.deepEqual(read('on = Y\noff = N\n'), [
      { name: 'on', value: value.identifier('Y') },
      { name: 'off', value: value.identifier('N') },
    ])
  })

  it('composes flags with `+`', () => {
    const [global] = read('flags = POSITION + ORIENTATION + ENTITY_RELATIVE\n')

    assert.deepEqual(global?.value, value.identifier('POSITION', 'ORIENTATION', 'ENTITY_RELATIVE'))
  })

  it('rejects `+` over something that is not an identifier', () => {
    assert.throws(() => read('x = 1 + 2\n'), SyntaxError)
  })

  // Keeping the literal is the whole reason numbers are stored as text: the parsed value would
  // re-emit as `-0.99999`, which is a different file.
  it('keeps a number as the literal it was written as', () => {
    assert.deepEqual(read('x = -0.9999900000000001\n')[0]?.value, {
      type: 'number',
      literal: '-0.9999900000000001',
    })

    assert.deepEqual(read('x = 9e-006\n')[0]?.value, { type: 'number', literal: '9e-006' })
  })

  it('reads a table with both parts, and both key forms', () => {
    const [global] = read('t = { 1, 2, name = "x", [3] = SCENE }\n')

    assert.deepEqual(global?.value, {
      type: 'table',
      array: [value.number('1'), value.number('2')],
      entries: [
        { key: value.string('name'), value: value.string('x') },
        { key: value.number('3'), value: value.identifier('SCENE') },
      ],
    })
  })

  it('accepts `;` as a separator and a trailing one', () => {
    assert.deepEqual(read('t = { 1; 2, }\n')[0]?.value, value.list(1, 2))
  })

  it('skips comments', () => {
    assert.deepEqual(read('-- a comment\nx = 1 -- another\n'), [
      { name: 'x', value: value.number('1') },
    ])
  })

  it('reads string escapes Lua’s way, with decimal byte escapes', () => {
    assert.deepEqual(
      read(String.raw`x = "a\tb\65c\\d\"e"` + '\n')[0]?.value,
      value.string('a\tbAc\\d"e'),
    )
  })

  it('reads a single-quoted and a long string', () => {
    assert.deepEqual(read("x = 'a'\n")[0]?.value, value.string('a'))
    assert.deepEqual(read('x = [[a\nb]]\n')[0]?.value, value.string('a\nb'))
  })

  // A script that needs any of these is not this format, and reading it partially would produce
  // something this library cannot write back.
  it('rejects what a scene script cannot contain', () => {
    assert.throws(() => read('local x = 1\n'), /locals/)
    assert.throws(() => read('x = nil\n'), /nil/)
    assert.throws(() => read('x = function() end\n'), /functions/)
  })

  it('names the line in an error', () => {
    assert.throws(() => read('x = 1\ny = {\n'), /line 2/)
  })
})

describe('write', () => {
  it('writes identifiers bare and strings quoted', () => {
    const globals: Globals = [
      { name: 'a', value: value.identifier('SCENE') },
      { name: 'b', value: value.string('SCENE') },
    ]

    assert.equal(write(globals), 'a = SCENE\n\nb = "SCENE"\n')
  })

  it('writes a composed flag with `+`', () => {
    assert.equal(
      write([{ name: 'f', value: value.identifier('POSITION', 'ORIENTATION') }]),
      'f = POSITION + ORIENTATION\n',
    )
  })

  it('writes a number as its literal, not as a reparsed value', () => {
    assert.equal(write([{ name: 'x', value: value.number('9e-006') }]), 'x = 9e-006\n')
  })

  it('brackets a key that is not a name, and a reserved word', () => {
    const globals: Globals = [
      {
        name: 't',
        value: {
          type: 'table',
          array: [],
          entries: [
            { key: value.number(1), value: value.number(2) },
            { key: value.string('end'), value: value.number(3) },
            { key: value.string('a b'), value: value.number(4) },
          ],
        },
      },
    ]

    assert.equal(write(globals), 't = { [1] = 2, ["end"] = 3, ["a b"] = 4 }\n')
  })

  // The one place the writer is faithful rather than tidy: `{ [1] = 1 }` and `{ 1 }` are the same
  // table to Lua but different instructions in the bytecode, and 76,447 retail tables use the
  // former, so collapsing them would lose the only thing a round-trip could lose.
  it('does not collapse a table keyed 1..n into an array literal', () => {
    const keyed = write([
      {
        name: 't',
        value: {
          type: 'table',
          array: [],
          entries: [
            { key: value.number(1), value: value.number(7) },
            { key: value.number(2), value: value.number(8) },
          ],
        },
      },
    ])

    assert.equal(keyed, 't = { [1] = 7, [2] = 8 }\n')
    assert.equal(write([{ name: 't', value: value.list(7, 8) }]), 't = { 7, 8 }\n')
  })

  it('breaks a table across lines past the width', () => {
    const globals: Globals = [{ name: 't', value: value.list('a'.repeat(120)) }]

    assert.match(write(globals), /^t = \{\n {2}"a+"\n\}\n$/)
  })

  it('escapes what Lua needs escaped', () => {
    assert.equal(
      write([{ name: 'x', value: value.string('a"b\\c\nd\0e') }]),
      'x = "a\\"b\\\\c\\nd\\0e"\n',
    )
  })
})

describe('round-trip', () => {
  it('is a fixed point over every kind of value', () => {
    const globals: Globals = [
      { name: 'duration', value: value.number('361.872') },
      {
        name: 'entities',
        value: value.list(
          value.table({
            entity_name: 'Scene',
            template_name: '',
            lt_grp: 0,
            spatialprops: value.table({ pos: value.list(0, 0, 0) }),
          }),
        ),
      },
      { name: 'events', value: value.list(value.identifier('START_PSYS', 'LOOP')) },
    ]

    assert.deepEqual(read(write(globals)), globals)
  })
})
