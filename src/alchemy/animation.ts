import BufferView from '#/utility/bufferview.js'
import type Vector3 from '#/math/vector3.js'

import {
  clamp,
  lerp,
  quadIn,
  quadOut,
  smooth,
  remap,
  fract,
  pingPong,
  hermite,
} from '#/math/scalar.js'

import {
  type Read,
  type Write,
  readArray,
  writeArray,
  readFloat,
  writeFloat,
  readInteger,
  writeInteger,
} from './misc.js'

interface Keyframe {
  key: number
}

interface FloatKeyframe extends Keyframe {
  value: number
}

const readFloatKeyframe: Read<FloatKeyframe> = (view) => ({
  key: view.readFloat32(),
  value: view.readFloat32(),
})

const writeFloatKeyframe: Write<FloatKeyframe> = ({ key, value }) =>
  BufferView.allocate(Float32Array.BYTES_PER_ELEMENT * 2)
    .writeFloat32(key)
    .writeFloat32(value)

interface VectorKeyframe extends Keyframe {
  value: Vector3
}

const readVectorKeyframe: Read<VectorKeyframe> = (view) => ({
  key: view.readFloat32(),
  value: {
    x: view.readFloat32(),
    y: view.readFloat32(),
    z: view.readFloat32(),
  },
})

const writeVectorKeyframe: Write<VectorKeyframe> = ({ key, value: { x, y, z } }) =>
  BufferView.allocate(Float32Array.BYTES_PER_ELEMENT * 4)
    .writeFloat32(key)
    .writeFloat32(x)
    .writeFloat32(y)
    .writeFloat32(z)

interface Animation<T extends Keyframe> {
  keyframes: T[]
}

/** Easing animation type. */
export enum EaseType {
  Step,
  Linear,
  QuadIn,
  QuadOut,
  Smooth,
  Auto,
}

interface EaseAnimation<T extends Keyframe> extends Animation<T> {
  easing: EaseType
}

const readEaseAnimation = <T extends Keyframe>(
  view: BufferView,
  read: Read<T>,
): EaseAnimation<T> => ({
  easing: view.readUint8(),
  keyframes: readArray(view, read, view.readUint8()),
})

const writeEaseAnimation = <T extends Keyframe>(
  animation: EaseAnimation<T>,
  write: Write<T>,
): BufferView =>
  BufferView.join(
    BufferView.allocate(Uint8Array.BYTES_PER_ELEMENT * 2)
      .writeUint8(animation.easing)
      .writeUint8(animation.keyframes.length),
    writeArray(animation.keyframes, write),
  )

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

interface LoopAnimation<T extends Keyframe> extends Animation<T> {
  default: number
  flags: WrapFlags
}

const readLoopAnimation = <T extends Keyframe>(
  view: BufferView,
  read: Read<T>,
): LoopAnimation<T> => ({
  default: view.readFloat32(),
  flags: view.readUint16(),
  keyframes: readArray(view, read, view.readUint16()),
})

const writeLoopAnimation = <T extends Keyframe>(
  animation: LoopAnimation<T>,
  write: Write<T>,
): BufferView =>
  BufferView.join(
    BufferView.allocate(Float32Array.BYTES_PER_ELEMENT + Uint16Array.BYTES_PER_ELEMENT * 2)
      .writeFloat32(animation.default)
      .writeUint16(animation.flags)
      .writeUint16(animation.keyframes.length),
    writeArray(animation.keyframes, write),
  )

export type AnimatedFloat = EaseAnimation<Keyframe & EaseAnimation<FloatKeyframe>>

export const readAnimatedFloat: Read<AnimatedFloat> = (view) =>
  readEaseAnimation(view, (view) => ({
    key: readFloat(view),
    ...readEaseAnimation(view, readFloatKeyframe),
  }))

export const writeAnimatedFloat: Write<AnimatedFloat> = (animation) =>
  writeEaseAnimation(animation, ({ key, ...keyframe }) =>
    BufferView.join(writeFloat(key), writeEaseAnimation(keyframe, writeFloatKeyframe)),
  )

export type AnimatedColor = EaseAnimation<Keyframe & EaseAnimation<VectorKeyframe>>

export const readAnimatedColor: Read<AnimatedColor> = (view) =>
  readEaseAnimation(view, (view) => ({
    key: readFloat(view),
    ...readEaseAnimation(view, readVectorKeyframe),
  }))

export const writeAnimatedColor: Write<AnimatedColor> = (animation) =>
  writeEaseAnimation(animation, ({ key, ...keyframe }) =>
    BufferView.join(writeFloat(key), writeEaseAnimation(keyframe, writeVectorKeyframe)),
  )

export type AnimatedCurve = EaseAnimation<Keyframe & LoopAnimation<VectorKeyframe>>

export const readAnimatedCurve: Read<AnimatedCurve> = (view) =>
  readEaseAnimation(view, (view) => ({
    key: readFloat(view),
    ...readLoopAnimation(view, readVectorKeyframe),
  }))

export const writeAnimatedCurve: Write<AnimatedCurve> = (animation) =>
  writeEaseAnimation(animation, ({ key, ...keyframe }) =>
    BufferView.join(writeFloat(key), writeLoopAnimation(keyframe, writeVectorKeyframe)),
  )

/** Animated transform point. */
export interface TransformPoint {
  x: AnimatedCurve
  y: AnimatedCurve
  z: AnimatedCurve
}

export const readTransformPoint: Read<TransformPoint> = (view) => ({
  x: readAnimatedCurve(view),
  y: readAnimatedCurve(view),
  z: readAnimatedCurve(view),
})

export const writeTransformPoint: Write<TransformPoint> = ({ x, y, z }) =>
  BufferView.join(writeAnimatedCurve(x), writeAnimatedCurve(y), writeAnimatedCurve(z))

export const enum TransformFlags {
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

/** Tests if transform data is provided. */
export const isTransformEnabled = (flags: TransformFlags) =>
  (flags & TransformFlags.Enable) >>> 0 > 0

/** Animated transform. */
export interface Transform {
  flags: TransformFlags
  position?: TransformPoint
  rotation?: TransformPoint
  scale?: TransformPoint
}

/** Reads animated transform. */
export const readTransform: Read<Transform> = (view) => {
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
export const writeTransform: Write<Transform> = ({ flags, position, rotation, scale }) => {
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

/** Animation query result. */
export interface AnimationRange<T> {
  /** Value before. */
  before: T

  /** Value ahead. */
  ahead: T

  /** Relative position in range [0, 1]. */
  span: number
}

export const at = <T extends { key: number }>(
  keyframes: Iterable<T>,
  key: number,
): AnimationRange<T> => {
  let ahead
  let before
  let span = Infinity

  for (ahead of keyframes) {
    span = before ? ahead.key - before.key : Infinity
    if (key <= ahead.key && span > 0) break

    before = ahead
    span = Infinity
  }

  if (!ahead) throw new Error('Missing keyframe data')

  before ??= ahead
  span = key > ahead.key ? 1 : clamp((key - before.key) / span, 0, 1)

  return { before, ahead, span }
}

export const ease = (type: EaseType, a: number, b: number, t: number): number => {
  if (a === b) return a

  switch (type) {
    case EaseType.Step:
      return a
    case EaseType.Linear:
      return lerp(a, b, t)
    case EaseType.QuadIn:
      return lerp(a, b, quadIn(t))
    case EaseType.QuadOut:
      return lerp(a, b, quadOut(t))
    case EaseType.Smooth:
      return lerp(a, b, smooth(t))
    case EaseType.Auto:
      return lerp(a, b, (a < b ? quadIn : quadOut)(t))
  }
}

export const limit = (flags: WrapFlags, start: number, end: number, key: number) => {
  let count = 0

  // Remap key to relative value.
  key = remap(key, start, end, 0, 1)

  const isBefore = key < 0
  const isAfter = key > 1

  // Multiplier.
  if (
    (isBefore && flags & WrapFlags.BeforeContinue) ||
    (isAfter && flags & WrapFlags.AfterContinue)
  )
    count = key > 0 ? Math.ceil(key) - 1 : Math.floor(key)

  // Clamp value.
  if ((isBefore && flags & WrapFlags.BeforeClamp) || (isAfter && flags & WrapFlags.AfterClamp))
    key = clamp(key, 0, 1)

  // Repeat value.
  if ((isBefore && flags & WrapFlags.BeforeRepeat) || (isAfter && flags & WrapFlags.AfterRepeat))
    key = fract(key)

  // Mirror value.
  if ((isBefore && flags & WrapFlags.BeforeMirror) || (isAfter && flags & WrapFlags.AfterMirror))
    key = pingPong(key)

  if (!flags && key === 1) key %= 1

  // Remap key back to absolute value.
  key = remap(key, 0, 1, start, end)

  return { key, count }
}

const floatWhen = (animation: EaseAnimation<FloatKeyframe>, key: number): number => {
  const { before, ahead, span } = at(animation.keyframes, key)
  return ease(animation.easing, before.value, ahead.value, span)
}

export const floatAt = (animation: AnimatedFloat, p: number, t: number): number => {
  const { before, ahead, span } = at(animation.keyframes, p)
  return ease(animation.easing, floatWhen(before, t), floatWhen(ahead, t), span)
}

const easeVector = (type: EaseType, a: Vector3, b: Vector3, t: number): Vector3 => ({
  x: ease(type, a.x, b.x, t),
  y: ease(type, a.y, b.y, t),
  z: ease(type, a.z, b.z, t),
})

const vectorWhen = (animation: EaseAnimation<VectorKeyframe>, key: number): Vector3 => {
  const { before, ahead, span } = at(animation.keyframes, key)
  return easeVector(animation.easing, before.value, ahead.value, span)
}

export const colorAt = (animation: AnimatedColor, p: number, t: number): Vector3 => {
  const { before, ahead, span } = at(animation.keyframes, p)
  return easeVector(animation.easing, vectorWhen(before, t), vectorWhen(ahead, t), span)
}

const hermiteAt = (animation: LoopAnimation<VectorKeyframe>, key: number): number => {
  let count = 0

  const first = animation.keyframes.at(0)
  const last = animation.keyframes.at(-1)

  // Curve has no keyframes.
  if (!first || !last)
    return animation.default

    // Limit key to position.
  ;({ key, count } = limit(animation.flags, first.key, last.key, key))

  const { before, ahead, span } = at(animation.keyframes, key)

  // Add loop distance for accumulative result.
  return (
    hermite(before.value.x, before.value.z, ahead.value.x, ahead.value.y, span) +
    (last.value.x - first.value.x) * count
  )
}

export const curveAt = (animation: AnimatedCurve, p: number, t: number): number => {
  const { before, ahead, span } = at(animation.keyframes, p)
  return ease(animation.easing, hermiteAt(before, t), hermiteAt(ahead, t), span)
}

const transformPointAt = ({ x, y, z }: TransformPoint, p: number, t: number): Vector3 => ({
  x: curveAt(x, p, t),
  y: curveAt(y, p, t),
  z: curveAt(z, p, t),
})

export const transformAt = (
  { flags, position, rotation, scale }: Transform,
  p: number,
  t: number,
): {
  flags: TransformFlags
  position: Vector3
  rotation: Vector3
  scale: Vector3
} => ({
  flags,
  position: position ? transformPointAt(position, p, t) : { x: 0, y: 0, z: 0 },
  rotation: rotation ? transformPointAt(rotation, p, t) : { x: 0, y: 0, z: 0 },
  scale: scale ? transformPointAt(scale, p, t) : { x: 1, y: 1, z: 1 },
})
