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
 * `field.ts` is exported because it is the seed of the planned `./schema`: hand-written readers over
 * a few coercion helpers, which is the answer this module gives to the open question in
 * [SCHEMA.md](../../docs/SCHEMA.md) about how the typed layer should be shaped.
 */

export * from './types.js'
export * from './effect.js'
export * from './viseffect.js'
export * from './fuse.js'
export * as field from './field.js'
