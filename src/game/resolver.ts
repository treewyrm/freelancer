import type { Entry, FileSystem } from './filesystem.js'
import { SEPARATOR, split } from './path.js'
import { fold } from '#/utility/string.js'

/**
 * Finds the file an authored path meant, whatever case it was written in.
 *
 * The game ran on Windows and compared filenames with the case-insensitive rules of the OS, so the
 * data is authored as if case did not exist — `missions\mBases.ini`, `Universe\universe.ini`,
 * `fx\weapons\weapons_ale.ini` — and a case-sensitive filesystem finds none of them. Retail's own
 * tree makes the mismatch total rather than occasional: directories are uppercase and filenames
 * lowercase, so almost every path in `[Data]` disagrees with disk in both halves.
 *
 * **Resolution is a folded index per directory, built lazily from
 * {@link import('./filesystem.js').FileSystem.list}.** Probing candidate spellings instead would be
 * both slow and wrong — there is no rule that generates `MISSIONS/mbases.ini` from
 * `missions\mBases.ini` short of knowing what is there. The index is safe because folding is
 * injective across the corpus: **8,368 files in retail `DATA`, and zero pairs collide when the whole
 * path is folded.** Where a tree does collide the first listed entry wins and the loss is recorded
 * in {@link Resolver.collisions} rather than thrown, because one ambiguous pair should not take a
 * whole install down.
 *
 * Folding is {@link fold}, ASCII-only, which is what `stricmp` does and therefore what the game did.
 * `toLowerCase` would fold characters windows-1252 can carry and silently merge two distinct names.
 *
 * The cache holds the listing promise rather than the listing, so resolving two paths through the
 * same directory at once lists it once.
 */

/** Two entries in one directory whose names fold together. Empty on retail. */
export interface Collision {
  /** Directory holding both, in its real case. */
  directory: string

  /** The folded name they share. */
  folded: string

  /** The entry that won, being listed first. */
  kept: string

  /** The entry that is now unreachable. */
  dropped: string
}

export default class Resolver {
  readonly #fs: FileSystem

  /** Folded name → entry, by real directory path. */
  readonly #directories = new Map<string, Promise<ReadonlyMap<string, Entry>>>()

  readonly #collisions: Collision[] = []

  constructor(fs: FileSystem) {
    this.#fs = fs
  }

  /** Ambiguities found while indexing, in the order they were met. */
  get collisions(): readonly Collision[] {
    return this.#collisions
  }

  /**
   * Indexes one directory, or yields an empty index when there is none.
   *
   * A missing directory is not an error here: a path is resolved segment by segment and running out
   * of tree partway is exactly how a reference that does not resolve reports itself.
   */
  #index(directory: string): Promise<ReadonlyMap<string, Entry>> {
    let pending = this.#directories.get(directory)
    if (pending) return pending

    pending = (async () => {
      const entries = new Map<string, Entry>()

      let listing: Iterable<Entry>

      try {
        listing = await this.#fs.list(directory)
      } catch {
        return entries
      }

      for (const entry of listing) {
        const folded = fold(entry.name)
        const existing = entries.get(folded)

        if (existing) {
          this.#collisions.push({
            directory,
            folded,
            kept: existing.name,
            dropped: entry.name,
          })

          continue
        }

        entries.set(folded, entry)
      }

      return entries
    })()

    this.#directories.set(directory, pending)
    return pending
  }

  /**
   * The entry an authored path names, or `undefined` when the tree does not hold one.
   *
   * @param path Path in either separator and any case.
   */
  async entryOf(path: string): Promise<(Entry & { path: string }) | undefined> {
    const segments = split(path)

    let directory = ''
    let entry: Entry | undefined

    for (const [index, segment] of segments.entries()) {
      // Everything but the last segment has to be a directory to keep walking.
      if (entry && !entry.directory) return undefined

      entry = (await this.#index(directory)).get(fold(segment))
      if (!entry) return undefined

      directory = index === 0 ? entry.name : directory + SEPARATOR + entry.name
    }

    return entry && { ...entry, path: directory }
  }

  /**
   * The real path an authored path names, in the case the tree stores.
   * @param path Path in either separator and any case.
   */
  async resolve(path: string): Promise<string | undefined> {
    return (await this.entryOf(path))?.path
  }

  /** Whether the tree holds anything at this path. */
  async has(path: string): Promise<boolean> {
    return (await this.entryOf(path)) !== undefined
  }

  /**
   * Reads a file named by an authored path.
   * @param path Path in either separator and any case.
   * @throws RangeError naming the path when nothing resolves, or when it resolves to a directory.
   */
  async read(path: string): Promise<Uint8Array> {
    const entry = await this.entryOf(path)

    if (!entry) throw new RangeError(`Path '${path}' does not resolve in this install`)
    if (entry.directory) throw new RangeError(`Path '${path}' resolves to a directory`)

    return this.#fs.read(entry.path)
  }

  /**
   * Lists a directory named by an authored path.
   * @param path Path in either separator and any case, or the empty string for the root.
   * @throws RangeError naming the path when nothing resolves, or when it resolves to a file.
   */
  async list(path: string): Promise<Iterable<Entry>> {
    if (split(path).length === 0) return (await this.#index('')).values()

    const entry = await this.entryOf(path)

    if (!entry) throw new RangeError(`Path '${path}' does not resolve in this install`)
    if (!entry.directory) throw new RangeError(`Path '${path}' resolves to a file`)

    return (await this.#index(entry.path)).values()
  }

  /**
   * Forgets cached listings, so a tree that changed underneath is seen again.
   *
   * Recorded collisions are kept: they describe what was found, not what is currently cached.
   *
   * A tool that writes into the tree invalidates one directory rather than re-listing the whole
   * install — 8,368 files in retail, and a save touches one of them. Two things about the narrow
   * form that are not obvious:
   *
   * - **A new file needs its directory forgotten; a new *directory* needs its parent forgotten too**,
   *   and a directory that did not exist when it was first asked for cached an empty index rather
   *   than nothing. Invalidating the ancestors as well is the caller's to do, and is cheap.
   * - Matching folds, as everything here folds, so the argument may be in any case. Passing a path
   *   that indexes nothing is not an error: it is what invalidating a directory nobody has listed
   *   yet looks like.
   *
   * @param directory Directory to forget, in any case. Every cached listing when omitted.
   */
  clear(directory?: string): void {
    if (directory === undefined) {
      this.#directories.clear()
      return
    }

    const target = fold(split(directory).join(SEPARATOR))

    for (const key of this.#directories.keys())
      if (fold(key) === target) this.#directories.delete(key)
  }
}
