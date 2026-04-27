import BufferView from '#/utility/bufferview.js'
import { assemble, flatten } from '#/utility/hierarchy.js'
import { type Read, type Write, readArray, readString, writeArray, writeString } from './misc.js'

/** Effect node instance raw entry. */
export interface Entry {
  flags: number
  crc: number
  parentId: number
  childId: number
}

/** Reads node instance raw entry. */
export const readEntry: Read<Entry> = (view) => ({
  flags: view.readInt32(),
  crc: view.readInt32(),
  parentId: view.readInt32(),
  childId: view.readInt32(),
})

/** Writes node instance raw entry. */
export const writeEntry: Write<Entry> = ({ flags, crc, parentId, childId }) =>
  BufferView.allocate(Int32Array.BYTES_PER_ELEMENT * 4)
    .writeInt32(flags)
    .writeInt32(crc)
    .writeInt32(parentId)
    .writeInt32(childId)

/** Effect node instance pair references. */
export interface Pair {
  sourceId: number
  targetId: number
}

export const readPair: Read<Pair> = (view) => ({
  sourceId: view.readInt32(),
  targetId: view.readInt32(),
})

export const writePair: Write<Pair> = ({ sourceId, targetId }) =>
  BufferView.allocate(Int32Array.BYTES_PER_ELEMENT * 2)
    .writeInt32(sourceId)
    .writeInt32(targetId)

export const WorldId = 0x8000

export const DefaultId = 0xee223b51

export interface NodeInstance {
  /** Node name CRC (case-sensitive). */
  crc: number

  /** Display flags. */
  flags: number

  /** Sorting order. */
  sort: number

  /** Attached node instances. */
  children: NodeInstance[]

  /** Linked targets. */
  targets: NodeInstance[]
}

export interface Effect {
  name: string
  unknown1?: number
  unknown2?: number
  unknown3?: number
  unknown4?: number
  children: NodeInstance[]
}

export const readEffect = (view: BufferView, version = 1): Effect => {
  const name = readString(view)
  let unknown1 = 0
  let unknown2 = 0
  let unknown3 = 0
  let unknown4 = 0

  if (version > 1) {
    unknown1 = view.readFloat32()
    unknown2 = view.readFloat32()
    unknown3 = view.readFloat32()
    unknown4 = view.readFloat32()
  }

  const entries = readArray(view, readEntry, view.readInt32())
  const pairs = readArray(view, readPair, view.readInt32())

  const children = assemble<Entry, NodeInstance>(
    entries,

    // Iterate over instance records to create NodeInstance.
    ({ flags, crc, parentId, childId }, sort) => ({
      child: {
        crc,
        flags,
        sort,
        children: [],
        targets: [],
      },
      childId,
      parentId: parentId < WorldId ? parentId : undefined,
    }),

    // Iterate over child-parent pairs.
    ({ child, parent, childId, array }) => {
      parent?.children.push(child)

      // Pick pairs matching this node instance.
      for (const { targetId } of pairs.filter(({ sourceId }) => sourceId === childId)) {
        const target = array.find(({ childId }) => targetId == childId)?.child
        if (target) child.targets.push(target)
      }
    },
  )

  return { name, unknown1, unknown2, unknown3, unknown4, children }
}

export const writeEffect = (effect: Effect, version = 1): BufferView => {
  const pairs: Pair[] = []

  // Flattens hierarchy of node instances into entry list.
  const entries: (Entry & { sort: number })[] = [
    ...flatten(effect.children, ({ children }) => children, 1),
  ].map((step, _index, array) => {
    const {
      child: source,
      child: { flags, crc, sort },
      childId,
      parentId: parentId = WorldId,
    } = step

    for (const target of source.targets) {
      const targetId = array.find(({ child: value }) => value === target)?.childId

      if (targetId === undefined) continue

      pairs.push({
        sourceId: childId,
        targetId: targetId,
      })
    }

    return { flags, crc, parentId, childId, sort }
  })

  entries.sort(({ sort: a }, { sort: b }) => a - b)

  const chunks: BufferView[] = []

  if (version > 1) {
    chunks.push(
      BufferView.allocate(Float32Array.BYTES_PER_ELEMENT * 4)
        .writeFloat32(effect.unknown1 ?? 0)
        .writeFloat32(effect.unknown2 ?? 0)
        .writeFloat32(effect.unknown3 ?? 0)
        .writeFloat32(effect.unknown4 ?? 0),
    )
  }

  return BufferView.join(
    writeString(effect.name),
    ...chunks,
    BufferView.allocate(Int32Array.BYTES_PER_ELEMENT).writeInt32(entries.length),
    writeArray(entries, writeEntry),
    BufferView.allocate(Int32Array.BYTES_PER_ELEMENT).writeInt32(pairs.length),
    writeArray(pairs, writePair),
  )
}

/** Effect library. */
export interface EffectLibrary {
  version: number
  effects: Effect[]
}

/** Reads effect library. */
export const readEffectLibrary: Read<EffectLibrary> = (view) => {
  const version = view.readFloat32()
  const effects = readArray(view, (view) => readEffect(view, version), view.readUint32())

  return { version, effects }
}

/** Writes effect library. */
export const writeEffectLibrary: Write<EffectLibrary> = ({ version, effects }) =>
  BufferView.join(
    BufferView.allocate(Float32Array.BYTES_PER_ELEMENT + Uint32Array.BYTES_PER_ELEMENT)
      .writeFloat32(version)
      .writeUint32(effects.length),
    writeArray(effects, (effect) => writeEffect(effect, version)),
  )
