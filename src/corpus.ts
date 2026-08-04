import { globSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Locates retail Freelancer data so tests can read the real thing.
 *
 * Test support only — not part of any package entry point and never bundled. Set `FREELANCER_DATA`
 * to point at a `DATA` directory elsewhere; without one, `available` is false and every corpus
 * suite skips itself, leaving the rest of the tests running on their own fixtures. Same convention
 * and same install as utf2json.
 */
export const root = process.env['FREELANCER_DATA'] ?? join(homedir(), 'Downloads/Freelancer/DATA')

/**
 * The three plain-text INIs outside `DATA`, which is also the only place `@include` appears. Absent
 * from most installs' `DATA` sweep, so they are located separately and skipped when missing.
 */
export const executables = join(root, '../EXE')

const exists = (path: string): boolean => {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

export const available = exists(root)

/** Reason to hand to a suite's `skip` option, or `false` to run it. */
export const skip = available ? false : `no game data at ${root}`

export interface Asset {
  /** Path relative to the data root. */
  path: string

  /** File bytes, verbatim. */
  data: Uint8Array
}

const cache = new Map<string, Asset[]>()

/**
 * Reads every `.ini` under a root, verbatim. Cached, so suites sharing a root share the read.
 *
 * Both encodings come back — this is the corpus a reader is supposed to sort out for itself, and
 * splitting them here would hide the one text file among the 1,251 binary ones.
 */
export const load = (from: string = root): Asset[] => {
  let assets = cache.get(from)

  if (!assets)
    cache.set(
      from,
      (assets = exists(from)
        ? globSync('**/*.ini', { cwd: from, nocase: true } as { cwd: string }).map((path) => ({
            path,
            data: readFileSync(join(from, path)),
          }))
        : []),
    )

  return assets
}
