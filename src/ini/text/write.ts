import { Document } from '#/ini/document.js'
import { Property } from '#/ini/property.js'
import { Section } from '#/ini/section.js'
import { toText } from '#/ini/value.js'

export interface WriteOptions {
  /** Line terminator. The game's own tools wrote CRLF. */
  newline?: string

  /** Spaces around the `=`. */
  spaceAroundAssignment?: boolean
}

/**
 * Serializes a document as text INI.
 *
 * Walks `document.entries`, so a `Line` entry — a comment, a blank line, anything the parser didn't
 * interpret — comes back exactly where it was read, and so does one nested inside a `Section`'s own
 * `entries`. Blank-line placement between sections is therefore data, not a writer policy: a
 * hand-built document that wants a blank line between two sections carries an explicit `''` entry,
 * the same as it would if typed in an editor.
 *
 * No quoting or escaping anywhere, and none is needed: not one of the 424,320 retail string values
 * contains a comma, a semicolon or a newline, so the three characters that would need it never
 * appear inside a value. A value that did contain one would come back split or truncated, which is
 * a limit of the format rather than of this writer — BINI is the encoding that can hold it.
 */
export const write = (document: Document, options: WriteOptions = {}): string => {
  const { newline = '\r\n', spaceAroundAssignment = true } = options

  const assignment = spaceAroundAssignment ? ' = ' : '='
  const lines: string[] = []

  for (const entry of document.entries) {
    if (typeof entry === 'string') {
      lines.push(entry)
      continue
    }

    lines.push(header(entry))
    for (const item of entry.entries)
      lines.push(typeof item === 'string' ? item : line(item, assignment))
  }

  return lines.length ? lines.join(newline) + newline : ''
}

/** One `[Section]` line, with its trailing comment when there is one. */
const header = ({ name, comment }: Section): string =>
  comment.length ? `[${name}] ; ${comment}` : `[${name}]`

/**
 * One property line.
 *
 * A property with no values is written as a bare name, with no `=`. Both spellings read back as
 * zero values, and the bare one is what the data itself uses.
 */
const line = ({ name, values, comment }: Property, assignment: string): string => {
  const body = values.length ? name + assignment + values.map(toText).join(', ') : name
  return comment.length ? `${body} ; ${comment}` : body
}

/** Serializes a single section, for diffing or for splicing into a larger file. */
export const writeSection = (section: Section, options?: WriteOptions): string =>
  write(new Document(section), options)
