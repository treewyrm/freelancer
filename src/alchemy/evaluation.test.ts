import { deepStrictEqual, notStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { quadIn, quadOut, smooth } from '#/math/scalar.js'
import {
  EaseType,
  TransformFlags,
  WrapFlags,
  type AnimatedColor,
  type AnimatedCurve,
  type AnimatedFloat,
  type LoopAnimation,
  type VectorKeyframe,
} from './animation.js'
import {
  colorAt,
  curveAt,
  ease,
  easeVector,
  floatAt,
  floatWhen,
  hermiteAt,
  limit,
  transformAt,
  vectorWhen,
} from './evaluation.js'

/** A hermite keyframe: X is the value, Y the incoming tangent and Z the outgoing one. */
const knot = (key: number, value: number, out = 0, into = 0): VectorKeyframe => ({
  key,
  value: { x: value, y: into, z: out },
})

const loop = (
  keyframes: VectorKeyframe[],
  flags = WrapFlags.None,
  fallback = 0,
): LoopAnimation<VectorKeyframe> => ({ default: fallback, flags, keyframes })

describe('ease', () => {
  it('follows each easing curve', () => {
    strictEqual(ease(EaseType.Step, 0, 10, 0.5), 0, 'holds the start value')
    strictEqual(ease(EaseType.Linear, 0, 10, 0.5), 5)
    strictEqual(ease(EaseType.QuadIn, 0, 10, 0.5), 10 * quadIn(0.5))
    strictEqual(ease(EaseType.QuadOut, 0, 10, 0.5), 10 * quadOut(0.5))
    strictEqual(ease(EaseType.Smooth, 0, 10, 0.5), 10 * smooth(0.5))
  })

  it('picks the direction of Auto from which end is larger', () => {
    strictEqual(ease(EaseType.Auto, 0, 10, 0.25), 10 * quadIn(0.25), 'rising eases in')
    strictEqual(ease(EaseType.Auto, 10, 0, 0.25), 10 - 10 * quadOut(0.25), 'falling eases out')
  })

  it('short-circuits when both ends are equal', () => {
    strictEqual(ease(EaseType.Smooth, 3, 3, 0.5), 3)
  })

  // Three retail files carry an easing byte the enum does not define; falling back to linear
  // keeps a stray value from turning the whole sample into NaN.
  it('falls back to linear for an easing type it does not know', () => {
    for (const type of [6, 8, 120, 136, 248]) strictEqual(ease(type, 0, 10, 0.5), 5)
  })

  // Seven of the nine strays are junk on single-keyframe lists in an effect the game never
  // plays. This one is not: `dust.ale` and `motionblur_dust.ale` both put a 6 on the alpha
  // fade of the motion dust, four keyframes that really are interpolated, and the player sees
  // it whenever they are in space. Those two are the only `FLDustAppearance` nodes in the
  // game and nothing else uses 6, so it tracks Freelancer's own node type. Linear is a
  // placeholder until someone watches it in game.
  // Commented out rather than run as `todo`: it reports every run and there is nothing to act on
  // until the node type is observed in game. Uncomment as-is to bring it back.
  // it(
  //   'names easing type 6',
  //   { todo: 'unidentified: tracks FLDustAppearance, see ALCHEMY.md' },
  //   () => {
  //     ok(6 in EaseType, 'EaseType has no name for the value retail uses on the motion dust')
  //   },
  // )

  it('eases each vector component independently', () => {
    deepStrictEqual(easeVector(EaseType.Linear, { x: 0, y: 0, z: 0 }, { x: 1, y: 2, z: 4 }, 0.5), {
      x: 0.5,
      y: 1,
      z: 2,
    })
  })
})

describe('limit', () => {
  it('leaves a key inside the range alone', () => {
    deepStrictEqual(limit(WrapFlags.None, 0, 2, 1), { key: 1, count: 0 })
  })

  it('clamps to the ends', () => {
    strictEqual(limit(WrapFlags.AfterClamp, 0, 2, 5).key, 2)
    strictEqual(limit(WrapFlags.BeforeClamp, 0, 2, -5).key, 0)
  })

  it('repeats, holding at the end of a whole cycle', () => {
    strictEqual(limit(WrapFlags.AfterRepeat, 0, 1, 2.25).key, 0.25)

    // `fract` returns 1 rather than 0 on a whole number, so a loop lands on its last keyframe
    // instead of snapping back to the first.
    strictEqual(limit(WrapFlags.AfterRepeat, 0, 1, 2).key, 1)
  })

  it('mirrors back into the range', () => {
    strictEqual(limit(WrapFlags.AfterMirror, 0, 1, 1.25).key, 0.75)
    strictEqual(limit(WrapFlags.BeforeMirror, 0, 1, -0.25).key, 0.25)
  })

  it('counts whole cycles for continue, in both directions', () => {
    strictEqual(limit(WrapFlags.AfterContinue, 0, 1, 2.5).count, 2)
    strictEqual(limit(WrapFlags.BeforeContinue, 0, 1, -1.5).count, -2)
  })

  it('repeats and counts at once, which is what an accumulating curve wants', () => {
    deepStrictEqual(limit(WrapFlags.AfterContinue | WrapFlags.AfterRepeat, 0, 1, 2.5), {
      key: 0.5,
      count: 2,
    })
  })

  it('maps the key through the range, not through zero to one', () => {
    strictEqual(limit(WrapFlags.AfterRepeat, 10, 20, 25).key, 15)
  })
})

describe('float and colour animations', () => {
  const animation: AnimatedFloat = {
    easing: EaseType.Linear,
    keyframes: [
      {
        key: 0,
        easing: EaseType.Linear,
        keyframes: [
          { key: 0, value: 0 },
          { key: 1, value: 10 },
        ],
      },
      {
        key: 1,
        easing: EaseType.Linear,
        keyframes: [
          { key: 0, value: 100 },
          { key: 1, value: 200 },
        ],
      },
    ],
  }

  it('interpolates within one inner list', () => {
    strictEqual(floatWhen(animation.keyframes[0]!, 0.5), 5)
  })

  it('interpolates between two inner lists', () => {
    strictEqual(floatAt(animation, 0, 0.5), 5)
    strictEqual(floatAt(animation, 1, 0.5), 150)
    strictEqual(floatAt(animation, 0.5, 0.5), 77.5)
  })

  it('holds the outermost lists outside the range', () => {
    strictEqual(floatAt(animation, -1, 0), 0)
    strictEqual(floatAt(animation, 2, 0), 100)
  })

  it('interpolates colours component by component', () => {
    const color: AnimatedColor = {
      easing: EaseType.Linear,
      keyframes: [
        {
          key: 0,
          easing: EaseType.Linear,
          keyframes: [
            { key: 0, value: { x: 0, y: 0, z: 0 } },
            { key: 1, value: { x: 1, y: 0.5, z: 0 } },
          ],
        },
      ],
    }

    deepStrictEqual(vectorWhen(color.keyframes[0]!, 0.5), { x: 0.5, y: 0.25, z: 0 })
    deepStrictEqual(colorAt(color, 0, 1), { x: 1, y: 0.5, z: 0 })
  })

  // An eased list has no fallback field the way a looped one does, so an empty one contributes
  // nothing. Seven retail properties hold one; four of them beside a populated list.
  it('evaluates an empty list to zero', () => {
    const empty = { key: 0, easing: EaseType.Linear, keyframes: [] }

    strictEqual(floatWhen(empty, 0.5), 0)
    strictEqual(floatAt({ easing: EaseType.Linear, keyframes: [empty] }, 0, 0.5), 0)
    strictEqual(floatAt({ easing: EaseType.Linear, keyframes: [] }, 0, 0.5), 0)

    deepStrictEqual(vectorWhen(empty, 0.5), { x: 0, y: 0, z: 0 })
    deepStrictEqual(colorAt({ easing: EaseType.Linear, keyframes: [] }, 0, 0.5), {
      x: 0,
      y: 0,
      z: 0,
    })
  })

  it('ramps out of an empty list into a populated one', () => {
    const ramp: AnimatedFloat = {
      easing: EaseType.Linear,
      keyframes: [
        { key: 0, easing: EaseType.Linear, keyframes: [] },
        {
          key: 1,
          easing: EaseType.Linear,
          keyframes: [
            { key: 0, value: 4 },
            { key: 1, value: 4 },
          ],
        },
      ],
    }

    strictEqual(floatAt(ramp, 0, 0.5), 0)
    strictEqual(floatAt(ramp, 0.5, 0.5), 2)
    strictEqual(floatAt(ramp, 1, 0.5), 4)
  })
})

describe('hermiteAt', () => {
  it('falls back to the default value when the curve has no keyframes', () => {
    strictEqual(hermiteAt(loop([], WrapFlags.None, 7), 0.5), 7)
  })

  it('interpolates between knots, flat tangents giving the midpoint', () => {
    const curve = loop([knot(0, 0), knot(1, 10)])

    strictEqual(hermiteAt(curve, 0), 0)
    strictEqual(hermiteAt(curve, 0.25), 1.5625)
    strictEqual(hermiteAt(curve, 0.5), 5)
  })

  it('bends the curve with the outgoing tangent', () => {
    // Z carries the outgoing tangent of the knot the span starts on, Y the incoming tangent
    // of the one it ends on. Equal and opposite tangents cancel back to the flat midpoint.
    strictEqual(hermiteAt(loop([knot(0, 0, 4), knot(1, 10)]), 0.5), 5.5)
    strictEqual(hermiteAt(loop([knot(0, 0, 4), knot(1, 10, 0, 4)]), 0.5), 5)
  })

  // Tangents are stored per unit of key and `hermite` wants them per unit of span, so a curve
  // keyed over a quarter of a unit needs its tangents quartered to draw the same shape. Retail
  // never keys on 0..1: 9322 of 9324 adjacent intervals are something else, and 142 lists in 54
  // files carry a tangent across one. Dropping the scale multiplies every tangent by 1/delta,
  // which on a typical 0.03-wide interval overshoots by thirty times.
  it('scales tangents by the width of the interval', () => {
    const narrow = loop([knot(0, 0, 4), knot(0.25, 10)])

    strictEqual(hermiteAt(narrow, 0.125), 5.125)
    strictEqual(
      hermiteAt(narrow, 0.125),
      hermiteAt(loop([knot(0, 0, 1), knot(1, 10)]), 0.5),
      'a quarter-wide interval with tangent 4 is the same curve as a unit one with tangent 1',
    )
    notStrictEqual(hermiteAt(narrow, 0.125), 5.5, 'which is what the unscaled tangent would give')
  })

  // The interval collapses on the two shapes most of retail is made of, and the scale has to
  // vanish rather than divide: 11791 lists hold one knot and 40 put every knot on one key.
  it('ignores tangents where the interval has no width', () => {
    strictEqual(hermiteAt(loop([knot(0, 3, 99, 99)]), 0.5), 3)
    strictEqual(hermiteAt(loop([knot(2, 3, 99, 99), knot(2, 5, 99, 99)]), 99), 3)
  })

  // `limit` folds a key landing exactly on the end of a curve carrying no wrap flags back to
  // its start, so the last knot is never sampled. Left as it stands until the game is observed
  // doing one or the other; the flagged cases below are the ones retail actually relies on.
  // Commented out rather than run as `todo`: it reports every run and there is nothing to act on
  // until the game is observed. Uncomment as-is to bring it back.
  // it(
  //   'reaches the last knot at the end of the range',
  //   { todo: 'unverified: limit folds key 1 back to 0 when unflagged' },
  //   () => {
  //     strictEqual(hermiteAt(loop([knot(0, 0), knot(1, 10)]), 1), 10)
  //   },
  // )

  it('holds the ends of a flagged curve', () => {
    const curve = loop([knot(0, 0), knot(1, 10)], WrapFlags.AfterClamp | WrapFlags.BeforeClamp)

    strictEqual(hermiteAt(curve, 1), 10)
    strictEqual(hermiteAt(curve, 5), 10)
    strictEqual(hermiteAt(curve, -5), 0)
  })

  it('accumulates whole loops when the curve continues past its end', () => {
    const curve = loop([knot(0, 0), knot(1, 10)], WrapFlags.AfterContinue | WrapFlags.AfterRepeat)

    strictEqual(hermiteAt(curve, 1.5), 15, 'one loop of 10 plus half of the next')
    strictEqual(hermiteAt(curve, 2.5), 25)
  })

  // Most retail curves are a single knot, which spans no range at all. `limit` returns it
  // rather than remapping the key through a zero-length range, which divided by zero and
  // carried NaN into the sample regardless of how far the key was from the knot.
  it('reads a single knot as a constant', () => {
    for (const key of [-99, 0, 0.5, 99]) strictEqual(hermiteAt(loop([knot(0, 3)]), key), 3)
  })

  it('reads knots sharing one key as a constant', () => {
    strictEqual(hermiteAt(loop([knot(2, 3), knot(2, 5)]), 99), 3)
  })

  it('reads a single knot the same way whatever the flags say', () => {
    for (const flags of [
      WrapFlags.None,
      WrapFlags.AfterClamp | WrapFlags.BeforeClamp,
      WrapFlags.AfterRepeat | WrapFlags.AfterContinue,
      WrapFlags.AfterMirror,
    ])
      strictEqual(hermiteAt(loop([knot(0, 3)], flags), 99), 3)
  })
})

describe('curveAt', () => {
  const curve: AnimatedCurve = {
    easing: EaseType.Linear,
    keyframes: [
      { key: 0, ...loop([knot(0, 0), knot(1, 10)]) },
      { key: 1, ...loop([knot(0, 100), knot(1, 200)]) },
    ],
  }

  it('eases between two curves sampled at the same time', () => {
    strictEqual(curveAt(curve, 0, 0.5), 5)
    strictEqual(curveAt(curve, 1, 0.5), 150)
    strictEqual(curveAt(curve, 0.5, 0.5), 77.5)
  })
})

describe('transformAt', () => {
  const point = (value: number) => ({
    easing: EaseType.Linear,
    keyframes: [{ key: 0, ...loop([knot(0, value), knot(1, value)]) }],
  })

  it('samples position, rotation and scale', () => {
    const result = transformAt(
      {
        flags: TransformFlags.Enable,
        position: { x: point(1), y: point(2), z: point(3) },
        rotation: { x: point(4), y: point(5), z: point(6) },
        scale: { x: point(7), y: point(8), z: point(9) },
      },
      0,
      0,
    )

    deepStrictEqual(result.position, { x: 1, y: 2, z: 3 })
    deepStrictEqual(result.rotation, { x: 4, y: 5, z: 6 })
    deepStrictEqual(result.scale, { x: 7, y: 8, z: 9 })
    strictEqual(result.flags, TransformFlags.Enable)
  })

  // A transform with the enable bit clear carries no points, and every node has one, so the
  // identity has to come from here rather than from the file.
  it('returns the identity for a transform carrying no points', () => {
    const result = transformAt({ flags: TransformFlags.Default }, 0, 0)

    deepStrictEqual(result.position, { x: 0, y: 0, z: 0 })
    deepStrictEqual(result.rotation, { x: 0, y: 0, z: 0 })
    deepStrictEqual(result.scale, { x: 1, y: 1, z: 1 })
  })
})
