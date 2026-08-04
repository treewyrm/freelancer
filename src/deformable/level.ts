import Directory from '#/utf/directory.js'
import File from '#/utf/file.js'
import { readFaceGroup, writeFaceGroup, type FaceGroup } from './facegroup.js'
import { readGeometry, writeGeometry, type Geometry } from './geometry.js'

/**
 * One detail level: a whole skinned mesh, split into face groups by material.
 *
 * Unlike a rigid model's `MultiLevel`, which switches between separately authored parts, every
 * level here is the same character at a different triangle budget, skinned to the same bones.
 */
export interface Level {
  /**
   * The level's entry in `MultiLevel/Fractions` — the fraction of the object's detail range at
   * which it takes over, the range itself coming from the INI that places the character.
   *
   * Carried on the level rather than as a list beside them, because the two counts agree in every
   * retail model and a separate array would only offer a way to disagree. Retail uses
   * `1, 0.8, 0.6, 0.4, 0.2, 0.1` for the 6-level models and `1, 0.8, 0.6, 0.2` for the two
   * 4-level ones.
   */
  fraction: number

  /** `Face_groups` — at least one, keyed by material. */
  groups: FaceGroup[]

  /** `Geometry` — the points, normals, coordinates and skinning weights. */
  geometry: Geometry
}

/**
 * Reads one `Mesh<n>` directory.
 * @param parent Mesh directory
 * @param fraction The level's entry of `Fractions`
 */
export function readLevel(parent: Directory, fraction: number): Level {
  const groups = parent.getDirectory('Face_groups')
  if (!groups) throw new Error(`Missing face groups in ${parent.name}`)

  const geometry = parent.getDirectory('Geometry')
  if (!geometry) throw new Error(`Missing geometry in ${parent.name}`)

  return {
    fraction,
    groups: groups.directories.map((directory) => readFaceGroup(directory)),
    geometry: readGeometry(geometry),
  }
}

/**
 * Writes one `Mesh<n>` directory.
 *
 * `Count` leads the face groups, where retail put it in all 1220 meshes. It is derived rather than
 * carried, equalling the number of `Group<n>` directories in every one of them.
 * @param level Detail level
 * @param index Level index, which the directory name carries
 */
export function writeLevel(level: Level, index = 0): Directory {
  const { groups, geometry } = level

  return new Directory(`Mesh${index}`, [
    new Directory('Face_groups', [
      new File('Count').writeIntegers(groups.length),
      ...groups.map((group, index) => writeFaceGroup(group, index)),
    ]),
    writeGeometry(geometry),
  ])
}

/**
 * Reads the `MultiLevel` directory of a deformable model.
 *
 * `Fractions` is read positionally against the `Mesh<n>` directories rather than by parsing the
 * digits off their names. The two counts match in every retail model, and a mismatch means one of
 * the levels has no switch point — which is not something to guess a value for.
 * @param parent File root directory
 */
export function readLevels(parent: Directory): Level[] {
  const directory = parent.getDirectory('MultiLevel')
  if (!directory) return []

  const fractions = [...(directory.getFile('Fractions')?.readFloats() ?? [])]
  const meshes = directory.directories

  if (fractions.length !== meshes.length)
    throw new RangeError(`${fractions.length} level fractions against ${meshes.length} meshes`)

  return meshes.map((mesh, index) => readLevel(mesh, fractions[index]!))
}

/**
 * Writes a `MultiLevel` directory.
 * @param levels Detail levels, most detailed first
 */
export function writeLevels(levels: Iterable<Level>): Directory {
  const list = [...levels]

  return new Directory('MultiLevel', [
    new File('Fractions').writeFloats(...list.map(({ fraction }) => fraction)),
    ...list.map((level, index) => writeLevel(level, index)),
  ])
}
