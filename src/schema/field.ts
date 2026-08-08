import type { Property } from '#/ini/property.js'
import type { Section } from '#/ini/section.js'
import type { Value } from '#/ini/types.js'
import { toBoolean, toFloat, toText } from '#/ini/value.js'
import { equals as sameName } from '#/utility/string.js'
import type { Fixed, Unrecognized } from './types.js'

/**
 * Reading one property as the type a field declares it to be.
 *
 * These began as `src/fx/field.ts`, answering the open question in `@treewyrm/freelancer-game`'s
 * `docs/SCHEMA.md` about whether the typed layer should be runtime schema objects or hand-written
 * readers: **hand-written readers, over a handful of field helpers.** That answer
 * stands. What moved them here is the rest of the same sentence — *"if a second domain module wants
 * those helpers they move to `./schema`"* — and `./ai` is the second. Invariant 2 makes the move
 * mandatory rather than tidy: `./ai` importing `#/fx/field.js` would be one domain module reaching
 * into another's meaning layer.
 *
 * Every helper coerces and **never inspects the value tag**, because the tag is authoring residue:
 * 266 retail `(section, property)` pairs carry more than one type signature, and `[EffectType]
 * radius` means the same number whether the compiler wrote it as an int or a float.
 *
 * Two helpers arrived with `./ai` and are general rather than its own —
 * `@treewyrm/freelancer-game`'s `docs/DICTIONARY.md` counts dozens of fields in the shape they cover:
 *
 * - {@link values}, a **mixed tuple**. `evade_dodge_style_weight = waggle, 0.5` is a string and a
 *   number, and so are `[Zone] faction`, `[Group] rep`, `[Explosion] debris_type` and
 *   `[WeaponType] shield_mod`. Neither {@link numbers} nor {@link list} can express it.
 * - {@link rows}, a **repeated property kept per occurrence**. {@link list} deliberately flattens,
 *   because `[VisEffect] textures` wants one list however it was written; `[JobBlock]
 *   attack_preference` repeats 262 times over 59 sections and each repeat is a separate record, so
 *   flattening it destroys the grouping.
 */

const of = (value: Value | undefined, convert: (value: Value) => number): number | undefined =>
  value === undefined ? undefined : convert(value)

/** One value as text, or absent. */
export const text = (section: Section, name: string): string | undefined => {
  const value = section.getValue(name)
  return value === undefined ? undefined : toText(value)
}

/** One value as a number, or absent. */
export const number = (section: Section, name: string): number | undefined =>
  of(section.getValue(name), toFloat)

/**
 * One value as a boolean, or absent.
 *
 * `toBoolean` is `INI_Reader`'s, which takes only `true` and `false` by name — so `yes` is false.
 * Retail writes booleans in every case (`False`, `FALSE`, `True`, `TRUE`) and never as a BINI
 * boolean, of which there are zero in the whole corpus.
 */
export const boolean = (section: Section, name: string): boolean | undefined => {
  const value = section.getValue(name)
  return value === undefined ? undefined : toBoolean(value)
}

/**
 * Every value of one property as numbers, or absent.
 *
 * **Arity is kept as read** rather than padded to the field's usual width, because arity varies
 * across retail and inventing the missing value is what `docs/SCHEMA.md` warns reading `[Sound] range`
 * as a fixed pair does — it makes up a second number for 11 sounds.
 */
export const numbers = (section: Section, name: string): number[] | undefined =>
  section.getValues(name)?.map((value) => toFloat(value))

/**
 * A tuple of exactly `count` numbers, or absent when the property is missing or a different width.
 *
 * The width is carried in the return type, so a field declared `[number, number, number]` takes
 * `tuple(section, name, 3)` without a cast and refuses `tuple(section, name, 2)`. Casting instead
 * would compile whichever width was written.
 */
export const tuple = <const N extends number>(
  section: Section,
  name: string,
  count: N,
): Fixed<N> | undefined => {
  const values = numbers(section, name)
  return values?.length === count ? (values as Fixed<N>) : undefined
}

/**
 * Whether a property is present with no values at all.
 *
 * The flag form, and it is not the same question as "is it truthy": `[CollisionGroup] separable` is
 * written as a bare `separable` 456 times and as `separable = true` 28 times, so a reader has to
 * accept both and this is how it recognizes the first.
 */
export const flag = (section: Section, name: string): boolean =>
  section.getValues(name)?.length === 0

/**
 * A repeated property flattened into one ordered list of text, or absent.
 *
 * Covers both ways a *single* list is written — the property occurring many times, and many values
 * on one line — because a consumer wants the same list either way. Use {@link rows} when the
 * repeats are separate records rather than one list.
 */
export const list = (section: Section, name: string): string[] | undefined => {
  const properties = section.filterProperties(name)
  if (properties.length === 0) return undefined

  return properties.flatMap(({ values }) => values.map((value) => toText(value)))
}

/**
 * A repeated property as one entry per occurrence, values raw and in order.
 *
 * The grouping {@link list} throws away. `[JobBlock] attack_preference` repeats within a section and
 * each repeat is `class, weight, flags` — one record — so the caller reads each row with
 * {@link values} rather than seeing 786 loose values.
 */
export const rows = (section: Section, name: string): Value[][] | undefined => {
  const properties: Property[] = section.filterProperties(name)
  return properties.length === 0 ? undefined : properties.map(({ values }) => values)
}

/**
 * One value list read positionally, each position coerced to what it is declared to be.
 *
 * The mixed-tuple case. `'s'` takes text, `'n'` a number, `'b'` a boolean; a position with no value
 * comes back `undefined`, which is how a trailing-optional tuple stays honest about its width.
 * Nothing is padded and nothing beyond `shape` is read — {@link rows} still holds the full list when
 * a caller wants the tail.
 *
 * @param list Values of one property occurrence.
 * @param shape One character per position: `s`, `n` or `b`.
 */
export const values = (
  list: readonly Value[] | undefined,
  shape: string,
): (string | number | boolean | undefined)[] =>
  [...shape].map((kind, index) => {
    const value = list?.[index]
    if (value === undefined) return undefined

    switch (kind) {
      case 'n':
        return toFloat(value)
      case 'b':
        return toBoolean(value)
      default:
        return toText(value)
    }
  })

/**
 * Properties the caller did not name, in the order they were read.
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
