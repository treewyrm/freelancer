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
  ranges: number[]
  levels: VMeshPart[]
}

/**
 * Picks the detail level covering a camera distance.
 *
 * `undefined` past the last breakpoint is the model's cue to vanish, so it is returned rather than
 * clamped away, and the breakpoint list is walked as given — four retail capital ships carry
 * denormal junk mid-list, and sorting it would change which level shows.
 */
export function atRange({ ranges, levels }: MultiLevel, value: number): VMeshPart | undefined {
  for (let i = 0, l = ranges.length - 1, min: number, max: number; i < l; i++) {
    min = ranges[i] ?? 0
    max = ranges[i + 1] ?? Infinity

    if (value >= min && value < max) return levels[i]
  }

  return
}

/**
 * Reads a `MultiLevel` directory: the `Switch2` breakpoints and one `Level<n>` subdirectory per
 * level. `undefined` when the part has no detail levels, so a caller can probe
 * (`readMultiLevel(parent) ?? readVMeshPart(parent)`).
 *
 * An absent `Switch2` defaults to `[0, 1000]`, the single range the game assumes. Levels stop at the
 * first gap in the numbering rather than being scanned for.
 */
export function readMultiLevel(parent: Directory): MultiLevel | undefined {
  const directory = parent.getDirectory('MultiLevel')
  if (!directory) return

  const levels: VMeshPart[] = []
  const ranges: number[] = [...(directory.getFile('Switch2')?.readFloats() ?? [0, 1000])]

  for (let i = 0; ; i++) {
    const level = directory.getDirectory(`Level${i}`)
    if (!level) break

    const part = readVMeshPart(level)
    if (!part) break

    levels[i] = part
  }

  return { type: 'multilevel', ranges, levels }
}

/**
 * Writes a `MultiLevel` directory. `Switch2` is always emitted, including for a single level, and
 * the breakpoints are written in the order given — N levels want N+1 of them, which is the caller's
 * to hold to.
 */
export function writeMultiLevel({ ranges, levels }: MultiLevel): Directory {
  const directory = new Directory('MultiLevel')

  directory.setFile('Switch2').writeFloats(...ranges)

  for (let i = 0; i < levels.length; i++)
    directory.setDirectory(`Level${i}`).children.push(writeVMeshPart(levels[i]!))

  return directory
}
