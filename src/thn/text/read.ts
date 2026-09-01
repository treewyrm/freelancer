import type { Entry, Globals, Value } from '#/thn/types.js'
import { identifier, number, string } from '#/thn/value.js'

/**
 * Parses a plain-text scene script.
 *
 * A Lua **literal** parser, not a Lua parser. The grammar it accepts is the grammar a THN is made
 * of, which the corpus settles rather than taste: a script is `name = value` assignments over
 * numbers, strings, identifiers and table constructors, with `+` composing flags. There is no
 * control flow, no call and no function in any of the 1,506 retail scripts, so there is none here.
 *
 * Anything else is a `SyntaxError` naming the line, deliberately. Half-supporting a `local` or an
 * `if` would mean quietly reading a file that this library cannot write back and the reader's own
 * model cannot represent.
 *
 * @param source Script text. Decode bytes with `utility/encoding` first.
 * @throws SyntaxError on anything outside the literal grammar.
 */
export const read = (source: string): Globals => {
  let offset = 0

  const lineOf = (at: number): number => {
    let line = 1
    for (let i = 0; i < at && i < source.length; i++) if (source[i] === '\n') line++
    return line
  }

  const fail = (message: string, at = offset): never => {
    throw new SyntaxError(`${message} on line ${lineOf(at)}`)
  }

  /** Skips whitespace and comments. Lua 3.2 has `--` to end of line, and no block comment. */
  const skip = (): void => {
    for (;;) {
      while (offset < source.length && /\s/.test(source[offset]!)) offset++

      if (source.startsWith('--', offset)) {
        const end = source.indexOf('\n', offset)
        offset = end < 0 ? source.length : end
        continue
      }

      return
    }
  }

  const at = (text: string): boolean => {
    skip()
    return source.startsWith(text, offset)
  }

  const take = (text: string): boolean => {
    if (!at(text)) return false
    offset += text.length
    return true
  }

  const expect = (text: string): void => {
    if (!take(text)) fail(`Expected ${JSON.stringify(text)}`)
  }

  const NAME = /[A-Za-z_]\w*/y
  const NUMBER = /-?(?:0[xX][0-9a-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/y

  const name = (): string | undefined => {
    skip()
    NAME.lastIndex = offset
    const match = NAME.exec(source)
    if (!match) return undefined
    offset = NAME.lastIndex
    return match[0]
  }

  /**
   * A quoted string. Lua's escapes, not JSON's — `\ddd` is up to three **decimal** digits, and
   * `\<newline>` is a literal newline.
   */
  const quoted = (): string => {
    // Reported against the opening quote, not against the end of the file: an unterminated
    // construct is a mistake where it starts, and EOF is never a useful place to be pointed at.
    const start = offset
    const quote = source[offset++]!
    let value = ''

    for (;;) {
      if (offset >= source.length) fail('Unterminated string', start)

      const character = source[offset++]!

      if (character === quote) return value

      if (character !== '\\') {
        value += character
        continue
      }

      const escape = source[offset++]
      const simple: Record<string, string> = {
        a: '\x07',
        b: '\b',
        f: '\f',
        n: '\n',
        r: '\r',
        t: '\t',
        v: '\v',
        '\n': '\n',
      }

      if (escape !== undefined && escape in simple) value += simple[escape]
      else if (escape !== undefined && /\d/.test(escape)) {
        let digits = escape
        while (digits.length < 3 && /\d/.test(source[offset] ?? '')) digits += source[offset++]!
        value += String.fromCharCode(Number(digits))
      } else if (escape !== undefined) value += escape
      else fail('Unterminated string')
    }
  }

  /** A long string, `[[…]]`. Lua drops a newline immediately after the opening bracket. */
  const long = (): string => {
    const start = offset
    offset += 2
    const end = source.indexOf(']]', offset)
    if (end < 0) fail('Unterminated long string', start)
    const value = source.slice(offset, end)
    offset = end + 2
    return value.startsWith('\n') ? value.slice(1) : value
  }

  const table = (): Value => {
    skip()
    const start = offset
    expect('{')

    const array: Value[] = []
    const entries: Entry[] = []

    while (!take('}')) {
      if (offset >= source.length) fail('Unterminated table', start)

      // `[key] = value`, the form a non-name key takes.
      if (take('[')) {
        const key = expression()
        expect(']')
        expect('=')
        entries.push({ key, value: expression() })
      } else {
        // `name = value` and a positional item start the same way, so the `=` decides which.
        const start = offset
        const key = name()

        if (key !== undefined && take('=')) entries.push({ key: string(key), value: expression() })
        else {
          offset = start
          array.push(expression())
        }
      }

      // Lua accepts `,` and `;` interchangeably, and allows a trailing one.
      if (!take(',') && !take(';')) {
        expect('}')
        break
      }
    }

    return { type: 'table', array, entries }
  }

  const term = (): Value => {
    skip()

    if (offset >= source.length) fail('Expected a value')

    const character = source[offset]!

    if (character === '{') return table()
    if (character === '"' || character === "'") return string(quoted())
    if (source.startsWith('[[', offset)) return string(long())

    NUMBER.lastIndex = offset
    const digits = NUMBER.exec(source)

    // A leading `-` folds into the literal rather than becoming an operator: the bytecode has a
    // dedicated `PUSHNUMBERNEG`, arithmetic never occurs, and the literal is what has to survive.
    if (digits) {
      offset = NUMBER.lastIndex
      return number(digits[0])
    }

    const word = name()
    if (word === undefined) fail(`Unexpected ${JSON.stringify(character)}`)
    if (word === 'nil') fail('`nil` has no value in this model')
    if (word === 'function') fail('A scene script holds no functions')

    return identifier(word!)
  }

  /** `+` over identifiers, which is set union over flags and never arithmetic. */
  const expression = (): Value => {
    let value = term()

    while (take('+')) {
      const right = term()

      if (value.type !== 'identifier' || right.type !== 'identifier')
        fail('`+` over something that is not an identifier')

      value = identifier(
        ...(value as { names: string[] }).names,
        ...(right as { names: string[] }).names,
      )
    }

    return value
  }

  const globals: Globals = []

  for (;;) {
    skip()
    if (offset >= source.length) return globals

    const start = offset
    const global = name()

    if (global === undefined) fail(`Unexpected ${JSON.stringify(source[offset])}`, start)
    if (global === 'local') fail('A scene script holds no locals')

    expect('=')
    globals.push({ name: global!, value: expression() })

    // A statement separator is optional in Lua and this format never writes one.
    take(';')
  }
}
