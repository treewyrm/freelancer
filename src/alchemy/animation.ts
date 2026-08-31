import BufferView from '#/utility/bufferview.js'
import type Vector3 from '#/math/vector3.js'
import { readArray, writeArray, readFloat, writeFloat, readInteger, writeInteger } from './misc.js'
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
 * Easing animation type.
 *
 * The list may be incomplete. Two retail keyframes — the alpha fade of the motion dust in
 * `dust.ale` and `motionblur_dust.ale` — hold a 6, one past `Auto`, on a four-keyframe list
 * where the easing is actually interpolated and on screen for as long as the player is in
 * space. Those two nodes are the only `FLDustAppearance` in the game and 6 appears nowhere
 * else, so the value tracks Freelancer's own node type rather than one author's slip. Whether
 * it names a seventh interpolation or something the dust code reads for another purpose is
 * unresolved; `ease` falls back to linear. See [Easing outside the enum] in ALCHEMY.md.
 *
 * The value is stored as read and written back unchanged either way.
 */
export enum EaseType {
  Step,
  Linear,
  QuadIn,
  QuadOut,
  Smooth,
  Auto,
}

/** A keyframe list interpolated by one named easing curve, with no behaviour outside its range. */
export interface EaseAnimation<T extends Keyframe> extends Animation<T> {
  easing: EaseType
}

/** Looped animation out-of-bounds toggles. */
export enum WrapFlags {
  None = 0,
  BeforeRepeat = 1 << 0,
  BeforeMirror = 1 << 1,
  BeforeClamp = 1 << 2,
  BeforeContinue = 1 << 3,
  AfterRepeat = 1 << 4,
  AfterMirror = 1 << 5,
  AfterClamp = 1 << 6,
  AfterContinue = 1 << 7,
}

/**
 * A keyframe list that says what happens outside its own range, and what an empty list evaluates to.
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

// TODO: observe in game. Retail carries exactly two words here — 0x00050304 and 0x80050304 — so
// only the enable bit is ever varied and the rest cannot be read off the data. They select neither
// which channels are present (the payload is always nine curves) nor which are used (the same word
// covers every combination of populated channels). See the TODO section in docs/ALCHEMY.md.
/** Which of a node transform's channels are present, and whatever else the low bits mean. */
export enum TransformFlags {
  None = 0,
  Unknown1 = 1 << 2,
  Unknown2 = 1 << 8,
  Unknown3 = 1 << 9,
  Unknown4 = 1 << 16,
  Unknown5 = 1 << 18,
  Default = TransformFlags.Unknown1 |
    TransformFlags.Unknown2 |
    TransformFlags.Unknown3 |
    TransformFlags.Unknown4 |
    TransformFlags.Unknown5,
  Enable = 1 << 31,
}

/** Animated transform. */
export interface Transform {
  flags: TransformFlags
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

/** Tests if transform data is provided. */
export const isTransformEnabled = (flags: TransformFlags) =>
  (flags & TransformFlags.Enable) >>> 0 > 0

/** Reads animated transform. */
export function readTransform(view: BufferView): Transform {
  const flags = readInteger(view)
  let position: TransformPoint | undefined
  let rotation: TransformPoint | undefined
  let scale: TransformPoint | undefined

  if (isTransformEnabled(flags)) {
    position = readTransformPoint(view)
    rotation = readTransformPoint(view)
    scale = readTransformPoint(view)
  }

  return { flags, position, rotation, scale }
}

/** Writes animated transform. */
export function writeTransform(transform: Transform): BufferView {
  const { flags, position, rotation, scale } = transform
  const views: BufferView[] = []

  if (isTransformEnabled(flags) && position && rotation && scale) {
    views.push(
      writeTransformPoint(position),
      writeTransformPoint(rotation),
      writeTransformPoint(scale),
    )
  }

  return BufferView.join(writeInteger(flags), ...views)
}
