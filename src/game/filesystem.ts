/**
 * The only way this library touches storage, and it does not: the consumer supplies it.
 *
 * Invariant 1 says the library resolves references rather than fetching them, which is what keeps it
 * isomorphic. A manager that follows the game's load order cannot honour that by reading files, only
 * by being handed a way to read them — so the whole contract is these two methods, and `src/game/`
 * imports nothing from `node:*`. `tsdown`'s `platform: 'neutral'` is what enforces that mechanically.
 *
 * **Asynchronous, and the only asynchronous thing in the library.** Every reader stays synchronous
 * and is called on bytes the manager has already resolved. A browser cannot offer bytes any other
 * way — the File System Access API, `fetch` and a directory picker are all promise-shaped — and a
 * synchronous contract would force a consumer to load the entire tree into memory before asking for
 * one file, which is precisely what loading on demand exists to avoid.
 *
 * {@link FileSystem.list} is here for one reason: case. Retail paths are authored with Windows
 * case-insensitivity and disagree with the real filenames — `missions\mBases.ini` is
 * `MISSIONS/mbases.ini` on disk — so something has to fold. Making that the consumer's problem means
 * every consumer reimplements the same fold and fails silently when it drifts, so the manager owns
 * it and needs directory contents to build the index from. See `resolver.ts`.
 */

/** One entry in a directory listing. */
export interface Entry {
  /** Name as stored, in its real case. */
  name: string

  /** Whether the entry is a directory rather than a file. */
  directory: boolean
}

/**
 * Read access to an install tree.
 *
 * Paths are relative to the install root — the directory holding `EXE` and `DATA` — and use `/`,
 * which is what {@link import('./path.js').join} produces. Nothing here ever sees the backslashes
 * the INI files are authored with; `path.ts` translates those first.
 */
export interface FileSystem {
  /**
   * Reads a whole file.
   * @param path Install-relative path, in the case the tree actually stores.
   */
  read(path: string): Promise<Uint8Array>

  /**
   * Lists one directory, without recursing.
   *
   * @param path Install-relative path, or the empty string for the root.
   * @throws Whatever the host raises for a missing directory. The resolver treats a throw as
   * "no such directory" and returns no match, so a consumer need not distinguish the cases.
   */
  list(path: string): Promise<Iterable<Entry>>
}
