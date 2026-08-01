import Directory from '#/directory.js'
import File from '#/file.js'
import { getResource, type Hashable } from '#/hash.js'
import Matrix3 from '#/math/matrix3.js'
import Vector3 from '#/math/vector3.js'
import { readHardpoints, writeHardpoints, type Hardpoint } from '#/compound/hardpoint.js'
import BufferView from '#/utility/bufferview.js'

/**
 * One bone of a deformable model, stored as a `<name>.3db` directory at the file root.
 *
 * A bone has no geometry of its own — the mesh is a single skinned surface under `MultiLevel`, and
 * a bone contributes only a bind pose, the levels it deforms, and any hardpoints hung off it.
 */
export interface Bone {
  /**
   * Directory name, which is the object name with the exporter's packing timestamp appended:
   * `Head01` becomes `Head01021014191928.3db`. Every bone of one model shares that timestamp, but
   * it is part of the name rather than a field, and {@link name} is what the rest of the file
   * refers to the bone by.
   */
  filename: string

  /**
   * `Object name`, as constraints and animation maps name it.
   *
   * Absent when no `Cmpnd` part claims this directory. 156 retail bones are in that position, all
   * of them a single fixed hardpoint and nothing else — `Neck`, `UpperTorso`, `LCollarBone`,
   * `RCollarBone`, `L Wrist`, `R Wrist` — the frame at which a head or a hand meets the body it
   * is attached to. They belong to the host skeleton, not to this model's hierarchy, which is why
   * they are named in no constraint and animated by no script.
   *
   * They are not inert, though: a detached bone still occupies its slot in the bone table, and
   * `Bone_id_chain` skins vertices to it. A head's crown really does follow the body's neck.
   */
  name?: string

  /** `Bone to root` rotation, the 3x3 half of the record. */
  rotation: Matrix3

  /** `Bone to root` translation, the three floats following the rotation. */
  position: Vector3

  /**
   * `Lod Bits` — one bit per entry of {@link DeformableModel.levels}, bit 0 being `Mesh0`.
   *
   * Retail only ever writes all bits or none: 63 across the 6-level models, 15 across the two
   * 4-level ones, and 0 on 976 bones. It is not a record of which levels actually reference the
   * bone — 2237 bones with every bit set appear in no `Bone_id_chain` at all — so it reads as a
   * permission rather than an index.
   */
  levels: number

  /** Hardpoints under `Hardpoints/Fixed` and `Hardpoints/Revolute`. Retail uses only fixed ones. */
  hardpoints: Hardpoint[]
}

/** Byte length of `Bone to root`: a 3x3 rotation followed by a translation. */
export const BONE_TO_ROOT_LENGTH = Float32Array.BYTES_PER_ELEMENT * 12

/**
 * Reads a bone from its `<name>.3db` directory.
 * @param parent Bone directory
 */
export function readBone(parent: Directory): Bone {
  const file = parent.getFile('Bone to root')
  if (!file) throw new Error(`Missing bone to root matrix in ${parent.name}`)

  const view = BufferView.from(file)

  const rotation = Matrix3.read(view)
  const position = Vector3.read(view)

  const [levels = 0] = parent.getFile('Lod Bits')?.readIntegers() ?? []

  return {
    filename: parent.name,
    rotation,
    position,
    levels,
    hardpoints: [...readHardpoints(parent)],
  }
}

/**
 * Writes a bone into its `<name>.3db` directory.
 *
 * `Lod Bits` is a single byte, so it cannot go through `writeIntegers`, which is 32-bit. The view
 * it is written through is rewound before the file takes it: a `BufferView` carries its own
 * position, and `File` hands that position on to whatever reads the file next.
 */
export function writeBone(bone: Bone): Directory {
  const { filename, rotation, position, levels, hardpoints } = bone

  const directory = new Directory(filename, [
    new File('Bone to root', BufferView.join(Matrix3.write(rotation), Vector3.write(position))),
    new File(
      'Lod Bits',
      BufferView.allocate(Uint8Array.BYTES_PER_ELEMENT).writeUint8(levels).rewind(),
    ),
  ])

  if (hardpoints.length) directory.children.push(writeHardpoints(hardpoints))

  return directory
}

/** Finds a bone by {@link Bone.name} or its resource CRC. Detached bones have no name to match. */
export const getBone = (bones: Bone[], name: Hashable): Bone | undefined =>
  getResource(
    bones.filter(({ name }) => name !== undefined),
    ({ name }) => name!,
    name,
  )
