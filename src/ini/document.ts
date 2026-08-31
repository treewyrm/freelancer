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

  /** @param entries Sections and unparsed lines, in the order they should be written. */
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

  /**
   * Inserts a section after `after`, appending when it is absent or belongs to another document.
   *
   * `addSection` pushes onto `entries`, which is right for a section that stands on its own and
   * wrong for one that belongs to the section above it: `[LOD]` names no owner and is read as a
   * trailer of the preceding entry — 388 retail equipment LODs follow a `[Gun]`, in 194 runs of two.
   * The property-level twin of this is `Section.insertProperty`.
   */
  insertSection(name: string, after?: Section, ...entries: (Property | Line)[]): Section {
    const section = new Section(name, ...entries)

    const index = after === undefined ? -1 : this.entries.indexOf(after)
    if (index < 0) this.entries.push(section)
    else this.entries.splice(index + 1, 0, section)

    return section
  }

  /** Removes every section with this name. */
  deleteSection(name: string): this {
    this.entries = this.entries.filter(
      (entry) => !(entry instanceof Section && sameName(entry.name, name)),
    )
    return this
  }

  /**
   * Removes one section by identity, reporting whether it was there.
   *
   * `deleteSection` removes *every* section with a name, and duplicate section names are legal —
   * 156 retail files repeat one.
   *
   * A comment line above the section is left alone: a preceding `Line` cannot be told apart from one
   * closing the section above it, and deleted text is not recoverable.
   */
  removeSection(section: Section): boolean {
    const index = this.entries.indexOf(section)
    if (index < 0) return false

    this.entries.splice(index, 1)
    return true
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
