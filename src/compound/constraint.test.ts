import { deepStrictEqual, notDeepStrictEqual, strictEqual, throws } from 'node:assert/strict'
import { describe, it } from 'node:test'
import File from '../utf/file.js'
import Matrix3 from '../math/matrix3.js'
import Vector3 from '../math/vector3.js'
import BufferView from '../utility/bufferview.js'
import { readConstraints, writeConstraints, type Constraint } from './constraint.js'
import type { Joint } from './joint.js'

/** Byte length of the two name fields that open every constraint record. */
const NAMES = 0x80

/** Record size of each constraint file, names included. */
const sizes = { fix: 176, rev: 208, pris: 208, cyl: 216, sphere: 212, loose: 176 }

const position = { x: 1, y: 2, z: 3 }

const offset = { x: -1, y: -2, z: -3 }

const rotation = Matrix3.copy({ x: { x: 0, y: 1, z: 0 }, y: { x: -1, y: 0, z: 0 } })

const axis = { x: 0, y: 0, z: 1 }

const joints: Record<keyof typeof sizes, Joint> = {
  fix: { type: 'fixed', position, rotation },
  rev: { type: 'revolute', position, offset, rotation, axis, min: -0.5, max: 0.75 },
  pris: { type: 'prismatic', position, offset, rotation, axis, min: -0.5, max: 0.75 },
  cyl: {
    type: 'cylinder',
    position,
    offset,
    rotation,
    axis,
    minPris: -2,
    maxPris: 3,
    minRev: -0.25,
    maxRev: 1.5,
  },
  sphere: {
    type: 'sphere',
    position,
    offset,
    rotation,
    minX: -1,
    maxX: 1,
    minY: -2,
    maxY: 2,
    minZ: -3,
    maxZ: 3,
  },
  loose: { type: 'loose', position, rotation },
}

const constraint = (
  name: keyof typeof sizes,
  parent = 'Root',
  child = 'wing_lod1',
): Constraint => ({
  parent,
  child,
  joint: joints[name]!,
})

/** Serializes constraints the way `writeModel` does — one file per name, records appended. */
function pack(...constraints: Constraint[]): File[] {
  const files = new Map<string, File>()

  for (const file of writeConstraints(constraints)) {
    const existing = files.get(file.name.toLowerCase())
    existing ? existing.append(file.data) : files.set(file.name.toLowerCase(), file)
  }

  return [...files.values()]
}

describe('constraint', () => {
  it('gives every joint type the record size its file uses', () => {
    for (const [name, size] of Object.entries(sizes)) {
      const [file] = pack(constraint(name as keyof typeof sizes))

      strictEqual(file?.byteLength, size, name)
    }
  })

  it('round-trips each joint type', () => {
    for (const name of Object.keys(sizes) as (keyof typeof sizes)[]) {
      const value = constraint(name)

      deepStrictEqual([...readConstraints(pack(value))], [value], name)
    }
  })

  // The two names are fixed 0x40-byte fields, not a NUL-separated pair — reading them as the
  // latter yields the child twice and leaves the cursor short of the joint payload.
  it('reads the parent and the child from separate fixed-size fields', () => {
    const value = constraint('fix', 'Root', 'baydoor02_lod1')
    const [file] = pack(value)
    const view = BufferView.from(file!)

    strictEqual(view.getString(0, 4), 'Root')
    strictEqual(view.getString(0x40, 14), 'baydoor02_lod1')

    const [back] = [...readConstraints([file!])]
    strictEqual(back?.parent, 'Root')
    strictEqual(back?.child, 'baydoor02_lod1')
  })

  // Retail exporters leave heap residue in the field after the terminator; the reader stops at
  // the NUL, so those records still decode, and the writer zero-fills what it emits.
  it('stops a name at its terminator, ignoring whatever follows it in the field', () => {
    const [file] = pack(constraint('fix'))
    const view = BufferView.from(file!)

    view.offset = 'Root'.length + 1
    view.writeString('junk')

    deepStrictEqual([...readConstraints([file!])], [constraint('fix')])
  })

  it('zero-fills the unused tail of a name field', () => {
    const [file] = pack(constraint('fix'))
    const bytes = new Uint8Array(file!.buffer, file!.byteOffset, NAMES)

    strictEqual(
      bytes.subarray('Root'.length, 0x40).every((byte) => byte === 0),
      true,
    )
  })

  it('reads several records out of one file, in order', () => {
    const values = [
      constraint('rev', 'Root', 'first'),
      constraint('rev', 'Root', 'second'),
      constraint('rev', 'first', 'third'),
    ]

    const [file] = pack(...values)
    strictEqual(file?.byteLength, sizes.rev * 3)

    deepStrictEqual([...readConstraints([file])], values)
  })

  it('keeps each joint type in its own file', () => {
    const files = pack(constraint('fix'), constraint('rev', 'Root', 'other'), constraint('fix'))

    deepStrictEqual(
      files.map(({ name, byteLength }) => [name.toLowerCase(), byteLength]),
      [
        ['fix', sizes.fix * 2],
        ['rev', sizes.rev],
      ],
    )
  })

  it('distinguishes the two limit pairs of a revolute joint', () => {
    const value = constraint('rev')
    const [back] = [...readConstraints(pack(value))]

    notDeepStrictEqual(back?.joint, joints.pris)
    strictEqual(back?.joint.type, 'revolute')
  })

  // 216 bytes: a Rev record with a second limit pair appended. The layout is CFW's `struct Cyl`
  // (Libs/Include/PERSISTCOMPOUND.H); no retail model ships one, so nothing here is corpus-backed.
  describe('cylinder joints, which no retail model uses', () => {
    it('stores travel limits before rotation limits, as the struct orders them', () => {
      const [file] = pack(constraint('cyl'))
      const view = BufferView.from(file!)

      view.offset = NAMES + 12 + 12 + 36 + 12

      deepStrictEqual(
        [view.readFloat32(), view.readFloat32(), view.readFloat32(), view.readFloat32()],
        [-2, 3, -0.25, 1.5],
      )
    })

    it('carries the child point a Rev record has and the old shape lacked', () => {
      const [file] = pack(constraint('cyl'))
      const view = BufferView.from(file!)

      view.offset = NAMES + 12
      deepStrictEqual(Vector3.read(view), offset)
    })

    it('reads back alongside the other joint types in one model', () => {
      const values = (Object.keys(sizes) as (keyof typeof sizes)[]).map((name) =>
        constraint(name, 'Root', `child_${name}`),
      )

      deepStrictEqual([...readConstraints(pack(...values))], values)
    })
  })

  it('refuses a constraint file it does not recognise', () => {
    const [file] = pack(constraint('fix'))

    throws(() => [...readConstraints([new File('Helical', file!.data)])], RangeError)
  })
})
