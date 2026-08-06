import type { Property } from '#/ini/types.js'

/**
 * What every typed INI record shares, and the type-level vocabulary its readers are written in.
 *
 * One interface, in the one place both `./fx` and `./ai` can reach, because `@treewyrm/freelancer-game`'s
 * `docs/SCHEMA.md` lossless round trip is a contract of the typed layer as a whole rather than of any
 * module in it. Invariant 3 is stated once here and inherited everywhere.
 */

/** Anything read from a section keeps what its reader did not recognize. */
export interface Unrecognized {
  /**
   * Properties with no field on this type, in the order they were read.
   *
   * A modded install carries fields this library has never heard of, and retail carries authoring
   * residue of its own: `[Effect]` has a property named `:`, `[Object]` has one named `260800`,
   * `[CollisionGroup]` has one that is a row of dashes. All of it survives a read-modify-write
   * instead of being silently deleted.
   */
  unrecognized?: Property[]
}

/**
 * A tuple of exactly `N` numbers.
 *
 * 349 retail `(section, property)` pairs are a fixed width of two or more, and every one of them is
 * declared in its module as `[number, number]` or wider. Without this, a helper that takes a width
 * can only return `number[]`, and every call site casts — which is a cast that would still compile
 * if the width and the field disagreed.
 */
export type Fixed<N extends number, A extends number[] = []> = A['length'] extends N
  ? A
  : Fixed<N, [...A, number]>

/**
 * Keys of `T` whose declared type accepts `V`, ignoring the optionality every field here has.
 *
 * How a reader names the field it fills without the type being inferred from what it reads:
 * `@treewyrm/freelancer-game`'s `docs/SCHEMA.md` settled that the interfaces are hand-written and are
 * the contract, so this checks against one rather than producing one.
 *
 * **A tuple is assignable to an array**, so `Keys<T, number[]>` also matches a `[number, number]`
 * field and cannot stop a variable-width read from filling a fixed-width one. Use {@link Fixed}
 * where the width matters; the type system will not close that gap.
 */
export type Keys<T, V> = Extract<
  {
    [K in keyof T]-?: NonNullable<T[K]> extends V ? K : never
  }[keyof T],
  string
>


/**
 * Where a lenient reader says what it chose not to do.
 *
 * Optional at every entry point and defaulting to nothing, per Invariant 5 — no reader depends on
 * one being passed. A section carrying something surprising is a thing to read and record, not a
 * file to reject: what throws is identity alone, because a record nothing can reference is a
 * different failure from a field this library has not heard of.
 */
export type Report = (message: string) => void
