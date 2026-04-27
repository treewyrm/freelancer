import { at } from '#/math/animation.js'
import {
  clamp,
  fract,
  hermite,
  lerp,
  pingPong,
  quadIn,
  quadOut,
  remap,
  smooth,
} from '#/math/scalar.js'
import type Vector3 from '#/math/vector3.js'
import {
  EaseType,
  TransformFlags,
  WrapFlags,
  type AnimatedColor,
  type AnimatedCurve,
  type AnimatedFloat,
  type EaseAnimation,
  type FloatKeyframe,
  type LoopAnimation,
  type Transform,
  type TransformPoint,
  type VectorKeyframe,
} from './animation.js'

export function ease(type: EaseType, a: number, b: number, t: number): number {
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

export function limit(flags: WrapFlags, start: number, end: number, key: number) {
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

export function floatWhen(animation: EaseAnimation<FloatKeyframe>, key: number): number {
  const { start, end, span } = at(animation.keyframes, key)
  return ease(animation.easing, start.value, end.value, span)
}

export function floatAt(animation: AnimatedFloat, p: number, t: number): number {
  const { start, end, span } = at(animation.keyframes, p)
  return ease(animation.easing, floatWhen(start, t), floatWhen(end, t), span)
}

export function easeVector(type: EaseType, a: Vector3, b: Vector3, t: number): Vector3 {
  return {
    x: ease(type, a.x, b.x, t),
    y: ease(type, a.y, b.y, t),
    z: ease(type, a.z, b.z, t),
  }
}

export function vectorWhen(animation: EaseAnimation<VectorKeyframe>, key: number): Vector3 {
  const { start, end, span } = at(animation.keyframes, key)
  return easeVector(animation.easing, start.value, end.value, span)
}

export function colorAt(animation: AnimatedColor, p: number, t: number): Vector3 {
  const { start, end, span } = at(animation.keyframes, p)
  return easeVector(animation.easing, vectorWhen(start, t), vectorWhen(end, t), span)
}

export function hermiteAt(animation: LoopAnimation<VectorKeyframe>, key: number): number {
  let count = 0

  const first = animation.keyframes.at(0)
  const last = animation.keyframes.at(-1)

  // Curve has no keyframes.
  if (!first || !last)
    return animation.default

    // Limit key to position.
  ;({ key, count } = limit(animation.flags, first.key, last.key, key))

  const { start, end, span } = at(animation.keyframes, key)

  // Add loop distance for accumulative result.
  return (
    hermite(start.value.x, start.value.z, end.value.x, end.value.y, span) +
    (last.value.x - first.value.x) * count
  )
}

export function curveAt(animation: AnimatedCurve, p: number, t: number): number {
  const { start, end, span } = at(animation.keyframes, p)
  return ease(animation.easing, hermiteAt(start, t), hermiteAt(end, t), span)
}

export function transformPointAt(point: TransformPoint, p: number, t: number): Vector3 {
  const { x, y, z } = point

  return {
    x: curveAt(x, p, t),
    y: curveAt(y, p, t),
    z: curveAt(z, p, t),
  }
}

export interface TransformAt {
  flags: TransformFlags
  position: Vector3
  rotation: Vector3
  scale: Vector3
}

export function transformAt(point: Transform, p: number, t: number): TransformAt {
  const { flags, position, rotation, scale } = point

  return {
    flags,
    position: position ? transformPointAt(position, p, t) : { x: 0, y: 0, z: 0 },
    rotation: rotation ? transformPointAt(rotation, p, t) : { x: 0, y: 0, z: 0 },
    scale: scale ? transformPointAt(scale, p, t) : { x: 1, y: 1, z: 1 },
  }
}
