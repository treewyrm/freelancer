import type { Document, Property, Section } from '#/ini/types.js'
import { classify } from '#/utility/number.js'
import { trim } from '#/utility/string.js'

/**
 * Parses text INI into sections.
 *
 * Deliberately forgiving, because the shipped data is: `[Object] 260800` is a half-deleted line
 * that the compiler preserved, `[Trigger] system St02` has a space inside a property name, and both
 * load. An unrecognised property is the normal state of a 2003 data file, so nothing here is a
 * parse error except a line that cannot be split at all.
 *
 * @param text INI source. Decode bytes with `utility/encoding` first — retail's one text data file
 * is windows-1252, not UTF-8.
 */
export const read = (text: string): Document => {
  const document: Document = []

  let section: Section | undefined

  for (const raw of text.split(/\r\n|\n|\r/)) {
    const line = trim(raw)
    if (!line.length) continue

    // A section header is opaque text: everything between the brackets, kept as authored. That is
    // what carries `[;Display]` — a section commented out by prefixing its *name*, which therefore
    // matches nothing — and `[keymap=1.1]`, which has an equals sign inside it. Testing for the
    // comment character first would turn the former into a comment and lose the section.
    if (line.startsWith('[')) {
      const end = line.indexOf(']')

      section = {
        name: trim(end < 0 ? line.substring(1) : line.substring(1, end)),
        properties: [],
      }

      document.push(section)
      continue
    }

    // A property outside any section has nowhere to go. The game ignores these; so does this.
    if (!section) continue

    const comment = line.indexOf(';')
    const body = trim(comment < 0 ? line : line.substring(0, comment))
    if (!body.length) continue

    section.properties.push(property(body))
  }

  return document
}

/**
 * Splits one property line.
 *
 * No `=` at all is a property with zero values, and so is an `=` with nothing after it — 1,063
 * retail properties are one or the other, and both mean the flag is present. Note the difference
 * from a single empty value: `a = ,` has two of those, and retail carries 102 empty strings.
 */
const property = (line: string): Property => {
  const separator = line.indexOf('=')

  if (separator < 0) return { name: line, values: [] }

  const name = trim(line.substring(0, separator))
  const body = trim(line.substring(separator + 1))

  if (!body.length) return { name, values: [] }

  return {
    name,
    values: body.split(',').map((token) => {
      const value = trim(token)

      switch (classify(value)) {
        case 'integer':
          return { type: 'integer', value: Number(value) }
        case 'float':
          return { type: 'float', value: Math.fround(Number(value)) }
        case 'string':
          return { type: 'string', value }
      }
    }),
  }
}
