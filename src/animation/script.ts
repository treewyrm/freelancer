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
export interface Script {
  /** Script name, referenced from INI files. */
  name: string

  /** Root object elevation, applied on top of the object map position. Deformable models only. */
  height?: number

  /** Animation maps, at most one per animated object. */
  maps: AnimationMap[]
}

/** Script duration in seconds, the longest of its maps. */
export function getScriptDuration({ maps }: Script): number {
  let duration = 0
  for (const map of maps) duration = Math.max(duration, getMapDuration(map))

  return duration
}

/** Finds object map animating the named object. */
export function getObjectMap({ maps }: Script, parent: Hashable): ObjectMap | undefined {
  return getResource(
    maps.filter((map) => map.type === 'object'),
    ({ parent }) => parent,
    parent,
  )
}

/** Finds joint map animating the named child object. */
export function getJointMap({ maps }: Script, child: Hashable): JointMap | undefined {
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
export function readScript(parent: Directory): Script {
  const script: Script = { name: parent.name, maps: [] }

  const [height] = parent.getFile('Root height')?.readFloats() ?? []
  if (height !== undefined) script.height = height

  for (const directory of parent.directories) {
    // Freelancer matches on the name prefix alone; the trailing index is decorative.
    const name = directory.name.toLowerCase()

    if (name.startsWith('object map')) script.maps.push(readObjectMap(directory))
    else if (name.startsWith('joint map')) script.maps.push(readJointMap(directory))
  }

  return script
}

/**
 * Writes animation script into directory.
 * @param script Animation script
 * @returns
 */
export function writeScript(script: Script): Directory {
  const { name, height, maps } = script
  const directory = new Directory(name)

  if (height !== undefined) directory.children.push(new File('Root height').writeFloats(height))

  let objects = 0
  let joints = 0

  for (const map of maps)
    directory.children.push(writeAnimationMap(map, map.type === 'object' ? objects++ : joints++))

  return directory
}
