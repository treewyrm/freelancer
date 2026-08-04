import Directory from '#/utf/directory.js'
import File from '#/utf/file.js'
import { readConstraints, writeConstraints, type Constraint } from '#/compound/constraint.js'
import { arrangeByConstraints, type Model } from '#/compound/model.js'
import { readBone, writeBone, type Bone } from './bone.js'
import { readLevels, writeLevels, type Level } from './level.js'

/** A bone directory is a root child whose name ends in `.3db`. Nothing else at the root does. */
const isBone = (directory: Directory): boolean => /\.3db$/i.test(directory.name)

/** `Cmpnd` holds one directory per bone plus `Cons`; the root part is `Root`, the rest `Part_*`. */
const isPart = (directory: Directory): boolean => /^(root|part_)/i.test(directory.name)

/**
 * A deformable model — the `.dfm` files Freelancer builds characters from.
 *
 * The shape is a rigid compound turned inside out. A `.cmp` is a tree of parts each holding its
 * own geometry; a `.dfm` is one skinned mesh per detail level, and the tree of bones under `Cmpnd`
 * exists only to pose it. So the compound layer is byte-for-byte the rigid one — the same
 * `Object name`/`File name`/`Index` triples, the same `Cons` records read by
 * {@link readConstraints} — while the fragment each part names is a {@link Bone} rather than a
 * mesh, and the geometry hangs off the file root instead.
 *
 * A character is assembled from three of these — a body, a head and a pair of hands — each with
 * its own bones, mesh and materials, joined through the hardpoints of the bones its
 * {@link skeleton} names. Neither the material library nor the texture library is read here: they
 * are ordinary siblings in the same container, and {@link readMaterials} and {@link readTextures}
 * take the same file root this does.
 */
export interface DeformableModel {
  /**
   * `Skeleton/Name` — the `.cmp` whose `Animation` library drives this model.
   *
   * Retail names four: `Head02.cmp` for every head, `AutoHeaderNode.cmp` for every body,
   * `L Palm.cmp` and `R Palm.cmp` for the hands, plus `torture_root.cmp` on one test asset. The
   * scripts live in that file, not in this one, which is how one set of animations drives every
   * head in the game.
   */
  skeleton: string

  /** `Cmpnd/Scale`. Always 1 in retail. */
  scale: number

  /** `MultiLevel` — the same mesh at descending detail, most detailed first. */
  levels: Level[]

  /**
   * Bones, in the order their `.3db` directories appear at the file root.
   *
   * Position in this array **is** the bone's identity: it is what `Index` states, what
   * `Bone_id_chain` skins to, and what {@link UVBone.bone} drives from. `Index` is therefore
   * derived on write rather than carried — it equals the directory position for all 9456 retail
   * bones, and the 156 bones with no `Cmpnd` part of their own fill exactly the gaps it leaves in
   * the head models. Reading a model whose two disagree throws rather than producing a bone table
   * that skinning would index wrongly.
   *
   * The first bone is the root of the hierarchy; every other named one is a `Part_*`.
   */
  bones: Bone[]

  /**
   * `Cmpnd/Cons` — the joints between bones, in file order.
   *
   * Only `Sphere` and `Loose` occur: a character's bones rotate about their sockets, and the root
   * floats free. Kept flat rather than folded into the bone tree because the order is the file's
   * own and because a detached bone is in none of them; {@link getBoneModel} assembles the
   * hierarchy when one is wanted.
   */
  constraints: Constraint[]
}

/**
 * Reads a deformable model from a file root directory.
 *
 * Takes the root the way {@link readVMeshLibrary} and {@link readTextures} do, because the pieces
 * are spread across it: bones are root children, geometry is under `MultiLevel`, and the hierarchy
 * that ties them together is under `Cmpnd`.
 * @param parent File root directory
 */
export function readDeformableModel(parent: Directory): DeformableModel {
  const compound = parent.getDirectory('Cmpnd')
  if (!compound) throw new Error('Missing compound directory')

  const bones = parent.directories.filter(isBone).map((directory) => readBone(directory))

  /** Bones by directory name, which is what a part's `File name` gives. */
  const byName = new Map(bones.map((bone, index) => [bone.filename.toLowerCase(), index]))

  for (const directory of compound.directories) {
    if (!isPart(directory)) continue

    const [name] = directory.getFile('Object name')?.readStrings() ?? []
    if (!name) throw new Error(`Missing object name in ${directory.name}`)

    const [filename] = directory.getFile('File name')?.readStrings() ?? []
    if (!filename) throw new Error(`Missing file name in ${directory.name}`)

    const position = byName.get(filename.toLowerCase())
    if (position === undefined) throw new Error(`Missing bone directory ${filename} for ${name}`)

    const [index] = directory.getFile('Index')?.readIntegers() ?? []
    if (index !== position)
      throw new RangeError(`${name} claims index ${index}, but ${filename} is bone ${position}`)

    // A bone holds one name. Two parts sharing a fragment would leave one of them with nowhere to
    // go, and writing back would quietly drop it.
    const bone = bones[position]!
    if (bone.name !== undefined)
      throw new Error(`${filename} is claimed by both ${bone.name} and ${name}`)

    bone.name = name
  }

  const [scale = 1] = compound.getFile('Scale')?.readFloats() ?? []
  const [skeleton = ''] = parent.getDirectory('Skeleton')?.getFile('Name')?.readStrings() ?? []

  const constraints = [...readConstraints(compound.getDirectory('Cons')?.files ?? [])]

  return { skeleton, scale, levels: readLevels(parent), bones, constraints }
}

/**
 * Writes a deformable model into a file root directory.
 *
 * The result holds `MultiLevel`, `Skeleton`, `Cmpnd` and the bone directories, in that order.
 * Retail also puts `Exporter Version` first and the `Material library` and `Texture library`
 * between `MultiLevel` and `Skeleton`; those are the caller's to add, the same way they are for a
 * rigid model, since {@link writeMaterials} and {@link writeTextures} own them.
 */
export function writeDeformableModel(model: DeformableModel): Directory {
  const { skeleton, scale, levels, bones, constraints } = model

  const compound = new Directory('Cmpnd', [new File('Scale').writeFloats(scale)])
  const names = new Set<string>()

  bones.forEach((bone, index) => {
    const { name, filename } = bone
    if (name === undefined) return

    if (!name.length) throw new RangeError(`Bone ${filename} has an empty object name`)
    if (names.has(name.toLowerCase())) throw new Error(`Duplicate bone name: ${name}`)

    names.add(name.toLowerCase())

    compound.children.push(
      new Directory(index === 0 ? 'Root' : `Part_${name}`, [
        new File('Object name').writeStrings(name),
        new File('File name').writeStrings(filename),
        new File('Index').writeIntegers(index),
      ]),
    )
  })

  // One file per joint kind, records appended in the order the constraints are given, matching how
  // `Cons` is read back: file by file, record by record.
  for (const file of writeConstraints(constraints))
    compound.setFile('Cons', file.name).append(file.data)

  return new Directory(undefined, [
    writeLevels(levels),
    new Directory('Skeleton', [new File('Name').writeStrings(skeleton)]),
    compound,
    ...bones.map((bone) => writeBone(bone)),
  ])
}

/**
 * Assembles the bone hierarchy from {@link DeformableModel.constraints}.
 *
 * Produces the same {@link Model} tree a rigid compound reads into, so everything built on that —
 * {@link listTreeElements}, {@link getModelHardpoint} — works on a character's skeleton
 * unchanged. Detached bones are left out: they name no part, so nothing constrains them and they
 * belong to the host skeleton rather than this one.
 *
 * @returns The root bone with its children, or nothing if the model has no named bone.
 */
export function getBoneModel({ bones, constraints }: DeformableModel): Model<Bone> | undefined {
  const objects = bones.flatMap<Model<Bone>>((bone, index) =>
    bone.name === undefined
      ? []
      : [
          {
            type: 'compound',
            name: bone.name,
            index,
            filename: bone.filename,
            part: bone,
            children: [],
          },
        ],
  )

  const root = objects.at(0)
  if (!root) return

  arrangeByConstraints(objects, constraints)

  return root
}
