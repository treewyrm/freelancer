/**
 * The interim document model, and the thing both encodings parse into.
 *
 * It is plain data — no classes, no cursors, no parent links. A `Section[]` read from a BINI, a
 * `Section[]` parsed from text and a `Section[]` written by hand are the same thing, and either
 * writer accepts any of them.
 */

/** Which of the four things a value is. BINI records this; text infers it. */
export type ValueType = Value['type']

/**
 * One value of one property.
 *
 * Tagged rather than a bare `boolean | number | string`, because the tag is not derivable from the
 * value: **14,209 retail values are float-typed with an integral value**, indistinguishable from an
 * integer once the tag is gone, and dropping it costs byte-exactness on the way back to BINI. It
 * also matches how the game reads: `INI_Reader` has no accessor asking what type a value is, only
 * accessors asking for the type you want, so a consumer here coerces the same way — see
 * {@link module:value}.
 */
export type Value =
  | { readonly type: 'boolean'; readonly value: boolean }
  | { readonly type: 'integer'; readonly value: number }
  | { readonly type: 'float'; readonly value: number }
  | { readonly type: 'string'; readonly value: string }

/**
 * A named list of values.
 *
 * Zero values is normal and means something — 1,063 retail properties have none, and that is how a
 * flag is written. Duplicate names within a section are equally normal: `[Loadout] equip` repeats
 * 16,074 times across retail, and each repeat is another item in a list, not an overwrite.
 */
export interface Property {
  /** As authored. Compared case-insensitively, never folded in place. */
  name: string

  /** 0..255 values; the count is a `uint8` in BINI. */
  values: Value[]
}

/**
 * A named list of properties.
 *
 * The name is opaque text, not an identifier: retail carries `[Exclusion Zones]` with a space,
 * `[keymap=1.1]` with an equals sign, and `[;Display]` which is a section commented out by its name
 * and therefore matches nothing.
 */
export interface Section {
  /** As authored. Compared case-insensitively, never folded in place. */
  name: string

  /** 0..65,535 properties; the count is a `uint16` in BINI. */
  properties: Property[]
}

/**
 * A whole file: an ordered sequence of sections.
 *
 * Ordered, and duplicates are legal — 156 retail files repeat a section name, and the universe is
 * built that way. The game applies sections in file order and a later one can depend on an earlier
 * one having run, so this is a list of instructions rather than a map.
 */
export type Document = Section[]
