import Directory from '#/utf/directory.js'
import File from '#/utf/file.js'
import { getResource, type Hashable } from '#/hash.js'
import {
  getMapDuration,
  readJointMap,
  readObjectMap,
  writeAnimationMap,
  type AnimationMap,
  type JointMap,
  type ObjectMap,
} from './map.js'

/** Named animation, a collection of maps applied to a model at the same time. */
export interface AnimationScript {
  /** Script name, referenced from INI files. */
  name: string

  /**
   * Root object elevation off the floor. Deformable models only. `engbase.dll` loads it beside the
   * maps and hands it back to the game, but applies it to nothing itself.
   */
  height?: number

  /** Animation maps, at most one per animated object. */
  maps: AnimationMap[]
}

/** Script duration in seconds, the longest of its maps. */
export function getScriptDuration({ maps }: AnimationScript): number {
  let duration = 0
  for (const map of maps) duration = Math.max(duration, getMapDuration(map))

  return duration
}

/** Finds object map animating the named object. */
export function getObjectMap({ maps }: AnimationScript, object: Hashable): ObjectMap | undefined {
  return getResource(
    maps.filter((map) => map.type === 'object'),
    ({ object }) => object,
    object,
  )
}

/** Finds joint map animating the named child object. */
export function getJointMap({ maps }: AnimationScript, child: Hashable): JointMap | undefined {
  return getResource(
    maps.filter((map) => map.type === 'joint'),
    ({ child }) => child,
    child,
  )
}

/**
 * Reads animation script from directory.
 * @param parent Script directory
 * @returns
 */
export function readScript(parent: Directory): AnimationScript {
  const script: AnimationScript = { name: parent.name, maps: [] }

  // The engine compares both names byte for byte (`engbase.dll` `0x66114a4`, `0x66116ff`): a
  // `root height` or `joint map 0` in any other case is not read, so neither is it here.
  const [height] = parent.files.find(({ name }) => name === 'Root height')?.readFloats() ?? []
  if (height !== undefined) script.height = height

  for (const directory of parent.directories) {
    // Matched on the name prefix alone; the trailing index is decorative. `Event map` is skipped by
    // the engine outright, and anything else was never a map.
    const { name } = directory

    if (name.startsWith('Object map')) script.maps.push(readObjectMap(directory))
    else if (name.startsWith('Joint map')) script.maps.push(readJointMap(directory))
  }

  return script
}

/**
 * Writes animation script into directory.
 * @param script Animation script
 * @returns
 */
export function writeScript(script: AnimationScript): Directory {
  const { name, height, maps } = script
  const directory = new Directory(name)

  if (height !== undefined) directory.children.push(new File('Root height').setFloats(height))

  let objects = 0
  let joints = 0

  for (const map of maps)
    directory.children.push(writeAnimationMap(map, map.type === 'object' ? objects++ : joints++))

  return directory
}
