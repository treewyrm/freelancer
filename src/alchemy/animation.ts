import BufferView from '#/utility/bufferview.js'
import type Vector3 from '#/math/vector3.js'
import { readArray, writeArray, readFloat, writeFloat } from './misc.js'
import type { Keyframe } from '#/math/animation.js'

/** A scalar keyframe. */
export interface FloatKeyframe extends Keyframe {
  value: number
}

/**
 * A three-component keyframe. On a colour list the value is RGB; on a Hermite curve it is
 * `x` = value, `y` = in-tangent, `z` = out-tangent, which is not a point in space.
 */
export interface VectorKeyframe extends Keyframe {
  value: Vector3
}

/** What every keyframe list has, whatever governs its ends. */
export interface Animation<T extends Keyframe> {
  keyframes: T[]
}

/**
 * Easing animation type: the index into `alchemy.dll`'s table of seven easing functions
 * (`0x6257c20`, filled at `0x6242880`), which the loader stores as the raw byte.
 *
 * `AutoInverse` is the seventh entry, and is what both `FLDustAppearance` alpha fades carry. A
 * byte past it indexes off the end of the table; retail's only such bytes sit on single-keyframe
 * lists, which never call an easing. See [Easing] in ALCHEMY.md.
 *
 * The value is stored as read and written back unchanged.
 */
export enum EaseType {
  Step,
  Linear,
  QuadIn,
  QuadOut,
  Smooth,
  /** QuadIn toward a larger value, QuadOut toward a smaller one. */
  Auto,
  /** QuadOut toward a larger value, QuadIn toward a smaller one — `Auto` mirrored. */
  AutoInverse,
}

/** A keyframe list interpolated by one named easing curve, with no behaviour outside its range. */
export interface EaseAnimation<T extends Keyframe> extends Animation<T> {
  easing: EaseType
}

/**
 * What a looped curve does past each end: **two four-bit modes, not a bitfield** — the low nibble
 * before the first key, the next one after the last, each one of hold (0), cycle, cycle with
 * offset, oscillate and linear. Combine one `Before` member with one `After` member.
 *
 * `alchemy.dll` switches on each nibble (`0x6246b00`, `0x6246c2f`); a nibble past 4 falls through
 * into the in-range search with an out-of-range key, which retail never does and `hermiteAt`
 * treats as hold. See [Wrap modes] in ALCHEMY.md.
 */
export enum WrapFlags {
  None = 0,
  BeforeCycle = 0x1,
  BeforeCycleOffset = 0x2,
  BeforeOscillate = 0x3,
  BeforeLinear = 0x4,
  AfterCycle = 0x10,
  AfterCycleOffset = 0x20,
  AfterOscillate = 0x30,
  AfterLinear = 0x40,
}

/**
 * A keyframe list that says what happens outside its own range, and what an empty list evaluates to.
 * `flags` is the whole 16-bit word as read; only its low byte is ever consulted.
 */
export interface LoopAnimation<T extends Keyframe> extends Animation<T> {
  default: number
  flags: WrapFlags
}

/** A scalar animated on both axes: outer list keyed on sparam, inner lists on particle lifetime. */
export type AnimatedFloat = EaseAnimation<Keyframe & EaseAnimation<FloatKeyframe>>

/** A colour animated on both axes, as {@link AnimatedFloat} with RGB inner keyframes. */
export type AnimatedColor = EaseAnimation<Keyframe & EaseAnimation<VectorKeyframe>>

/** A Hermite curve animated on both axes; the inner lists are looped rather than eased. */
export type AnimatedCurve = EaseAnimation<Keyframe & LoopAnimation<VectorKeyframe>>

/** Animated transform point. */
export interface TransformPoint {
  x: AnimatedCurve
  y: AnimatedCurve
  z: AnimatedCurve
}

/**
 * The three order bytes a transform opens with. `alchemy.dll` packs them into one word as nibbles
 * (`0x62439f0`), copies it and writes it back, and **never evaluates it**: the builder's rotation
 * order is fixed. Retail carries only {@link DefaultTransformOrder}. See [Transform] in
 * ALCHEMY.md.
 */
export type TransformOrder = [number, number, number]

/** The order bytes every retail transform carries, and `alchemy.dll`'s own default (`0x435`). */
export const DefaultTransformOrder: Readonly<TransformOrder> = [4, 3, 5]

/**
 * Animated transform. The curves are all present or all absent; absent is the identity, which is
 * what the fourth header byte records (`0x80` with curves, `0x00` without) and what the writer
 * derives it from.
 */
export interface Transform {
  order: TransformOrder
  position?: TransformPoint
  rotation?: TransformPoint
  scale?: TransformPoint
}

/** Reads a scalar keyframe: key then value, two floats. */
export function readFloatKeyframe(view: BufferView): FloatKeyframe {
  return {
    key: view.readFloat32(),
    value: view.readFloat32(),
  }
}

/** Writes a scalar keyframe. */
export function writeFloatKeyframe(keyframe: FloatKeyframe): BufferView {
  const { key, value } = keyframe

  return BufferView.allocate(Float32Array.BYTES_PER_ELEMENT * 2)
    .writeFloat32(key)
    .writeFloat32(value)
}

/**
 * Reads a vector keyframe: key then three floats. On a colour curve those are RGB; on a Hermite
 * curve they are value, in-tangent and out-tangent, not a point.
 */
export function readVectorKeyframe(view: BufferView): VectorKeyframe {
  return {
    key: view.readFloat32(),
    value: {
      x: view.readFloat32(),
      y: view.readFloat32(),
      z: view.readFloat32(),
    },
  }
}

/** Writes a vector keyframe. */
export function writeVectorKeyframe(keyframe: VectorKeyframe): BufferView {
  const {
    key,
    value: { x, y, z },
  } = keyframe

  return BufferView.allocate(Float32Array.BYTES_PER_ELEMENT * 4)
    .writeFloat32(key)
    .writeFloat32(x)
    .writeFloat32(y)
    .writeFloat32(z)
}

/**
 * Reads an eased keyframe list: an easing byte, a count byte, then that many keyframes.
 *
 * The easing byte is stored as read even when it falls outside {@link EaseType}, so a file carrying
 * one round-trips; only evaluation has to commit to a meaning.
 * @param read Reader for one keyframe, which fixes the element type.
 */
export function readEaseAnimation<T extends Keyframe>(
  view: BufferView,
  read: (view: BufferView) => T,
): EaseAnimation<T> {
  return {
    easing: view.readUint8(),
    keyframes: readArray(view, read, view.readUint8()),
  }
}

/**
 * Writes an eased keyframe list. The count is derived, and the easing byte goes out as carried.
 * @param write Writer for one keyframe, matching the reader that produced the list.
 */
export function writeEaseAnimation<T extends Keyframe>(
  animation: EaseAnimation<T>,
  write: (value: T) => BufferView,
): BufferView {
  const view = BufferView.allocate(Uint8Array.BYTES_PER_ELEMENT * 2)
    .writeUint8(animation.easing)
    .writeUint8(animation.keyframes.length)

  return BufferView.join(view, writeArray(animation.keyframes, write))
}

/**
 * Reads a looped keyframe list: a fallback value, the {@link WrapFlags} governing keys outside the
 * list's own range, a count, then that many keyframes. The counts here are 16-bit, unlike an eased
 * list's.
 * @param read Reader for one keyframe, which fixes the element type.
 */
export function readLoopAnimation<T extends Keyframe>(
  view: BufferView,
  read: (view: BufferView) => T,
): LoopAnimation<T> {
  return {
    default: view.readFloat32(),
    flags: view.readUint16(),
    keyframes: readArray(view, read, view.readUint16()),
  }
}

/**
 * Writes a looped keyframe list. Only the count is derived.
 * @param write Writer for one keyframe, matching the reader that produced the list.
 */
export function writeLoopAnimation<T extends Keyframe>(
  animation: LoopAnimation<T>,
  write: (value: T) => BufferView,
): BufferView {
  const view = BufferView.allocate(
    Float32Array.BYTES_PER_ELEMENT + Uint16Array.BYTES_PER_ELEMENT * 2,
  )
    .writeFloat32(animation.default)
    .writeUint16(animation.flags)
    .writeUint16(animation.keyframes.length)

  return BufferView.join(view, writeArray(animation.keyframes, write))
}

/**
 * Reads a two-level scalar animation: an outer eased list keyed on sparam, over inner eased lists
 * keyed on particle lifetime.
 */
export function readAnimatedFloat(view: BufferView): AnimatedFloat {
  return readEaseAnimation(view, (view) => ({
    key: readFloat(view),
    ...readEaseAnimation(view, readFloatKeyframe),
  }))
}

/** Writes a two-level scalar animation. */
export function writeAnimatedFloat(animation: AnimatedFloat): BufferView {
  return writeEaseAnimation(animation, ({ key, ...keyframe }) =>
    BufferView.join(writeFloat(key), writeEaseAnimation(keyframe, writeFloatKeyframe)),
  )
}

/** Reads a two-level colour animation, as {@link readAnimatedFloat} with RGB inner keyframes. */
export function readAnimatedColor(view: BufferView): AnimatedColor {
  return readEaseAnimation(view, (view) => ({
    key: readFloat(view),
    ...readEaseAnimation(view, readVectorKeyframe),
  }))
}

/** Writes a two-level colour animation. */
export function writeAnimatedColor(animation: AnimatedColor): BufferView {
  return writeEaseAnimation(animation, ({ key, ...keyframe }) =>
    BufferView.join(writeFloat(key), writeEaseAnimation(keyframe, writeVectorKeyframe)),
  )
}

/**
 * Reads a two-level curve animation: an outer eased list keyed on sparam, over inner *looped*
 * lists whose vector keyframes are Hermite control points rather than plain values.
 */
export function readAnimatedCurve(view: BufferView): AnimatedCurve {
  return readEaseAnimation(view, (view) => ({
    key: readFloat(view),
    ...readLoopAnimation(view, readVectorKeyframe),
  }))
}

/** Writes a two-level curve animation. */
export function writeAnimatedCurve(animation: AnimatedCurve): BufferView {
  return writeEaseAnimation(animation, ({ key, ...keyframe }) =>
    BufferView.join(writeFloat(key), writeLoopAnimation(keyframe, writeVectorKeyframe)),
  )
}

/** Reads three curves as one animated vector, X then Y then Z. */
export function readTransformPoint(view: BufferView): TransformPoint {
  return {
    x: readAnimatedCurve(view),
    y: readAnimatedCurve(view),
    z: readAnimatedCurve(view),
  }
}

/** Writes three curves as one animated vector. */
export function writeTransformPoint(point: TransformPoint): BufferView {
  const { x, y, z } = point
  return BufferView.join(writeAnimatedCurve(x), writeAnimatedCurve(y), writeAnimatedCurve(z))
}

/** The fourth header byte's only bit `alchemy.dll` tests: nine curves follow. */
const CURVES = 0x80

/**
 * Reads animated transform: three signed order bytes, a byte whose sign bit alone says whether
 * nine curves follow (`0x62280a0`), then those curves. The other seven bits are never read.
 */
export function readTransform(view: BufferView): Transform {
  const order: TransformOrder = [view.readInt8(), view.readInt8(), view.readInt8()]

  if ((view.readUint8() & CURVES) === 0) return { order }

  return {
    order,
    position: readTransformPoint(view),
    rotation: readTransformPoint(view),
    scale: readTransformPoint(view),
  }
}

/**
 * Writes animated transform. The curve byte is derived, as `alchemy.dll`'s writer derives it
 * (`0x6227ef0`): `0x80` and nine curves when all three points are present, `0x00` alone otherwise.
 */
export function writeTransform(transform: Transform): BufferView {
  const {
    order: [a, b, c],
    position,
    rotation,
    scale,
  } = transform
  const header = BufferView.allocate(Int8Array.BYTES_PER_ELEMENT * 4)
    .writeInt8(a)
    .writeInt8(b)
    .writeInt8(c)

  if (!position || !rotation || !scale) return header.writeUint8(0)

  return BufferView.join(
    header.writeUint8(CURVES),
    writeTransformPoint(position),
    writeTransformPoint(rotation),
    writeTransformPoint(scale),
  )
}
