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
  readChannel,
  readQuaternion,
  readVectorQuaternion,
  sampleChannel,
  validateChannelType,
  writeAngleQuaternion,
  writeChannel,
  writeQuaternion,
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

  it('rejects event keyframes and bits outside the byte', () => {
    throws(() => validateChannelType(ChannelType.Event), RangeError)
    throws(() => validateChannelType(0x100), RangeError)
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
      ok(Vector4.equal(Vector4.multipyScalar(quat, -1), result, 1e-4), JSON.stringify(result))
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

    deepStrictEqual(
      channel.keyframes.map(({ key, value }) => [key, value]),
      [
        [0, 1],
        [0.5, 2],
        [1, 3],
      ],
    )
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

    deepStrictEqual(
      channel.keyframes.map(({ key, value }) => [key, value]),
      [
        [0, 10],
        [2.5, 20],
      ],
    )
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

    deepStrictEqual(channel.keyframes, [
      { key: 0, position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } },
    ])
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

  it('reports a missing channel or header', () => {
    throws(() => readChannel(new Directory('Joint map 0')), /Missing channel/)
    throws(() => readChannel(wrap(new Directory('Channel'))), /Missing channel header/)
  })
})

describe('writeChannel', () => {
  const channel: Channel = {
    interval: -1,
    type: ChannelType.Position | ChannelType.Quaternion,
    keyframes: [
      { key: 0, position: { x: 1, y: 2, z: 3 }, rotation: { ...Quat.identity } },
      { key: 1.5, position: { x: 4, y: 5, z: 6 }, rotation: { x: 0, y: 0, z: 1, w: 0 } },
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
      interval: 1 / 30,
      type: ChannelType.ZeroPosition | ChannelType.IdentityQuaternion,
      keyframes: [{ key: 0 }, { key: 1 / 30 }],
    }

    strictEqual(writeChannel(implied).getFile('Frames')?.byteLength, 0)
  })

  it('rejects channel types the format does not define', () => {
    throws(() => writeChannel({ ...channel, type: ChannelType.Event }), RangeError)
  })

  it('re-reads a byte-identical header', () => {
    const first = writeChannel(channel).getFile('Header')!
    const second = writeChannel(readChannel(wrap(writeChannel(channel)))).getFile('Header')!

    deepStrictEqual(bytes(second), bytes(first))
  })
})

describe('sampleChannel', () => {
  const channel: Channel = {
    interval: 1,
    type: ChannelType.Position,
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
      interval: 2,
      type: ChannelType.Angle,
      keyframes: [
        { key: 0, value: 0 },
        { key: 2, value: Math.PI },
      ],
    }

    strictEqual(sampleChannel(angles, 1).value, Math.PI / 2)
  })
})
