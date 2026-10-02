import Directory from '#/utf/directory.js'
import { readVMeshPart, writeVMeshPart, type VMeshPart } from './part.js'

/**
 * A part's detail levels, switched by how large the part is on screen.
 *
 * N levels want N+1 breakpoints, and level `i` ends at `ranges[i + 1]`, inclusive. The game reads
 * only these upper ends — `ranges[i]` is level `i`'s start for whoever writes the list, never for
 * the selector. Past the last end the part is not drawn, which is a state the format has and not an
 * absence to clamp away. **LOD is per part, not per model.**
 */
export interface MultiLevel {
  type: 'multilevel'

  /**
   * `Switch2`, the N+1 breakpoints for N levels: the game counts the levels as this list's length
   * − 1, not from the `Level<n>` directories. Absent when the directory has no `Switch2`, which four retail parts leave
   * out — the game then has one level and two uninitialised breakpoints, so there is no range to
   * assume and {@link getLevel} picks nothing.
   */
  ranges?: number[]

  levels: VMeshPart[]
}

/**
 * Picks the detail level the game draws at a metric — `rendcomp.dll`'s selector: the first level
 * `i` whose upper end `ranges[i + 1]` is at least `metric`.
 *
 * `metric` is not a distance. The game computes it as the depth of the part's centre in view space
 * × tan(fovx / 2) ÷ the largest axis scale of the instance transform, and compares it against the
 * raw `Switch2` values; an archetype's `LODranges` overwrites those entry by entry before this sees
 * them, which is the consumer's to apply.
 *
 * `undefined` past the last end is the model's cue to vanish, so it is returned rather than
 * clamped away; it is also returned for a negative metric, and when `ranges` is absent, as the game
 * leaves that part uninitialised. The breakpoint list is walked as given — four retail capital ships
 * carry denormal junk mid-list, and sorting it would change which level shows.
 */
export function getLevel({ ranges, levels }: MultiLevel, metric: number): VMeshPart | undefined {
  if (!ranges || metric < 0) return

  for (let i = 0, l = Math.min(ranges.length - 1, levels.length); i < l; i++)
    if (ranges[i + 1]! >= metric) return levels[i]

  return
}

/**
 * Reads a `MultiLevel` directory: the `Switch2` breakpoints and one `Level<n>` subdirectory per
 * level. `undefined` when the part has no detail levels, so a caller can probe
 * (`readMultiLevel(parent) ?? readVMeshPart(parent)`).
 *
 * An absent `Switch2` leaves `ranges` off, so the directory is written back without one. Levels stop
 * at the first gap in the numbering rather than being scanned for.
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
