import { deepStrictEqual, strictEqual, throws } from 'node:assert/strict'
import { describe, it } from 'node:test'
import Directory from '../utf/directory.js'
import File from '../utf/file.js'
import Matrix3 from '../math/matrix3.js'
import Vector3 from '../math/vector3.js'
import BufferView from '../utility/bufferview.js'
import { getBone, readBone, writeBone, type Bone } from './bone.js'

const rotation: Matrix3 = {
  x: { x: 0, y: 1, z: 0 },
  y: { x: -1, y: 0, z: 0 },
  z: { x: 0, y: 0, z: 1 },
}

const position: Vector3 = { x: 1, y: 2, z: 3 }

const bone = (values: Partial<Bone> = {}): Bone => ({
  filename: 'Spine020831180347.3db',
  rotation,
  position,
  levels: 0x3f,
  hardpoints: [],
  ...values,
})

const directory = (levels = 0x3f) =>
  new Directory('Spine020831180347.3db', [
    new File('Bone to root', BufferView.join(Matrix3.write(rotation), Vector3.write(position))),
    new File('Lod Bits', BufferView.allocate(1).writeUint8(levels).rewind()),
  ])

describe('readBone', () => {
  it('reads the rotation and translation halves of Bone to root', () => {
    const value = readBone(directory())

    strictEqual(value.filename, 'Spine020831180347.3db')
    deepStrictEqual(value.rotation, rotation)
    deepStrictEqual(value.position, position)
    strictEqual(value.levels, 0x3f)
  })

  it('leaves a bone unnamed, since the name comes from the compound and not the directory', () => {
    strictEqual(readBone(directory()).name, undefined)
  })

  it('reads hardpoints from the fragment', () => {
    const parent = directory()

    parent
      .setDirectory('Hardpoints', 'Fixed', 'hp_neck')
      .children.push(
        new File('Position', Vector3.write({ x: 0, y: 1, z: 0 })),
        new File('Orientation', Matrix3.write(Matrix3.identity)),
      )

    deepStrictEqual(
      readBone(parent).hardpoints.map(({ name, type }) => [type, name]),
      [['fixed', 'hp_neck']],
    )
  })

  it('throws when the bind pose is missing, rather than posing the bone at the origin', () => {
    throws(() => readBone(new Directory('Spine.3db')), /bone to root/i)
  })
})

describe('writeBone', () => {
  it('round-trips a bone', () => {
    const value = bone()

    deepStrictEqual(readBone(writeBone(value)), value)
  })

  it('writes Bone to root as twelve floats, rotation first', () => {
    const file = writeBone(bone()).getFile('Bone to root')!

    strictEqual(file.byteLength, 48)
    deepStrictEqual([...file.readFloats()], [0, 1, 0, -1, 0, 0, 0, 0, 1, 1, 2, 3])
  })

  it('writes Lod Bits as a single byte', () => {
    strictEqual(writeBone(bone({ levels: 15 })).getFile('Lod Bits')?.byteLength, 1)
  })

  // A `BufferView` remembers where writing left off, and `File` passes that position on to
  // `readIntegers`. A view handed over unrewound reads back as an empty file.
  it('hands the byte back on a rewound view', () => {
    deepStrictEqual(
      [
        ...writeBone(bone({ levels: 15 }))
          .getFile('Lod Bits')!
          .readIntegers(),
      ],
      [15],
    )
  })

  it('omits the hardpoint directory when there are none', () => {
    deepStrictEqual(writeBone(bone()).directories, [])
  })

  it('names the directory after the fragment file name', () => {
    strictEqual(writeBone(bone()).name, 'Spine020831180347.3db')
  })
})

describe('getBone', () => {
  const bones = [
    bone({ name: 'Root', filename: 'Root.3db' }),
    bone({ filename: 'Neck.3db' }),
    bone({ name: 'Spine', filename: 'Spine.3db' }),
  ]

  it('finds a bone by name, folding case the way a resource lookup does', () => {
    strictEqual(getBone(bones, 'spine'), bones[2])
  })

  // A detached bone is named by nothing in the file, and its directory name is not a name.
  it('does not reach a detached bone through its file name', () => {
    strictEqual(getBone(bones, 'Neck.3db'), undefined)
    strictEqual(getBone(bones, 'Neck'), undefined)
  })
})
