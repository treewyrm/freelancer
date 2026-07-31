import Directory from '#/directory.js'
import { getResource, type Hashable } from '#/hash.js'

/**
 * One segment of a material animation.
 *
 * `time` is the segment's own duration, not an offset from the start of the animation — the
 * velocities apply for that long before the next keyframe takes over.
 */
export interface MaterialKeyframe {
  /** Segment duration in seconds. */
  time: number

  /** U tiling offset velocity, per second. */
  uOffsetSpeed: number

  /** V tiling offset velocity, per second. */
  vOffsetSpeed: number

  /** U tiling scale velocity, per second. */
  uScaleSpeed: number

  /** V tiling scale velocity, per second. */
  vScaleSpeed: number
}

/** UV transform a segment starts from. */
export interface MaterialKey {
  /** U start offset. */
  uOffset: number

  /** V start offset. */
  vOffset: number

  /** U start scale. */
  uScale: number

  /** V start scale. */
  vScale: number
}

/**
 * Animates the UV transform of a single material, named by the directory holding it.
 *
 * `keys` always has one entry fewer than {@link keyframes}, the first transform being implicit.
 *
 * The two are related but not redundant: key magnitudes match segment displacements
 * (`speed × time`) closely enough that they clearly describe the same motion, yet no single
 * alignment between them reproduces every retail entry, so `keys` must be read rather than
 * derived. See [What `MAKeys` is not](../../docs/MODEL.md#what-makeys-is-not).
 */
export interface MaterialAnim {
  /** Material name. */
  name: string

  /** Animation flags. Purpose unknown; retail data holds `2`, or `0` in four entries. */
  flags: number

  /** Segments, in playback order. */
  keyframes: MaterialKeyframe[]

  /** Starting transform per segment, less the implicit first. */
  keys: MaterialKey[]
}

export type MaterialAnimLibrary = MaterialAnim[]

/** Floats per `MADeltas` and `MAKeys` entry. */
const keyframeLength = 5
const keyLength = 4

/** Animation duration in seconds, the sum of its segment durations. */
export const getMaterialAnimDuration = ({ keyframes }: MaterialAnim): number =>
  keyframes.reduce((total, { time }) => total + time, 0)

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
  if (deltas.length < count * keyframeLength)
    throw new RangeError(`MADeltas in ${parent.name} holds fewer than ${count} keyframes`)

  const keyframes: MaterialKeyframe[] = new Array(count)

  for (let i = 0, o = 0; i < count; i++, o += keyframeLength)
    keyframes[i] = {
      time: deltas[o]!,
      uOffsetSpeed: deltas[o + 1]!,
      vOffsetSpeed: deltas[o + 2]!,
      uScaleSpeed: deltas[o + 3]!,
      vScaleSpeed: deltas[o + 4]!,
    }

  // The first key is the material's own UV state, so only the rest are stored. A single-segment
  // animation has none at all, and retail omits the file rather than writing it empty.
  const stored = [...(parent.getFile('MAKeys')?.readFloats() ?? [])]
  if (stored.length < (count - 1) * keyLength)
    throw new RangeError(`MAKeys in ${parent.name} holds fewer than ${count - 1} keys`)

  const keys: MaterialKey[] = new Array(count - 1)

  for (let i = 0, o = 0; i < count - 1; i++, o += keyLength)
    keys[i] = {
      uOffset: stored[o]!,
      vOffset: stored[o + 1]!,
      uScale: stored[o + 2]!,
      vScale: stored[o + 3]!,
    }

  return { name: parent.name, flags, keyframes, keys }
}

/**
 * Writes a material animation into a directory named after the material.
 * @param anim Material animation
 */
export function writeMaterialAnim(anim: MaterialAnim): Directory {
  const { name, flags, keyframes, keys } = anim

  if (!keyframes.length) throw new RangeError(`Material animation ${name} has no keyframes`)
  if (keys.length !== keyframes.length - 1)
    throw new RangeError(
      `Material animation ${name} has ${keys.length} keys for ${keyframes.length} keyframes`,
    )

  const directory = new Directory(name)

  directory.setFile('MACount').writeIntegers(keyframes.length)
  directory.setFile('MAFlags').writeIntegers(flags)

  directory
    .setFile('MADeltas')
    .writeFloats(
      ...keyframes.flatMap(({ time, uOffsetSpeed, vOffsetSpeed, uScaleSpeed, vScaleSpeed }) => [
        time,
        uOffsetSpeed,
        vOffsetSpeed,
        uScaleSpeed,
        vScaleSpeed,
      ]),
    )

  if (keys.length)
    directory
      .setFile('MAKeys')
      .writeFloats(
        ...keys.flatMap(({ uOffset, vOffset, uScale, vScale }) => [
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
