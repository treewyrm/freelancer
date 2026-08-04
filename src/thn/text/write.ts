import type { Document, Value } from '../types.js'

/** Lua 3.2's reserved words. A table key that is one of these cannot be written bare. */
const RESERVED = new Set([
  'and',
  'do',
  'else',
  'elseif',
  'end',
  'function',
  'if',
  'local',
  'nil',
  'not',
  'or',
  'repeat',
  'return',
  'then',
  'until',
  'while',
])

const NAME = /^[A-Za-z_]\w*$/

/** Escapes Lua's own way, not JSON's: `\ddd` is decimal, and `\uXXXX` would not parse. */
const quote = (value: string): string => {
  let result = '"'

  for (const character of value) {
    const code = character.codePointAt(0) ?? 0

    if (character === '"') result += '\\"'
    else if (character === '\\') result += '\\\\'
    else if (character === '\n') result += '\\n'
    else if (character === '\r') result += '\\r'
    else if (character === '\t') result += '\\t'
    else if (code < 0x20 || code === 0x7f) result += `\\${code}`
    else result += character
  }

  return result + '"'
}

export interface WriteOptions {
  /** Width past which a table breaks across lines instead of staying on one. */
  width?: number

  /** One level of indentation. */
  indent?: string
}

/**
 * Renders a script as Lua source.
 *
 * **This is the whole write path.** The engine loads scripts with `dofile` and Lua's loader compiles
 * source text when the signature is absent, so a plain-text `.thn` runs — observed in the running
 * game, from the packed retail install, which is what makes a bytecode emitter unnecessary rather
 * than merely unwritten.
 *
 * Faithful rather than tidy in one place worth knowing about. Some retail tables store what reads
 * like an array as a hash keyed `1..n`, and those are written back as `[1] = …`, not collapsed into
 * an array literal. The two are the same table to Lua but different instructions in the bytecode,
 * and the model records which was used, so collapsing them would be the one thing here that loses
 * information on a round-trip.
 *
 * @param document Assignments to write, in order.
 */
export const write = (document: Document, options: WriteOptions = {}): string => {
  const { width = 96, indent = '  ' } = options

  const render = (value: Value, depth: number): string => {
    switch (value.type) {
      case 'number':
        return value.literal
      case 'string':
        return quote(value.value)

      // Bare, and joined with `+` when several flags were composed. Never quoted: a quoted flag is a
      // string where the engine wants the number the global holds.
      case 'identifier':
        return value.names.join(' + ')

      case 'table': {
        const items = [
          ...value.array.map((item) => render(item, depth + 1)),
          ...value.entries.map(
            ({ key, value: item }) => `${renderKey(key, depth)} = ${render(item, depth + 1)}`,
          ),
        ]

        if (!items.length) return '{}'

        const flat = `{ ${items.join(', ')} }`
        if (flat.length <= width && !flat.includes('\n')) return flat

        const padding = indent.repeat(depth + 1)
        return `{\n${items.map((item) => padding + item).join(',\n')}\n${indent.repeat(depth)}}`
      }
    }
  }

  /** A key writes bare when it is a name Lua would accept as one, and bracketed otherwise. */
  const renderKey = (key: Value, depth: number): string =>
    key.type === 'string' && NAME.test(key.value) && !RESERVED.has(key.value)
      ? key.value
      : `[${render(key, depth)}]`

  return document.map(({ name, value }) => `${name} = ${render(value, 0)}\n`).join('\n')
}
