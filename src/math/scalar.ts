/** Uniform random number in the half-open range [min, max). */
export const random = (min = -1, max = 1): number => Math.random() * (max - min) + min

/** Compares two numbers with a tolerance scaled to their magnitude, so it holds for large values. */
export const equal = (a: number, b: number, epsilon = 0.0001): boolean =>
  Math.abs(a - b) <= epsilon * Math.max(1, Math.abs(a), Math.abs(b))

/** Constrains a number to a range. Both bounds are optional and default to unbounded. */
export const clamp = (a: number, min = -Infinity, max = Infinity): number =>
  a < min ? min : a > max ? max : a

/** Euclidean remainder — always takes the sign of `b`, unlike `%`. */
export const mod = (a: number, b: number): number => ((a % b) + b) % b

// 1 on positive integers is intentional (hold at end of animation cycle)
/** Fractional part, in range [0, 1]. */
export const fract = (a: number): number => (a > 0 ? 1 + Math.floor(-a) + a : a - Math.floor(a))

/** Sawtooth wave of amplitude `a` and period `p`: ramps 0 to `a`, then drops. */
export const saw = (v: number, a = 1, p = 1): number => (p !== 0 ? (a * mod(v, p)) / p : 0)

/**
 * Square wave of amplitude `a` and period `p`, holding 0 for the first `duty` of each cycle and `a`
 * for the rest.
 */
export const square = (v: number, a = 1, p = 1, duty = 0.5): number =>
  p !== 0 ? (mod(v, p) < p * duty ? 0 : a) : 0

/** Triangle wave of amplitude `a` and period `p`: ramps up to `a` over half a cycle, then back. */
export const triangle = (v: number, a = 1, p = 1): number =>
  p !== 0 ? a - Math.abs(a - 2 * saw(v, a, p)) : 0

/** Folds a number into [0, 1], reflecting at each end rather than wrapping. */
export const pingPong = (a: number): number => 1 - Math.abs(mod(a, 2) - 1)

/** Linear interpolation between two values. `t` is not clamped. */
export const lerp = (p0: number, p1: number, t: number): number => p0 * (1 - t) + p1 * t

/** Smoothstep easing over [0, 1] — zero first derivative at both ends. */
export const smooth = (t: number): number => t * t * (3 - 2 * t)

/** Smootherstep easing over [0, 1] — zero first *and* second derivative at both ends. */
export const smoother = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10)

/** Quadratic ease in: slow at the start, fastest at the end. */
export const quadIn = (t: number): number => t * t

/** Quadratic ease out: fastest at the start, slow at the end. */
export const quadOut = (t: number): number => t * (2 - t) // 1 - (1 - t) ** 2

/**
 * Cubic Hermite spline between two points with their tangents.
 *
 * Tangents are per unit of `t`, so a caller keying over an interval wider than 1 scales them by the
 * width of that interval before passing them in.
 * @param p0 Value at `t = 0`
 * @param m0 Tangent leaving `p0`
 * @param p1 Value at `t = 1`
 * @param m1 Tangent arriving at `p1`
 */
export const hermite = (p0: number, m0: number, p1: number, m1: number, t: number): number => {
  const t1 = 1 - t
  const t2 = t1 * t1
  const tt = t * t

  return p0 * ((1 + 2 * t) * t2) + m0 * (t * t2) + p1 * (tt * (3 - 2 * t)) + m1 * (tt * (t - 1))
}

/** Linearly rescales a number from one range to another. Neither input nor output is clamped. */
export const remap = (a: number, aMin: number, aMax: number, bMin: number, bMax: number) =>
  bMin + ((a - aMin) / (aMax - aMin)) * (bMax - bMin)

/**
 * Rescales a linear number onto a logarithmic range — a slider position onto a multiplier, where
 * the midpoint should mean 1× and the ends should be reciprocal. Inverse of {@link remapExp}.
 */
export const remapLog = (a: number, aMin = 0, aMax = 1, bMin = 0.5, bMax = 2) =>
  Math.exp(remap(a, aMin, aMax, Math.log(bMin), Math.log(bMax)))

/** Rescales a logarithmic number back onto a linear range. Inverse of {@link remapLog}. */
export const remapExp = (a: number, aMin = 0.5, aMax = 2, bMin = 0, bMax = 1): number =>
  remap(Math.log(a), Math.log(aMin), Math.log(aMax), bMin, bMax)
