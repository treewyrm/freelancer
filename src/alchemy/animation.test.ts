import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import BufferView from '#/utility/bufferview.js'
import {
  DefaultTransformOrder,
  EaseType,
  WrapFlags,
  readAnimatedColor,
  readAnimatedCurve,
  readAnimatedFloat,
  readEaseAnimation,
  readFloatKeyframe,
  readLoopAnimation,
  readTransform,
  readTransformPoint,
  readVectorKeyframe,
  writeAnimatedColor,
  writeAnimatedCurve,
  writeAnimatedFloat,
  writeEaseAnimation,
  writeFloatKeyframe,
  writeLoopAnimation,
  writeTransform,
  writeTransformPoint,
  writeVectorKeyframe,
  type AnimatedColor,
  type AnimatedCurve,
  type AnimatedFloat,
  type TransformOrder,
  type TransformPoint,
} from './animation.js'

const curve = (value: number): AnimatedCurve => ({
  easing: EaseType.Linear,
  keyframes: [
    {
      key: 0,
      default: value,
      flags: WrapFlags.None,
      keyframes: [{ key: 0, value: { x: value, y: 0, z: 0 } }],
    },
  ],
})

const point = (): TransformPoint => ({ x: curve(1), y: curve(2), z: curve(3) })

describe('keyframes', () => {
  it('stores a float keyframe as key and value', () => {
    const keyframe = { key: 0.5, value: 2 }
    const view = writeFloatKeyframe(keyframe)

    strictEqual(view.byteLength, 8)
    deepStrictEqual(readFloatKeyframe(view.rewind()), keyframe)
  })

  it('stores a vector keyframe as key and three components', () => {
    const keyframe = { key: 0.5, value: { x: 1, y: 2, z: 3 } }
    const view = writeVectorKeyframe(keyframe)

    strictEqual(view.byteLength, 16)
    deepStrictEqual(readVectorKeyframe(view.rewind()), keyframe)
  })
})

describe('animation containers', () => {
  // An eased list is two bytes of header, so it cannot hold more than 255 keyframes; a looped
  // list spends six and counts in 16 bits, because it also carries a fallback and wrap flags.
  it('heads an eased list with a byte of easing and a byte of count', () => {
    const animation = {
      easing: EaseType.Smooth,
      keyframes: [
        { key: 0, value: 1 },
        { key: 1, value: 2 },
      ],
    }

    const view = writeEaseAnimation(animation, writeFloatKeyframe)

    strictEqual(view.byteLength, 2 + 8 * 2)
    deepStrictEqual([...new Uint8Array(view.buffer, 0, 2)], [EaseType.Smooth, 2])
    deepStrictEqual(readEaseAnimation(view.rewind(), readFloatKeyframe), animation)
  })

  it('heads a looped list with a default value, wrap flags and count', () => {
    const animation = {
      default: 1.5,
      flags: WrapFlags.BeforeCycle | WrapFlags.AfterCycleOffset,
      keyframes: [{ key: 0, value: { x: 1, y: 2, z: 3 } }],
    }

    const view = writeLoopAnimation(animation, writeVectorKeyframe)

    strictEqual(view.byteLength, 8 + 16)
    deepStrictEqual(readLoopAnimation(view.rewind(), readVectorKeyframe), animation)
  })

  it('keeps an empty list to its header', () => {
    strictEqual(
      writeEaseAnimation({ easing: EaseType.Step, keyframes: [] }, writeFloatKeyframe).byteLength,
      2,
    )

    strictEqual(
      writeLoopAnimation({ default: 0, flags: WrapFlags.None, keyframes: [] }, writeVectorKeyframe)
        .byteLength,
      8,
    )
  })
})

describe('animated properties', () => {
  // All three nest an outer eased list over inner lists, each inner one keyed by a float. The
  // outer key is the particle's age; the inner one is its position along the emitter's life.
  it('nests eased float lists behind a float key', () => {
    const animation: AnimatedFloat = {
      easing: EaseType.Linear,
      keyframes: [
        {
          key: 0,
          easing: EaseType.QuadIn,
          keyframes: [
            { key: 0, value: 10 },
            { key: 1, value: 20 },
          ],
        },
      ],
    }

    const view = writeAnimatedFloat(animation)

    strictEqual(view.byteLength, 2 + (4 + 2 + 8 * 2))
    deepStrictEqual(readAnimatedFloat(view.rewind()), animation)
  })

  it('nests eased vector lists for colours', () => {
    const animation: AnimatedColor = {
      easing: EaseType.Auto,
      keyframes: [
        {
          key: 0.25,
          easing: EaseType.Step,
          keyframes: [{ key: 0, value: { x: 1, y: 0.5, z: 0 } }],
        },
      ],
    }

    const view = writeAnimatedColor(animation)

    strictEqual(view.byteLength, 2 + (4 + 2 + 16))
    deepStrictEqual(readAnimatedColor(view.rewind()), animation)
  })

  it('nests looped vector lists for curves', () => {
    const animation = curve(4)
    const view = writeAnimatedCurve(animation)

    strictEqual(view.byteLength, 2 + (4 + 8 + 16))
    deepStrictEqual(readAnimatedCurve(view.rewind()), animation)
  })

  it('stores a transform point as three curves in X, Y, Z order', () => {
    const value = point()
    const view = writeTransformPoint(value)

    deepStrictEqual(readTransformPoint(view.rewind()), value)
  })
})

describe('transform', () => {
  const order = () => [...DefaultTransformOrder] as TransformOrder

  it('writes the order bytes and a clear curve byte when no points are present', () => {
    const view = writeTransform({ order: order() })

    deepStrictEqual([...view.bytes], [4, 3, 5, 0])
    deepStrictEqual(readTransform(view.rewind()), { order: order() })
  })

  it('round-trips position, rotation and scale behind a curve byte of 0x80', () => {
    const transform = { order: order(), position: point(), rotation: point(), scale: point() }
    const view = writeTransform(transform)

    strictEqual(view.byteLength, 4 + 3 * 3 * (2 + 4 + 8 + 16))
    strictEqual(view.rewind().readInt32(), 0x80050304 | 0)
    deepStrictEqual(readTransform(view.rewind()), transform)
  })

  // alchemy.dll's writer derives the byte from the curves, so a partial set cannot claim a
  // payload it does not carry.
  it('writes no curves unless all three points are present', () => {
    strictEqual(writeTransform({ order: order(), position: point() }).byteLength, 4)
  })

  // The reader tests the sign bit and nothing else (0x62280a0).
  it('reads curves on the sign bit of the fourth byte alone', () => {
    const header = (flag: number) =>
      BufferView.allocate(4).writeInt8(4).writeInt8(3).writeInt8(5).writeUint8(flag)

    deepStrictEqual(readTransform(header(0x7f).rewind()), { order: order() })
  })

  it('reads the order bytes signed', () => {
    const view = BufferView.allocate(4).writeUint8(0xff).writeInt8(0).writeInt8(1).writeUint8(0)

    deepStrictEqual(readTransform(view.rewind()).order, [-1, 0, 1])
  })

  it('leaves the view positioned after the transform', () => {
    const view = BufferView.join(
      writeTransform({ order: order() }),
      writeTransform({ order: [1, 2, 3] }),
    )

    readTransform(view)
    deepStrictEqual(readTransform(view).order, [1, 2, 3])
  })
})
