import Directory from '#/utf/directory.js'
import File from '#/utf/file.js'
import Transform from '#/math/transform.js'
import Vector3 from '#/math/vector3.js'
import Quat from '#/math/quat.js'
import {
  getChannelDuration,
  getChannelTime,
  readChannel,
  sampleChannel,
  writeChannel,
  type Channel,
  type PlaybackMode,
} from './channel.js'

/**
 * Animates an object — the root of a model — relative to where it stood when the script started.
 *
 * The channel must carry both position and rotation: the engine binds an object map only to a
 * channel it expands to seven floats (`engbase.dll` `0x661af0d`), which every stored combination of
 * a position bit and a quaternion bit does. See {@link sampleObjectMap} for what the samples mean.
 */
export interface ObjectMap {
  type: 'object'

  /** Animated object name, stored in the map's `Parent name` file. */
  object: string

  /** Keyframes. */
  channel: Channel
}

/**
 * Animates a child object relative to its parent, driving the joint between them.
 *
 * What the keyframes mean depends on the joint, and the engine binds a map only when the channel
 * expands to exactly as many floats as the joint's state (`engbase.dll` `0x661aea7`): revolute and
 * prismatic joints take the one-float value, translational joints a position, sphere joints a
 * rotation, and loose joints **both** — a rotation-only or position-only channel on a loose joint is
 * refused, which is what the zero-position and identity-rotation bits exist to pad. Fixed joints
 * cannot be animated, and nothing expands to a cylinder's two floats.
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

/**
 * One animated target within a script: either a part moving freely in its own frame, or a joint
 * driven within the limits its constraint set.
 */
export type AnimationMap = ObjectMap | JointMap

/** Map duration in seconds. */
export const getMapDuration = ({ channel }: AnimationMap): number => getChannelDuration(channel)

/** The channel's sample as a transform, absent fields standing at zero and the identity. */
function sampleTransform(channel: Channel, time: number): Transform {
  const { position = Vector3.zero, orientation = Quat.identity } = sampleChannel(channel, time)
  return { position, orientation }
}

/** `transform` composed with itself `count` times, `count ≥ 0`. */
function power(transform: Transform, count: number): Transform {
  let result: Transform = Transform.identity
  let step = transform

  for (; count > 0; count = Math.floor(count / 2)) {
    if (count % 2) result = Transform.multiply(step, result)
    step = Transform.multiply(step, step)
  }

  return result
}

/**
 * Samples an object map as the engine applies it: a transform **relative to the object's pose when
 * the script started**, to be composed onto that pose as `start ∘ sample`.
 *
 * An object map does not replace the object's placement. `engbase.dll`'s object player captures the
 * object's position and orientation when the script starts from zero (`0x661c9d3`) and writes back
 * `base.R · p + base.t` and `base.q ⊗ q` (`0x661bb10`). The first keyframe is applied on top of the
 * start pose, not subtracted from it.
 *
 * **A looping object map carries its motion forward.** Each time the clock wraps, the player takes
 * the pose at the channel's last keyframe as the new base (`0x661b5b3`), so a walk cycle walks on
 * instead of snapping back: after `n` whole cycles the result is `S(D)ⁿ ∘ S(t mod D)`. Once holds at
 * `S(D)`. A bounce turns the clock round without moving the base — what the engine converges to at
 * small frame steps; it actually realigns to the object's current pose, so a long frame drifts it.
 *
 * Time is elapsed time since the script started, played forwards; negative time reads as zero.
 * @param map Object map
 * @param time Elapsed time in seconds
 * @param mode Playback mode
 * @throws RangeError when the channel is an angle channel, which no object map can carry.
 */
export function sampleObjectMap(
  map: ObjectMap,
  time: number,
  mode: PlaybackMode = 'loop',
): Transform {
  const { channel } = map
  if (channel.type !== 'motion')
    throw new RangeError(`Object map ${map.object} has an angle channel`)

  time = Math.max(0, time)

  const duration = getChannelDuration(channel)
  if (mode !== 'loop' || !(duration > 0))
    return sampleTransform(channel, getChannelTime(channel, time, mode))

  const cycles = Math.floor(time / duration)
  const local = sampleTransform(channel, Math.max(0, time - cycles * duration))

  return Transform.multiply(local, power(sampleTransform(channel, duration), cycles))
}

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
    object: readName(parent, 'Parent name'),
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
  const { type, channel } = map

  const directory = new Directory(`${type === 'object' ? 'Object map' : 'Joint map'} ${index}`, [
    new File('Parent name').setStrings(type === 'object' ? map.object : map.parent),
  ])

  if (map.type === 'joint') directory.children.push(new File('Child name').setStrings(map.child))

  directory.children.push(writeChannel(channel))

  return directory
}
