import { clamp } from './scalar.js'

export interface Keyframe {
  key: number
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

export function at<T extends Keyframe>(keyframes: Iterable<T>, key: number): AnimationRange<T> {
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
