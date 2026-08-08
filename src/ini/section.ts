import { Property } from './property.js'
import type { Line, Value } from './types.js'
import { toText } from './value.js'
import { equals as sameName, fold } from '#/utility/string.js'

/**
 * A named list of properties, and the unparsed lines interleaved with them.
 *
 * The name is opaque text, not an identifier: retail carries `[Exclusion Zones]` with a space,
 * `[keymap=1.1]` with an equals sign, and `[;Display]` which is a section commented out by its name
 * and therefore matches nothing.
 *
 * Every lookup here folds case and none of them string-compares, because six retail section names
 * and 32 property names are spelled more than one way — `ObjList` and `Objlist`, `zone` and `Zone`.
 * Nothing folds a name *in place*: what was read is what gets written back. Lookups compare by name,
 * never by hash — unlike `utf/`'s `Directory`, INI property and section names are never hashed for
 * lookup, only a `nickname` *value* is (see `Document.findByNickname`).
 */
export class Section {
  /** Unparsed lines and parsed properties, in read/write order. */
  entries: (Property | Line)[]

  /** Trailing comment on the section's own `[Name]` line. Text-only. */
  comment = ''

  /** @param name As authored. Compared case-insensitively, never folded in place. */
  constructor(
    public name: string,
    ...entries: (Property | Line)[]
  ) {
    this.entries = entries
  }

  /** Case-folded `name`, for a caller's own comparisons. */
  get label(): string {
    return fold(this.name)
  }

  /** 0..65,535 properties; the count is a `uint16` in BINI. Unparsed lines filtered out. */
  get properties(): Property[] {
    return this.entries.filter((entry): entry is Property => entry instanceof Property)
  }

  /** First property with this name, or `undefined`. */
  getProperty(name: string): Property | undefined {
    return this.properties.find((property) => sameName(property.name, name))
  }

  /** Every property with this name, in file order. */
  filterProperties(name: string): Property[] {
    return this.properties.filter((property) => sameName(property.name, name))
  }

  /**
   * First value of the first property with this name.
   * @param index Position within the property's values. Default 0.
   */
  getValue(name: string, index = 0): Value | undefined {
    return this.getProperty(name)?.values[index]
  }

  /**
   * Values of the first property with this name, or `undefined` when there is no such property.
   *
   * An empty array is not the same answer: a property that is present with no values is a flag that
   * is set, and 1,063 retail properties are exactly that.
   */
  getValues(name: string): Value[] | undefined {
    return this.getProperty(name)?.values
  }

  /** Whether a property is present at all, whatever its values. */
  hasProperty(name: string): boolean {
    return this.getProperty(name) !== undefined
  }

  /**
   * Appends a property, which is how a repeated property is added. Always appends — never
   * find-or-replace, because duplicate names are legal and common (`[Loadout] equip` repeats 16,074
   * times across retail).
   */
  addProperty(name: string, ...values: Value[]): Property {
    const property = new Property(name, ...values)
    this.entries.push(property)
    return property
  }

  /** Removes every property with this name. */
  deleteProperty(name: string): this {
    this.entries = this.entries.filter(
      (entry) => !(entry instanceof Property && sameName(entry.name, name)),
    )
    return this
  }

  /** Appends properties and/or unparsed lines, preserving order. */
  append(...entries: (Property | Line)[]): this {
    this.entries.push(...entries)
    return this
  }

  /**
   * The `nickname` a section identifies itself by, as text.
   *
   * 108 of the 256 retail section names always carry one, 136 never do, and three sometimes do.
   */
  getNickname(name = 'nickname'): string | undefined {
    const value = this.getValue(name)
    return value === undefined ? undefined : toText(value)
  }
}
