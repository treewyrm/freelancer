import { Document } from '#/ini/document.js'
import { Property } from '#/ini/property.js'
import { Section } from '#/ini/section.js'
import { classify } from '#/utility/number.js'
import { trim } from '#/utility/string.js'

/**
 * Parses text INI into a document.
 *
 * Deliberately forgiving, because the shipped data is: `[Object] 260800` is a half-deleted line
 * that the compiler preserved, `[Trigger] system St02` has a space inside a property name, and both
 * load. An unrecognised property is the normal state of a 2003 data file, so nothing here is a
 * parse error except a line that cannot be split at all.
 *
 * Every line lands somewhere: a blank line or a line the parser doesn't otherwise make sense of is
 * kept verbatim as a `Line`, interleaved in position with the sections and properties it parses, so
 * a write-back reproduces a modder's comments and spacing in roughly the same place.
 *
 * @param text INI source. Decode bytes with `utility/encoding` first — retail's one text data file
 * is windows-1252, not UTF-8.
 */
export const read = (text: string): Document => {
  const document = new Document()

  let section: Section | undefined

  // Splitting always leaves one trailing empty element when the text ends with a line terminator —
  // the normal case — which is an artifact of the split, not a blank line the author typed. Dropping
  // it is what makes a genuine trailing blank line (one more terminator than that) still come out as
  // exactly one `''` entry.
  const lines = text.split(/\r\n|\n|\r/)
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()

  for (const raw of lines) {
    const line = trim(raw)

    if (!line.length) {
      if (section) section.entries.push('')
      else document.entries.push('')
      continue
    }

    // A section header is opaque text: everything between the brackets, kept as authored. That is
    // what carries `[;Display]` — a section commented out by prefixing its *name*, which therefore
    // matches nothing — and `[keymap=1.1]`, which has an equals sign inside it. Testing for the
    // comment character first would turn the former into a comment and lose the section.
    if (line.startsWith('[')) {
      const end = line.indexOf(']')
      const name = trim(end < 0 ? line.substring(1) : line.substring(1, end))
      const rest = end < 0 ? '' : line.substring(end + 1)
      const commentIndex = rest.indexOf(';')

      section = new Section(name)
      if (commentIndex >= 0) section.comment = trim(rest.substring(commentIndex + 1))

      document.entries.push(section)
      continue
    }

    // A line before any section has opened has nowhere to attach a property, so it is kept verbatim
    // rather than parsed — this is also where the game's own "a property outside any section is
    // ignored" line ends up, now preserved instead of dropped.
    if (!section) {
      document.entries.push(line)
      continue
    }

    // A comment-only line is kept verbatim, in the section it appeared in.
    if (line.startsWith(';')) {
      section.entries.push(line)
      continue
    }

    const commentIndex = line.indexOf(';')
    const body = trim(commentIndex < 0 ? line : line.substring(0, commentIndex))

    if (!body.length) {
      section.entries.push(line)
      continue
    }

    const item = property(body)
    if (commentIndex >= 0) item.comment = trim(line.substring(commentIndex + 1))

    section.entries.push(item)
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

  if (separator < 0) return new Property(line)

  const name = trim(line.substring(0, separator))
  const body = trim(line.substring(separator + 1))

  if (!body.length) return new Property(name)

  return new Property(
    name,
    ...body.split(',').map((token) => {
      const value = trim(token)

      switch (classify(value)) {
        case 'integer':
          return { type: 'integer', value: Number(value) } as const
        case 'float':
          return { type: 'float', value: Math.fround(Number(value)) } as const
        case 'string':
          return { type: 'string', value } as const
      }
    }),
  )
}
