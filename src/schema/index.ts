/**
 * The typed layer's shared machinery: coercion helpers and the round-trip contract.
 *
 * Deliberately small, and deliberately not a framework. `@treewyrm/freelancer-game`'s `docs/SCHEMA.md`
 * asked whether the layer above `./ini` should be runtime schema objects that infer their TypeScript
 * type or hand-written readers over a few helpers, and said to settle it once domain modules existed.
 * `./fx` answered *hand-written readers*; `./ai` is the second module and did not change the answer,
 * so what lives here is the helpers themselves and the one interface every typed record extends.
 *
 * A domain module imports from here. It never imports from another domain module — Invariant 2 — and
 * this is the shared floor that makes that possible. Every domain module (`./fx`, `./ai`, `./base`,
 * `./universe`, `./game`) lives in the sibling `@treewyrm/freelancer-game` package now, which is why
 * their design documents do too.
 *
 * See `@treewyrm/freelancer-game`'s `docs/DICTIONARY.md` for what the helpers are reading: every
 * retail `(section, property)` pair with the field kind it resolves to.
 */

export * from './types.js'
export * as field from './field.js'
export * from './property.js'
export * from './document.js'
