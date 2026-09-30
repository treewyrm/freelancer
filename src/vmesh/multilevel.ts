import Directory from '#/utf/directory.js'
import { readVMeshPart, writeVMeshPart, type VMeshPart } from './part.js'

/**
 * A part's detail levels, switched by camera distance.
 *
 * N levels want N+1 breakpoints, and the ranges are half-open: level `i` covers
 * `[ranges[i], ranges[i+1])`. Past the last breakpoint the part vanishes, which is a state the
 * format has and not an absence to clamp away. **LOD is per part, not per model.**
 */
export interface MultiLevel {
  type: 'multilevel'

  /**
   * `Switch2`, the N+1 distance breakpoints for N levels. Absent when the directory has no
   * `Switch2`, which four retail parts leave out — {@link getLevel} then takes the single range
   * `[0, 1000]` the game assumes.
   */
  ranges?: number[]

  levels: VMeshPart[]
}

/** The breakpoints the game assumes for a `MultiLevel` with no `Switch2`. */
const DEFAULT_RANGES = [0, 1000]

/**
 * Picks the detail level covering a camera distance.
 *
 * `undefined` past the last breakpoint is the model's cue to vanish, so it is returned rather than
 * clamped away, and the breakpoint list is walked as given — four retail capital ships carry
 * denormal junk mid-list, and sorting it would change which level shows.
 */
export function getLevel(
  { ranges = DEFAULT_RANGES, levels }: MultiLevel,
  distance: number,
): VMeshPart | undefined {
  for (let i = 0, l = ranges.length - 1, min: number, max: number; i < l; i++) {
    min = ranges[i] ?? 0
    max = ranges[i + 1] ?? Infinity

    if (distance >= min && distance < max) return levels[i]
  }

  return
}

/**
 * Reads a `MultiLevel` directory: the `Switch2` breakpoints and one `Level<n>` subdirectory per
 * level. `undefined` when the part has no detail levels, so a caller can probe
 * (`readMultiLevel(parent) ?? readVMeshPart(parent)`).
 *
 * An absent `Switch2` leaves `ranges` off rather than filling in the game's default, so the
 * directory is written back without one. Levels stop at the first gap in the numbering rather than
 * being scanned for.
 */
export function readMultiLevel(parent: Directory): MultiLevel | undefined {
  const directory = parent.getDirectory('MultiLevel')
  if (!directory) return

  const levels: VMeshPart[] = []
  const switches = directory.getFile('Switch2')

  for (let i = 0; ; i++) {
    const level = directory.getDirectory(`Level${i}`)
    if (!level) break

    const part = readVMeshPart(level)
    if (!part) break

    levels[i] = part
  }

  return switches
    ? { type: 'multilevel', ranges: [...switches.readFloats()], levels }
    : { type: 'multilevel', levels }
}

/**
 * Writes a `MultiLevel` directory. `Switch2` is emitted whenever `ranges` is present, including for
 * a single level, and the breakpoints are written in the order given.
 * @throws RangeError when `ranges` is present and does not hold one more breakpoint than there are
 * levels, which every retail `Switch2` does.
 */
export function writeMultiLevel({ ranges, levels }: MultiLevel): Directory {
  const directory = new Directory('MultiLevel')

  if (ranges) {
    if (ranges.length !== levels.length + 1)
      throw new RangeError(`${levels.length} levels want ${levels.length + 1} breakpoints`)

    directory.ensureFile('Switch2').setFloats(...ranges)
  }

  for (let i = 0; i < levels.length; i++)
    directory.ensureDirectory(`Level${i}`).children.push(writeVMeshPart(levels[i]!))

  return directory
}
