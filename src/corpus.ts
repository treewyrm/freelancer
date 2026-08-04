import { globSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import Directory from '#/utf/directory.js'

/**
 * Locates retail Freelancer data so tests can read the real thing.
 *
 * Test support only — this module is not part of any package entry point and is never bundled.
 * Set `FREELANCER_DATA` to point at a DATA directory elsewhere; without one, `available` is false
 * and every corpus suite skips itself, leaving the rest of the tests running on their own fixtures.
 */
export const root = process.env['FREELANCER_DATA'] ?? join(homedir(), 'Downloads/Freelancer/DATA')

/**
 * The three plain-text INIs outside `DATA`, which is also the only place `@include` appears, and
 * the resource DLLs. Absent from the `DATA` sweep, so this root is swept separately and skipped
 * when missing.
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

/** Lists asset paths relative to the data root, matched case-insensitively by extension. */
export function list(...extensions: string[]): string[] {
  if (!available) return []

  const pattern = new RegExp(`\\.(${extensions.join('|')})$`, 'i')

  return globSync('**/*', { cwd: root }).filter((path) => pattern.test(path))
}

export interface Asset {
  /** Path relative to the root it was swept from. */
  path: string

  /** File bytes, verbatim. */
  data: Uint8Array
}

const bytes = new Map<string, Asset[]>()

/**
 * Reads every listed asset verbatim, for the formats that are not UTF trees — `.sur`, and every
 * INI and THN. Cached by pattern, so suites sharing a sweep share the read.
 */
export function raw(...extensions: string[]): Asset[] {
  const key = extensions.join(',')
  let assets = bytes.get(key)

  if (!assets)
    bytes.set(
      key,
      (assets = list(...extensions).map((path) => ({
        path,
        data: readFileSync(join(root, path)),
      }))),
    )

  return assets
}

const globbed = new Map<string, Asset[]>()

/**
 * Reads every file matching a glob under a root, verbatim. Cached the same way {@link raw} is.
 *
 * This is the sweep for the text formats, where {@link raw}'s extension match is the wrong handle:
 * both INI encodings come back from one pattern — this is the corpus a reader is supposed to sort
 * out for itself, and splitting them here would hide the one text INI among the 1,251 binary ones —
 * and the scene scripts are spread across `SCRIPTS`, `MISSIONS` and `RANDOMMISSIONS`, so a single
 * sweep from the root is what finds all 1,506. It also reaches {@link executables}, which is
 * outside the `DATA` tree {@link list} walks.
 */
export const glob = (from: string = root, pattern = '**/*.ini'): Asset[] => {
  const key = `${from}\0${pattern}`
  let assets = globbed.get(key)

  if (!assets)
    globbed.set(
      key,
      (assets = exists(from)
        ? globSync(pattern, { cwd: from, nocase: true } as { cwd: string }).map((path) => ({
            path,
            data: readFileSync(join(from, path)),
          }))
        : []),
    )

  return assets
}

export interface TreeAsset {
  /** Path relative to the data root. */
  path: string

  /** Parsed UTF tree. */
  root: Directory
}

const trees = new Map<string, TreeAsset[]>()

/**
 * Parses every listed asset once, caching by pattern so suites sharing a set of extensions
 * share the parse. No test case depends on another having run first.
 */
export function load(...extensions: string[]): TreeAsset[] {
  const key = extensions.join(',')
  let assets = trees.get(key)

  if (!assets)
    trees.set(
      key,
      (assets = raw(...extensions).map(({ path, data }) => ({
        path,
        root: Directory.read(data),
      }))),
    )

  return assets
}
