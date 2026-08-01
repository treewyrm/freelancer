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

    // Nine retail keyframes carry a byte outside the enum, and they are two different things.
    // Seven are junk — 8, 120, 136, 248, every one of them with bit 3 set and the low three
    // bits clear, all in `gf_bolt01.ale`, all on lists of a single keyframe where easing has
    // nothing to interpolate between. The other two are a 6, one past `Auto`, on the four-
    // keyframe alpha fade of the motion dust in `dust.ale` and `motionblur_dust.ale`. That one
    // may well be a seventh type nobody has named yet; see [Easing outside the enum] in
    // ALCHEMY.md, and `EaseType` in animation.ts. Linear is a guess, not a reading of the data.
    //
    // Whatever it means, the byte itself survives: readers and writers preserve it verbatim and
    // both files round-trip byte for byte. Only evaluation has to commit to something, and
    // without this branch it committed to `undefined`, which became NaN downstream.
    default:
      return lerp(a, b, t)
  }
}

export function limit(flags: WrapFlags, start: number, end: number, key: number) {
  let count = 0

  // A range of no length holds a single value, and most retail curves are exactly that: one
  // keyframe. Remapping through it would divide by zero and carry NaN into the sample.
  if (start === end) return { key: start, count }

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

  // TODO: observe in game. A key landing exactly on the end of a curve with no wrap flags folds
  // back to the start, so the last keyframe is never sampled. Deliberate for a looping curve
  // that carries no flags, and wrong for one meant to hold — unverified either way.
  if (!flags && key === 1) key %= 1

  // Remap key back to absolute value.
  key = remap(key, 0, 1, start, end)

  return { key, count }
}

/**
 * An eased list carries no fallback the way a looped one does, so an empty list contributes
 * nothing. Seven properties across two retail files hold one — three where it is the only list,
 * four where it sits at key 0 beside a populated list, which then ramps up from zero.
 */
export function floatWhen(animation: EaseAnimation<FloatKeyframe>, key: number): number {
  if (!animation.keyframes.length) return 0

  const { start, end, span } = at(animation.keyframes, key)
  return ease(animation.easing, start.value, end.value, span)
}

export function floatAt(animation: AnimatedFloat, p: number, t: number): number {
  if (!animation.keyframes.length) return 0

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

/** Empty vector list, as {@link floatWhen}. No retail colour carries one. */
export function vectorWhen(animation: EaseAnimation<VectorKeyframe>, key: number): Vector3 {
  if (!animation.keyframes.length) return { x: 0, y: 0, z: 0 }

  const { start, end, span } = at(animation.keyframes, key)
  return easeVector(animation.easing, start.value, end.value, span)
}

export function colorAt(animation: AnimatedColor, p: number, t: number): Vector3 {
  if (!animation.keyframes.length) return { x: 0, y: 0, z: 0 }

  const { start, end, span } = at(animation.keyframes, p)
  return easeVector(animation.easing, vectorWhen(start, t), vectorWhen(end, t), span)
}

export function hermiteAt(animation: LoopAnimation<VectorKeyframe>, key: number): number {
  let count = 0

  const first = animation.keyframes.at(0)
  const last = animation.keyframes.at(-1)

  // Curve has no keyframes.
  if (!first || !last) return animation.default

  // Limit key to position.
  ;({ key, count } = limit(animation.flags, first.key, last.key, key))

  const { start, end, span } = at(animation.keyframes, key)

  /** Continue effect. */
  const accumulate = (last.value.x - first.value.x) * count

  // Add loop distance for accumulative result.
  return hermite(start.value.x, start.value.z, end.value.x, end.value.y, span) + accumulate
}

export function curveAt(animation: AnimatedCurve, p: number, t: number): number {
  if (!animation.keyframes.length) return 0

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
