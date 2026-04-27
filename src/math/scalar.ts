export const random = (min = -1, max = 1): number => Math.random() * (max - min) + min

export const equal = (a: number, b: number, epsilon = 0.0001): boolean =>
  Math.abs(a - b) <= epsilon * Math.max(1, Math.abs(a), Math.abs(b))

export const clamp = (a: number, min = -Infinity, max = Infinity): number =>
  a < min ? min : a > max ? max : a

export const mod = (a: number, b: number): number => ((a % b) + b) % b

export const fract = (a: number): number => (a > 0 ? 1 + Math.floor(-a) + a : a - Math.floor(a))

export const saw = (v: number, a = 1, p = 1): number => (p !== 0 ? (a * mod(v, p)) / p : 0)

export const square = (v: number, a = 1, p = 1, duty = 0.5): number =>
  p !== 0 ? (mod(v, p) < p * duty ? 0 : a) : 0

export const triangle = (v: number, a = 1, p = 1): number =>
  p !== 0 ? a - Math.abs(a - 2 * saw(v, a, p)) : 0

export const pingPong = (a: number): number => 1 - Math.abs(mod(a, 2) - 1)

export const lerp = (p0: number, p1: number, t: number): number => p0 * (1 - t) + p1 * t

export const smooth = (t: number): number => t * t * (3 - 2 * t)

export const smoother = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10)

export const quadIn = (t: number): number => t * t

export const quadOut = (t: number): number => t * (2 - t) // 1 - (1 - t) ** 2

export const hermite = (p0: number, m0: number, p1: number, m1: number, t: number): number => {
  const t1 = 1 - t
  const t2 = t1 * t1
  const tt = t * t

  return p0 * ((1 + 2 * t) * t2) + m0 * (t * t2) + p1 * (tt * (3 - 2 * t)) + m1 * (tt * (t - 1))
}

export const remap = (a: number, aMin: number, aMax: number, bMin: number, bMax: number) =>
  bMin + ((a - aMin) / (aMax - aMin)) * (bMax - bMin)

export const remapLog = (a: number, aMin = 0, aMax = 1, bMin = 0.5, bMax = 2) =>
  Math.exp(remap(a, aMin, aMax, Math.log(bMin), Math.log(bMax)))

export const remapExp = (a: number, aMin = 0.5, aMax = 2, bMin = 0, bMax = 1): number =>
  remap(Math.log(a), Math.log(aMin), Math.log(aMax), bMin, bMax)
