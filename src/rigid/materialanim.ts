import Directory from '#/utf/directory.js'
import { getResource, type Hashable } from '#/hash.js'

/**
 * A material's UV transform, or its rate of change per second.
 *
 * The scales are displacements from 1: the game multiplies by `1 + uScale` and `1 + vScale`.
 */
export interface MaterialTransform {
  /** U offset. */
  uOffset: number

  /** V offset. */
  vOffset: number

  /** U scale, as a displacement from 1. */
  uScale: number

  /** V scale, as a displacement from 1. */
  vScale: number
}

/**
 * One segment of a material animation: where the UV transform starts, how fast it moves, and for
 * how long before the next segment takes over.
 *
 * `start` and `velocity` are both read rather than derived — nothing integrates across a boundary,
 * so where one segment's velocity arrives and where the next starts can differ, and the game jumps.
 * See [What `MAKeys` is not](../../docs/modules/RIGID.md#what-makeys-is-not).
 */
export interface MaterialSegment {
  /** Segment duration in seconds, from `MADeltas`. */
  duration: number

  /**
   * Transform the segment starts from: `MAKeys[i − 1]`, and on the first segment the four zeros
   * the file leaves implicit. The writer refuses a first segment that starts anywhere else, since
   * the file has nowhere to put it.
   */
  start: MaterialTransform

  /** Transform velocity, per second, from `MADeltas`. */
  velocity: MaterialTransform
}

/** Animates the UV transform of a single material, named by the directory holding it. */
export interface MaterialAnim {
  /** Material name. */
  name: string

  /**
   * `MAFlags`, carried for the round trip. The game stores it and never reads it back; retail data
   * holds `2`, or `0` in four entries.
   */
  flags: number

  /** Segments, in playback order. */
  segments: MaterialSegment[]
}

/**
 * The material animations one file carries. A root-level sibling of `Cmpnd` rather than part of the
 * model, since it animates materials by name and not parts.
 */
export type MaterialAnimLibrary = MaterialAnim[]

/** Floats per `MADeltas` and `MAKeys` entry. */
const deltaLength = 5
const keyLength = 4

const zero = (): MaterialTransform => ({ uOffset: 0, vOffset: 0, uScale: 0, vScale: 0 })

const isZero = ({ uOffset, vOffset, uScale, vScale }: MaterialTransform): boolean =>
  !uOffset && !vOffset && !uScale && !vScale

/** Animation duration in seconds, the sum of its segment durations. */
export const getMaterialAnimDuration = ({ segments }: MaterialAnim): number =>
  segments.reduce((total, { duration }) => total + duration, 0)

/** Finds a material animation by name. */
export const getMaterialAnim = (
  library: MaterialAnimLibrary,
  name: Hashable,
): MaterialAnim | undefined => getResource(library, ({ name }) => name, name)

/**
 * Reads a material animation from its directory.
 * @param parent Directory named after the material
 */
export function readMaterialAnim(parent: Directory): MaterialAnim {
  const [count] = parent.getFile('MACount')?.readIntegers() ?? []
  if (count === undefined) throw new Error(`Missing MACount in ${parent.name}`)
  if (count < 1)
    throw new RangeError(`Invalid material animation count in ${parent.name}: ${count}`)

  const [flags = 0] = parent.getFile('MAFlags')?.readIntegers() ?? []

  const deltas = [...(parent.getFile('MADeltas')?.readFloats() ?? [])]
  if (deltas.length < count * deltaLength)
    throw new RangeError(`MADeltas in ${parent.name} holds fewer than ${count} keyframes`)

  // The first key is the material's own UV state, so only the rest are stored. A single-segment
  // animation has none at all, and retail omits the file rather than writing it empty.
  const keys = [...(parent.getFile('MAKeys')?.readFloats() ?? [])]
  if (keys.length < (count - 1) * keyLength)
    throw new RangeError(`MAKeys in ${parent.name} holds fewer than ${count - 1} keys`)

  const segments: MaterialSegment[] = new Array(count)

  for (let i = 0; i < count; i++) {
    const d = i * deltaLength
    const k = (i - 1) * keyLength

    segments[i] = {
      duration: deltas[d]!,
      start: i
        ? { uOffset: keys[k]!, vOffset: keys[k + 1]!, uScale: keys[k + 2]!, vScale: keys[k + 3]! }
        : zero(),
      velocity: {
        uOffset: deltas[d + 1]!,
        vOffset: deltas[d + 2]!,
        uScale: deltas[d + 3]!,
        vScale: deltas[d + 4]!,
      },
    }
  }

  return { name: parent.name, flags, segments }
}

/**
 * Writes a material animation into a directory named after the material.
 * @param anim Material animation
 * @throws RangeError on an animation with no segments, or whose first segment starts anywhere but
 * zero — the file stores no first key.
 */
export function writeMaterialAnim(anim: MaterialAnim): Directory {
  const { name, flags, segments } = anim
  const [first, ...rest] = segments

  if (!first) throw new RangeError(`Material animation ${name} has no segments`)
  if (!isZero(first.start))
    throw new RangeError(`Material animation ${name} does not start from the zero transform`)

  const directory = new Directory(name)

  directory.ensureFile('MACount').setIntegers(segments.length)
  directory.ensureFile('MAFlags').setIntegers(flags)

  directory
    .ensureFile('MADeltas')
    .setFloats(
      ...segments.flatMap(({ duration, velocity: { uOffset, vOffset, uScale, vScale } }) => [
        duration,
        uOffset,
        vOffset,
        uScale,
        vScale,
      ]),
    )

  if (rest.length)
    directory
      .ensureFile('MAKeys')
      .setFloats(
        ...rest.flatMap(({ start: { uOffset, vOffset, uScale, vScale } }) => [
          uOffset,
          vOffset,
          uScale,
          vScale,
        ]),
      )

  return directory
}

/**
 * Reads the material animation library from a file root directory.
 *
 * `MaterialAnim` is a root-level sibling of `Cmpnd` in `.cmp` files and of the part contents in
 * `.3db` files, never nested inside a part fragment.
 * @param parent File root directory
 */
export function readMaterialAnimLibrary(parent: Directory): MaterialAnimLibrary {
  const directory = parent.getDirectory('MaterialAnim')
  if (!directory) return []

  return directory.directories.map(readMaterialAnim)
}

/**
 * Writes a material animation library into a `MaterialAnim` directory.
 * @param values Material animations
 */
export function writeMaterialAnimLibrary(values: Iterable<MaterialAnim>): Directory {
  const directory = new Directory('MaterialAnim')

  for (const anim of values) directory.children.push(writeMaterialAnim(anim))

  return directory
}
