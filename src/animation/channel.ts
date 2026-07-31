import BufferView from '#/utility/bufferview.js'
import Directory from '#/directory.js'
import File from '#/file.js'
import { at, type Keyframe as TimedKeyframe } from '#/math/animation.js'
import Quat from '#/math/quat.js'
import { clamp, lerp } from '#/math/scalar.js'
import Vector3 from '#/math/vector3.js'

/**
 * Channel keyframe contents, a bitfield stored in the channel `Header` file.
 *
 * At most one of the position bits and at most one of the quaternion bits may be set, and
 * {@link Angle} never combines with anything else.
 *
 * The low four bits are inherited verbatim from Conquest: Frontier Wars, where they are
 * `PersistDT_FLOAT`, `_VECTOR`, `_QUATERNION` and `_EVENT`. There they describe the joint's state
 * vector, and its width follows: 1, 3 and 4 floats, so `Position | Quaternion` is the 7 floats a
 * loose joint needs. The high four bits are Freelancer's own additions, all of them compression.
 *
 * A cylinder joint takes 2 floats — an angle and an offset along one shared axis — and no
 * combination of these bits comes to 2. That, rather than a missing decoder, is why cylinder
 * joints cannot be animated: the format has nowhere to put them.
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
}

/** Bits describing keyframe position. */
export const POSITION_MASK = ChannelType.Position | ChannelType.ZeroPosition

/** Bits describing keyframe rotation. */
export const QUATERNION_MASK =
  ChannelType.Quaternion |
  ChannelType.IdentityQuaternion |
  ChannelType.VectorQuaternion |
  ChannelType.AngleQuaternion

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
  if (type & ~0xff || type < 0) throw new RangeError(`Unknown channel type bits: ${type}`)

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

/** Animation keyframe. Which properties are set is dictated by the channel type. */
export interface Keyframe extends TimedKeyframe {
  /** Time offset in seconds from the start of the script. */
  key: number

  /** Revolute joint angle in radians or prismatic joint offset. */
  value?: number

  /** Position offset. */
  position?: Vector3

  /** Rotation. */
  rotation?: Quat
}

/** Keyframe track of a single animated property set. */
export interface Channel {
  /**
   * Keyframe interval in seconds. When negative every keyframe carries its own time marker,
   * otherwise keyframes are evenly spaced and time markers are not stored.
   */
  interval: number

  /** Keyframe contents. */
  type: ChannelType

  /** Keyframes in ascending time order. */
  keyframes: Keyframe[]
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
  if (header.byteLength < Uint32Array.BYTES_PER_ELEMENT * 3)
    throw new RangeError(`Channel header in ${parent.name} is too short`)

  const view = BufferView.from(header)

  const count = view.readUint32()
  const interval = view.readFloat32()
  const type = validateChannelType(view.readUint32())

  const frames = directory.getFile('Frames')
  const length = keyframeByteLength(type, interval) * count

  if ((frames?.byteLength ?? 0) < length)
    throw new RangeError(`Channel frames in ${parent.name} hold fewer than ${count} keyframes`)

  const data = frames ? BufferView.from(frames) : BufferView.allocate(0)
  const keyframes: Keyframe[] = new Array(count)

  for (let i = 0; i < count; i++) {
    const keyframe: Keyframe = { key: interval < 0 ? data.readFloat32() : i * interval }

    if (type & ChannelType.Angle) keyframe.value = data.readFloat32()

    switch (type & POSITION_MASK) {
      case ChannelType.Position:
        keyframe.position = Vector3.read(data)
        break
      case ChannelType.ZeroPosition:
        keyframe.position = { ...Vector3.identity }
        break
    }

    switch (type & QUATERNION_MASK) {
      case ChannelType.Quaternion:
        keyframe.rotation = readQuaternion(data)
        break
      case ChannelType.VectorQuaternion:
        keyframe.rotation = readVectorQuaternion(data)
        break
      case ChannelType.AngleQuaternion:
        keyframe.rotation = readAngleQuaternion(data)
        break
      case ChannelType.IdentityQuaternion:
        keyframe.rotation = { ...Quat.identity }
        break
    }

    keyframes[i] = keyframe
  }

  return { interval, type, keyframes }
}

/**
 * Writes animation channel into directory.
 * @param channel Animation channel
 * @returns
 */
export function writeChannel(channel: Channel): Directory {
  const { interval, keyframes } = channel
  const type = validateChannelType(channel.type)

  const data = BufferView.allocate(keyframeByteLength(type, interval) * keyframes.length)

  for (const { key, value = 0, position, rotation } of keyframes) {
    if (interval < 0) data.writeFloat32(key)

    if (type & ChannelType.Angle) data.writeFloat32(value)
    if (type & ChannelType.Position) writeVector(data, position ?? Vector3.identity)

    switch (type & QUATERNION_MASK) {
      case ChannelType.Quaternion:
        writeQuaternion(data, rotation ?? Quat.identity)
        break
      case ChannelType.VectorQuaternion:
        writeVectorQuaternion(data, rotation ?? Quat.identity)
        break
      case ChannelType.AngleQuaternion:
        writeAngleQuaternion(data, rotation ?? Quat.identity)
        break
    }
  }

  const header = BufferView.allocate(Uint32Array.BYTES_PER_ELEMENT * 3)
    .writeUint32(keyframes.length)
    .writeFloat32(interval)
    .writeUint32(type)

  return new Directory('Channel', [new File('Header', header), new File('Frames', data)])
}

/** Channel value sampled between keyframes. */
export interface ChannelSample {
  value?: number
  position?: Vector3
  rotation?: Quat
}

/**
 * Samples channel at time, interpolating linearly between neighbouring keyframes.
 * @param channel Animation channel
 * @param time Time in seconds
 * @returns
 */
export function sampleChannel({ keyframes }: Channel, time: number): ChannelSample {
  const { start, end, span } = at(keyframes, time)
  const sample: ChannelSample = {}

  if (start.value !== undefined && end.value !== undefined)
    sample.value = lerp(start.value, end.value, span)

  if (start.position && end.position)
    sample.position = Vector3.lerp(start.position, end.position, span)
  if (start.rotation && end.rotation)
    sample.rotation = Quat.slerp(start.rotation, end.rotation, span)

  return sample
}
