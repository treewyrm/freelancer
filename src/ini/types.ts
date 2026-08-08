/**
 * The interim document model, and the thing both encodings parse into.
 *
 * `Document`, `Section` and `Property` are classes — identity and mutation are the point, the same
 * as `utf/`'s `Directory`/`File`. A document read from a BINI, parsed from text or built by hand is
 * the same shape, and either writer accepts any of them.
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
 * A verbatim source line the parser did not interpret — blank, comment-only, or unrecognized.
 *
 * Text-only: BINI has no comment syntax, so a `Line` never appears in a document read from binary,
 * and the binary writer drops any that end up in a hand-built document.
 */
export type Line = string
