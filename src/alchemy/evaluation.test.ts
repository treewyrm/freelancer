import { deepStrictEqual, notStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { quadIn, quadOut, smooth } from '#/math/scalar.js'
import {
  EaseType,
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

  // alchemy.dll 0x6242a20: QuadIn toward the larger end, QuadOut toward the smaller.
  it('picks the direction of Auto from which end is larger', () => {
    strictEqual(ease(EaseType.Auto, 0, 10, 0.25), 10 * quadIn(0.25), 'rising eases in')
    strictEqual(ease(EaseType.Auto, 10, 0, 0.25), 10 - 10 * quadOut(0.25), 'falling eases out')
  })

  // 0x6242a70, the seventh entry of the table, and what both FLDustAppearance alpha fades carry.
  it('mirrors Auto for AutoInverse', () => {
    strictEqual(ease(EaseType.AutoInverse, 0, 10, 0.25), 10 * quadOut(0.25), 'rising eases out')
    strictEqual(ease(EaseType.AutoInverse, 10, 0, 0.25), 10 - 10 * quadIn(0.25), 'falling eases in')
  })

  it('short-circuits when both ends are equal', () => {
    strictEqual(ease(EaseType.Smooth, 3, 3, 0.5), 3)
  })

  // Past the table the DLL reads whatever follows it. Retail's only such bytes — all in
  // gf_bolt01.ale — sit on single-keyframe lists, which never call an easing.
  it('falls back to linear past the end of the table', () => {
    for (const type of [7, 8, 120, 136, 248]) strictEqual(ease(type, 0, 10, 0.5), 5)
  })

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

  it('holds the ends when a side has no mode', () => {
    strictEqual(limit(WrapFlags.None, 0, 2, 5).key, 2)
    strictEqual(limit(WrapFlags.None, 0, 2, -5).key, 0)
  })

  it('cycles', () => {
    strictEqual(limit(WrapFlags.AfterCycle, 0, 1, 2.25).key, 0.25)
    strictEqual(limit(WrapFlags.BeforeCycle, 0, 1, -0.25).key, 0.75)

    // `fmod` of a whole number of ranges is zero, so a cycle lands back on its first keyframe
    // after the range and on its last before it (0x6246c36, 0x6246b07).
    strictEqual(limit(WrapFlags.AfterCycle, 0, 1, 2).key, 0)
    strictEqual(limit(WrapFlags.BeforeCycle, 0, 1, -1).key, 1)
  })

  it('oscillates back into the range', () => {
    strictEqual(limit(WrapFlags.AfterOscillate, 0, 1, 1.25).key, 0.75)
    strictEqual(limit(WrapFlags.AfterOscillate, 0, 1, 2.25).key, 0.25)
    strictEqual(limit(WrapFlags.BeforeOscillate, 0, 1, -0.25).key, 0.25)
    strictEqual(limit(WrapFlags.BeforeOscillate, 0, 1, -1.25).key, 0.75)
  })

  it('cycles and counts whole ranges for cycle with offset, in both directions', () => {
    deepStrictEqual(limit(WrapFlags.AfterCycleOffset, 0, 1, 2.5), { key: 0.5, count: 2 })
    deepStrictEqual(limit(WrapFlags.BeforeCycleOffset, 0, 1, -1.5), { key: 0.5, count: -2 })
  })

  // Each side is a four-bit mode, not a set of flags: 0x30 is oscillate, not cycle plus
  // something, and a before mode says nothing about the far end.
  it('reads each nibble as one mode', () => {
    strictEqual(limit(0x30, 0, 1, 1.25).key, 0.75)
    strictEqual(limit(WrapFlags.BeforeOscillate, 0, 1, 1.25).key, 1)
  })

  it('maps the key through the range, not through zero to one', () => {
    strictEqual(limit(WrapFlags.AfterCycle, 10, 20, 25).key, 15)
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

  // 0x6242b2f: at or past the last key the list returns that key's value, not the easing's end —
  // which only Step can tell apart.
  it('returns the last value on the last key, even stepped', () => {
    const stepped = {
      key: 0,
      easing: EaseType.Step,
      keyframes: [
        { key: 0, value: 1 },
        { key: 1, value: 2 },
      ],
    }

    strictEqual(floatWhen(stepped, 0.5), 1)
    strictEqual(floatWhen(stepped, 1), 2)
  })

  // 0x6206f90 carries its own easings, with the two Auto types swapped relative to the table.
  it('swaps Auto and AutoInverse at the sparam level', () => {
    const constant = (key: number, value: number) => ({
      key,
      easing: EaseType.Linear,
      keyframes: [{ key: 0, value }],
    })

    strictEqual(
      floatAt({ easing: EaseType.Auto, keyframes: [constant(0, 0), constant(1, 10)] }, 0.25, 0),
      10 * quadOut(0.25),
    )
  })

  // FxRampColor packs each key to 0x00RRGGBB and moves each channel by (b − a) × w >> 8, with
  // w = _ftol(t × 255) — so the midpoint of black to white is 127/255, not a half.
  it('eases colours in bytes', () => {
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

    const byte = (n: number) => Math.fround(n * Math.fround(1 / 255))

    deepStrictEqual(vectorWhen(color.keyframes[0]!, 0.5), { x: byte(126), y: byte(63), z: 0 })
    deepStrictEqual(colorAt(color, 0, 1), { x: 1, y: byte(127), z: 0 }, 'a half is 127 stored')
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
  // files carry a tangent across one. The DLL multiplies both tangents by the interval (0x62469bf).
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

  it('ignores tangents where the interval has no width', () => {
    strictEqual(hermiteAt(loop([knot(0, 3, 99, 99)]), 0.5), 3)
  })

  // 0x6246c8f takes the last keyframe at or before the key, so on a shared key the last one wins.
  it('reads knots sharing one key as the last of them on the key and after it', () => {
    const shared = loop([knot(2, 3), knot(2, 5)])

    strictEqual(hermiteAt(shared, 2), 5)
    strictEqual(hermiteAt(shared, 99), 5)
    strictEqual(hermiteAt(shared, -99), 3)
  })

  it('reaches the last knot at the end of the range', () => {
    strictEqual(hermiteAt(loop([knot(0, 0), knot(1, 10)]), 1), 10)
  })

  it('holds the ends of a curve with no modes', () => {
    const curve = loop([knot(0, 0), knot(1, 10)])

    strictEqual(hermiteAt(curve, 5), 10)
    strictEqual(hermiteAt(curve, -5), 0)
  })

  it('extrapolates along the end tangents for linear', () => {
    const curve = loop(
      [knot(0, 0, 0, 2), knot(1, 10, 3, 0)],
      WrapFlags.BeforeLinear | WrapFlags.AfterLinear,
    )

    strictEqual(hermiteAt(curve, -2), -4, 'in-tangent of the first knot')
    strictEqual(hermiteAt(curve, 3), 16, 'out-tangent of the last knot')
  })

  it('accumulates whole ranges for cycle with offset', () => {
    const curve = loop([knot(0, 0), knot(1, 10)], WrapFlags.AfterCycleOffset)

    strictEqual(hermiteAt(curve, 1.5), 15, 'one range of 10 plus half of the next')
    strictEqual(hermiteAt(curve, 2.5), 25)
  })

  // Retail: 0x20 on three live Transform curves, 0x30 on three, 0x33 on two. Read as the bits
  // they were once taken for, 0x20 mirrored and 0x30 repeated.
  it('reads the retail words other than 0x10 as the modes they are', () => {
    const curve = (flags: WrapFlags) => loop([knot(0, 0), knot(1, 10)], flags)

    strictEqual(
      hermiteAt(curve(WrapFlags.AfterCycleOffset), 1.25),
      10 + 10 * smooth(0.25),
      'cycle with offset',
    )
    strictEqual(
      hermiteAt(curve(WrapFlags.AfterOscillate), 1.25),
      hermiteAt(curve(WrapFlags.AfterOscillate), 0.75),
      'oscillate',
    )
    strictEqual(
      hermiteAt(curve(WrapFlags.BeforeOscillate | WrapFlags.AfterOscillate), -0.25),
      hermiteAt(curve(WrapFlags.BeforeOscillate | WrapFlags.AfterOscillate), 0.25),
      'oscillate before',
    )
  })

  // Most retail curves are a single knot. The cycling modes need a range, so the knot holds
  // whatever they say; linear alone extends it (0x6246a11).
  it('reads a single knot as a constant unless a side is linear', () => {
    for (const key of [-99, 0, 0.5, 99]) strictEqual(hermiteAt(loop([knot(0, 3)]), key), 3)

    for (const flags of [
      WrapFlags.AfterCycle,
      WrapFlags.AfterCycleOffset,
      WrapFlags.AfterOscillate,
    ])
      strictEqual(hermiteAt(loop([knot(0, 3)], flags), 99), 3)

    strictEqual(hermiteAt(loop([knot(0, 3, 1)], WrapFlags.AfterLinear), 2), 5)
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
        order: [4, 3, 5],
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
  })

  // A transform with the curve byte clear carries no points, and every node has one, so the
  // identity has to come from here rather than from the file.
  it('returns the identity for a transform carrying no points', () => {
    const result = transformAt({ order: [4, 3, 5] }, 0, 0)

    deepStrictEqual(result.position, { x: 0, y: 0, z: 0 })
    deepStrictEqual(result.rotation, { x: 0, y: 0, z: 0 })
    deepStrictEqual(result.scale, { x: 1, y: 1, z: 1 })
  })
})
