import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import BufferView from '../utility/bufferview.js'
import {
  DefaultId,
  WorldId,
  readEffect,
  readEffectLibrary,
  readEntry,
  readPair,
  writeEffect,
  writeEffectLibrary,
  writeEntry,
  writePair,
  type Effect,
  type Entry,
  type NodeInstance,
  type Pair,
} from './effect.js'
import { writeArray, writeInteger, writeString } from './misc.js'

const bytes = ({ buffer, byteOffset, byteLength }: ArrayBufferView) =>
  new Uint8Array(buffer, byteOffset, byteLength)

/** Builds the on-disk form of an effect, the way the authoring tool laid it out. */
const buffer = (name: string, entries: Entry[], pairs: Pair[] = [], floats?: number[]) =>
  BufferView.join(
    writeString(name),
    ...(floats?.map(writeFloat32) ?? []),
    writeInteger(entries.length),
    writeArray(entries, writeEntry),
    writeInteger(pairs.length),
    writeArray(pairs, writePair),
  )

const writeFloat32 = (value: number) => BufferView.allocate(4).writeFloat32(value)

const instance = (crc: number, rest: Partial<NodeInstance> = {}): NodeInstance => ({
  crc,
  flags: 0,
  sort: 0,
  children: [],
  targets: [],
  ...rest,
})

/** A container root with two emitters under it, the shape almost every retail effect has. */
const entries: Entry[] = [
  { flags: 1, crc: DefaultId, parentId: WorldId, childId: 7 },
  { flags: 0, crc: 0x11111111, parentId: 7, childId: 3 },
  { flags: 0, crc: 0x22222222, parentId: 7, childId: 9 },
]

describe('constants', () => {
  it('holds DefaultId signed so it compares against a CRC read as int32', () => {
    strictEqual(DefaultId, 0xee223b51 | 0)
    ok(DefaultId < 0)
  })

  it('marks roots with a parent of WorldId', () => {
    strictEqual(WorldId, 0x8000)
  })
})

describe('entries and pairs', () => {
  it('stores an entry as four signed 32-bit fields', () => {
    const entry = { flags: 1, crc: DefaultId, parentId: WorldId, childId: 2 }
    const view = writeEntry(entry)

    strictEqual(view.byteLength, 16)
    deepStrictEqual(readEntry(view.rewind()), entry)
  })

  it('stores a pair as source and target identifiers', () => {
    const pair = { sourceId: 3, targetId: 9 }
    const view = writePair(pair)

    strictEqual(view.byteLength, 8)
    deepStrictEqual(readPair(view.rewind()), pair)
  })
})

describe('readEffect', () => {
  it('rebuilds the hierarchy from parent identifiers', () => {
    const effect = readEffect(buffer('fx_test', entries))

    strictEqual(effect.name, 'fx_test')
    strictEqual(effect.children.length, 1, 'only the container is a root')

    const [container] = effect.children

    strictEqual(container?.crc, DefaultId)
    strictEqual(container.flags, 1)
    deepStrictEqual(
      container.children.map(({ crc }) => crc),
      [0x11111111, 0x22222222],
    )
  })

  it('keeps the entry identifiers and records the on-disk order as sort', () => {
    const [container] = readEffect(buffer('fx_test', entries)).children

    strictEqual(container?.id, 7)
    strictEqual(container.sort, 0)
    deepStrictEqual(
      container.children.map(({ id, sort }) => [id, sort]),
      [
        [3, 1],
        [9, 2],
      ],
    )
  })

  it('resolves pairs into references to the instances themselves', () => {
    const effect = readEffect(buffer('fx_test', entries, [{ sourceId: 3, targetId: 9 }]))
    const [container] = effect.children
    const [source, target] = container!.children

    deepStrictEqual(source?.targets, [target])
    deepStrictEqual(target?.targets, [])
  })

  it('drops a pair whose target is not in the effect', () => {
    const effect = readEffect(buffer('fx_test', entries, [{ sourceId: 3, targetId: 99 }]))

    deepStrictEqual(effect.children[0]?.children[0]?.targets, [])
  })

  it('reads four extra floats per effect at version 1.1 and none at version 1', () => {
    const floats = [1, 2, 3, 4]
    const extended = readEffect(buffer('fx_test', entries, [], floats), Math.fround(1.1))

    deepStrictEqual(
      [extended.unknown1, extended.unknown2, extended.unknown3, extended.unknown4],
      floats,
    )

    const plain = readEffect(buffer('fx_test', entries))

    deepStrictEqual([plain.unknown1, plain.unknown2, plain.unknown3, plain.unknown4], [0, 0, 0, 0])
  })
})

describe('writeEffect', () => {
  it('writes the entries back byte for byte, identifiers and order included', () => {
    const original = buffer('fx_test', entries, [{ sourceId: 3, targetId: 9 }])

    deepStrictEqual(bytes(writeEffect(readEffect(original))), bytes(original))
  })

  // Retail identifiers are sparse and unordered, so they cannot be derived from the tree. Any
  // instance built by hand still needs one, and gets the lowest number nothing else claims.
  it('numbers instances without an identifier around those that have one', () => {
    const child = instance(0x11111111)
    const effect: Effect = {
      name: 'fx_test',
      children: [instance(DefaultId, { id: 2, children: [child] })],
    }

    const written = readEffect(writeEffect(effect))

    deepStrictEqual(
      [...written.children[0]!.children, written.children[0]!].map(({ id }) => id),
      [1, 2],
    )
  })

  it('renumbers a duplicated identifier rather than merging the two instances', () => {
    const effect: Effect = {
      name: 'fx_test',
      children: [
        instance(DefaultId, {
          id: 5,
          children: [instance(0x11111111, { id: 5 }), instance(0x22222222, { id: 5 })],
        }),
      ],
    }

    const [container] = readEffect(writeEffect(effect)).children

    strictEqual(container?.id, 5)
    deepStrictEqual(
      container.children.map(({ id }) => id).sort((a, b) => a! - b!),
      [1, 2],
    )
  })

  it('orders entries by sort, not by traversal', () => {
    const effect: Effect = {
      name: 'fx_test',
      children: [
        instance(DefaultId, {
          id: 1,
          sort: 2,
          children: [instance(0x11111111, { id: 2, sort: 0 })],
        }),
        instance(0x22222222, { id: 3, sort: 1 }),
      ],
    }

    const view = writeEffect(effect)

    view.offset = writeString('fx_test').byteLength + 4
    deepStrictEqual(
      [readEntry(view), readEntry(view), readEntry(view)].map(({ crc }) => crc),
      [0x11111111, 0x22222222, DefaultId],
    )
  })

  it('writes a pair for every link and skips targets outside the effect', () => {
    const target = instance(0x22222222, { id: 9 })
    const orphan = instance(0x33333333, { id: 4 })

    const effect: Effect = {
      name: 'fx_test',
      children: [
        instance(DefaultId, {
          id: 7,
          children: [instance(0x11111111, { id: 3, targets: [target, orphan] }), target],
        }),
      ],
    }

    const view = writeEffect(effect)

    view.offset = writeString('fx_test').byteLength + 4 + 16 * 3

    strictEqual(view.readInt32(), 1, 'the orphan target is not written')
    deepStrictEqual(readPair(view), { sourceId: 3, targetId: 9 })
  })

  it('writes the four extra floats only at version 1.1', () => {
    const effect = readEffect(buffer('fx_test', entries))

    strictEqual(
      writeEffect(effect, Math.fround(1.1)).byteLength - writeEffect(effect, 1).byteLength,
      16,
    )
  })
})

describe('effect library', () => {
  const library = {
    version: Math.fround(1.1),
    effects: [readEffect(buffer('fx_one', entries, [], [0, 0, 0, 1]), Math.fround(1.1))],
  }

  it('heads the library with a float version and an effect count', () => {
    const view = writeEffectLibrary(library)

    strictEqual(view.readFloat32(), Math.fround(1.1))
    strictEqual(view.readUint32(), 1)
  })

  it('passes its version down to every effect', () => {
    deepStrictEqual(readEffectLibrary(writeEffectLibrary(library)), library)

    const plain = { version: 1, effects: library.effects }
    const reread = readEffectLibrary(writeEffectLibrary(plain))

    deepStrictEqual(
      reread.effects.map(({ unknown4 }) => unknown4),
      [0],
      'the extra floats are dropped at version 1',
    )
  })

  it('reaches a fixed point after one write', () => {
    const first = writeEffectLibrary(library)
    const second = writeEffectLibrary(readEffectLibrary(first.rewind()))

    deepStrictEqual(bytes(second), bytes(first))
  })
})
