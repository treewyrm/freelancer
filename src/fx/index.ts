/**
 * Effects: what fires, what it looks like, and the script that sequences it.
 *
 * The first domain module over INI, and it was chosen for that on purpose. `./fx` is where an INI
 * reference becomes an asset — a `[VisEffect]` names an `.ale` and one effect inside it — so it is
 * the shortest path from the data graph to something a renderer can draw. It also carries the one
 * structure nothing else in the library has had to read: a **fuse script**, a run of sections that
 * belong to the section before them. `[Trigger]`'s `act_*` lists will need the same shape, so it is
 * worth getting right once here.
 *
 * The files are the `effects`, `effect_shapes` and `fuses` keys of `[Data]`, which is 30 of its 99
 * entries. `./game` routes them here.
 *
 * The coercion helpers this module was built on **now live in [`./schema`](../../docs/SCHEMA.md)**.
 * They started here as `field.ts` — the answer to SCHEMA.md's question about how the typed layer
 * should be shaped — and moved when `./ai` became the second module to want them, which is the
 * condition SCHEMA.md set. Import them from `#/schema` rather than from here.
 */

export * from './types.js'
export * from './effect.js'
export * from './viseffect.js'
export * from './fuse.js'
