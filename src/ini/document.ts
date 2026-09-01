import * as binary from './binary/index.js'
import type { Property } from './property.js'
import * as save from './save/index.js'
import { Section } from './section.js'
import * as text from './text/index.js'
import type { Line } from './types.js'
import { getObjectId } from '#/hash.js'
import { decode, encode } from '#/utility/encoding.js'
import { equals as sameName } from '#/utility/string.js'

/**
 * Which encoding a document came from, or should be written in.
 *
 * `save` is text under a positional XOR mask and nothing else — same grammar, same character set,
 * so a document read from one form writes to any of the three.
 */
export type Format = 'binary' | 'text' | 'save'

/**
 * A whole file: an ordered sequence of sections, and the unparsed lines interleaved with them.
 *
 * Ordered, and duplicate section names are legal — 156 retail files repeat a section name, and the
 * universe is built that way. The game applies sections in file order and a later one can depend on
 * an earlier one having run, so this is a list of instructions rather than a map.
 *
 * Iterating a `Document` directly yields its sections, so `for (const section of document)` reads
 * the same as it would over a plain `Section[]`.
 *
 * **Serialization is the class's, the same as `utf/`'s `Directory`**: `Document.read` takes bytes in
 * any of the three encodings and `document.write` emits any of them. The per-encoding subpaths stay
 * where they are for a caller who already knows which one they have.
 */
export class Document implements Iterable<Section> {
  /** Unparsed lines and parsed sections, in read/write order. */
  entries: (Section | Line)[]

  /** @param entries Sections and unparsed lines, in the order they should be written. */
  constructor(...entries: (Section | Line)[]) {
    this.entries = entries
  }

  /**
   * Reads an INI in whichever encoding it is in.
   *
   * The signature decides, never the extension or the location — retail `DATA` holds 1,251 BINI
   * files and one text file all named `.ini`, `EXE/` holds three more text ones, and of the two
   * `.fl` there only one is masked. The game does exactly this: it checks for `BINI` and falls
   * through to the text parser when it is absent.
   *
   * @param data File bytes, or text that has already been decoded.
   */
  static read(data: ArrayBufferView | ArrayBufferLike | string): Document {
    if (typeof data === 'string') return text.read(data)

    if (binary.isBinary(data)) return binary.read(data)

    if (save.isSave(data)) return save.read(data)

    return text.read(decode(ArrayBuffer.isView(data) ? data : new Uint8Array(data)))
  }

  /**
   * Writes this document as bytes.
   *
   * Text output is windows-1252, which is what the game reads and what retail's one text data file
   * is. Use `text.write` directly when a string is what you want.
   *
   * The mask is never applied unless it is asked for. Round-tripping a save means passing `'save'`
   * back, because a document does not remember what it was read from and the default stays
   * `binary`.
   *
   * @param format Encoding to write in.
   * @param options Passed through to the text writer, which the save form also goes through.
   */
  write(format: Format = 'binary', options?: text.WriteOptions): Uint8Array {
    switch (format) {
      case 'binary':
        return binary.write(this)
      case 'save':
        return save.write(this, options)
      case 'text':
        return encode(text.write(this, options))
    }
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
