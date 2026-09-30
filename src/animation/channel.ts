import BufferView from '#/utility/bufferview.js'
import Directory from '#/utf/directory.js'
import File from '#/utf/file.js'
import { at, type Keyframe } from '#/math/animation.js'
import Quat from '#/math/quat.js'
import { clamp, lerp } from '#/math/scalar.js'
import Vector3 from '#/math/vector3.js'
import Vector4 from '#/math/vector4.js'

/**
 * Channel keyframe contents, a bitfield stored in the channel `Header` file as a `uint32`.
 *
 * At most one of the position bits and at most one of the quaternion bits may be set, and
 * {@link Angle} never combines with anything else — the same combinations `engbase.dll` refuses,
 * at load (`0x661db70`) or when the channel is bound (`0x6615950`).
 *
 * The low four bits are inherited verbatim from Conquest: Frontier Wars, where they are
 * `PersistDT_FLOAT`, `_VECTOR`, `_QUATERNION` and `_EVENT`. There they describe the joint's state
 * vector, and its width follows: 1, 3 and 4 floats, so `Position | Quaternion` is the 7 floats a
 * loose joint needs. The five bits above them are Freelancer's own additions, all of them
 * compression, which the engine expands into those four at load.
 *
 * A cylinder joint takes 2 floats — an offset along one shared axis and an angle about it — and no
 * combination of these bits comes to 2. The engine does keep a two-float state for a cylinder, but
 * has no channel, player or blend case that could feed it, so cylinder joints cannot be animated.
 */
export enum ChannelType {
  /** Single float: revolute joint angle in radians or prismatic joint offset. */
  Angle = 0x01,

  /** Position vector, three floats. */
  Position = 0x02,

  /** Rotation quaternion, four floats stored W, X, Y, Z. */
  Quaternion = 0x04,

  /**
   * Event stream rather than joint data. `PersistDT_EVENT` in Conquest: Frontier Wars, where it
   * pairs with an `Event map` directory alongside `Object map` and `Joint map`.
   *
   * Freelancer authored none: no retail script holds an `Event map`, and no channel sets this
   * bit. The payload layout is therefore unknown here, and `validateChannelType` rejects it.
   *
   * MAXLancer repurposes the bit to write a pair of floats for cylinder joints. That is its own
   * convention, not this one — see {@link ChannelType} for why a cylinder cannot be expressed
   * by the bitfield at all.
   */
  Event = 0x08,

  /** Channel animates position, but every keyframe is zero and no data is stored. */
  ZeroPosition = 0x10,

  /** Channel animates rotation, but every keyframe is identity and no data is stored. */
  IdentityQuaternion = 0x20,

  /** Rotation quantized into the quaternion vector part, three int16. */
  VectorQuaternion = 0x40,

  /** Rotation quantized into the rotation axis scaled by angle, three int16. */
  AngleQuaternion = 0x80,

  /**
   * Rotation quantized whole, four int16 in W, X, Y, Z order, renormalized on read.
   *
   * No retail asset uses it; `engbase.dll` decodes it (`0x661e067`) all the same.
   */
  ShortQuaternion = 0x100,
}

/** Bits describing keyframe position. */
export const POSITION_MASK = ChannelType.Position | ChannelType.ZeroPosition

/** Bits describing keyframe rotation. */
export const QUATERNION_MASK =
  ChannelType.Quaternion |
  ChannelType.IdentityQuaternion |
  ChannelType.VectorQuaternion |
  ChannelType.AngleQuaternion |
  ChannelType.ShortQuaternion

/** Every bit the engine gives a meaning to. */
const TYPE_MASK = 0x1ff

/** Byte length of the channel `Header` file. The engine refuses any other. */
const HEADER_LENGTH = Uint32Array.BYTES_PER_ELEMENT * 3

/** Quantized quaternion components are int16 fractions of this scale. */
const QUANTIZATION_SCALE = 0x7fff

const countBits = (value: number): number => {
  let count = 0
  while (value) ((value &= value - 1), count++)
  return count
}

/**
 * Validates channel type bitfield.
 * @param type Channel type bitfield
 * @returns Type unchanged
 */
export function validateChannelType(type: number): ChannelType {
  if (type & ChannelType.Event) throw new RangeError('Channel event keyframes are unsupported')
  if (type & ~TYPE_MASK || type < 0) throw new RangeError(`Unknown channel type bits: ${type}`)

  if (type & ChannelType.Angle && type !== ChannelType.Angle)
    throw new RangeError('Channel angle cannot combine with other keyframe types')

  if (countBits(type & POSITION_MASK) > 1)
    throw new RangeError('Channel has more than one position type')

  if (countBits(type & QUATERNION_MASK) > 1)
    throw new RangeError('Channel has more than one quaternion type')

  return type
}

/**
 * Calculates keyframe byte length for the channel type.
 *
 * Keyframes are evenly spaced when interval is positive, otherwise each keyframe is prefixed
 * with its own time marker.
 * @param type Channel type bitfield
 * @param interval Keyframe interval in seconds
 * @returns
 */
export function keyframeByteLength(type: ChannelType, interval: number): number {
  let size = 0

  if (interval < 0) size += Float32Array.BYTES_PER_ELEMENT
  if (type & ChannelType.Angle) size += Float32Array.BYTES_PER_ELEMENT
  if (type & ChannelType.Position) size += Float32Array.BYTES_PER_ELEMENT * 3
  if (type & ChannelType.Quaternion) size += Float32Array.BYTES_PER_ELEMENT * 4
  if (type & ChannelType.VectorQuaternion) size += Int16Array.BYTES_PER_ELEMENT * 3
  if (type & ChannelType.AngleQuaternion) size += Int16Array.BYTES_PER_ELEMENT * 3
  if (type & ChannelType.ShortQuaternion) size += Int16Array.BYTES_PER_ELEMENT * 4

  return size
}

/** Writes position vector into the frame buffer, three floats. */
function writeVector(view: BufferView, { x, y, z }: Vector3): BufferView {
  return view.writeFloat32(x).writeFloat32(y).writeFloat32(z)
}

/** Reads quaternion stored as four floats in W, X, Y, Z order. */
export function readQuaternion(view: BufferView): Quat {
  const w = view.readFloat32()

  return { x: view.readFloat32(), y: view.readFloat32(), z: view.readFloat32(), w }
}

/** Writes quaternion as four floats in W, X, Y, Z order. */
export function writeQuaternion(view: BufferView, { x, y, z, w }: Quat): BufferView {
  return view.writeFloat32(w).writeFloat32(x).writeFloat32(y).writeFloat32(z)
}

/**
 * Reads quaternion from its quantized vector part, restoring W from unit length.
 *
 * Only the positive-W hemisphere is representable.
 */
export function readVectorQuaternion(view: BufferView): Quat {
  const x = view.readInt16() / QUANTIZATION_SCALE
  const y = view.readInt16() / QUANTIZATION_SCALE
  const z = view.readInt16() / QUANTIZATION_SCALE

  return { x, y, z, w: Math.sqrt(Math.max(0, 1 - (x * x + y * y + z * z))) }
}

/** Writes quaternion as its quantized vector part. */
export function writeVectorQuaternion(view: BufferView, quat: Quat): BufferView {
  const { x, y, z } = quat.w < 0 ? Vector3.multiplyScalar(quat, -1) : quat

  return view
    .writeInt16(Math.round(clamp(x, -1, 1) * QUANTIZATION_SCALE))
    .writeInt16(Math.round(clamp(y, -1, 1) * QUANTIZATION_SCALE))
    .writeInt16(Math.round(clamp(z, -1, 1) * QUANTIZATION_SCALE))
}

/**
 * Reads quaternion from a quantized rotation axis scaled by angle.
 *
 * The stored vector is the unit rotation axis times the rotation angle over PI, so its length
 * spans the whole positive-W hemisphere: zero is identity and one is a half turn.
 */
export function readAngleQuaternion(view: BufferView): Quat {
  const x = view.readInt16() / QUANTIZATION_SCALE
  const y = view.readInt16() / QUANTIZATION_SCALE
  const z = view.readInt16() / QUANTIZATION_SCALE

  const length = Math.sqrt(x * x + y * y + z * z)
  if (length === 0) return { ...Quat.identity }

  // Sine of the half angle, which is the magnitude of the quaternion vector part.
  const sine = Math.sin(Math.PI * length * 0.5)
  const scale = sine / length

  return {
    x: x * scale,
    y: y * scale,
    z: z * scale,
    w: Math.sqrt(Math.max(0, 1 - sine * sine)),
  }
}

/** Writes quaternion as a quantized rotation axis scaled by angle. */
export function writeAngleQuaternion(view: BufferView, quat: Quat): BufferView {
  const { x, y, z } = quat.w < 0 ? Vector3.multiplyScalar(quat, -1) : quat

  const sine = Math.sqrt(x * x + y * y + z * z)
  const scale = sine > 0 ? ((2 / Math.PI) * Math.asin(clamp(sine, 0, 1))) / sine : 0

  return view
    .writeInt16(Math.round(clamp(x * scale, -1, 1) * QUANTIZATION_SCALE))
    .writeInt16(Math.round(clamp(y * scale, -1, 1) * QUANTIZATION_SCALE))
    .writeInt16(Math.round(clamp(z * scale, -1, 1) * QUANTIZATION_SCALE))
}

/**
 * Reads quaternion stored as four int16 fractions in W, X, Y, Z order.
 *
 * The engine renormalizes with a single Newton step, `k = (3 - |q|²) / 2`, rather than a square
 * root, and so does this: the result is what the game computes, not an exactly unit quaternion.
 */
export function readShortQuaternion(view: BufferView): Quat {
  const w = view.readInt16() / QUANTIZATION_SCALE
  const x = view.readInt16() / QUANTIZATION_SCALE
  const y = view.readInt16() / QUANTIZATION_SCALE
  const z = view.readInt16() / QUANTIZATION_SCALE

  const k = (3 - (w * w + x * x + y * y + z * z)) * 0.5

  return { x: x * k, y: y * k, z: z * k, w: w * k }
}

/** Writes quaternion as four int16 fractions in W, X, Y, Z order. */
export function writeShortQuaternion(view: BufferView, quat: Quat): BufferView {
  const { x, y, z, w } = Vector4.normalize(quat)

  return view
    .writeInt16(Math.round(clamp(w, -1, 1) * QUANTIZATION_SCALE))
    .writeInt16(Math.round(clamp(x, -1, 1) * QUANTIZATION_SCALE))
    .writeInt16(Math.round(clamp(y, -1, 1) * QUANTIZATION_SCALE))
    .writeInt16(Math.round(clamp(z, -1, 1) * QUANTIZATION_SCALE))
}

/**
 * How a motion channel stores position: three floats per keyframe, or nothing because it is zero.
 */
export type PositionEncoding = 'vector' | 'zero'

/**
 * How a motion channel stores orientation: four floats, nothing because it is the identity, three
 * int16 quantizing either the quaternion's vector part or its axis scaled by angle, or four int16
 * quantizing the whole quaternion.
 */
export type OrientationEncoding = 'quaternion' | 'identity' | 'vector' | 'angle' | 'short'

/** One keyframe of an {@link AngleChannel}. */
export interface AngleKeyframe extends Keyframe {
  /** Time offset in seconds from the start of the script. */
  key: number

  /** Revolute joint angle in radians or prismatic joint offset. */
  value: number
}

/**
 * One keyframe of a {@link MotionChannel}. A field is present exactly when the channel carries the
 * matching encoding, zero and identity included.
 */
export interface MotionKeyframe extends Keyframe {
  /** Time offset in seconds from the start of the script. */
  key: number

  /** Position offset. */
  position?: Vector3

  /** Orientation. */
  orientation?: Quat
}

/**
 * A channel driving one float: the angle of a revolute joint or the offset of a prismatic one.
 * `ChannelType.Angle`, which combines with nothing.
 */
export interface AngleChannel {
  type: 'angle'

  /**
   * Keyframe interval in seconds. When negative every keyframe carries its own time marker, which
   * is what -1, the only negative value retail uses, says; otherwise keyframes are evenly spaced
   * and time markers are not stored.
   */
  interval: number

  /** Keyframes in ascending time order. */
  keyframes: AngleKeyframe[]
}

/**
 * A channel driving position, orientation or both: an object map, or a sphere or loose joint.
 * The two encodings are what the type bitfield records, apart from what the keyframes hold.
 */
export interface MotionChannel {
  type: 'motion'

  /** As {@link AngleChannel.interval}. */
  interval: number

  /** How position is stored. Absent when the channel does not animate it. */
  position?: PositionEncoding

  /** How orientation is stored. Absent when the channel does not animate it. */
  orientation?: OrientationEncoding

  /** Keyframes in ascending time order. */
  keyframes: MotionKeyframe[]
}

/** Keyframe track of a single animated property set. */
export type Channel = AngleChannel | MotionChannel

const POSITION_BITS: Record<PositionEncoding, ChannelType> = {
  vector: ChannelType.Position,
  zero: ChannelType.ZeroPosition,
}

const ORIENTATION_BITS: Record<OrientationEncoding, ChannelType> = {
  quaternion: ChannelType.Quaternion,
  identity: ChannelType.IdentityQuaternion,
  vector: ChannelType.VectorQuaternion,
  angle: ChannelType.AngleQuaternion,
  short: ChannelType.ShortQuaternion,
}

/** The type bitfield a channel is stored with. */
export function getChannelType(channel: Channel): ChannelType {
  if (channel.type === 'angle') return ChannelType.Angle

  return (
    (channel.position ? POSITION_BITS[channel.position] : 0) |
    (channel.orientation ? ORIENTATION_BITS[channel.orientation] : 0)
  )
}

/** Channel duration in seconds. */
export function getChannelDuration({ keyframes }: Channel): number {
  return keyframes.at(-1)?.key ?? 0
}

/**
 * Reads animation channel from map directory.
 * @param parent Map directory
 * @returns
 */
export function readChannel(parent: Directory): Channel {
  const directory = parent.getDirectory('Channel')
  if (!directory) throw new Error(`Missing channel in ${parent.name}`)

  const header = directory.getFile('Header')
  if (!header) throw new Error(`Missing channel header in ${parent.name}`)

  // The engine refuses a header of any other length, and frames that are not exactly `count`
  // keyframes long (`0x661d97b`, `0x661da30`); the map is then dropped rather than half-played.
  if (header.byteLength !== HEADER_LENGTH)
    throw new RangeError(`Channel header in ${parent.name} is not ${HEADER_LENGTH} bytes`)

  const view = BufferView.from(header)

  const count = view.readUint32()
  const interval = view.readFloat32()
  const type = validateChannelType(view.readUint32())

  const frames = directory.getFile('Frames')
  const length = keyframeByteLength(type, interval) * count

  if ((frames?.byteLength ?? 0) !== length)
    throw new RangeError(`Channel frames in ${parent.name} are not ${count} keyframes long`)

  const data = frames ? BufferView.from(frames) : BufferView.allocate(0)
  const key = (index: number) => (interval < 0 ? data.readFloat32() : index * interval)

  if (type === ChannelType.Angle) {
    const keyframes: AngleKeyframe[] = new Array(count)

    for (let i = 0; i < count; i++) keyframes[i] = { key: key(i), value: data.readFloat32() }

    return { type: 'angle', interval, keyframes }
  }

  const channel: MotionChannel = { type: 'motion', interval, keyframes: new Array(count) }

  switch (type & POSITION_MASK) {
    case ChannelType.Position:
      channel.position = 'vector'
      break
    case ChannelType.ZeroPosition:
      channel.position = 'zero'
      break
  }

  switch (type & QUATERNION_MASK) {
    case ChannelType.Quaternion:
      channel.orientation = 'quaternion'
      break
    case ChannelType.IdentityQuaternion:
      channel.orientation = 'identity'
      break
    case ChannelType.VectorQuaternion:
      channel.orientation = 'vector'
      break
    case ChannelType.AngleQuaternion:
      channel.orientation = 'angle'
      break
    case ChannelType.ShortQuaternion:
      channel.orientation = 'short'
      break
  }

  for (let i = 0; i < count; i++) {
    const keyframe: MotionKeyframe = { key: key(i) }

    switch (channel.position) {
      case 'vector':
        keyframe.position = Vector3.read(data)
        break
      case 'zero':
        keyframe.position = { ...Vector3.zero }
        break
    }

    switch (channel.orientation) {
      case 'quaternion':
        keyframe.orientation = readQuaternion(data)
        break
      case 'vector':
        keyframe.orientation = readVectorQuaternion(data)
        break
      case 'angle':
        keyframe.orientation = readAngleQuaternion(data)
        break
      case 'short':
        keyframe.orientation = readShortQuaternion(data)
        break
      case 'identity':
        keyframe.orientation = { ...Quat.identity }
        break
    }

    channel.keyframes[i] = keyframe
  }

  return channel
}

/**
 * Writes animation channel into directory.
 * @param channel Animation channel
 * @throws RangeError when a keyframe lacks a field its channel stores, or carries one its channel
 * has no encoding for — either would be written as something other than what it says.
 */
export function writeChannel(channel: Channel): Directory {
  const { interval } = channel
  const type = validateChannelType(getChannelType(channel))

  const data = BufferView.allocate(keyframeByteLength(type, interval) * channel.keyframes.length)

  if (channel.type === 'angle')
    for (const { key, value } of channel.keyframes) {
      if (interval < 0) data.writeFloat32(key)
      data.writeFloat32(value)
    }
  else
    for (const { key, position, orientation } of channel.keyframes) {
      if (position && !channel.position)
        throw new RangeError(`Keyframe at ${key} has a position its channel does not store`)
      if (orientation && !channel.orientation)
        throw new RangeError(`Keyframe at ${key} has an orientation its channel does not store`)

      if (interval < 0) data.writeFloat32(key)

      if (channel.position === 'vector') {
        if (!position) throw new RangeError(`Keyframe at ${key} is missing its position`)
        writeVector(data, position)
      }

      if (channel.orientation && channel.orientation !== 'identity' && !orientation)
        throw new RangeError(`Keyframe at ${key} is missing its orientation`)

      switch (channel.orientation) {
        case 'quaternion':
          writeQuaternion(data, orientation!)
          break
        case 'vector':
          writeVectorQuaternion(data, orientation!)
          break
        case 'angle':
          writeAngleQuaternion(data, orientation!)
          break
        case 'short':
          writeShortQuaternion(data, orientation!)
          break
      }
    }

  const header = BufferView.allocate(Uint32Array.BYTES_PER_ELEMENT * 3)
    .writeUint32(channel.keyframes.length)
    .writeFloat32(interval)
    .writeUint32(type)

  return new Directory('Channel', [new File('Header', header), new File('Frames', data)])
}

/** Channel value sampled between keyframes. */
export interface ChannelSample {
  value?: number
  position?: Vector3
  orientation?: Quat
}

/** π and 2π as the engine holds them, in single precision (`0x66294ec`, `0x66294f0`). */
const PI = Math.fround(Math.PI)
const TAU = Math.fround(Math.PI * 2)

/**
 * Samples channel at time, interpolating between neighbouring keyframes the way `engbase.dll` does.
 *
 * - Position and scalars interpolate linearly.
 * - Rotations take a normalized linear interpolation on the near hemisphere — `Quat.nlerp`, which is
 *   the engine's `3DMathEngine +0x58` (`x86math.dll` `0x6f724d0`) — not a slerp. The two agree at
 *   keyframes and at the midpoint and differ in pace between them.
 * - With `revolute`, the scalar is an angle and the pair of keyframes is brought within half a turn
 *   first: `b ± 2π` once, whenever `b - a` leaves [-π, π]. The engine does this for every channel
 *   driving a `Rev` joint (`0x661b8a0`) regardless of what the channel stores, so a sweep authored
 *   past half a turn between two keyframes plays the short way round in game. Only the joint says a
 *   channel is revolute — `ChannelType.Angle` also carries prismatic offsets, which never wrap.
 *
 * Time outside the keyframes holds the first or last; wrapping is {@link getChannelTime}'s.
 * @param channel Animation channel
 * @param time Time in seconds
 * @param revolute The channel drives a revolute joint
 * @returns
 */
export function sampleChannel(channel: Channel, time: number, revolute = false): ChannelSample {
  if (channel.type === 'angle') {
    const { start, end, span } = at(channel.keyframes, time)
    const a = start.value
    let b = end.value

    if (revolute) {
      const d = b - a

      if (d < -PI) b += TAU
      else if (d > PI) b -= TAU
    }

    return { value: lerp(a, b, span) }
  }

  const { start, end, span } = at(channel.keyframes, time)
  const sample: ChannelSample = {}

  if (start.position && end.position)
    sample.position = Vector3.lerp(start.position, end.position, span)
  if (start.orientation && end.orientation)
    sample.orientation = Quat.nlerp(start.orientation, end.orientation, span)

  return sample
}

/**
 * How a channel's clock behaves past its last keyframe: the play flags `engbase.dll` knows
 * (`0x661b420`) — `0x2` loops, `0x4` bounces, neither plays once and holds.
 */
export type PlaybackMode = 'loop' | 'once' | 'pingPong'

/**
 * Maps time elapsed since a script started onto a channel's own time axis.
 *
 * Every map of a script runs its own clock and wraps at **its own** channel's duration, not the
 * script's, so a short channel cycles inside a long one. `loop` wraps on reaching the end, so the
 * end itself reads as the start; `pingPong` turns round there; `once` stops on it. Negative time is
 * time played backwards, as a negative speed plays it. A channel of one keyframe is always at zero.
 * @param channel Animation channel
 * @param time Elapsed time in seconds
 * @param mode Playback mode
 * @returns
 */
export function getChannelTime(
  channel: Channel,
  time: number,
  mode: PlaybackMode = 'loop',
): number {
  const duration = getChannelDuration(channel)
  if (!(duration > 0)) return 0

  switch (mode) {
    case 'once':
      return clamp(time, 0, duration)
    case 'pingPong': {
      const phase = modulo(time, duration * 2)
      return phase > duration ? duration * 2 - phase : phase
    }
    case 'loop':
      return modulo(time, duration)
  }
}

/** Remainder with the sign of the divisor. */
const modulo = (value: number, divisor: number) => ((value % divisor) + divisor) % divisor
