import { at, type Keyframe } from '#/math/animation.js'
import { hermite, lerp, quadIn, quadOut, smooth } from '#/math/scalar.js'
import type Vector3 from '#/math/vector3.js'
import {
  EaseType,
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

/*
 * Everything here is a port of retail `alchemy.dll`, and the addresses in the comments are where
 * each rule was read. The DLL has three evaluators, not one: the eased lists (`FxRampSingle`,
 * `FxRampColor`), the Hermite curves (`FxAnimatedSingle`), and the sparam level above both
 * (`AnimatedFloat` / `AnimatedColor` / `AnimatedCurve`), which carries its own inline copy of the
 * easings. See [Evaluation] in ALCHEMY.md.
 */

/** The easing curve alone, over `t` in [0, 1]. `rising` decides the two `Auto` types. */
function weight(type: EaseType, rising: boolean, t: number): number {
  switch (type) {
    case EaseType.Step:
      return 0
    case EaseType.QuadIn:
      return quadIn(t)
    case EaseType.QuadOut:
      return quadOut(t)
    case EaseType.Smooth:
      return smooth(t)
    case EaseType.Auto:
      return (rising ? quadIn : quadOut)(t)
    case EaseType.AutoInverse:
      return (rising ? quadOut : quadIn)(t)

    // Linear, and every byte past the table. The DLL indexes off its end there (`0x6242880`),
    // and retail puts such bytes only on single-keyframe lists, which never reach an easing.
    default:
      return t
  }
}

/**
 * Interpolates between two values by the named easing curve — the table an eased list calls
 * through (`0x6242970`..`0x6242a70`).
 *
 * `Auto` eases in toward a larger value and out toward a smaller one (`0x6242a20`), and
 * `AutoInverse` the reverse (`0x6242a70`). A byte outside the enum is linear here and undefined in
 * the game.
 * @param t Normalized position between `a` and `b`, in range [0, 1].
 */
export function ease(type: EaseType, a: number, b: number, t: number): number {
  if (a === b || type === EaseType.Step) return a

  return lerp(a, b, weight(type, a < b, t))
}

/**
 * The sparam level's easing. It is inline code rather than the table (`0x6206f90`, `0x6207740`,
 * `0x6207ef0`), and it has `Auto` and `AutoInverse` the other way round. Retail's outer lists use
 * only `Smooth`, `Linear` and `QuadIn`, so the swap is never seen — but it is what the code does.
 */
const outer = (type: EaseType): EaseType =>
  type === EaseType.Auto
    ? EaseType.AutoInverse
    : type === EaseType.AutoInverse
      ? EaseType.Auto
      : type

/**
 * Where the sparam level of an animated property lands for `p`: the inner list at or before it, the
 * one after, how far between, and the easing that blends what the two give — already the level's
 * own, with `Auto` and `AutoInverse` swapped (`0x6206f90`, `0x6207740`, `0x6207ef0`).
 *
 * The half of {@link floatAt}, {@link colorAt} and {@link curveAt} above the inner lists, and all
 * three are built on it. It is exported for a caller that evaluates the inner lists somewhere else —
 * a vertex stage, handed the two lists and the weight's inputs once per draw, since `p` is one value
 * for a whole effect instance.
 *
 * On or past the last key both lists are the last and `span` is 0, which every easing takes to the
 * lower list's value. `undefined` for an animation with no inner list at all.
 */
export interface SparamLevel<T> {
  lower: T
  upper: T
  span: number
  easing: EaseType
}

export function sparamLevel<T extends Keyframe>(
  animation: EaseAnimation<T>,
  p: number,
): SparamLevel<T> | undefined {
  const last = animation.keyframes.at(-1)
  if (!last) return undefined
  if (p >= last.key) return { lower: last, upper: last, span: 0, easing: outer(animation.easing) }

  const { start, end, span } = at(animation.keyframes, p)
  return { lower: start, upper: end, span, easing: outer(animation.easing) }
}

/**
 * Folds a key outside a looped curve's range back into it, by the curve's {@link WrapFlags} mode on
 * that side (`0x6246a52`..`0x6246c7a`).
 *
 * `count` is what cycle-with-offset needs: the number of whole ranges the key ran past, which the
 * caller multiplies by the curve's total rise. Hold and linear return the key clamped to the end;
 * linear's value is not a folded key, so `hermiteAt` handles it before calling this.
 * @returns The key folded into `[start, end]`, and how many ranges it overshot.
 */
export function limit(flags: WrapFlags, start: number, end: number, key: number) {
  const before = key < start

  if (!before && !(key > end)) return { key, count: 0 }

  const mode = before ? flags & 0xf : (flags >> 4) & 0xf
  const range = end - start

  // Keyframes all on one key span nothing, and the DLL divides by that range regardless — its
  // result is undefined. This holds the near end rather than carry NaN on.
  if (!(range > 0)) return { key: before ? start : end, count: 0 }

  const offset = key - start

  // `fmod` keeps the dividend's sign, so before the range `wrapped` is in (−range, 0] and is added
  // to the end rather than the start. The quotient goes through `_ftol`, which truncates, and is
  // lowered by one first on that side (`0x6246ae1`).
  const wrapped = offset % range
  const quotient = offset / range
  const count = Math.trunc(before ? quotient - 1 : quotient)
  const cycled = (before ? end : start) + wrapped

  // The `Before` members are the bare mode numbers, so they name either nibble once shifted.
  switch (mode) {
    case WrapFlags.BeforeCycle:
      return { key: cycled, count: 0 }
    case WrapFlags.BeforeCycleOffset:
      return { key: cycled, count }
    case WrapFlags.BeforeOscillate:
      return { key: count & 1 ? (before ? start : end) - wrapped : cycled, count: 0 }

    // Hold, linear, and the nibbles past 4 that the DLL leaves undefined.
    default:
      return { key: before ? start : end, count: 0 }
  }
}

/**
 * Samples an eased list (`FxRampSingle`, `0x6242b10`). It holds its first and last values outside
 * its keys, and a key exactly on the last one returns that value rather than the easing's end.
 *
 * An eased list carries no fallback the way a looped one does, so an empty list contributes
 * nothing here. The DLL has no guard for one at all. Seven properties across two retail files
 * hold one — three where it is the only list, four where it sits at key 0 beside a populated list,
 * which then ramps up from zero.
 */
export function floatWhen(animation: EaseAnimation<FloatKeyframe>, key: number): number {
  const last = animation.keyframes.at(-1)
  if (!last) return 0
  if (key >= last.key) return last.value

  const { start, end, span } = at(animation.keyframes, key)
  return ease(animation.easing, start.value, end.value, span)
}

/**
 * Samples an {@link AnimatedFloat} on both axes: the outer list is keyed on `p`, and the two inner
 * lists it lands between are each sampled at `t` and eased together.
 * @param p Sparam — the external control value the engine blends animation states with.
 * @param t The inner key. What it is belongs to the caller: see [Two clocks] in ALCHEMY.md.
 */
export function floatAt(animation: AnimatedFloat, p: number, t: number): number {
  const level = sparamLevel(animation, p)
  if (!level) return 0

  const { lower, upper, span, easing } = level
  if (lower === upper) return floatWhen(lower, t)

  return ease(easing, floatWhen(lower, t), floatWhen(upper, t), span)
}

/**
 * {@link ease} componentwise, which is how the sparam level blends colours — in float, with each
 * component eased on its own.
 */
export function easeVector(type: EaseType, a: Vector3, b: Vector3, t: number): Vector3 {
  return {
    x: ease(type, a.x, b.x, t),
    y: ease(type, a.y, b.y, t),
    z: ease(type, a.z, b.z, t),
  }
}

/** One colour component to a byte as the DLL stores it: `_ftol(c × 255)`, unclamped (`0x62098e0`). */
const byte = (c: number): number => (c * 255) | 0

/** `0x00RRGGBB`, packed the DLL's way, so an out-of-range component spills as it does there. */
const pack = ({ x, y, z }: Vector3): number => (((byte(y) | (byte(x) << 8)) << 8) | byte(z)) >>> 0

const BYTE = Math.fround(1 / 255)

/** Back to float through the DLL's `1/255` constant (`0x624bc98`). */
const unpack = (rgb: number): Vector3 => ({
  x: Math.fround(((rgb >>> 16) & 0xff) * BYTE),
  y: Math.fround(((rgb >>> 8) & 0xff) * BYTE),
  z: Math.fround((rgb & 0xff) * BYTE),
})

/**
 * Samples a colour list (`FxRampColor`, `0x62424b0`). **It eases in bytes, not floats**: each key
 * is stored packed as `0x00RRGGBB`, the easing curve becomes an integer weight `w = _ftol(e × 255)`,
 * and each channel moves by `(b − a) × w >> 8` (`0x6241cd0`) — so a span never quite reaches its
 * far key from inside, and `Auto` compares the two packed words, red first.
 *
 * Every retail colour is a whole number of 255ths, so only the interior of a span differs from a
 * float lerp, and by under one 255th.
 */
export function vectorWhen(animation: EaseAnimation<VectorKeyframe>, key: number): Vector3 {
  const last = animation.keyframes.at(-1)
  if (!last) return { x: 0, y: 0, z: 0 }
  if (key >= last.key) return unpack(pack(last.value))

  const { start, end, span } = at(animation.keyframes, key)
  const a = pack(start.value)

  if (animation.easing === EaseType.Step) return unpack(a)

  const b = pack(end.value)
  const w = (weight(animation.easing, a < b, span) * 255) | 0
  const channel = (shift: number) => {
    const from = (a >>> shift) & 0xff
    return ((from + (((((b >>> shift) & 0xff) - from) * w) >> 8)) & 0xff) << shift
  }

  return unpack((channel(16) | channel(8) | channel(0)) >>> 0)
}

/**
 * Samples an {@link AnimatedColor}, as {@link floatAt}. The vector is RGB, not a position. The inner
 * lists ease in bytes ({@link vectorWhen}); the sparam level blends their results in float, and its
 * `Auto` compares the two colours' component sums (`0x6207fde`).
 * @param p Sparam — the external control value the engine blends animation states with.
 * @param t The inner key. What it is belongs to the caller: see [Two clocks] in ALCHEMY.md.
 */
export function colorAt(animation: AnimatedColor, p: number, t: number): Vector3 {
  const level = sparamLevel(animation, p)
  if (!level) return { x: 0, y: 0, z: 0 }

  const { lower, upper, span, easing } = level
  if (lower === upper) return vectorWhen(lower, t)

  const a = vectorWhen(lower, t)
  const b = vectorWhen(upper, t)

  if (easing === EaseType.Step) return a

  const f = weight(easing, a.x + a.y + a.z < b.x + b.y + b.z, span)
  return { x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f), z: lerp(a.z, b.z, f) }
}

/**
 * Samples one inner curve of an {@link AnimatedCurve} as a Hermite spline (`FxAnimatedSingle`,
 * `0x62469f0`), wrapping the key by the curve's {@link WrapFlags} first.
 *
 * A keyframe's vector is not a point: `x` is the value, `y` the in-tangent and `z` the out-tangent,
 * so a span reads `z` off the keyframe it leaves and `y` off the one it arrives at. They are used
 * exactly as the file stores them; the loader never recomputes them (`0x6227a20`).
 * @returns The sampled value, plus the accumulated rise of any whole ranges a cycle-with-offset key
 * ran past.
 */
export function hermiteAt(animation: LoopAnimation<VectorKeyframe>, key: number): number {
  const { flags, keyframes } = animation
  const first = keyframes.at(0)
  const last = keyframes.at(-1)

  // No keyframes: the default, which is otherwise ignored (`0x62430e0`).
  if (!first || !last) return animation.default

  // Past an end, hold returns that end's value and linear runs along its own tangent — in-tangent
  // before, out-tangent after (`0x6246aa6`, `0x6246b99`, `0x6246bc9`, `0x6246c7a`). A single
  // keyframe obeys only these two (`0x6246a11`); the three cycling modes need a range.
  const before = key < first.key
  const after = key > last.key
  const mode = before ? flags & 0xf : after ? (flags >> 4) & 0xf : 0
  const cycles = keyframes.length > 1 && mode >= 1 && mode <= 3

  if (before && !cycles)
    return mode === 4 ? first.value.x + (key - first.key) * first.value.y : first.value.x

  if (after && !cycles)
    return mode === 4 ? last.value.x + (key - last.key) * last.value.z : last.value.x

  const folded = limit(flags, first.key, last.key, key)
  const accumulate = (last.value.x - first.value.x) * folded.count

  // The last keyframe at or before the key, and the one after it (`0x6246b48`..`0x6246caf`). On
  // keys shared by several keyframes that is the last of them, where `at` would take the first.
  let index = 0
  while (index + 1 < keyframes.length && keyframes[index + 1]!.key <= folded.key) index++

  const start = keyframes[index]!
  const end = keyframes[index + 1] ?? start

  // The segment returns a keyframe's value outright when the key lands on it (`0x6246950`).
  if (folded.key === start.key) return start.value.x + accumulate

  // An out-tangent whose bits are all set steps instead of bending (`0x6246987`). No retail
  // keyframe carries one; a NaN read from the file is the nearest thing this can test for.
  if (Number.isNaN(start.value.z)) return start.value.x + accumulate

  // Tangents are stored per unit of key, and `hermite` takes them per unit of `span`, so they
  // convert by the width of the interval being crossed — as the DLL does, multiplying both by it.
  // Retail key axes are not normalized: 9322 of 9324 adjacent intervals are something other than
  // 1, and one rotation curve in `gf_neutronstar.ale` is keyed over 0..360.
  const delta = end.key - start.key
  const span = (folded.key - start.key) / delta

  return (
    hermite(start.value.x, start.value.z * delta, end.value.x, end.value.y * delta, span) +
    accumulate
  )
}

/**
 * Samples an {@link AnimatedCurve}, as {@link floatAt}, except that the inner lists are Hermite
 * curves sampled by {@link hermiteAt} rather than eased keyframe lists.
 * @param p Sparam — the external control value the engine blends animation states with.
 * @param t The inner key. What it is belongs to the caller: see [Two clocks] in ALCHEMY.md.
 */
export function curveAt(animation: AnimatedCurve, p: number, t: number): number {
  const level = sparamLevel(animation, p)
  if (!level) return 0

  const { lower, upper, span, easing } = level
  if (lower === upper) return hermiteAt(lower, t)

  return ease(easing, hermiteAt(lower, t), hermiteAt(upper, t), span)
}

/** Samples the three curves of a {@link TransformPoint} into a vector. */
export function transformPointAt(point: TransformPoint, p: number, t: number): Vector3 {
  const { x, y, z } = point

  return {
    x: curveAt(x, p, t),
    y: curveAt(y, p, t),
    z: curveAt(z, p, t),
  }
}

/** A {@link Transform} sampled at one point on both axes. Every component is present. */
export interface TransformAt {
  position: Vector3
  rotation: Vector3
  scale: Vector3
}

/**
 * Samples a node's whole {@link Transform}. An absent component is not animated and falls back to
 * its neutral value — zero for position and rotation, one for scale — so the result is always
 * complete. The order bytes are not consulted: `alchemy.dll`'s builder never reads them.
 * @param p Sparam — the external control value the engine blends animation states with.
 * @param t The inner key. What it is belongs to the caller: see [Two clocks] in ALCHEMY.md.
 */
export function transformAt(point: Transform, p: number, t: number): TransformAt {
  const { position, rotation, scale } = point

  return {
    position: position ? transformPointAt(position, p, t) : { x: 0, y: 0, z: 0 },
    rotation: rotation ? transformPointAt(rotation, p, t) : { x: 0, y: 0, z: 0 },
    scale: scale ? transformPointAt(scale, p, t) : { x: 1, y: 1, z: 1 },
  }
}
