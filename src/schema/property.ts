import { Property } from '#/ini/property.js'
import { Section } from '#/ini/section.js'
import type { Value } from '#/ini/types.js'
import { from, toBoolean, toFloat, toText } from '#/ini/value.js'
import { fold } from '#/utility/string.js'
import type { Fixed, Keys, Report, Unrecognized } from './types.js'

/**
 * Reading a section the way the game reads one: a cursor over properties, in file order.
 *
 * `INI_Reader` is not a map. It is a loop — the consumer takes the next property, compares its name,
 * and runs whatever that name means — so a section is a **sequence of instructions against a
 * context** rather than a record of fields. Three things follow that a lookup-per-field reader
 * cannot express, and all three are in the retail data:
 *
 * - **A property can open a context the properties after it belong to.** `[Exclusion Zones]` is 169
 *   sections holding **634 `exclusion` openers and zero member properties before the first one**;
 *   each owns the `fog_far`, `zone_shell`, `max_alpha` and `exclusion_tint` that follow it. Read
 *   flat, that is nine unrelated lists and which shell belongs to which zone is gone.
 *   {@link Fields.group} is the shape, and it is `[fuse]`'s run (`@treewyrm/freelancer-game`'s
 *   `docs/FX.md`) one level down.
 * - **A repeat re-runs the instruction.** 202 pairs repeat inside one section, so a singular field is
 *   **last-wins** — what an assignment in a loop does. A lookup reader silently takes the first. The
 *   visible difference across all of retail is three `[start_effect]` actions, which is small, but it
 *   is a difference and choosing it by accident is what this replaces.
 * - **What the reader did not consume is derivable.** The walk knows which properties it dispatched,
 *   so `unrecognized` falls out of the read instead of being declared beside it. Every reader written
 *   against `field.rest` keeps a `known: string[]` in parallel with its own interface, nothing checks
 *   that the two agree, and a name dropped from the array moves a field into `unrecognized` while the
 *   field still reads correctly.
 *
 * **This is not the runtime schema `@treewyrm/freelancer-game`'s `docs/SCHEMA.md` rejected**, and the difference
 * is worth being precise about because the rejection still stands. A {@link Table} declares which INI
 * name does what to which **already-declared** field. It infers no TypeScript type, validates
 * nothing, and the interfaces in each module's `types.ts` remain hand-written and remain the contract
 * — the same argument `./ai`'s block table already makes for itself, one step further.
 *
 * What the types do and do not catch is on {@link Fields}. The short version: the field name is
 * checked, the INI property name cannot be.
 */

/**
 * What one property name does to the record being built.
 *
 * Stateless on purpose. Everything an instruction needs is the draft it is filling and the values of
 * this one occurrence, so a single table is shared by every section it reads and nothing carries
 * between them. A group's open row is the last element of the array its opener appends to — a
 * position in the draft, not a closure — which is what keeps a table reusable and reentrant.
 *
 * The **INI property name is the table key**, not a field here, and is passed in to both halves.
 * That way one name drives the dispatch and the write, and they cannot disagree.
 */
export interface Instruction<T> {
  /** Field of the hand-written interface this fills. Checked against `keyof T`, never inferred. */
  readonly into: Keys<T, unknown>

  /**
   * Runs once per occurrence, in the order the file wrote them.
   *
   * @param draft Record being filled. An absent field is an absent key, never `undefined` —
   * Invariant 4.
   * @param values Values of this occurrence. Empty for a flag; arity is as read and never padded.
   * @param report Optional diagnostics — see {@link Report}.
   * @returns Whether the property was consumed. Only a {@link Fields.group} member ever declines,
   * when there is no open row for it to attach to; the walk then files the property as unrecognized.
   * A property whose values were unusable is still *consumed* — see {@link readSection}.
   */
  read(draft: Partial<T>, values: readonly Value[], report?: Report): boolean

  /**
   * Emits the field back, appending to `properties` in table order.
   *
   * An absent field emits nothing, which is `@treewyrm/freelancer-game`'s `docs/SCHEMA.md`
   * absent-stays-absent: a default written out is a claim about the game's behaviour that the file
   * did not make.
   *
   * @param name The INI property name to write under — the table key this instruction was found at.
   */
  write(properties: Property[], value: Readonly<Partial<T>>, name: string): void
}

/**
 * Property name to instruction — the game's own dispatch key.
 *
 * Keys are the name **as authored**; lookup folds case, because 32 retail property names are spelled
 * more than one way. Nothing is folded in place.
 */
export type Table<T> = Readonly<Record<string, Instruction<T>>>

/** The one place a field is read off a record, since `noUncheckedIndexedAccess` makes it noisy. */
const get = <V>(record: object, into: string): V | undefined => Reflect.get(record, into) as V

/**
 * Reads one section by walking its properties once, in file order.
 *
 * **Identity is not read here.** A section with no `nickname` throws in its own module, before the
 * walk starts, because a record nothing can reference is a different failure from a field this
 * library has not heard of — `@treewyrm/freelancer-game`'s `docs/SCHEMA.md`
 * lenient-with-a-diagnostics-channel, unchanged.
 *
 * Two behaviours that are easy to get backwards:
 *
 * - **Consumed means an instruction ran, not that a value was produced.** A `tuple(3)` meeting two
 *   values assigns nothing and reports, but the property is still consumed and does **not** fall into
 *   `unrecognized`. Otherwise what is in `unrecognized` would depend on whether the data was
 *   well-formed, and writing back would emit the property twice.
 * - **Recognized fields come out in table order**, whatever order the file used. That is the read
 *   half of `@treewyrm/freelancer-game`'s `docs/SCHEMA.md` round trip; leaving it to the writer alone
 *   would make a record's shape depend on how the file happened to be written.
 *
 * @param section Section to read.
 * @param table Property name to instruction.
 * @param report Optional diagnostics channel.
 * @returns Recognized fields in table-declaration order, plus `unrecognized` when anything was left
 * over, in the order it was read.
 */
export const readSection = <T extends Unrecognized>(
  section: Section,
  table: Table<T>,
  report?: Report,
): Partial<T> & Unrecognized => {
  const entries = Object.entries(table)
  const lookup = new Map(entries.map(([name, instruction]) => [fold(name), instruction]))

  const draft: Partial<T> = {}
  const unrecognized: Property[] = []

  for (const property of section.properties) {
    const instruction = lookup.get(fold(property.name))

    if (!instruction || !instruction.read(draft, property.values, report))
      unrecognized.push(property)
  }

  const ordered: Partial<T> = {}
  for (const [, { into }] of entries) if (into in draft) Reflect.set(ordered, into, get(draft, into))

  return { ...ordered, ...(unrecognized.length > 0 && { unrecognized }) }
}

/**
 * Writes a typed record back as an interim section.
 *
 * Recognized fields go out in table order and `unrecognized` follows, in the relative order it was
 * read. That is weaker than preserving the original interleaving, deliberately — see
 * `@treewyrm/freelancer-game`'s `docs/SCHEMA.md` round trip, and edit the interim document when bytes
 * matter.
 *
 * The result is a **fixed point, not byte-exact**: the int/float tag is authoring residue and is
 * re-inferred here, so a value the file wrote as `100.0` comes back as an integer.
 *
 * @param name Section name, as it should be written.
 * @param table The same table the record was read with.
 * @param value The record.
 */
export const writeSection = <T extends Unrecognized>(
  name: string,
  table: Table<T>,
  value: Readonly<T>,
): Section => {
  const properties: Property[] = []

  for (const [property, instruction] of Object.entries(table))
    instruction.write(properties, value, property)

  if (value.unrecognized) properties.push(...value.unrecognized)

  return new Section(name, ...properties)
}

/**
 * Field constructors bound to one hand-written interface.
 *
 * Call `fields<Zone>()` once per module and every entry after it infers, so the interface is named in
 * one place rather than at each of forty fields.
 *
 * **What the types catch.** `into` must be a key of `T`, so a misspelled *field* is a compile error
 * and the `known: string[]` that shadowed every hand-written reader is gone at the type level. What
 * the instruction produces must be assignable to that key: `number('nickname')` fails against
 * `nickname: string`, and `tuple(3, 'pbubble')` fails against `pbubble?: [number, number]`.
 *
 * **What they do not.** The table *key* — the INI property name — is data out of a file, not a
 * program symbol, so a typo there silently routes the property to `unrecognized` and only a corpus
 * sweep finds it. Nothing enforces exhaustiveness, because a field may legitimately be filled by a
 * group member or by the identity read that precedes the walk. Requiredness is invisible, which is
 * why identity stays a hand-written read-and-throw. And a tuple is assignable to an array, so
 * {@link Fields.numbers} typechecks against a `[number, number, number]` field and can leave two
 * elements in it — use {@link Fields.tuple} where the width is the point.
 */
export interface Fields<T> {
  /** One value as text. A repeat overrides, which is what re-running an assignment does. */
  text<K extends Keys<T, string>>(into: K): Instruction<T>

  /** One value as a number. A repeat overrides. */
  number<K extends Keys<T, number>>(into: K): Instruction<T>

  /**
   * One value as a boolean, by `INI_Reader`'s rule — so `yes` is **false**.
   *
   * Written back as the string `true` or `false`, which is how every one of the 12,699 retail
   * booleans is spelled; the boolean *value type* occurs zero times in the corpus.
   *
   * For a field that may also be written bare, use {@link flag}.
   */
  boolean<K extends Keys<T, boolean>>(into: K): Instruction<T>

  /**
   * A property whose **presence** is the value, whether or not it carries one.
   *
   * `[CollisionGroup] separable` is written bare 456 times and `= true` 28 times and never `= false`
   * — the only retail field spelled both ways. The two are the same fact rather than two readings of
   * it: [INI.md](../../docs/INI.md) records that reading index 0 of a zero-value property is a hard
   * error in the game, so a bare property cannot be being read by value, and presence is the test. A
   * value, where there is one, still coerces, so a mod's `= false` is false.
   *
   * Writes bare when true and `= false` when false. Bare is what the compiler produced for this case;
   * the explicit `false` is kept because dropping it would let a default win.
   */
  flag<K extends Keys<T, boolean>>(into: K): Instruction<T>

  /**
   * Exactly `count` numbers, or nothing — never padded to width.
   *
   * A property of the wrong width assigns nothing and reports rather than inventing the missing
   * value: reading `[Sound] range` as a fixed pair makes up a second number for 11 sounds.
   *
   * @param count Width. Declared before `into` so `N` binds before the field is checked.
   */
  tuple<N extends number, K extends Keys<T, Fixed<N>>>(count: N, into: K): Instruction<T>

  /** Every value of this occurrence as numbers, arity as read. A repeat overrides. */
  numbers<K extends Keys<T, number[]>>(into: K): Instruction<T>

  /** Every value of this occurrence as text, arity as read. A repeat overrides. */
  strings<K extends Keys<T, string[]>>(into: K): Instruction<T>

  /**
   * Every value of **every** occurrence, flattened in order into one list.
   *
   * The accumulating property — `[Ship] material_library`, `[VisEffect] textures` — where a caller
   * wants one list however it was written, on one line or on twenty. Written back as one property per
   * value, which re-reads to the same list either way. Use {@link each} when the repeats are separate
   * records rather than one list; flattening those loses the grouping.
   */
  merge<K extends Keys<T, string[]>>(into: K): Instruction<T>

  /**
   * One record per occurrence, built by a mapper.
   *
   * `[Loadout] equip`, `[BaseGood] marketgood`, `[JobBlock] attack_preference`. A mapper returning
   * `undefined` drops that row and reports, rather than appending an empty record.
   *
   * @param row Builds a record from one occurrence's values. `field.values` is the usual shape.
   * @param values Renders one back. The inverse is required so the two halves cannot drift.
   */
  each<R, K extends Keys<T, readonly R[]>>(
    into: K,
    row: (values: readonly Value[]) => R | undefined,
    values: (row: R) => Value[],
  ): Instruction<T>

  /**
   * Values kept exactly as read, one array per occurrence.
   *
   * The escape hatch for a field whose meaning is not known: `[MetaBehavior] MB_GotoGuide` is eight
   * positional values with one sample each, and keeping them raw is how the round trip survives
   * without a guess being baked in. It is also where a variable-stride field waits until the module
   * that owns it is written and its stride measured.
   */
  raw<K extends Keys<T, Value[][]>>(into: K): Instruction<T>

  /**
   * An opener that owns the properties following it, until the next opener.
   *
   * Returns a **table fragment** — the opener's own entry plus one per member name — to be spread
   * into the enclosing table, so one flat dispatch still covers the whole section and `members` is an
   * ordinary {@link Table} one level down, in the same vocabulary. The opener writes its row and that
   * row's members together, which is what puts the interleave back.
   *
   * A member with no open row is **not consumed**: it lands in `unrecognized` and reports rather than
   * throwing. It has to — 497 `[Zone] faction` properties in `UNIVERSE/SYSTEMS/INTRO/intro.ini`
   * precede every `encounter` in their section, and the game loads that file.
   *
   * @param name INI property name of the opener. Given explicitly because the fragment supplies its
   * own keys, and the opener's name is rarely the field's (`exclusion` fills `exclusions`).
   * @param into Field holding the rows.
   * @param open Builds a row from the opener's values. `undefined` opens nothing.
   * @param values Renders an opener's values back.
   * @param members Instructions for the properties the row owns.
   */
  group<R, K extends Keys<T, readonly R[]>>(
    name: string,
    into: K,
    open: (values: readonly Value[]) => R | undefined,
    values: (row: R) => Value[],
    members: Table<R>,
  ): Table<T>
}

/**
 * Builds the field constructors for one interface.
 *
 * Nothing here inspects `T` at runtime — the generics do their work at the call site, and what
 * reaches this code is a field name and a pair of converters.
 */
export const fields = <T>(): Fields<T> => {
  /** One value list in, one field out: every singular constructor is this. */
  const single = <V>(
    into: string,
    of: (values: readonly Value[], into: string, report?: Report) => V | undefined,
    to: (value: V) => Value[],
  ): Instruction<T> => ({
    into: into as Keys<T, unknown>,
    read(draft, values, report) {
      const value = of(values, into, report)
      if (value !== undefined) Reflect.set(draft, into, value)
      return true
    },
    write(properties, value, name) {
      const held = get<V>(value, into)
      if (held !== undefined) properties.push(new Property(name, ...to(held)))
    },
  })

  /** One record per occurrence, appended in file order: {@link Fields.each} and {@link Fields.raw}. */
  const many = <R>(
    into: string,
    of: (values: readonly Value[]) => R | undefined,
    to: (row: R) => Value[],
  ): Instruction<T> => ({
    into: into as Keys<T, unknown>,
    read(draft, values, report) {
      const row = of(values)

      if (row === undefined) {
        report?.(`${into}: an occurrence carried nothing to read and was dropped`)
        return true
      }

      const rows = get<R[]>(draft, into)
      if (rows) rows.push(row)
      else Reflect.set(draft, into, [row])

      return true
    },
    write(properties, value, name) {
      for (const row of get<readonly R[]>(value, into) ?? [])
        properties.push(new Property(name, ...to(row)))
    },
  })

  const first = <V>(convert: (value: Value) => V) => (values: readonly Value[]): V | undefined => {
    const [value] = values
    return value === undefined ? undefined : convert(value)
  }

  return {
    text: (into) => single(into, first(toText), (value) => [from(value)]),

    number: (into) => single(into, first(toFloat), (value) => [from(value)]),

    // As the string `true`/`false`: 12,699 retail booleans are spelled that way and none is a
    // boolean-typed value.
    boolean: (into) => single(into, first(toBoolean), (value) => [from(String(value))]),

    flag: (into) =>
      single<boolean>(
        into,
        // Presence is the reading; a value, where there is one, still coerces.
        (values) => (values.length === 0 ? true : first(toBoolean)(values)),
        (value) => (value ? [] : [from('false')]),
      ),

    tuple: <N extends number>(count: N, into: string) =>
      single<Fixed<N>>(
        into,
        (values, field, report) => {
          if (values.length !== count) {
            report?.(`${field}: expected ${count} values, found ${values.length}`)
            return undefined
          }
          return values.map(toFloat) as Fixed<N>
        },
        // `Fixed<N>` is still generic here, so its tuple form is not resolved and `map` is not on it.
        (value) => (value as number[]).map(from),
      ),

    numbers: (into) =>
      single<number[]>(
        into,
        (values) => values.map(toFloat),
        (value) => value.map(from),
      ),

    strings: (into) =>
      single<string[]>(
        into,
        (values) => values.map(toText),
        (value) => value.map(from),
      ),

    merge: (into) => ({
      into: into as Keys<T, unknown>,
      read(draft, values) {
        const held = get<string[]>(draft, into)
        const read = values.map(toText)

        if (held) held.push(...read)
        else Reflect.set(draft, into, read)

        return true
      },
      write(properties, value, name) {
        for (const entry of get<readonly string[]>(value, into) ?? [])
          properties.push(new Property(name, from(entry)))
      },
    }),

    each: (into, row, values) => many(into, row, values),

    raw: (into) => many<Value[]>(into, (values) => [...values], (row) => row),

    group: <R>(
      name: string,
      into: string,
      open: (values: readonly Value[]) => R | undefined,
      values: (row: R) => Value[],
      members: Table<R>,
    ) => {
      const rows = many<R>(into, open, values)
      const entries = Object.entries(members)

      const table: Record<string, Instruction<T>> = {
        [name]: {
          into: into as Keys<T, unknown>,
          read: rows.read,
          write(properties, value) {
            // The opener emits its row and that row's members together, so the file's interleave
            // comes back rather than every opener followed by every member.
            for (const row of get<readonly R[]>(value, into) ?? []) {
              properties.push(new Property(name, ...values(row)))
              for (const [member, instruction] of entries) instruction.write(properties, row, member)
            }
          },
        },
      }

      for (const [member, instruction] of entries)
        table[member] = {
          into: into as Keys<T, unknown>,
          read(draft, occurrence, report) {
            // The open row is a position in the draft, not state held here.
            const held = get<R[]>(draft, into)
            const row = held?.at(-1)

            if (row === undefined) {
              report?.(`${member}: no open ${name} to attach to`)
              return false
            }

            return instruction.read(row, occurrence, report)
          },
          // Written by the opener above, in the row it belongs to.
          write() {},
        }

      return table
    },
  }
}
