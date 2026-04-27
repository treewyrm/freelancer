import { clamp } from './scalar.js'

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
