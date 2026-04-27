import BufferView from '#/utility/bufferview.js'
import type Vector3 from '#/math/vector3.js'
import { readArray, writeArray, readFloat, writeFloat, readInteger, writeInteger } from './misc.js'
import type { Keyframe } from '#/math/animation.js'

export interface FloatKeyframe extends Keyframe {
  value: number
}

export interface VectorKeyframe extends Keyframe {
  value: Vector3
}

export interface Animation<T extends Keyframe> {
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

export interface LoopAnimation<T extends Keyframe> extends Animation<T> {
  default: number
  flags: WrapFlags
}

export type AnimatedFloat = EaseAnimation<Keyframe & EaseAnimation<FloatKeyframe>>

export type AnimatedColor = EaseAnimation<Keyframe & EaseAnimation<VectorKeyframe>>

export type AnimatedCurve = EaseAnimation<Keyframe & LoopAnimation<VectorKeyframe>>

/** Animated transform point. */
export interface TransformPoint {
  x: AnimatedCurve
  y: AnimatedCurve
  z: AnimatedCurve
}

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

/** Animated transform. */
export interface Transform {
  flags: TransformFlags
  position?: TransformPoint
  rotation?: TransformPoint
  scale?: TransformPoint
}

export function readFloatKeyframe(view: BufferView): FloatKeyframe {
  return {
    key: view.readFloat32(),
    value: view.readFloat32(),
  }
}

export function writeFloatKeyframe(keyframe: FloatKeyframe): BufferView {
  const { key, value } = keyframe

  return BufferView.allocate(Float32Array.BYTES_PER_ELEMENT * 2)
    .writeFloat32(key)
    .writeFloat32(value)
}

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

export function readEaseAnimation<T extends Keyframe>(
  view: BufferView,
  read: (view: BufferView) => T,
): EaseAnimation<T> {
  return {
    easing: view.readUint8(),
    keyframes: readArray(view, read, view.readUint8()),
  }
}

export function writeEaseAnimation<T extends Keyframe>(
  animation: EaseAnimation<T>,
  write: (value: T) => BufferView,
): BufferView {
  const view = BufferView.allocate(Uint8Array.BYTES_PER_ELEMENT * 2)
    .writeUint8(animation.easing)
    .writeUint8(animation.keyframes.length)

  return BufferView.join(view, writeArray(animation.keyframes, write))
}

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

export function readAnimatedFloat(view: BufferView): AnimatedFloat {
  return readEaseAnimation(view, (view) => ({
    key: readFloat(view),
    ...readEaseAnimation(view, readFloatKeyframe),
  }))
}

export function writeAnimatedFloat(animation: AnimatedFloat): BufferView {
  return writeEaseAnimation(animation, ({ key, ...keyframe }) =>
    BufferView.join(writeFloat(key), writeEaseAnimation(keyframe, writeFloatKeyframe)),
  )
}

export function readAnimatedColor(view: BufferView): AnimatedColor {
  return readEaseAnimation(view, (view) => ({
    key: readFloat(view),
    ...readEaseAnimation(view, readVectorKeyframe),
  }))
}

export function writeAnimatedColor(animation: AnimatedColor): BufferView {
  return writeEaseAnimation(animation, ({ key, ...keyframe }) =>
    BufferView.join(writeFloat(key), writeEaseAnimation(keyframe, writeVectorKeyframe)),
  )
}

export function readAnimatedCurve(view: BufferView): AnimatedCurve {
  return readEaseAnimation(view, (view) => ({
    key: readFloat(view),
    ...readLoopAnimation(view, readVectorKeyframe),
  }))
}

export function writeAnimatedCurve(animation: AnimatedCurve): BufferView {
  return writeEaseAnimation(animation, ({ key, ...keyframe }) =>
    BufferView.join(writeFloat(key), writeLoopAnimation(keyframe, writeVectorKeyframe)),
  )
}

export function readTransformPoint(view: BufferView): TransformPoint {
  return {
    x: readAnimatedCurve(view),
    y: readAnimatedCurve(view),
    z: readAnimatedCurve(view),
  }
}

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
