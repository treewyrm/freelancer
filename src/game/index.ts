/**
 * The install as a whole: where the files are, what order they load in, and what they resolve into.
 *
 * Every other entry point in this library takes bytes and gives back meaning. This one is the layer
 * above that — the part that knows an install starts at `EXE/freelancer.ini`, that `resources.dll`
 * comes before the `[Resources]` list, that `[Data]` order is load-bearing, and that
 * `missions\mBases.ini` means `MISSIONS/mbases.ini` on anything but Windows.
 *
 * It stays isomorphic by never touching storage: the consumer implements {@link FileSystem} and this
 * module does the rest. That is also why it is the only asynchronous code here.
 *
 * See [GAME.md](../../docs/GAME.md).
 */

export * from './filesystem.js'
export * from './config.js'
export * from './hardcoded.js'
export { default as Resolver, type Collision } from './resolver.js'
export { default as Assets, type Contribution } from './assets.js'
export { default as Game, type OpenOptions, type LoadedEntry, type Effects } from './game.js'
export * as path from './path.js'
