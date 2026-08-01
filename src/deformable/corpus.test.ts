import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { load, skip } from '../corpus.js'
import Directory from '../directory.js'
import File from '../file.js'
import { getResourceId } from '../hash.js'
import { readMaterials } from '../material/library.js'
import { listTreeElements } from '../utility/tree.js'
import {
  getBoneModel,
  readDeformableModel,
  writeDeformableModel,
  type DeformableModel,
} from './model.js'

const assets = () => load('dfm')

/** The root nodes a deformable model owns. The rest belong to the material and texture modules. */
const owned = (root: Directory) =>
  new Directory(
    undefined,
    root.children.filter(
      (child) =>
        ['multilevel', 'skeleton', 'cmpnd'].includes(child.name.toLowerCase()) ||
        /\.3db$/i.test(child.name),
    ),
  )

const bytes = (file: File) => new Uint8Array(file.buffer, file.byteOffset, file.byteLength)

const identical = (a: File, b: File) => {
  if (a.byteLength !== b.byteLength) return false

  const x = bytes(a)
  const y = bytes(b)

  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false
  return true
}

/**
 * Compares two trees node for node, in order.
 *
 * `skipConstraints` leaves `Cmpnd/Cons` out: every retail constraint record has stack residue in
 * the tail of its two name fields, which the writer zero-fills. Nothing else in the file differs.
 */
function compare(
  a: Directory,
  b: Directory,
  path: string,
  differences: string[],
  skipConstraints = true,
): void {
  if (a.children.length !== b.children.length) {
    differences.push(`${path}: ${a.children.length} children against ${b.children.length}`)
    return
  }

  for (let i = 0; i < a.children.length; i++) {
    const x = a.children[i]!
    const y = b.children[i]!

    if (x.name !== y.name) {
      differences.push(`${path}: ${x.name} against ${y.name}`)
      continue
    }

    if (skipConstraints && path.endsWith('/Cmpnd') && x.name.toLowerCase() === 'cons') continue

    if (x instanceof Directory && y instanceof Directory)
      compare(x, y, `${path}/${x.name}`, differences, skipConstraints)
    else if (x instanceof File && y instanceof File) {
      if (!identical(x, y)) differences.push(`${path}/${x.name}`)
    } else differences.push(`${path}/${x.name}: file against directory`)
  }
}

/** Decoding the corpus once, shared by every case. No case depends on another having run. */
let decoded: { path: string; root: Directory; model: DeformableModel }[] | undefined

const models = () =>
  (decoded ??= assets().map(({ path, root }) => ({
    path,
    root,
    model: readDeformableModel(root),
  })))

const levels = () =>
  models().flatMap(({ path, model }) => model.levels.map((level) => ({ path, level })))

const groups = () =>
  levels().flatMap(({ path, level }) => level.groups.map((group) => ({ path, group })))

describe('deformable corpus', { skip }, () => {
  it('finds the character models', () => {
    strictEqual(assets().length, 204)
  })

  it('reads every one of them', () => {
    strictEqual(models().length, 204)
  })

  /**
   * The whole point of the module. Reading and writing back reproduces every node the model owns,
   * byte for byte, across all 204 files — the bone directories, the compound, the skeleton name
   * and every mesh.
   */
  it('writes every model back byte for byte, bar the constraint name padding', () => {
    const differences: string[] = []

    for (const { path, root, model } of models())
      compare(owned(root), writeDeformableModel(model), path, differences)

    deepStrictEqual(differences.slice(0, 20), [])
  })

  /** What is written reads back the same and writes again to the same bytes, constraints included. */
  it('is a fixed point over every model', () => {
    const differences: string[] = []

    for (const { path, model } of models()) {
      const once = writeDeformableModel(model)
      const twice = writeDeformableModel(readDeformableModel(once))

      compare(once, twice, path, differences, false)
    }

    deepStrictEqual(differences.slice(0, 20), [])
  })

  /**
   * Every retail constraint record — 9096 here and 5316 across the rigid models — leaves stack
   * residue past the terminator of its 64-byte name fields, often a longer name written earlier.
   * The names read out identically either way, and the writer zero-fills, so this is the one thing
   * about a deformable model that cannot be reproduced.
   */
  it('has residue in the name padding of every constraint record it ships', () => {
    let records = 0
    let padded = 0

    for (const { root } of models())
      for (const file of root.getDirectory('Cmpnd', 'Cons')?.files ?? []) {
        const size = file.name.toLowerCase() === 'sphere' ? 212 : 176
        const data = bytes(file)

        for (let offset = 0; offset + size <= data.length; offset += size) {
          records++

          let dirty = false

          for (const base of [offset, offset + 0x40]) {
            const field = data.subarray(base, base + 0x40)
            const end = field.indexOf(0)

            if (end >= 0 && field.subarray(end).some((byte) => byte !== 0)) dirty = true
          }

          if (dirty) padded++
        }
      }

    strictEqual(records, 9096)
    strictEqual(padded, records)
  })

  /** A character's bones rotate about their sockets and the root floats free. Nothing else occurs. */
  it('constrains bones with sphere and loose joints only', () => {
    const kinds = new Set(
      models().flatMap(({ model }) => model.constraints.map(({ joint }) => joint.type)),
    )

    deepStrictEqual([...kinds].sort(), ['loose', 'sphere'])
  })

  /**
   * `Index` is derived from the bone's position in the table on write, so it has to be redundant
   * on read — {@link readDeformableModel} throws when it is not, and every retail file passes.
   */
  it('numbers every part by its bone directory position', () => {
    let bones = 0

    for (const { model } of models()) bones += model.bones.length

    strictEqual(bones, 9456)
  })

  /**
   * The bones no `Cmpnd` part claims. Every one is a single fixed hardpoint on a frame belonging
   * to the host skeleton — the neck a head hangs from, the wrist a hand does — and every one is
   * still skinned to, which is why they cannot simply be dropped.
   */
  it('carries 156 detached bones, each a lone hardpoint on the host skeleton', () => {
    const detached = models().flatMap(({ path, model }) =>
      model.bones.filter(({ name }) => name === undefined).map((bone) => ({ path, bone })),
    )

    strictEqual(detached.length, 156)
    deepStrictEqual(
      detached.filter(({ bone }) => bone.hardpoints.length !== 1).map(({ path }) => path),
      [],
    )
    deepStrictEqual(
      [...new Set(detached.map(({ bone }) => bone.filename.replace(/\d+\.3db$/i, '')))].sort(),
      ['LCollarBone', 'L Wrist', 'Neck', 'RCollarBone', 'R Wrist', 'UpperTorso'].sort(),
    )
  })

  /** Position in the bone table is what the skin indexes, detached bones included. */
  it('skins to a bone the table has, and drives UVs from one too', () => {
    const dangling: string[] = []

    for (const { path, model } of models())
      for (const { geometry } of model.levels) {
        for (const id of geometry.boneIds)
          if (id >= model.bones.length) dangling.push(`${path} ${id}`)

        if (geometry.uvBone && geometry.uvBone.bone >= model.bones.length)
          dangling.push(`${path} uv ${geometry.uvBone.bone}`)
      }

    deepStrictEqual(dangling.slice(0, 10), [])
  })

  /** Four is what a fixed-function skinning pipeline can blend, and retail never asks for a fifth. */
  it('weights a point to at most four bones, and slices the chain within its bounds', () => {
    const wrong: string[] = []
    let most = 0

    for (const { path, model } of models())
      for (const { geometry } of model.levels) {
        const { points, normals, boneFirst, boneCount, boneIds, boneWeights } = geometry

        if (points.length !== normals.length) wrong.push(`${path}: normals`)
        if (boneFirst.length !== points.length / 3) wrong.push(`${path}: bone first`)
        if (boneCount.length !== boneFirst.length) wrong.push(`${path}: bone count`)
        if (boneIds.length !== boneWeights.length) wrong.push(`${path}: bone weights`)

        for (let i = 0; i < boneFirst.length; i++) {
          most = Math.max(most, boneCount[i]!)
          if (boneFirst[i]! + boneCount[i]! > boneIds.length) wrong.push(`${path}: chain ${i}`)
        }
      }

    deepStrictEqual(wrong.slice(0, 10), [])
    strictEqual(most, 4)
  })

  /** A face group's indices address the element list, which is what `Point_indices` builds. */
  it('indexes the element list from every face group', () => {
    const wrong: string[] = []

    for (const { path, model } of models())
      for (const { groups, geometry } of model.levels)
        for (const group of groups)
          for (const index of group.indices)
            if (index >= geometry.indices.length) wrong.push(`${path}: ${index}`)

    deepStrictEqual(wrong.slice(0, 10), [])
  })

  /** Materials are looked up in the same container, never outside it. */
  it('names a material its own library holds, in every face group', () => {
    const missing: string[] = []

    for (const { path, root, model } of models()) {
      const materials = new Set([...readMaterials(root)].map(({ name }) => getResourceId(name)))

      for (const { groups } of model.levels)
        for (const { material } of groups)
          if (!materials.has(getResourceId(material))) missing.push(`${path} :: ${material}`)
    }

    deepStrictEqual(missing.slice(0, 10), [])
  })

  it('stores every face group as a triangle strip', () => {
    strictEqual(groups().length, 4184)
    deepStrictEqual(
      groups()
        .filter(({ group }) => group.type !== 'strip')
        .map(({ path }) => path),
      [],
    )
  })

  /** Two files, 36 groups, and nothing reads them. See {@link Edge}. */
  it('carries edge angles in two files only, sorted from sharpest', () => {
    const edged = groups().filter(({ group }) => group.edges)

    strictEqual(edged.length, 36)
    deepStrictEqual([...new Set(edged.map(({ path }) => path))].sort(), [
      'CHARACTERS/BODIES/br_female_elite_body.dfm',
      'CHARACTERS/BODIES/br_female_guard_body.dfm',
    ])

    for (const { path, group } of edged) {
      const angles = group.edges!.map(({ angle }) => angle)

      ok(
        angles.every((angle, index) => index === 0 || angle <= angles[index - 1]!),
        `${path}: edge angles are not sorted`,
      )
    }
  })

  it('holds six levels in all but the two four-level models', () => {
    const counts = new Map<number, number>()

    for (const { model } of models())
      counts.set(model.levels.length, (counts.get(model.levels.length) ?? 0) + 1)

    deepStrictEqual(
      [...counts].sort((a, b) => b[1] - a[1]),
      [
        [6, 202],
        [4, 2],
      ],
    )
    strictEqual(levels().length, 1220)
  })

  it('uses one of two fraction sets', () => {
    const sets = new Set(
      models().map(({ model }) => model.levels.map(({ fraction }) => fraction.toFixed(1)).join()),
    )

    deepStrictEqual([...sets].sort(), ['1.0,0.8,0.6,0.2', '1.0,0.8,0.6,0.4,0.2,0.1'])
  })

  /**
   * `Lod Bits` reads as a permission rather than an index: it is all bits or none, and 2237 bones
   * with every bit set appear in no `Bone_id_chain` at all.
   */
  it('sets every level bit or none of them, never a subset', () => {
    const words = new Map<number, number>()

    for (const { model } of models())
      for (const { levels } of model.bones) words.set(levels, (words.get(levels) ?? 0) + 1)

    deepStrictEqual(
      [...words].sort((a, b) => b[1] - a[1]),
      [
        [0x3f, 8436],
        [0, 976],
        [0x0f, 44],
      ],
    )
  })

  /** Both optional geometry blocks, and where they occur. */
  it('carries a second coordinate set on half the meshes and a UV bone on the heads', () => {
    strictEqual(levels().filter(({ level }) => level.geometry.uv1).length, 618)

    const uvBone = levels().filter(({ level }) => level.geometry.uvBone)

    strictEqual(uvBone.length, 104)
    deepStrictEqual(
      uvBone.filter(({ path }) => !path.startsWith('CHARACTERS/HEADS/')).map(({ path }) => path),
      [],
    )
  })

  /** Only the first level gets one — a head at any distance blinks with its highest-detail mesh. */
  it('puts the UV bone on Mesh0 and nowhere else', () => {
    const wrong: string[] = []

    for (const { path, model } of models())
      model.levels.forEach((level, index) => {
        if (level.geometry.uvBone && index !== 0) wrong.push(`${path} ${index}`)
      })

    deepStrictEqual(wrong, [])
  })

  it('names one of five skeletons', () => {
    const names = new Map<string, number>()

    for (const { model } of models())
      names.set(model.skeleton, (names.get(model.skeleton) ?? 0) + 1)

    deepStrictEqual(
      [...names].sort((a, b) => b[1] - a[1]),
      [
        ['Head02.cmp', 104],
        ['AutoHeaderNode.cmp', 87],
        ['L Palm.cmp', 6],
        ['R Palm.cmp', 6],
        ['torture_root.cmp', 1],
      ],
    )
  })

  it('scales every model by one', () => {
    deepStrictEqual(
      models()
        .filter(({ model }) => model.scale !== 1)
        .map(({ path }) => path),
      [],
    )
  })

  /** Every named bone reaches the tree, so no constraint dangles and no part is left unattached. */
  it('assembles a hierarchy holding every named bone', () => {
    const wrong: string[] = []

    for (const { path, model } of models()) {
      const root = getBoneModel(model)
      const named = model.bones.filter(({ name }) => name !== undefined).length

      if (!root || [...listTreeElements(root)].length !== named) wrong.push(path)
    }

    deepStrictEqual(wrong, [])
  })

  it('hangs 1003 hardpoints off the bones, all of them fixed', () => {
    const hardpoints = models().flatMap(({ model }) =>
      model.bones.flatMap(({ hardpoints }) => hardpoints),
    )

    strictEqual(hardpoints.length, 1003)
    deepStrictEqual([...new Set(hardpoints.map(({ type }) => type))], ['fixed'])
  })
})
