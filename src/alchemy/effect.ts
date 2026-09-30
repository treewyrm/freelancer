import type Vector3 from '#/math/vector3.js'
import BufferView from '#/utility/bufferview.js'
import { assemble, flatten } from '#/utility/hierarchy.js'
import { readArray, readString, writeArray, writeString } from './misc.js'

/** Effect node instance raw entry. */
export interface Entry {
  flags: number
  crc: number
  parentId: number
  childId: number
}

/** Reads node instance raw entry. */
export function readEntry(view: BufferView) {
  return {
    flags: view.readInt32(),
    crc: view.readInt32(),
    parentId: view.readInt32(),
    childId: view.readInt32(),
  }
}

/** Writes node instance raw entry. */
export function writeEntry({ flags, crc, parentId, childId }: Entry) {
  return BufferView.allocate(Int32Array.BYTES_PER_ELEMENT * 4)
    .writeInt32(flags)
    .writeInt32(crc)
    .writeInt32(parentId)
    .writeInt32(childId)
}

/** Effect node instance pair references. */
export interface Pair {
  sourceId: number
  targetId: number
}

/** Reads a link record: two entry identifiers, source then target. */
export function readPair(view: BufferView): Pair {
  return {
    sourceId: view.readInt32(),
    targetId: view.readInt32(),
  }
}

/** Writes a link record. */
export function writePair({ sourceId, targetId }: Pair): BufferView {
  return BufferView.allocate(Int32Array.BYTES_PER_ELEMENT * 2)
    .writeInt32(sourceId)
    .writeInt32(targetId)
}

/** Parent identifier standing in for the world, i.e. the instance is a root. */
export const WorldId = 0x8000

/**
 * CRC of `"Control Root"`, the name that makes a container the effect's control root: the one node
 * the host's placement matrix reaches. It names no node in the library, is always a root, always
 * carries `flags` 1, and is never either end of a link.
 *
 * The name ships nowhere in retail. The authoring tool hashed it and wrote only the CRC, so the name
 * was recovered by searching likely phrases against `0xee223b51`.
 *
 * **The flag makes a container; this CRC makes it the root.** `alchemy.dll` builds any flagged
 * instance as a bare folder without looking its CRC up, and then keeps the folder whose CRC is this
 * one as the target of every placement. Nodes beside it are not placed.
 *
 * Signed, because instance CRCs are read as `int32` and would never compare equal otherwise.
 */
export const ControlRootId = 0xee223b51 | 0

/**
 * One use of a library node within an effect: which node, how it is placed in the instance tree,
 * and what it links to.
 *
 * The node itself is referenced by CRC and never resolved here. `children` and `targets` are
 * different relations — a child is contained, a target is merely pointed at — and the file records
 * them in two separate lists.
 */
export interface NodeInstance {
  /** Node name CRC (case-sensitive), or {@link ControlRootId} on the control root. */
  crc: number

  /** Non-zero for a container that references no node. */
  flags: number

  /** Sorting order. */
  sort: number

  /**
   * Entry identifier linking this instance to its parent and to pair targets.
   *
   * Retail hands out sparse, unordered handles left over from the authoring tool, so it
   * cannot be derived from the tree. Preserved on read and reused on write; instances
   * without one are numbered around those that have one.
   */
  id?: number

  /** Attached node instances. */
  children: NodeInstance[]

  /** Linked targets. */
  targets: NodeInstance[]
}

/**
 * One named effect: a tree of node instances, hanging off the roots in `children`.
 *
 * `center` and `radius` are the version 1.1 bounding sphere: stored by the authoring tool, never read
 * by the game, and all zero on most effects. See docs/modules/ALCHEMY.md#effect-library-versions.
 */
export interface Effect {
  name: string
  /** Bounding sphere centre, in the effect's space. Version 1.1 only. */
  center?: Vector3
  /** Bounding sphere radius; zero where the effect does not state one. Version 1.1 only. */
  radius?: number
  children: NodeInstance[]
}

/**
 * Reads one effect: its name, its instance entries and the links between them.
 *
 * The file is flat. Hierarchy comes out of each entry's `parentId` — a value at or above
 * {@link WorldId} makes the instance a root — and the links are a separate list resolved against
 * the same identifiers, so an instance can be some other instance's target without being its child.
 *
 * A target naming an identifier no entry hands out is dropped rather than throwing, since a link is
 * a reference and the format gives no way to tell a stale one from a damaged file.
 * @param version Library version; only past 1 does an effect carry its bounding sphere.
 */
export function readEffect(view: BufferView, version = 1): Effect {
  const name = readString(view)
  const center = { x: 0, y: 0, z: 0 }
  let radius = 0

  if (version > 1) {
    center.x = view.readFloat32()
    center.y = view.readFloat32()
    center.z = view.readFloat32()
    radius = view.readFloat32()
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
        id: childId,
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

  return { name, center, radius, children }
}

/**
 * Writes one effect, flattening the instance tree back into entries and links.
 *
 * Identifiers are not derived from the tree: an instance keeps whatever `id` it was read with, and
 * the rest are numbered into the gaps left over — retail's handles are sparse and unordered, and
 * renumbering them would still load but would no longer round-trip. Entries go out in each
 * instance's recorded `sort` order, which is the order the file had them in.
 * @param version Library version; only past 1 is the bounding sphere written.
 */
export const writeEffect = (effect: Effect, version = 1): BufferView => {
  const pairs: Pair[] = []

  // Flattens hierarchy of node instances into entry list.
  const steps = [...flatten(effect.children, ({ children }) => children, 1)]

  // Instances keep whatever identifier they were read with; the rest fill the gaps left over.
  const identifiers = new Map<NodeInstance, number>()
  const taken = new Set<number>()

  for (const { child } of steps)
    if (child.id !== undefined && !taken.has(child.id)) {
      identifiers.set(child, child.id)
      taken.add(child.id)
    }

  let next = 1

  for (const { child } of steps)
    if (!identifiers.has(child)) {
      while (taken.has(next)) next++
      identifiers.set(child, next)
      taken.add(next)
    }

  const entries: (Entry & { sort: number })[] = steps.map(({ child: source, parent }) => {
    const { flags, crc, sort } = source
    const childId = identifiers.get(source)!

    for (const target of source.targets) {
      const targetId = identifiers.get(target)

      if (targetId === undefined) continue

      pairs.push({
        sourceId: childId,
        targetId: targetId,
      })
    }

    return { flags, crc, parentId: parent ? identifiers.get(parent)! : WorldId, childId, sort }
  })

  entries.sort(({ sort: a }, { sort: b }) => a - b)

  const chunks: BufferView[] = []

  if (version > 1) {
    chunks.push(
      BufferView.allocate(Float32Array.BYTES_PER_ELEMENT * 4)
        .writeFloat32(effect.center?.x ?? 0)
        .writeFloat32(effect.center?.y ?? 0)
        .writeFloat32(effect.center?.z ?? 0)
        .writeFloat32(effect.radius ?? 0),
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
export function readEffectLibrary(view: BufferView): EffectLibrary {
  const version = view.readFloat32()
  const effects = readArray(view, (view) => readEffect(view, version), view.readUint32())

  return { version, effects }
}

/** Writes effect library. */
export function writeEffectLibrary({ version, effects }: EffectLibrary): BufferView {
  const view = BufferView.allocate(Float32Array.BYTES_PER_ELEMENT + Uint32Array.BYTES_PER_ELEMENT)
    .writeFloat32(version)
    .writeUint32(effects.length)

  return BufferView.join(
    view,
    writeArray(effects, (effect) => writeEffect(effect, version)),
  )
}
