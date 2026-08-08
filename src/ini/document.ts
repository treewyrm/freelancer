import type { Property } from './property.js'
import { Section } from './section.js'
import type { Line } from './types.js'
import { getObjectId } from '#/hash.js'
import { equals as sameName } from '#/utility/string.js'

/**
 * A whole file: an ordered sequence of sections, and the unparsed lines interleaved with them.
 *
 * Ordered, and duplicate section names are legal — 156 retail files repeat a section name, and the
 * universe is built that way. The game applies sections in file order and a later one can depend on
 * an earlier one having run, so this is a list of instructions rather than a map.
 *
 * Iterating a `Document` directly yields its sections, so `for (const section of document)` reads
 * the same as it would over a plain `Section[]`.
 */
export class Document implements Iterable<Section> {
  /** Preferred save storage format. */
  format: 'binary' | 'text' | 'save' | undefined

  /** Unparsed lines and parsed sections, in read/write order. */
  entries: (Section | Line)[]

  constructor(...entries: (Section | Line)[]) {
    this.entries = entries
  }

  /** Sections in file order. Unparsed lines filtered out. */
  get sections(): Section[] {
    return this.entries.filter((entry): entry is Section => entry instanceof Section)
  }

  [Symbol.iterator](): Iterator<Section> {
    return this.sections[Symbol.iterator]()
  }

  /** First section with this name, or `undefined`. */
  getSection(name: string): Section | undefined {
    return this.sections.find((section) => sameName(section.name, name))
  }

  /** Every section with this name, in file order. */
  filterSections(name: string): Section[] {
    return this.sections.filter((section) => sameName(section.name, name))
  }

  /**
   * Appends a section. Always appends — never find-or-replace, because duplicate section names are
   * legal and common.
   */
  addSection(name: string, ...entries: (Property | Line)[]): Section {
    const section = new Section(name, ...entries)
    this.entries.push(section)
    return section
  }

  /** Removes every section with this name. */
  deleteSection(name: string): this {
    this.entries = this.entries.filter(
      (entry) => !(entry instanceof Section && sameName(entry.name, name)),
    )
    return this
  }

  /** Appends sections and/or unparsed lines, preserving order. */
  append(...entries: (Section | Line)[]): this {
    this.entries.push(...entries)
    return this
  }

  /**
   * Finds a section by its `nickname`, comparing hashes rather than text.
   *
   * This is how the game resolves a cross-file reference, so a lookup that matches here matches
   * there — including the case folding, which `getObjectId` does.
   */
  findByNickname(nickname: string, name = 'nickname'): Section | undefined {
    const id = getObjectId(nickname)

    return this.sections.find((section) => {
      const value = section.getNickname(name)
      return value !== undefined && getObjectId(value) === id
    })
  }
}
