import { deepStrictEqual, ok, strictEqual, throws } from 'node:assert/strict'
import { describe, it } from 'node:test'
import Directory from '#/utf/directory.js'
import File from '#/utf/file.js'
import BufferView from '#/utility/bufferview.js'
import Quat from '#/math/quat.js'
import Vector4 from '#/math/vector4.js'
import {
  ChannelType,
  keyframeByteLength,
  readAngleQuaternion,
  getChannelTime,
  getChannelType,
  readChannel,
  readQuaternion,
  readShortQuaternion,
  readVectorQuaternion,
  sampleChannel,
  validateChannelType,
  writeAngleQuaternion,
  writeChannel,
  writeQuaternion,
  writeShortQuaternion,
  writeVectorQuaternion,
  type Channel,
} from './channel.js'

const bytes = (view: ArrayBufferView) =>
  new Uint8Array(view.buffer, view.byteOffset, view.byteLength)

/** Wraps a channel directory in the map directory the reader expects. */
const wrap = (directory: Directory) => new Directory('Joint map 0', [directory])

const header = (count: number, interval: number, type: number) =>
  new File(
    'Header',
    BufferView.allocate(12).writeUint32(count).writeFloat32(interval).writeUint32(type),
  )

const roundtrip = (quat: Quat, write: typeof writeQuaternion, read: typeof readQuaternion) => {
  const view = BufferView.allocate(16)
  write(view, quat)
  return read(view.rewind())
}

describe('validateChannelType', () => {
  it('accepts every combination retail assets use', () => {
    for (const type of [0x01, 0x04, 0x06, 0x22, 0x40, 0x42, 0x50, 0x80, 0x82, 0x90])
      strictEqual(validateChannelType(type), type)
  })

  it('rejects angles combined with anything else', () => {
    throws(() => validateChannelType(ChannelType.Angle | ChannelType.Position), RangeError)
  })

  it('rejects more than one position or quaternion type', () => {
    throws(() => validateChannelType(ChannelType.Position | ChannelType.ZeroPosition), RangeError)
    throws(
      () => validateChannelType(ChannelType.Quaternion | ChannelType.VectorQuaternion),
      RangeError,
    )
  })

  it('rejects event keyframes and bits the engine gives no meaning', () => {
    throws(() => validateChannelType(ChannelType.Event), RangeError)
    throws(() => validateChannelType(0x200), RangeError)
  })

  it('accepts the whole-quaternion bit, alone or beside a position', () => {
    strictEqual(validateChannelType(0x100), ChannelType.ShortQuaternion)
    strictEqual(validateChannelType(0x102), 0x102)
    strictEqual(validateChannelType(0x110), 0x110)
    throws(
      () => validateChannelType(ChannelType.ShortQuaternion | ChannelType.AngleQuaternion),
      RangeError,
    )
  })
})

describe('keyframeByteLength', () => {
  it('prefixes a time marker only when the interval is negative', () => {
    strictEqual(keyframeByteLength(ChannelType.Angle, -1), 8)
    strictEqual(keyframeByteLength(ChannelType.Angle, 1 / 30), 4)
  })

  it('sizes each keyframe field', () => {
    strictEqual(keyframeByteLength(ChannelType.Position, 0), 12)
    strictEqual(keyframeByteLength(ChannelType.Quaternion, 0), 16)
    strictEqual(keyframeByteLength(ChannelType.VectorQuaternion, 0), 6)
    strictEqual(keyframeByteLength(ChannelType.AngleQuaternion, 0), 6)
    strictEqual(keyframeByteLength(ChannelType.ShortQuaternion, 0), 8)
  })

  it('stores nothing for implied zero position and identity rotation', () => {
    strictEqual(keyframeByteLength(ChannelType.ZeroPosition, 0), 0)
    strictEqual(keyframeByteLength(ChannelType.IdentityQuaternion, 0), 0)
    strictEqual(keyframeByteLength(ChannelType.ZeroPosition | ChannelType.VectorQuaternion, -1), 10)
  })
})

describe('quaternion storage', () => {
  it('stores full quaternions W first', () => {
    const quat = { x: 0.25, y: 0.5, z: 0.125, w: 0.75 }
    const view = BufferView.allocate(16)

    writeQuaternion(view, quat)
    deepStrictEqual(
      [...new Float32Array(view.buffer)],
      [quat.w, quat.x, quat.y, quat.z],
      'W precedes X, Y and Z',
    )

    deepStrictEqual(readQuaternion(view.rewind()), quat)
  })

  it('restores W from the quaternion vector part', () => {
    const quat = Quat.axisAngle({ axis: { x: 0, y: 1, z: 0 }, angle: Math.PI / 3 })
    const result = roundtrip(quat, writeVectorQuaternion, readVectorQuaternion)

    ok(Vector4.equal(quat, result, 1e-4), `${JSON.stringify(result)}`)
  })

  it('maps the angle-scaled axis over the whole positive hemisphere', () => {
    for (const angle of [0, 0.25, 1, 2, 3, Math.PI]) {
      const quat = Quat.axisAngle({ axis: { x: 0, y: 0, z: 1 }, angle })
      const result = roundtrip(quat, writeAngleQuaternion, readAngleQuaternion)

      ok(Vector4.equal(quat, result, 1e-4), `angle ${angle}: ${JSON.stringify(result)}`)
    }
  })

  it('stores the whole quaternion as four int16, W first, keeping its sign', () => {
    const quat = Quat.axisAngle({ axis: { x: 0, y: 0.6, z: 0.8 }, angle: Math.PI * 1.5 })
    const view = BufferView.allocate(8)

    writeShortQuaternion(view, quat)
    strictEqual(
      new Int16Array(view.buffer)[0],
      Math.round(quat.w * 0x7fff),
      'W precedes X, Y and Z',
    )
    ok(Vector4.equal(quat, readShortQuaternion(view.rewind()), 1e-4))
  })

  it("renormalizes a whole quaternion with the engine's single Newton step", () => {
    // Stored at half length: |q|² = 0.25, so k = (3 - 0.25) / 2 = 1.375 — not the exact 2.
    const view = BufferView.allocate(8)
      .writeInt16(0x7fff / 2)
      .rewind()
    const { w } = readShortQuaternion(view)

    ok(Math.abs(w - 0.5 * 1.375) < 1e-4, `${w}`)
  })

  it('reads identity from a zero angle-scaled axis', () => {
    const view = BufferView.allocate(6)

    deepStrictEqual(readAngleQuaternion(view), { ...Quat.identity })
  })

  it('folds negative-W rotations into the positive hemisphere', () => {
    // Both encodings drop the sign of W, which is harmless: q and -q are the same rotation.
    const quat = Quat.axisAngle({ axis: { x: 1, y: 0, z: 0 }, angle: Math.PI * 1.5 })

    for (const [write, read] of [
      [writeVectorQuaternion, readVectorQuaternion],
      [writeAngleQuaternion, readAngleQuaternion],
    ] as const) {
      const result = roundtrip(quat, write, read)

      ok(result.w >= 0, 'W is non-negative')
      ok(Vector4.equal(Vector4.multiplyScalar(quat, -1), result, 1e-4), JSON.stringify(result))
    }
  })
})

describe('readChannel', () => {
  it('derives keyframe times from the interval when it is not negative', () => {
    const channel = readChannel(
      wrap(
        new Directory('Channel', [
          header(3, 0.5, ChannelType.Angle),
          new File(
            'Frames',
            BufferView.allocate(12).writeFloat32(1).writeFloat32(2).writeFloat32(3),
          ),
        ]),
      ),
    )

    strictEqual(channel.type, 'angle')
    deepStrictEqual(channel, {
      type: 'angle',
      interval: 0.5,
      keyframes: [
        { key: 0, value: 1 },
        { key: 0.5, value: 2 },
        { key: 1, value: 3 },
      ],
    })
  })

  it('reads a time marker per keyframe when the interval is negative', () => {
    const frames = BufferView.allocate(16)
      .writeFloat32(0)
      .writeFloat32(10)
      .writeFloat32(2.5)
      .writeFloat32(20)

    const channel = readChannel(
      wrap(
        new Directory('Channel', [header(2, -1, ChannelType.Angle), new File('Frames', frames)]),
      ),
    )

    deepStrictEqual(channel.keyframes, [
      { key: 0, value: 10 },
      { key: 2.5, value: 20 },
    ])
  })

  it('materialises implied zero position and identity rotation', () => {
    const channel = readChannel(
      wrap(
        new Directory('Channel', [
          header(1, 0, ChannelType.ZeroPosition | ChannelType.IdentityQuaternion),
          new File('Frames'),
        ]),
      ),
    )

    deepStrictEqual(channel, {
      type: 'motion',
      interval: 0,
      position: 'zero',
      orientation: 'identity',
      keyframes: [
        { key: 0, position: { x: 0, y: 0, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } },
      ],
    })
  })

  it('rejects a frame buffer too short for the keyframe count', () => {
    throws(
      () =>
        readChannel(
          wrap(
            new Directory('Channel', [
              header(4, -1, ChannelType.Angle),
              new File('Frames', BufferView.allocate(8)),
            ]),
          ),
        ),
      RangeError,
    )
  })

  it('rejects a frame buffer longer than the keyframe count, as the engine does', () => {
    throws(
      () =>
        readChannel(
          wrap(
            new Directory('Channel', [
              header(1, 1, ChannelType.Angle),
              new File('Frames', BufferView.allocate(8)),
            ]),
          ),
        ),
      RangeError,
    )
  })

  it('rejects a header of any length but twelve bytes', () => {
    const long = new File('Header', BufferView.allocate(16).writeUint32(0).writeFloat32(1))

    throws(() => readChannel(wrap(new Directory('Channel', [long]))), /not 12 bytes/)
  })

  it('reports a missing channel or header', () => {
    throws(() => readChannel(new Directory('Joint map 0')), /Missing channel/)
    throws(() => readChannel(wrap(new Directory('Channel'))), /Missing channel header/)
  })
})

describe('writeChannel', () => {
  const channel: Channel = {
    type: 'motion',
    interval: -1,
    position: 'vector',
    orientation: 'quaternion',
    keyframes: [
      { key: 0, position: { x: 1, y: 2, z: 3 }, orientation: { ...Quat.identity } },
      { key: 1.5, position: { x: 4, y: 5, z: 6 }, orientation: { x: 0, y: 0, z: 1, w: 0 } },
    ],
  }

  it('produces a Channel directory holding Header and Frames', () => {
    const directory = writeChannel(channel)

    strictEqual(directory.name, 'Channel')
    deepStrictEqual(
      directory.children.map(({ name }) => name),
      ['Header', 'Frames'],
    )

    strictEqual(directory.getFile('Header')?.byteLength, 12)
    strictEqual(directory.getFile('Frames')?.byteLength, (4 + 12 + 16) * 2)
  })

  it('round-trips through the reader', () => {
    deepStrictEqual(readChannel(wrap(writeChannel(channel))), channel)
  })

  it('writes nothing for implied zero position and identity rotation', () => {
    const implied: Channel = {
      type: 'motion',
      interval: 1 / 30,
      position: 'zero',
      orientation: 'identity',
      keyframes: [{ key: 0 }, { key: 1 / 30 }],
    }

    strictEqual(writeChannel(implied).getFile('Frames')?.byteLength, 0)
  })

  it('stores the encodings as the type bitfield', () => {
    strictEqual(getChannelType(channel), ChannelType.Position | ChannelType.Quaternion)
    strictEqual(
      getChannelType({ type: 'motion', interval: 1, orientation: 'angle', keyframes: [] }),
      ChannelType.AngleQuaternion,
    )
    strictEqual(getChannelType({ type: 'angle', interval: 1, keyframes: [] }), ChannelType.Angle)
  })

  // A keyframe field the channel has no encoding for would be dropped, and one it does encode
  // but the keyframe lacks would be invented.
  it('refuses keyframes that disagree with the channel encodings', () => {
    throws(
      () =>
        writeChannel({
          type: 'motion',
          interval: 1,
          orientation: 'quaternion',
          keyframes: [{ key: 0, position: { x: 1, y: 0, z: 0 }, orientation: Quat.identity }],
        }),
      /does not store/,
    )

    throws(
      () =>
        writeChannel({ type: 'motion', interval: 1, position: 'vector', keyframes: [{ key: 0 }] }),
      /missing its position/,
    )

    throws(
      () =>
        writeChannel({
          type: 'motion',
          interval: 1,
          orientation: 'vector',
          keyframes: [{ key: 0 }],
        }),
      /missing its orientation/,
    )
  })

  it('re-reads a byte-identical header', () => {
    const first = writeChannel(channel).getFile('Header')!
    const second = writeChannel(readChannel(wrap(writeChannel(channel)))).getFile('Header')!

    deepStrictEqual(bytes(second), bytes(first))
  })
})

describe('sampleChannel', () => {
  const channel: Channel = {
    type: 'motion',
    interval: 1,
    position: 'vector',
    keyframes: [
      { key: 0, position: { x: 0, y: 0, z: 0 } },
      { key: 1, position: { x: 10, y: 0, z: 0 } },
      { key: 2, position: { x: 10, y: 20, z: 0 } },
    ],
  }

  it('interpolates between neighbouring keyframes', () => {
    deepStrictEqual(sampleChannel(channel, 0.25).position, { x: 2.5, y: 0, z: 0 })
    deepStrictEqual(sampleChannel(channel, 1.5).position, { x: 10, y: 10, z: 0 })
  })

  it('holds the first and last keyframe outside the range', () => {
    deepStrictEqual(sampleChannel(channel, -5).position, { x: 0, y: 0, z: 0 })
    deepStrictEqual(sampleChannel(channel, 99).position, { x: 10, y: 20, z: 0 })
  })

  it('interpolates joint values', () => {
    const angles: Channel = {
      type: 'angle',
      interval: 2,
      keyframes: [
        { key: 0, value: 0 },
        { key: 2, value: Math.PI },
      ],
    }

    strictEqual(sampleChannel(angles, 1).value, Math.PI / 2)
  })

  const seam: Channel = {
    type: 'angle',
    interval: 1,
    keyframes: [
      { key: 0, value: 3 },
      { key: 1, value: -3 },
    ],
  }

  it('takes the short way round a revolute seam, and the long way for anything else', () => {
    // 3 → -3 is 6 radians backwards on a line and 2π - 6 forwards on the circle.
    ok(Math.abs(sampleChannel(seam, 0.5, true).value! - Math.PI) < 1e-6)
    strictEqual(sampleChannel(seam, 0.5).value, 0)
  })

  it('wraps a revolute pair once, whatever it stores', () => {
    // A sweep authored past half a turn plays backwards in game.
    const sweep: Channel = {
      type: 'angle',
      interval: 1,
      keyframes: [
        { key: 0, value: 0 },
        { key: 1, value: -Math.PI * 1.25 },
      ],
    }

    ok(Math.abs(sampleChannel(sweep, 1, true).value! - Math.PI * 0.75) < 1e-6)
  })

  it('interpolates rotations as a normalized lerp, not a slerp', () => {
    const a = Quat.identity
    const b = Quat.axisAngle({ axis: { x: 0, y: 0, z: 1 }, angle: Math.PI / 2 })
    const turn: Channel = {
      type: 'motion',
      interval: 1,
      orientation: 'quaternion',
      keyframes: [
        { key: 0, orientation: a },
        { key: 1, orientation: b },
      ],
    }

    const sample = sampleChannel(turn, 0.25).orientation!

    ok(Vector4.equal(sample, Quat.nlerp(a, b, 0.25), 1e-9))
    ok(!Vector4.equal(sample, Quat.slerp(a, b, 0.25), 1e-4), 'the two differ off the midpoint')
  })

  it('takes the near hemisphere between opposite-signed keyframes', () => {
    const b = Vector4.multiplyScalar(Quat.axisAngle({ axis: { x: 1, y: 0, z: 0 }, angle: 0.5 }), -1)
    const turn: Channel = {
      type: 'motion',
      interval: 1,
      orientation: 'quaternion',
      keyframes: [
        { key: 0, orientation: Quat.identity },
        { key: 1, orientation: b },
      ],
    }

    ok(sampleChannel(turn, 0.5).orientation!.w > 0.9)
  })
})

describe('getChannelTime', () => {
  const channel: Channel = {
    type: 'angle',
    interval: 1,
    keyframes: [
      { key: 0, value: 0 },
      { key: 1, value: 1 },
      { key: 2, value: 2 },
    ],
  }

  it('wraps a loop at its own duration, the end reading as the start', () => {
    strictEqual(getChannelTime(channel, 0.5), 0.5)
    strictEqual(getChannelTime(channel, 2), 0)
    strictEqual(getChannelTime(channel, 5.5), 1.5)
    strictEqual(getChannelTime(channel, -0.5), 1.5)
  })

  it('stops a single play on its last keyframe', () => {
    strictEqual(getChannelTime(channel, 7, 'once'), 2)
    strictEqual(getChannelTime(channel, -1, 'once'), 0)
  })

  it('turns a bounce round at either end', () => {
    strictEqual(getChannelTime(channel, 2, 'pingPong'), 2)
    strictEqual(getChannelTime(channel, 2.5, 'pingPong'), 1.5)
    strictEqual(getChannelTime(channel, 4, 'pingPong'), 0)
    strictEqual(getChannelTime(channel, 4.5, 'pingPong'), 0.5)
  })

  it('holds a single keyframe at zero', () => {
    const pose: Channel = { type: 'angle', interval: 0, keyframes: [{ key: 0, value: 1 }] }

    strictEqual(getChannelTime(pose, 3), 0)
  })
})
