# Deformable

A character's `.dfm` file holds one skinned mesh per detail level, plus a tree of bones that poses
it.

A character is not one file. Body, head and each hand are separate models, each with its own bones,
mesh, materials and textures, joined at load time through the hardpoints of the bones their
skeletons share.

## Layout

```
<file root>
  ├─ Exporter Version ────── string, the build date of the exporter
  ├─ MultiLevel ──────────── the mesh, once per detail level
  │    ├─ Fractions ──────── float[], one per Mesh below
  │    └─ Mesh0 … Mesh<n>
  │         ├─ Face_groups
  │         │    ├─ Count ── int32, the number of Group directories beside it
  │         │    └─ Group0 … Group<n>
  │         │         ├─ Material_name
  │         │         ├─ Tristrip_indices  (or Face_indices)
  │         │         └─ Edge_indices, Edge_angles   ← two files only
  │         └─ Geometry ──── points, normals, coordinates, skinning weights
  ├─ Material library ────── see MATERIAL.md
  ├─ Texture library ─────── see TEXTURE.md
  ├─ Skeleton
  │    └─ Name ───────────── the .cmp whose Animation library drives this model
  ├─ Cmpnd
  │    ├─ Scale ──────────── float, always 1
  │    ├─ Root ───────────── Object name, File name, Index
  │    ├─ Part_<name> ×n ─── the same three files
  │    └─ Cons
  │         ├─ Sphere ────── 212-byte records
  │         └─ Loose ─────── 176-byte records
  └─ <bone>.3db ×n ───────── one directory per bone
       ├─ Bone to root ───── float[12]: a 3×3 rotation then a translation
       ├─ Lod Bits ───────── one byte
       └─ Hardpoints ─────── Fixed / Revolute, as a rigid model's are
```

Node order is the exporter's and is uniform, down to the file order inside a geometry directory and
the `Object name`, `File name`, `Index` order inside a part. `writeDeformableModel` reproduces it,
minus `Exporter Version` and the two libraries, which are the caller's to add.

`readDeformableModel(root)` takes the file root, as `readVMeshLibrary` and `readTextures` do.

## The compound is the rigid one

`Cmpnd` and `Cons` are byte-for-byte the layout `.cmp` uses, read by the same `readConstraints`. What
differs is what a part names: in a `.cmp` a fragment holding geometry, here a bone holding nothing
but a bind pose.

Only two joint kinds occur: `Sphere` for a bone rotating in its socket, `Loose` for the root.

`getBoneModel` assembles the constraints into the same `CompoundNode<T>` tree a rigid compound reads
into, so `listTreeElements` and `getCompoundHardpoint` work on a skeleton unchanged.

The constraint chain is not the bind pose — see [The chain is not the bind
pose](#the-chain-is-not-the-bind-pose).

## Bones are a table, not just a tree

`Bone_id_chain` skins each point to bone numbers, and those numbers are what `Index` states. `Index`
equals the position of the bone's `.3db` directory among the root's children, so
`DeformableModel.bones` is an ordered array and `Index` is derived from position on write rather
than carried. Reading a model whose two disagree throws.

### Detached bones

Some bone directories have no `Cmpnd` part: named by no constraint, animated by no script, invisible
to a reader that walks the compound. Every one carries exactly one fixed hardpoint and nothing else,
is named `Neck`, `UpperTorso`, `LCollarBone`, `RCollarBone`, `L Wrist` or `R Wrist`, and occupies
one of the gaps the part numbering leaves.

They are the frame at which a head or a hand meets the body it attaches to. The bone belongs to the
host skeleton, so this model does not claim it as a part, but it holds a slot in the bone table and
`Bone_id_chain` still skins vertices to it. They are carried as bones with no `name`. Dropping them
unpicks both the attachment and the skin.

**The hardpoint each one carries names the host hardpoint it seats on**, so a composer reads the join
off the file rather than knowing about necks and wrists. What that means for assembling a character,
and how far a child's stored seam frame can be trusted, is [COSTUME.md](../refs/COSTUME.md).

## Geometry

Positions and texture coordinates are indexed separately. A drawn vertex is the pairing of
`Point_indices[i]` with `UV0_indices[i]`, so a UV seam splits the coordinate without splitting the
position, and the skinning weights, which hang off the position, are shared across the split. A face
group's own indices address that element list, not the points.

Skinning weights are a shared pool sliced per point:

```
for (let i = boneFirst[p], end = i + boneCount[p]; i < end; i++)
  // boneIds[i] weighted by boneWeights[i]
```

`UV1_indices` and `UV1` come as a pair or not at all.

### The UV bone

Eleven further files appear on `Mesh0` of every head and nowhere else, always as the complete set.
One bone is named, its X and Y translation is scaled into a U and V delta, the delta is clamped to a
min/max pair, and the result offsets the coordinates `UV_vertex_id` lists — whose unshifted values
`UV_default_list` holds, two floats each.

This is facial animation: the eye and mouth patches slide across a sprite sheet in the diffuse
texture while the head geometry stays put.

`UV_vertex_count` is derived from `UV_vertex_id` rather than carried, and `Face_groups/Count` from
the group directories the same way.

### Level fractions

`Fractions` holds one float per `Mesh`, and the counts match in every model, so the fraction is
carried on the `Level` rather than as a separate array. The distance each fraction stands for comes
from the INI that places the character.

### Lod Bits

One byte per bone, one bit per level. Not a record of which levels reference the bone — bones with
every bit set appear in no `Bone_id_chain` at all, and retail writes all bits or none, so it reads
as a permission rather than an index.

### Edge angles

Two files carry `Edge_indices` and `Edge_angles` on some face groups. Indices are `uint16` pairs
into `Points`, angles one `float32` each, descending within a group — the shape a mesh simplifier
leaves when it ranks edges by crease sharpness. A handful are slightly negative, as a signed
dihedral measure gives for a reflex edge.

Nothing is known to read them. They are carried because dropping them shrinks two files. See
[TODO](#todo).

## Not modelled

- **`Face_indices`.** A face group may hold a plain triangle list instead of a strip. Reader and
  writer both handle it, but every retail group is a strip.
- **`Exporter Version`.** Read past, as for rigid models.
- **Materials and textures.** Ordinary siblings in the same container, owned by
  [MATERIAL.md](MATERIAL.md) and [TEXTURE.md](TEXTURE.md), and resolved in the same global CRC space
  as any other file's. Every face group's `Material_name` happens to be defined in its own container —
  measured, all 4,184 — but nothing scopes the lookup there, and 75 of the 386 distinct names are
  defined in more than one of the 204 models.
- **The `.anm` side.** A deformable model names its skeleton; the animation scripts live in that
  file. See [ANIMATION.md](ANIMATION.md).

## Notes

### The chain is not the bind pose

Composing `T(position) · R(orientation)` down the constraint tree gives each bone a world transform,
which is not the same thing as `Bone to root`. The corpus splits cleanly:

| | Chain reproduces the bind pose |
| --- | --- |
| `CHARACTERS/HEADS` | 6,543 of 6,543 bones |
| `CHARACTERS/HANDS` | 252 of 252 bones |
| `CHARACTERS/BODIES` | **88 of 2,505** — the 88 roots, and nothing else |

For bodies the constraint rest is a genuinely different pose: skinning a body's points through its
own chain displaces them by 0.828 on average and 4.556 at worst, and not rigidly — pairwise
distances change by up to 1.19 on a figure 1.6 tall. `br_bartender_body.dfm` spans y −0.97..0.63
while the chain lays the skeleton along z −0.10..1.23, a Z-up rig against a Y-up mesh.

The reading is that a body's `Cons` hierarchy is the animation rig — the frame an `.anm`'s joint
maps drive — while `Bone to root` carries the skin's bind pose, and `pose · inverse(bindPose)`
reconciles them. A consumer with no animation loaded poses each bone from its own `Bone to root`
rather than by composing the chain.

## API

### `./deformable`

| Export                 | Kind      |                                                                                     |
| ---------------------- | --------- | ----------------------------------------------------------------------------------- |
| `Bone`                 | interface | One bone, stored as a `<name>.3db` directory at the file root.                      |
| `DeformableModel`      | interface | A `.dfm` model — a rigid compound turned inside out.                                |
| `Edge`                 | interface | An edge of a face group, with the angle between the two faces meeting along it.     |
| `FaceGroup`            | interface | A run of faces sharing one material; strip or list, never both.                     |
| `Geometry`             | interface | The skinned surface of one detail level, as flat parallel arrays.                   |
| `getBone`              | function  | Finds a bone by name or resource CRC.                                               |
| `getBoneModel`         | function  | Assembles the bone hierarchy, producing the same `Model` tree a rigid compound has. |
| `Level`                | interface | One detail level: a whole skinned mesh, split into face groups by material.         |
| `Mapping`              | interface | A texture coordinate set; positions and UVs are indexed separately.                 |
| `readBone`             | function  | Reads a bone from its `<name>.3db` directory.                                       |
| `readDeformableModel`  | function  | Reads a deformable model from a file root directory.                                |
| `readFaceGroup`        | function  | Reads a face group from a `Group<n>` directory.                                     |
| `readGeometry`         | function  | Reads geometry from a `Geometry` directory.                                         |
| `readLevel`            | function  | Reads one `Mesh<n>` directory.                                                      |
| `readLevels`           | function  | Reads the `MultiLevel` directory of a deformable model.                             |
| `UVBone`               | interface | Texture coordinates driven by a bone's translation rather than by the skin.         |
| `writeBone`            | function  | Writes a bone into its `<name>.3db` directory.                                      |
| `writeDeformableModel` | function  | Writes a deformable model into a file root directory.                               |
| `writeFaceGroup`       | function  | Writes a face group into a `Group<n>` directory.                                    |
| `writeGeometry`        | function  | Writes geometry into a `Geometry` directory.                                        |
| `writeLevel`           | function  | Writes one `Mesh<n>` directory.                                                     |
| `writeLevels`          | function  | Writes a `MultiLevel` directory.                                                    |

## Corpus

Retail ships 204 models holding 9,456 bones and 1,220 meshes.

| Directory           | Files | Bones per file | Detached bones |
| ------------------- | ----- | -------------- | -------------- |
| `CHARACTERS/HEADS`  | 104   | 63 – 86        | 144            |
| `CHARACTERS/BODIES` | 88    | 28 – 57        | 0              |
| `CHARACTERS/HANDS`  | 12    | 22             | 12             |

All 204 agree on the exporter's node order. 116 have gaps in their bone numbering, and 156 bone
directories are detached.

| | Count |
| --- | --- |
| Bones | 9,456, `Index` matching directory position in all of them |
| Constraint records | 9,096, `Sphere` and `Loose` only |
| Meshes | 1,220 |
| — carrying `UV1` | 618 |
| Face groups | 4,184, **all `Tristrip_indices`** |
| Skinned points | 378,667 |
| `Exporter Version` values | 4, all build dates between June and November 2002 |

Influences per point never exceed four: 239,931 at one bone, 117,626 at two, 20,261 at three, 849 at
four. None has zero, and weights sum to one to `1.08e-7` at worst.

378,667 points are declared and 378,318 are reached. The 349 difference is points no `Point_indices`
entry names, spread over 134 of the 1,220 meshes. The declared count is `Points` divided by three,
which is what `Point_bone_first` is parallel to.

**Elements and triangles.** The 1,220 meshes hold 855,377 `Point_indices` entries, peaking at 8,667
in one mesh, so a renderer welding one vertex per element stays inside a `uint16` index. Unrolled,
the strips give 547,731 triangles, and 996,073 further strip entries are degenerate — the exporter
stitches short runs together with repeated indices, spending 1,014 entries on 204 triangles in the
smallest hand mesh. A reader that does not skip them draws zero-area triangles across the model.

**Winding.** Unrolled with the strip's own parity — `(i, i+1, i+2)` on even `i`, `(i+1, i, i+2)` on
odd, degenerates skipped without disturbing it — the face normal under a right-handed cross product
agrees with the stored vertex normals 542,903 times against 4,828, none zero-area. Same convention
as the rigid meshes; the opposite parity gives exactly the mirrored count.

**The UV bone** appears on `Mesh0` of all 104 heads. Scales are ±0.4, clamps ±0.2 in U and ±0.1035
in V, `UV_plane_distance` always 1. `UV_vertex_count` agrees with `UV_vertex_id` in all 104;
`Face_groups/Count` agrees with the group directories in all 1,220.

**Level fractions** come in two sets: `1, 0.8, 0.6, 0.4, 0.2, 0.1` for the 202 six-level models and
`1, 0.8, 0.6, 0.2` for the two four-level ones.

**`Lod Bits`** is `0x3f` on 8,436 bones, `0x0f` on the 44 belonging to the four-level models, and 0
on 976. 2,237 bones with every bit set appear in no `Bone_id_chain`.

**`Edge_angles`** occur in exactly two files — `br_female_elite_body.dfm` and
`br_female_guard_body.dfm` — on 36 face groups. Librelancer's face group parser does not read them.

**Skeleton names**: `Head02.cmp` for every head, `AutoHeaderNode.cmp` for every body, `L Palm.cmp`
and `R Palm.cmp` for the hands, plus `torture_root.cmp` on one test asset.

### Round-trip

All 204 models write back byte for byte, and writing is a fixed point — with one exception belonging
to the compound layer: every retail constraint record leaves stack residue past its name
terminators, which `writeConstraints` zero-fills. See
[COMPOUND.md](COMPOUND.md#constraints-round-trip-by-value-not-byte-for-byte).

Constraint file names are written capitalized, the spelling all 1,024 retail `Cons` files use.
Lookups fold case, so the engine reads either.

## TODO

### Does anything read `Edge_angles`?

Two files carry them on 36 face groups; nothing is known to read them, and the other 202 models do
without.

The experiment is subtractive. Both files write back byte for byte, so deleting the two files from
one group and loading the character says whether the engine wants them: if it is a simplifier
artefact nothing changes; if the engine uses them for LOD collapse or for smoothing normals across
the crease, that group looks different at distance or under a moving light. Doing it on the elite
and leaving the guard intact keeps a control.

If nothing reads them they stay carried anyway — round-trip fidelity is the reason they are here.

### The four-level models

`Fractions` runs six entries on 202 models and four on two. What distance each fraction stands for
comes from the INI that places the character, so how the engine maps a four-entry set onto the same
distance bands is not derivable here. It wants watching a four-level character switch levels as the
camera pulls back.

## References

- [Librelancer `src/LibreLancer/Utf/Dfm`](https://github.com/Librelancer/Librelancer/tree/main/src/LibreLancer/Utf/Dfm)
