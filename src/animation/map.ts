import Directory from '#/utf/directory.js'
import File from '#/utf/file.js'
import { getChannelDuration, readChannel, writeChannel, type Channel } from './channel.js'

/**
 * Animates the root object of a model in its own space.
 *
 * Only the root part reads object maps, and only position and rotation apply to it.
 */
export interface ObjectMap {
  type: 'object'

  /** Animated object name. */
  parent: string

  /** Keyframes. */
  channel: Channel
}

/**
 * Animates a child object relative to its parent, driving the joint between them.
 *
 * What the keyframes mean depends on the joint: revolute and prismatic joints take the angle
 * or offset value, sphere joints take the rotation, loose joints take both position and
 * rotation. Fixed joints cannot be animated.
 */
export interface JointMap {
  type: 'joint'

  /** Parent object name. */
  parent: string

  /** Child object name, the animation target. */
  child: string

  /** Keyframes. */
  channel: Channel
}

export type AnimationMap = ObjectMap | JointMap

/** Map duration in seconds. */
export const getMapDuration = ({ channel }: AnimationMap): number => getChannelDuration(channel)

function readName(parent: Directory, name: string): string {
  const [value] = parent.getFile(name)?.readStrings() ?? []
  if (!value) throw new Error(`Missing ${name.toLowerCase()} in ${parent.name}`)

  return value
}

/**
 * Reads object map from directory.
 * @param parent Object map directory
 * @returns
 */
export function readObjectMap(parent: Directory): ObjectMap {
  return {
    type: 'object',
    parent: readName(parent, 'Parent name'),
    channel: readChannel(parent),
  }
}

/**
 * Reads joint map from directory.
 * @param parent Joint map directory
 * @returns
 */
export function readJointMap(parent: Directory): JointMap {
  return {
    type: 'joint',
    parent: readName(parent, 'Parent name'),
    child: readName(parent, 'Child name'),
    channel: readChannel(parent),
  }
}

/**
 * Writes animation map into directory.
 *
 * Freelancer matches maps by the `Object map` and `Joint map` name prefix and ignores whatever
 * follows, so the index is only there to keep sibling names unique.
 * @param map Animation map
 * @param index Map index within its kind
 * @returns
 */
export function writeAnimationMap(map: AnimationMap, index = 0): Directory {
  const { type, parent, channel } = map

  const directory = new Directory(`${type === 'object' ? 'Object map' : 'Joint map'} ${index}`, [
    new File('Parent name').writeStrings(parent),
  ])

  if (map.type === 'joint') directory.children.push(new File('Child name').writeStrings(map.child))

  directory.children.push(writeChannel(channel))

  return directory
}
