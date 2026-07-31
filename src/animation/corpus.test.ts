import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { load, skip } from '../corpus.js'
import type Directory from '../directory.js'
import type File from '../file.js'
import BufferView from '../utility/bufferview.js'
import Vector4 from '../math/vector4.js'
import {
  ChannelType,
  keyframeByteLength,
  readAngleQuaternion,
  readChannel,
  writeChannel,
  type Channel,
} from './channel.js'
import { readAnimationLibrary, writeAnimationLibrary } from './library.js'
import { getScriptDuration } from './script.js'

/** Rigid models embed their animation, deformable models keep it in a standalone `.anm`. */
const extensions = ['cmp', 'anm']

const assets = () => load(...extensions).filter(({ root }) => root.getDirectory('Animation'))

const bytes = (file: File) => new Uint8Array(file.buffer, file.byteOffset, file.byteLength)

/** Every map directory in the corpus, paired with the asset path it came from. */
function* maps(): Generator<{ path: string; name: string; directory: Directory }> {
  for (const { path, root } of assets())
    for (const script of root.getDirectory('Animation', 'Script')?.directories ?? [])
      for (const directory of script.directories)
        yield { path, name: `${script.name}/${directory.name}`, directory }
}

/**
 * Byte offset of the rotation field within a keyframe. The time marker, joint value and position
 * all precede it.
 */
const rotationOffset = (type: ChannelType, interval: number) =>
  (interval < 0 ? 4 : 0) +
  (type & ChannelType.Angle ? 4 : 0) +
  (type & ChannelType.Position ? 12 : 0)

/**
 * Counts keyframes whose stored angle-scaled axis is longer than one unit.
 *
 * The encoding maps length onto a rotation of 0 to PI, so anything past one unit is outside the
 * range it can represent and cannot survive a re-encode intact.
 */
function countOutOfRange({ type, interval, keyframes }: Channel, frames: File): number {
  if (!(type & ChannelType.AngleQuaternion)) return 0

  const stride = keyframeByteLength(type, interval)
  const view = BufferView.from(frames)
  let count = 0

  for (let i = 0; i < keyframes.length; i++) {
    view.offset = i * stride + rotationOffset(type, interval)

    const x = view.readInt16()
    const y = view.readInt16()
    const z = view.readInt16()

    if (Math.sqrt(x * x + y * y + z * z) > 0x7fff) count++
  }

  return count
}

describe('retail asset corpus', { skip }, () => {
  it('finds animated assets to read', () => {
    ok(
      assets().length > 150,
      `expected the full DATA tree, found ${assets().length} animated files`,
    )
  })

  it('reads every script in every library', () => {
    let scripts = 0
    let channels = 0

    for (const { path, root } of assets())
      for (const script of readAnimationLibrary(root)) {
        ok(script.name.length > 0, `${path}: unnamed script`)
        ok(script.maps.length > 0, `${path}/${script.name}: no maps`)
        ok(getScriptDuration(script) >= 0, `${path}/${script.name}: negative duration`)

        for (const map of script.maps) {
          ok(map.parent.length > 0, `${path}/${script.name}: unnamed parent`)
          if (map.type === 'joint')
            ok(map.child.length > 0, `${path}/${script.name}: unnamed child`)

          channels++
        }

        scripts++
      }

    ok(scripts > 3000, `expected the full script corpus, read ${scripts}`)
    ok(channels > 140000, `expected the full channel corpus, read ${channels}`)
  })

  it('uses only the channel types the format defines', () => {
    const types = new Set<number>()

    for (const { name, path, directory } of maps()) {
      const { type } = readChannel(directory)

      ok(type > 0, `${path}/${name}: empty channel type`)
      types.add(type)
    }

    deepStrictEqual(
      [...types].sort((a, b) => a - b),
      [0x01, 0x04, 0x06, 0x22, 0x40, 0x42, 0x50, 0x80, 0x82, 0x90],
    )
  })

  it('consumes each Frames file exactly, leaving no trailing bytes', () => {
    for (const { path, name, directory } of maps()) {
      const channel = readChannel(directory)
      const frames = directory.getFile('Channel', 'Frames')

      strictEqual(
        frames?.byteLength,
        keyframeByteLength(channel.type, channel.interval) * channel.keyframes.length,
        `${path}/${name}`,
      )
    }
  })

  it('keeps keyframes in ascending time order', () => {
    for (const { path, name, directory } of maps()) {
      let previous = -Infinity

      for (const { key } of readChannel(directory).keyframes) {
        ok(key >= previous, `${path}/${name}: keyframe at ${key} follows ${previous}`)
        previous = key
      }
    }
  })

  it('re-serialises every channel header byte for byte', () => {
    for (const { path, name, directory } of maps())
      deepStrictEqual(
        bytes(writeChannel(readChannel(directory)).getFile('Header')!),
        bytes(directory.getFile('Channel', 'Header')!),
        `${path}/${name}`,
      )
  })

  it('re-serialises every channel frame byte for byte, bar rotations it cannot represent', () => {
    let inexact = 0

    for (const { path, name, directory } of maps()) {
      const channel = readChannel(directory)
      const original = directory.getFile('Channel', 'Frames')!
      const result = writeChannel(channel).getFile('Frames')!

      const a = bytes(original)
      const b = bytes(result)

      strictEqual(b.byteLength, a.byteLength, `${path}/${name}`)
      if (a.every((value, i) => value === b[i])) continue

      // The only frames allowed to differ are those the angle-scaled axis cannot round-trip.
      const out = countOutOfRange(channel, original)
      ok(out > 0, `${path}/${name}: frames changed with nothing out of range`)
      inexact++

      // Whatever changed must still decode to the same rotation.
      const stride = keyframeByteLength(channel.type, channel.interval)
      const offset = rotationOffset(channel.type, channel.interval)

      for (let i = 0; i < channel.keyframes.length; i++) {
        const before = readAngleQuaternion(BufferView.from(original).subarray(i * stride + offset))
        const after = readAngleQuaternion(BufferView.from(result).subarray(i * stride + offset))

        ok(Vector4.equal(before, after, 1e-4), `${path}/${name}: keyframe ${i} rotation drifted`)
      }
    }

    ok(inexact < 50, `${inexact} channels failed to round-trip exactly`)
  })

  it('rebuilds the Animation directory of every animated asset', () => {
    for (const { path, root } of assets()) {
      const original = root.getDirectory('Animation', 'Script')!
      const written = writeAnimationLibrary(readAnimationLibrary(root)).getDirectory('Script')!

      deepStrictEqual(
        written.directories.map(({ name }) => name),
        original.directories.map(({ name }) => name),
        `${path}: script list changed`,
      )

      for (const script of original.directories)
        strictEqual(
          written.getDirectory(script.name)?.directories.length,
          script.directories.filter(({ name }) => /^(object|joint) map/i.test(name)).length,
          `${path}/${script.name}: map count changed`,
        )
    }
  })
})
