/**
 * Paths as the data authors wrote them, turned into paths a filesystem can take.
 *
 * Two things are wrong with a path in an INI, from anywhere but Windows. It is backslash-separated
 * (`Universe\Systems\Li01\Li01.ini`), and its case is whatever the author typed — retail's own tree
 * stores directories uppercase and filenames lowercase, so `missions\mBases.ini` has to find
 * `MISSIONS/mbases.ini`. This module fixes the first and prepares the second; `resolver.ts` does the
 * lookup that fixes it.
 *
 * Nothing here reads anything, which is why it is separate from the resolver: separator translation
 * and `..` folding are decidable from the string alone and are worth testing without a tree present.
 *
 * Folding is deliberately not done here either. A path is carried in the case it was written in
 * right up to the lookup, because that is what has to be written back out.
 */
import { fold } from './string.js'

/** What {@link join} emits and what {@link import('./filesystem.js').FileSystem} takes. */
export const SEPARATOR = '/'

/** Either separator, since `[Data]` uses `\` and a consumer will pass `/`. */
const SEPARATORS = /[\\/]+/

/**
 * Splits a path into segments, folding `.` and `..` away.
 *
 * Empty segments are dropped rather than preserved, which is what makes a trailing separator
 * harmless — `fonts\files\` is the `[Data] fonts_dir` value and names a directory, not a file with
 * an empty name.
 *
 * @param path Path in either separator.
 * @throws RangeError when `..` would climb above the root, which no install-relative path can mean.
 */
export const split = (path: string): string[] => {
  const segments: string[] = []

  for (const segment of path.split(SEPARATORS)) {
    if (segment === '' || segment === '.') continue

    if (segment !== '..') {
      segments.push(segment)
      continue
    }

    if (segments.pop() === undefined)
      throw new RangeError(`Path '${path}' climbs above the install root`)
  }

  return segments
}

/**
 * Joins parts into one normalized path.
 *
 * Every part is split in turn, so joining a directory to a relative path is the same operation as
 * normalizing one path — which is what {@link resolve} relies on.
 */
export const join = (...parts: string[]): string => split(parts.join(SEPARATOR)).join(SEPARATOR)

/**
 * Resolves a path against the directory a file lives in.
 *
 * This is what `[Freelancer] data path` needs: `..\data` is written relative to `EXE/`, because
 * `EXE` is the game's working directory, and means the sibling `DATA`.
 *
 * @param from Directory to resolve against. Pass {@link directoryOf} of a file, not the file.
 * @param path Path relative to it.
 */
export const resolve = (from: string, path: string): string => join(from, path)

/** The directory part, or the empty string when the path names something in the root. */
export const directoryOf = (path: string): string => split(path).slice(0, -1).join(SEPARATOR)

/** The last segment, or the empty string for an empty path. */
export const nameOf = (path: string): string => split(path).at(-1) ?? ''

/**
 * Whether two paths name the same thing, comparing the way the game compares names.
 *
 * Folds with {@link fold} rather than `toLowerCase`, for the reason `utility/string.ts` gives: ASCII
 * is what `stricmp` folds, and folding further would make two distinct windows-1252 names equal.
 */
export const equals = (a: string, b: string): boolean => fold(join(a)) === fold(join(b))
