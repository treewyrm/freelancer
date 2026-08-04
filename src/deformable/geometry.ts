import Directory from '#/utf/directory.js'
import File from '#/utf/file.js'
import { readFloat32Array, readUint32Array, writeFloat32Array, writeUint32Array } from './arrays.js'

/**
 * A texture coordinate set.
 *
 * Positions and UVs are indexed separately: a vertex of the drawn mesh is the pairing of
 * `Point_indices[i]` with `UV0_indices[i]`, so a seam can split the UV without splitting the
 * position, and the skinning weights attached to the position are shared across the split.
 */
export interface Mapping {
  /** `UV<n>_indices`, one per element of {@link Geometry.indices}. */
  indices: Uint32Array

  /** `UV<n>`, two floats per coordinate. */
  coordinates: Float32Array
}

/**
 * Texture coordinates driven by a bone's translation rather than by the skin.
 *
 * Present on `Mesh0` of 104 retail heads and nowhere else, always as the full set of eleven files.
 * One bone is named, its X and Y translation is scaled into a U and V delta, the delta is clamped
 * to the min/max pair, and the result offsets the coordinates {@link vertices} lists. That is how
 * a face blinks and mouths words without moving a vertex: the eye and mouth patches slide across
 * a sprite sheet in the diffuse texture while the head geometry stays put.
 *
 * The scales are +-0.4 and the clamps +-0.2 in U and +-0.1035 in V across every head that has
 * them, and {@link distance} is always 1.
 */
export interface UVBone {
  /** `UV_bone_id` — the driving bone, indexing {@link DeformableModel.bones}. */
  bone: number

  /** `Bone_X_to_U_scale` — bone X translation to U delta. */
  scaleU: number

  /** `Bone_Y_to_V_scale` — bone Y translation to V delta. */
  scaleV: number

  /** `Min_du` and `Max_du` — clamp on the U delta. */
  minU: number
  maxU: number

  /** `Min_dv` and `Max_dv` — clamp on the V delta. */
  minV: number
  maxV: number

  /** `UV_plane_distance`. Always 1 in retail. */
  distance: number

  /**
   * `UV_vertex_id` — the coordinates the bone shifts, indexing {@link Geometry.uv0}'s
   * `coordinates`. `UV_vertex_count` states its length and is derived rather than carried.
   */
  vertices: Uint32Array

  /** `UV_default_list` — the unshifted coordinates, two floats per entry of {@link vertices}. */
  defaults: Float32Array
}

/**
 * The skinned surface of one detail level.
 *
 * Everything here is a flat parallel array, the way the file stores it. Positions and normals are
 * per point; the bone chain is a shared pool that {@link boneFirst} and {@link boneCount} slice
 * per point; and {@link indices} walks the points in drawing order, which is what a face group's
 * own indices then index into.
 */
export interface Geometry {
  /** `Point_indices` — one entry per element, indexing {@link points} by triples. */
  indices: Uint32Array

  /** `Points` — three floats per point. */
  points: Float32Array

  /** `Vertex_normals` — three floats per point, matching {@link points}. */
  normals: Float32Array

  /** `UV0_indices` and `UV0`. */
  uv0: Mapping

  /** `UV1_indices` and `UV1`. Present on 618 of the 1220 retail meshes, always as the pair. */
  uv1?: Mapping

  /**
   * `Point_bone_first` — where a point's influences start in {@link boneIds}, one per point.
   *
   * The influences of point `p` are `boneIds[i]` and `boneWeights[i]` for `i` from
   * `boneFirst[p]` to `boneFirst[p] + boneCount[p]`.
   */
  boneFirst: Uint32Array

  /** `Point_bone_count` — how many influences a point has. Retail never exceeds four. */
  boneCount: Uint32Array

  /** `Bone_id_chain` — the influence pool, indexing {@link DeformableModel.bones}. */
  boneIds: Uint32Array

  /** `Bone_weight_chain` — one weight per entry of {@link boneIds}. */
  boneWeights: Float32Array

  /** The eleven `UV_*` files, when the mesh carries them. */
  uvBone?: UVBone
}

function required(parent: Directory, name: string): File {
  const file = parent.getFile(name)
  if (!file) throw new Error(`Missing ${name} in ${parent.name}`)

  return file
}

const scalar = (parent: Directory, name: string): number => {
  const [value] = required(parent, name).readFloats()
  if (value === undefined) throw new Error(`Empty ${name} in ${parent.name}`)

  return value
}

function readMapping(parent: Directory, index: number): Mapping | undefined {
  const indices = parent.getFile(`UV${index}_indices`)
  const coordinates = parent.getFile(`UV${index}`)

  if (!indices || !coordinates) {
    // Half a coordinate set is unusable: the indices address nothing, or nothing addresses the
    // coordinates. Retail never writes one, and a reader that shrugged would drop the half present.
    if (indices || coordinates)
      throw new Error(`Incomplete UV${index} coordinate set in ${parent.name}`)

    return
  }

  return { indices: readUint32Array(indices), coordinates: readFloat32Array(coordinates) }
}

function readUVBone(parent: Directory): UVBone | undefined {
  const file = parent.getFile('UV_bone_id')
  if (!file) return

  const [bone] = readUint32Array(file)
  if (bone === undefined) throw new Error(`Empty UV bone id in ${parent.name}`)

  return {
    bone,
    scaleU: scalar(parent, 'Bone_X_to_U_scale'),
    scaleV: scalar(parent, 'Bone_Y_to_V_scale'),
    minU: scalar(parent, 'Min_du'),
    maxU: scalar(parent, 'Max_du'),
    minV: scalar(parent, 'Min_dv'),
    maxV: scalar(parent, 'Max_dv'),
    distance: scalar(parent, 'UV_plane_distance'),
    vertices: readUint32Array(required(parent, 'UV_vertex_id')),
    defaults: readFloat32Array(required(parent, 'UV_default_list')),
  }
}

/**
 * Reads geometry from a `Geometry` directory.
 * @param parent Geometry directory
 */
export function readGeometry(parent: Directory): Geometry {
  const uv0 = readMapping(parent, 0)
  if (!uv0) throw new Error(`Missing UV0 coordinate set in ${parent.name}`)

  const geometry: Geometry = {
    indices: readUint32Array(required(parent, 'Point_indices')),
    points: readFloat32Array(required(parent, 'Points')),
    normals: readFloat32Array(required(parent, 'Vertex_normals')),
    uv0,
    boneFirst: readUint32Array(required(parent, 'Point_bone_first')),
    boneCount: readUint32Array(required(parent, 'Point_bone_count')),
    boneIds: readUint32Array(required(parent, 'Bone_id_chain')),
    boneWeights: readFloat32Array(required(parent, 'Bone_weight_chain')),
  }

  const uv1 = readMapping(parent, 1)
  if (uv1) geometry.uv1 = uv1

  const uvBone = readUVBone(parent)
  if (uvBone) geometry.uvBone = uvBone

  return geometry
}

/**
 * Writes geometry into a `Geometry` directory.
 *
 * File order follows the exporter, which is uniform across the corpus: the two index files, the
 * optional second UV index, the point attributes, the coordinates, then the UV bone block.
 * `UV_vertex_count` is derived from `UV_vertex_id` rather than carried, since the two agree in
 * every retail mesh and a field for it would only offer a way to disagree.
 */
export function writeGeometry(geometry: Geometry): Directory {
  const { indices, points, normals, uv0, uv1, boneFirst, boneCount, boneIds, boneWeights, uvBone } =
    geometry

  const directory = new Directory('Geometry', [
    writeUint32Array('Point_indices', indices),
    writeUint32Array('UV0_indices', uv0.indices),
  ])

  if (uv1) directory.children.push(writeUint32Array('UV1_indices', uv1.indices))

  directory.children.push(
    writeFloat32Array('Points', points),
    writeUint32Array('Point_bone_first', boneFirst),
    writeUint32Array('Point_bone_count', boneCount),
    writeUint32Array('Bone_id_chain', boneIds),
    writeFloat32Array('Bone_weight_chain', boneWeights),
    writeFloat32Array('Vertex_normals', normals),
    writeFloat32Array('UV0', uv0.coordinates),
  )

  if (uv1) directory.children.push(writeFloat32Array('UV1', uv1.coordinates))

  if (uvBone) {
    const { bone, scaleU, scaleV, minU, maxU, minV, maxV, distance, vertices, defaults } = uvBone

    directory.children.push(
      writeUint32Array('UV_bone_id', [bone]),
      writeUint32Array('UV_vertex_count', [vertices.length]),
      new File('UV_plane_distance').writeFloats(distance),
      new File('Bone_X_to_U_scale').writeFloats(scaleU),
      new File('Bone_Y_to_V_scale').writeFloats(scaleV),
      new File('Min_du').writeFloats(minU),
      new File('Max_du').writeFloats(maxU),
      new File('Min_dv').writeFloats(minV),
      new File('Max_dv').writeFloats(maxV),
      writeUint32Array('UV_vertex_id', vertices),
      writeFloat32Array('UV_default_list', defaults),
    )
  }

  return directory
}
