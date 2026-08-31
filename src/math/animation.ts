import { clamp } from './scalar.js'

/** The one field every keyframe list is sorted and searched by. */
export interface Keyframe {
  key: number
}

/** Animation query result. */
export interface AnimationRange<T> {
  /** Value before. */
  start: T

  /** Value ahead. */
  end: T

  /** Relative position in range [0, 1]. */
  span: number
}

/**
 * Locates the pair of keyframes a key falls between, and where between them it lands.
 *
 * Keyframes are taken in the order given and are assumed ascending, which is what every format here
 * stores. A key outside the list clamps to the first or last keyframe, and zero-length spans are
 * skipped so a repeated key never divides by zero — a single-keyframe list comes back with
 * `start === end`.
 * @throws Error when the list is empty, which no caller can interpolate through.
 */
export function at<T extends Keyframe>(keyframes: Iterable<T>, key: number): AnimationRange<T> {
  let end
  let start
  let span = Infinity

  for (end of keyframes) {
    span = start ? end.key - start.key : Infinity
    if (key <= end.key && span > 0) break

    start = end
    span = Infinity
  }

  if (!end) throw new Error('Missing keyframe data')

  start ??= end
  span = key > end.key ? 1 : clamp((key - start.key) / span, 0, 1)

  return { start, end, span }
}
