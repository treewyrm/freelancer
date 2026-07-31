import { globSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import Directory from './directory.js'

/**
 * Locates retail Freelancer assets so tests can read the real thing.
 *
 * Test support only — this module is not part of any package entry point and is never bundled.
 * Set `FREELANCER_DATA` to point at a DATA directory elsewhere; without one, `available` is false
 * and every corpus suite skips itself, leaving the rest of the tests running on their own fixtures.
 */
export const root = process.env['FREELANCER_DATA'] ?? join(homedir(), 'Downloads/Freelancer/DATA')

export const available = (() => {
  try {
    return statSync(root).isDirectory()
  } catch {
    return false
  }
})()

/** Reason to hand to a suite's `skip` option, or `false` to run it. */
export const skip = available ? false : `no game data at ${root}`

export interface Asset {
  path: string
  root: Directory
}

/** Lists asset paths relative to the data root, matched case-insensitively by extension. */
export function list(...extensions: string[]): string[] {
  if (!available) return []

  const pattern = new RegExp(`\\.(${extensions.join('|')})$`, 'i')

  return globSync('**/*', { cwd: root }).filter((path) => pattern.test(path))
}

/**
 * Parses every listed asset once, caching by pattern so suites sharing a set of extensions
 * share the parse. No test case depends on another having run first.
 */
const cache = new Map<string, Asset[]>()

export function load(...extensions: string[]): Asset[] {
  const key = extensions.join(',')
  let assets = cache.get(key)

  if (!assets)
    cache.set(
      key,
      (assets = list(...extensions).map((path) => ({
        path,
        root: Directory.read(readFileSync(join(root, path))),
      }))),
    )

  return assets
}
