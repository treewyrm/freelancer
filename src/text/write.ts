import type { Document, Property, Section } from '../types.js'
import { toText } from '../value.js'

export interface WriteOptions {
  /** Line terminator. The game's own tools wrote CRLF. */
  newline?: string

  /** Blank line between sections. */
  spaceBetweenSections?: boolean

  /** Spaces around the `=`. */
  spaceAroundAssignment?: boolean
}

/**
 * Serializes sections as text INI.
 *
 * No quoting or escaping anywhere, and none is needed: not one of the 424,320 retail string values
 * contains a comma, a semicolon or a newline, so the three characters that would need it never
 * appear inside a value. A value that did contain one would come back split or truncated, which is
 * a limit of the format rather than of this writer — BINI is the encoding that can hold it.
 */
export const write = (document: Document, options: WriteOptions = {}): string => {
  const { newline = '\r\n', spaceBetweenSections = true, spaceAroundAssignment = true } = options

  const assignment = spaceAroundAssignment ? ' = ' : '='
  const lines: string[] = []

  for (const section of document) {
    if (spaceBetweenSections && lines.length) lines.push('')

    lines.push(`[${section.name}]`)
    for (const property of section.properties) lines.push(line(property, assignment))
  }

  return lines.length ? lines.join(newline) + newline : ''
}

/**
 * One property line.
 *
 * A property with no values is written as a bare name, with no `=`. Both spellings read back as
 * zero values, and the bare one is what the data itself uses.
 */
const line = ({ name, values }: Property, assignment: string): string =>
  values.length ? name + assignment + values.map(toText).join(', ') : name

/** Serializes a single section, for diffing or for splicing into a larger file. */
export const writeSection = (section: Section, options?: WriteOptions): string =>
  write([section], options)
