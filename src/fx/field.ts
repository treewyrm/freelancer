import type { Property, Section, Value } from '#/ini/types.js'
import { filterProperties, getValue, getValues } from '#/ini/section.js'
import { toBoolean, toFloat, toText } from '#/ini/value.js'
import { equals as sameName } from '#/utility/string.js'
import type { Unrecognized } from './types.js'

/**
 * Reading one property as the type a field declares it to be.
 *
 * These exist because [SCHEMA.md](../../docs/SCHEMA.md) leaves open whether the typed layer is
 * runtime schema objects that infer their TypeScript type, or hand-written types with a read
 * function per section, and says to settle it once the first domain modules exist rather than
 * guess. `./fx` is the first, and it answers: **hand-written readers, over a handful of field
 * helpers**. The section shapes are small, heterogeneous, and full of one-off residue, and a
 * declarative schema able to express all of that would be larger than the readers it replaced. It
 * also reads the way every UTF reader in this library already reads, which matters more than saving
 * lines.
 *
 * If a second domain module wants the same helpers unchanged, they move to `./schema`. That is the
 * point at which the question is worth revisiting, and not before.
 *
 * Every helper here coerces and never inspects the value tag, because the tag is authoring residue —
 * `[EffectType] radius` is float in some files and int in others and means the same number in both.
 */

const of = (value: Value | undefined, convert: (value: Value) => number): number | undefined =>
  value === undefined ? undefined : convert(value)

/** One value as text, or absent. */
export const text = (section: Section, name: string): string | undefined => {
  const value = getValue(section, name)
  return value === undefined ? undefined : toText(value)
}

/** One value as a number, or absent. */
export const number = (section: Section, name: string): number | undefined =>
  of(getValue(section, name), toFloat)

/**
 * One value as a boolean, or absent.
 *
 * `toBoolean` is `INI_Reader`'s, which takes only `true` and `false` by name — so `yes` is false.
 * Every boolean in this module's data is spelled `true` or `false`.
 */
export const boolean = (section: Section, name: string): boolean | undefined => {
  const value = getValue(section, name)
  return value === undefined ? undefined : toBoolean(value)
}

/**
 * Every value of one property as numbers, or absent.
 *
 * This is the tuple case: `pbubble`, `pos_offset`, `at_t`. **Arity is kept as read** rather than
 * padded to the field's usual width, because a field's arity varies across retail and inventing the
 * missing value is what SCHEMA.md warns reading `[Sound] range` as a fixed pair does.
 */
export const numbers = (section: Section, name: string): number[] | undefined =>
  getValues(section, name)?.map((value) => toFloat(value))

/** A tuple of exactly `count` numbers, or absent when the property is missing or a different width. */
export const tuple = <const N extends number>(
  section: Section,
  name: string,
  count: N,
): number[] | undefined => {
  const values = numbers(section, name)
  return values?.length === count ? values : undefined
}

/**
 * A repeated property flattened into one ordered list, or absent.
 *
 * Covers both ways the data writes a list — the property occurring many times (`hardpoint` in 129
 * `[start_effect]` sections, `textures` up to ten times) and many values on one line — because a
 * consumer wants the same list either way and no retail field here does both meaningfully.
 */
export const list = (section: Section, name: string): string[] | undefined => {
  const properties = filterProperties(section, name)
  if (properties.length === 0) return undefined

  return properties.flatMap(({ values }) => values.map((value) => toText(value)))
}

/**
 * Properties the caller did not name, in the order they were read.
 *
 * Retail needs this before any mod does: `[Effect]` carries a property called `:`, `[start_effect]`
 * carries `only` and `age_fire`, `[destroy_group]` carries `separable`, `dmg_hp` and `dmg_obj`. All
 * of it survives a read-modify-write rather than being quietly deleted.
 *
 * @param section Section being read.
 * @param known Every property name the reader consumed.
 */
export const rest = (section: Section, known: readonly string[]): Unrecognized => {
  const unrecognized: Property[] = section.properties.filter(
    (property) => !known.some((name) => sameName(property.name, name)),
  )

  return unrecognized.length > 0 ? { unrecognized } : {}
}
