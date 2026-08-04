import Directory from '#/utf/directory.js'
import File from '#/utf/file.js'
import { readFloat32Array, readUint16Array, writeFloat32Array, writeUint16Array } from './arrays.js'

/**
 * An edge of a face group, with the angle between the two faces meeting along it.
 *
 * Authoring residue: only `br_female_elite_body.dfm` and `br_female_guard_body.dfm` carry the pair
 * of files, 36 groups between them, and neither Freelancer nor any other reader is known to look
 * at them. Within a group the angles run in descending order, so the list is sorted by how sharp
 * the crease is — the shape a mesh simplifier leaves behind when it ranks edges for collapsing.
 * A handful of angles come out slightly negative, which a signed dihedral measure would give for
 * a reflex edge.
 *
 * They are carried because they are there, and dropping them would silently shrink two files.
 */
export interface Edge {
  /** First endpoint, indexing `Points` of the same mesh. */
  a: number

  /** Second endpoint. */
  b: number

  /** Angle across the edge, in radians. Retail values run from -0.026 to pi. */
  angle: number
}

/**
 * A run of faces sharing one material.
 *
 * The two index forms are alternatives, not a pair: a group stores either a triangle strip or a
 * triangle list, and every retail group is a strip.
 */
export interface FaceGroup {
  /**
   * `Material_name`, resolved by {@link getResourceId} against the `Material library` in the same
   * file. Deformable models do not reference materials outside their own container.
   */
  material: string

  /** Which of the two index files holds {@link indices}. */
  type: 'strip' | 'list'

  /** `Tristrip_indices` or `Face_indices`, indexing `Point_indices` of the same mesh. */
  indices: Uint16Array

  /** `Edge_indices` and `Edge_angles`, when the group carries them. */
  edges?: Edge[]
}

/**
 * Reads a face group from a `Group<n>` directory.
 * @param parent Face group directory
 */
export function readFaceGroup(parent: Directory): FaceGroup {
  const [material] = parent.getFile('Material_name')?.readStrings() ?? []
  if (material === undefined) throw new Error(`Missing material name in ${parent.name}`)

  const strip = parent.getFile('Tristrip_indices')
  const list = parent.getFile('Face_indices')

  const file = strip ?? list
  if (!file) throw new Error(`Missing face indices in ${parent.name}`)

  const group: FaceGroup = {
    material,
    type: strip ? 'strip' : 'list',
    indices: readUint16Array(file),
  }

  const indices = parent.getFile('Edge_indices')
  const angles = parent.getFile('Edge_angles')

  if (indices && angles) group.edges = [...readEdges(indices, angles)]

  return group
}

function* readEdges(indices: File, angles: File): Generator<Edge> {
  const pairs = readUint16Array(indices)
  const values = readFloat32Array(angles)

  if (pairs.length !== values.length * 2)
    throw new RangeError(`${values.length} edge angles against ${pairs.length / 2} edges`)

  for (let i = 0; i < values.length; i++)
    yield { a: pairs[i * 2]!, b: pairs[i * 2 + 1]!, angle: values[i]! }
}

/**
 * Writes a face group into a `Group<n>` directory.
 * @param group Face group
 * @param index Group index within its mesh, which is all the directory name carries
 */
export function writeFaceGroup(group: FaceGroup, index = 0): Directory {
  const { material, type, indices, edges } = group

  const directory = new Directory(`Group${index}`, [
    new File('Material_name').writeStrings(material),
    writeUint16Array(type === 'strip' ? 'Tristrip_indices' : 'Face_indices', indices),
  ])

  if (edges?.length)
    directory.children.push(
      writeUint16Array(
        'Edge_indices',
        edges.flatMap(({ a, b }) => [a, b]),
      ),
      writeFloat32Array(
        'Edge_angles',
        edges.map(({ angle }) => angle),
      ),
    )

  return directory
}
