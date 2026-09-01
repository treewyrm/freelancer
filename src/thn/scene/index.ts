/**
 * The typed layer for scene scripts: entities and events rather than Lua tables.
 *
 * Sits on top of [`../index.ts`](../index.ts), which reads either encoding into an interim
 * `Globals`. Take those here to get structures with real types, and hand them back to write
 * them. The vocabulary and the evidence behind every value are in
 * [THORN.md](../../../docs/THORN.md).
 *
 * ```ts
 * import * as thn from '@treewyrm/freelancer/thn'
 * import * as scene from '@treewyrm/freelancer/thn/scene'
 *
 * const script = scene.read(thn.read(bytes))
 * const cameras = script.entities.filter((entity) => entity.type === 'CAMERA')
 * const back = thn.write(scene.write(script))
 * ```
 *
 * **This layer folds the two export forms and the interim layer does not.** `type = SCENE` and
 * `type = 9` are different bytecode, so `../types.ts` keeps them apart; both are `'SCENE'` here.
 * Writing always emits the symbolic form, which makes `typed → interim → typed` an identity and
 * `interim → typed → interim` a fixed point rather than byte-exact. Edit the interim document when
 * the bytes matter.
 */

export * from './types.js'
export * as data from './data.js'
export { read } from './read.js'
export { write } from './write.js'
