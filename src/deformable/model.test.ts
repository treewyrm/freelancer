import { deepStrictEqual, ok, strictEqual, throws } from 'node:assert/strict'
import { describe, it } from 'node:test'
import Directory from '../directory.js'
import Matrix3 from '../math/matrix3.js'
import Vector3 from '../math/vector3.js'
import type { Constraint } from '../compound/constraint.js'
import { listTreeElements } from '../utility/tree.js'
import type { Bone } from './bone.js'
import type { Level } from './level.js'
import {
  getBoneModel,
  readDeformableModel,
  writeDeformableModel,
  type DeformableModel,
} from './model.js'

const bone = (filename: string, name?: string): Bone => ({
  filename,
  name,
  rotation: Matrix3.copy(Matrix3.identity),
  position: Vector3.copy({}),
  levels: 0x3f,
  hardpoints: [],
})

const sphere = (parent: string, child: string): Constraint => ({
  parent,
  child,
  joint: {
    type: 'sphere',
    position: Vector3.copy({}),
    offset: Vector3.copy({}),
    rotation: Matrix3.copy(Matrix3.identity),
    minX: -1,
    maxX: 1,
    minY: -1,
    maxY: 1,
    minZ: -1,
    maxZ: 1,
  },
})

const levels: Level[] = []

const model = (values: Partial<DeformableModel> = {}): DeformableModel => ({
  skeleton: 'AutoHeaderNode.cmp',
  scale: 1,
  levels,
  bones: [bone('Root.3db', 'Root'), bone('Spine.3db', 'Spine'), bone('Head.3db', 'Head')],
  constraints: [sphere('Root', 'Spine'), sphere('Spine', 'Head')],
  ...values,
})

describe('readDeformableModel', () => {
  it('round-trips a model', () => {
    const value = model()

    deepStrictEqual(readDeformableModel(writeDeformableModel(value)), value)
  })

  it('throws without a compound directory', () => {
    throws(() => readDeformableModel(new Directory()), /compound/i)
  })

  it('throws when a part names a bone directory that is not there', () => {
    const root = writeDeformableModel(model())
    root.delete('Spine.3db')

    throws(() => readDeformableModel(root), /Spine\.3db/)
  })

  /**
   * Position in the bone table is what `Bone_id_chain` skins to, so an `Index` that disagrees with
   * it would leave every weight pointing at the wrong bone. Better to refuse the file than to read
   * a skeleton the mesh is not attached to.
   */
  it('throws when a part index disagrees with its bone position', () => {
    const root = writeDeformableModel(model())
    root.setFile('Cmpnd', 'Part_Head', 'Index').data = new Uint8Array()
    root.setFile('Cmpnd', 'Part_Head', 'Index').writeIntegers(7)

    throws(() => readDeformableModel(root), /index/i)
  })

  it('throws when two parts claim the same bone directory', () => {
    const root = writeDeformableModel(model())
    root.setFile('Cmpnd', 'Part_Head', 'File name').data = new Uint8Array()
    root.setFile('Cmpnd', 'Part_Head', 'File name').writeStrings('Spine.3db')
    root.setFile('Cmpnd', 'Part_Head', 'Index').data = new Uint8Array()
    root.setFile('Cmpnd', 'Part_Head', 'Index').writeIntegers(1)

    throws(() => readDeformableModel(root), /claimed by both/)
  })

  it('leaves a bone no part names unnamed, and keeps it in the table', () => {
    const value = model({
      bones: [bone('Root.3db', 'Root'), bone('Neck.3db'), bone('Head.3db', 'Head')],
      constraints: [sphere('Root', 'Head')],
    })

    const bones = readDeformableModel(writeDeformableModel(value)).bones

    strictEqual(bones.length, 3)
    strictEqual(bones[1]?.name, undefined)
    strictEqual(bones[2]?.name, 'Head')
  })

  /** The detached bone at position 1 leaves a gap that `Index` skips, exactly as retail heads do. */
  it('numbers parts around a detached bone rather than closing the gap', () => {
    const root = writeDeformableModel(
      model({ bones: [bone('Root.3db', 'Root'), bone('Neck.3db'), bone('Head.3db', 'Head')] }),
    )

    deepStrictEqual([...root.getFile('Cmpnd', 'Part_Head', 'Index')!.readIntegers()], [2])
  })
})

describe('writeDeformableModel', () => {
  it('writes the root nodes in the order the exporter does', () => {
    deepStrictEqual(
      writeDeformableModel(model()).children.map(({ name }) => name),
      ['MultiLevel', 'Skeleton', 'Cmpnd', 'Root.3db', 'Spine.3db', 'Head.3db'],
    )
  })

  it('writes the compound in the order the exporter does', () => {
    deepStrictEqual(
      writeDeformableModel(model())
        .getDirectory('Cmpnd')!
        .children.map(({ name }) => name),
      ['Scale', 'Root', 'Part_Spine', 'Part_Head', 'Cons'],
    )
  })

  it('writes a part as object name, file name, then index', () => {
    deepStrictEqual(
      writeDeformableModel(model())
        .getDirectory('Cmpnd', 'Part_Spine')!
        .files.map(({ name }) => name),
      ['Object name', 'File name', 'Index'],
    )
  })

  it('groups constraint records into one file per joint kind', () => {
    const value = model({
      constraints: [
        sphere('Root', 'Spine'),
        {
          parent: 'Root',
          child: 'Head',
          joint: {
            type: 'loose',
            position: Vector3.copy({}),
            rotation: Matrix3.copy(Matrix3.identity),
          },
        },
        sphere('Spine', 'Head'),
      ],
    })

    const cons = writeDeformableModel(value).getDirectory('Cmpnd', 'Cons')!

    deepStrictEqual(
      cons.files.map(({ name, byteLength }) => [name, byteLength]),
      [
        ['Sphere', 212 * 2],
        ['Loose', 176],
      ],
    )
  })

  it('refuses two bones sharing an object name', () => {
    throws(
      () =>
        writeDeformableModel(
          model({ bones: [bone('a.3db', 'Root'), bone('b.3db', 'root')], constraints: [] }),
        ),
      /duplicate/i,
    )
  })
})

describe('getBoneModel', () => {
  it('assembles the hierarchy the constraints describe', () => {
    const root = getBoneModel(model())

    ok(root)
    strictEqual(root.name, 'Root')
    deepStrictEqual(
      [...listTreeElements(root)].map(({ name, index }) => [name, index]),
      [
        ['Root', 0],
        ['Spine', 1],
        ['Head', 2],
      ],
    )
  })

  it('carries the joint onto the child it constrains', () => {
    strictEqual(getBoneModel(model())?.children[0]?.joint?.type, 'sphere')
  })

  it('leaves detached bones out of the tree', () => {
    const root = getBoneModel(
      model({
        bones: [bone('Root.3db', 'Root'), bone('Neck.3db'), bone('Head.3db', 'Head')],
        constraints: [sphere('Root', 'Head')],
      }),
    )

    deepStrictEqual(
      [...listTreeElements(root!)].map(({ name }) => name),
      ['Root', 'Head'],
    )
  })

  it('indexes a bone by its position in the table, gaps included', () => {
    const root = getBoneModel(
      model({
        bones: [bone('Root.3db', 'Root'), bone('Neck.3db'), bone('Head.3db', 'Head')],
        constraints: [sphere('Root', 'Head')],
      }),
    )

    strictEqual(root?.children[0]?.index, 2)
  })

  it('returns nothing when no bone is named', () => {
    strictEqual(getBoneModel(model({ bones: [bone('Neck.3db')], constraints: [] })), undefined)
  })
})
