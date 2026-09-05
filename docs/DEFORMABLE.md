# Deformable

The `.dfm` files every character in the game is built from. A deformable model is one skinned mesh per
detail level, plus a tree of bones that poses it. Export names are in [API.md](API.md#deformable).

**A character is not one file.** The body, the head and each hand are separate models, each with its
own bones, mesh, materials and textures, joined at load time through the hardpoints of the bones their
skeletons share — which is why so many models have gaps in their bone numbering: the missing slots
belong to bones the host provides.

## Architecture

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

The node order above is the exporter's and it is uniform, down to the file order inside a geometry
directory and the `Object name`, `File name`, `Index` order inside a part. `writeDeformableModel`
reproduces it, minus `Exporter Version` and the two libraries, which belong to their own modules and
are the caller's to add.

`readDeformableModel(root)` takes the file root, the way `readVMeshLibrary` and `readTextures` do,
because the pieces are spread across it.

## The compound is the rigid one

`Cmpnd` and `Cons` are byte-for-byte the layout `.cmp` uses — the same
`Object name`/`File name`/`Index` triples, the same 64-byte name fields, the same joint records, read
here by the very same `readConstraints`. What differs is what a part names: in a `.cmp` it is a
fragment holding geometry, here it is a bone holding nothing but a bind pose.

Only two joint kinds occur: `Sphere` for a bone rotating in its socket, and `Loose` for the root,
which floats free. No `Fix`, `Rev` or `Pris` — a character's bones do not translate along a rail.

`getBoneModel` assembles the constraints into the same `Model<T>` tree a rigid compound reads into, so
`listTreeElements` and `getModelHardpoint` work on a skeleton unchanged.

### The chain is not the bind pose, and on bodies it is nowhere near it

Composing `T(position) · R(rotation)` down that tree gives each bone a world transform, and it is
tempting to read that as where the bone rests. **It is not the same thing as `Bone to root`**, and the
corpus splits cleanly on which:

| | Chain reproduces the bind pose |
| --- | --- |
| `CHARACTERS/HEADS` | 6,543 of 6,543 bones |
| `CHARACTERS/HANDS` | 252 of 252 bones |
| `CHARACTERS/BODIES` | **88 of 2,505** — the 88 roots, and nothing else |

For heads and hands the two agree exactly and the distinction never surfaces. For bodies the
constraint rest is a **genuinely different pose**: skinning a body's points through its own chain
displaces them by 0.828 on average and 4.556 at worst, and not rigidly — pairwise distances change by
up to 1.19 on a figure 1.6 tall, so it is a deformation and not a reorientation that some root
transform could undo. `br_bartender_body.dfm` shows it plainly: the mesh spans y −0.97..0.63 while
the chain lays the skeleton along z −0.10..1.23, a Max-style Z-up rig against a Y-up mesh.

The reading is that a body's `Cons` hierarchy is the *animation* rig — the frame an `.anm`'s joint
maps drive — while `Bone to root` carries the skin's own bind pose, and the skinning matrix
`pose · inverse(bindPose)` is what reconciles them. A consumer with no animation loaded therefore
poses each bone from its own `Bone to root` rather than by composing the chain. What the game shows
for a body between animations is not something this corpus can answer, since in play a character is
always running one.

## Bones are a table, not just a tree

`Bone_id_chain` skins each point to bone numbers, and those numbers are what `Index` states. **`Index`
equals the position of the bone's `.3db` directory among the root's children** — so
`DeformableModel.bones` is an ordered array and `Index` is derived from position on write rather than
carried. Reading a model whose two disagree throws, because a bone table indexed one way and skinned
another is not a model worth handing back.

That positional identity is also what makes the detached bones legible.

### Detached bones

Some bone directories have **no `Cmpnd` part at all** — named by no constraint, animated by no script,
and invisible to a reader that walks the compound. Every one of them carries exactly one fixed
hardpoint and nothing else, is named `Neck`, `UpperTorso`, `LCollarBone`, `RCollarBone`, `L Wrist` or
`R Wrist`, and occupies exactly one of the gaps the part numbering leaves.

They are the frame at which a head or a hand meets the body it attaches to. The bone belongs to the
host skeleton, which is why this model does not claim it as a part — but it still holds a slot in the
bone table, and `Bone_id_chain` still skins vertices to it. A head's crown really does follow the
body's neck. **Dropping them would silently unpick both the attachment and the skin**, so they are
carried as bones with no `name`.

## Geometry

Positions and texture coordinates are **indexed separately**. A drawn vertex is the pairing of
`Point_indices[i]` with `UV0_indices[i]`, so a UV seam splits the coordinate without splitting the
position — and the skinning weights, which hang off the position, are shared across the split. A face
group's own indices then address that element list, not the points.

Skinning weights are a shared pool sliced per point:

```
for (let i = boneFirst[p], end = i + boneCount[p]; i < end; i++)
  // boneIds[i] weighted by boneWeights[i]
```

`UV1_indices` and `UV1` come as a pair or not at all.

### The UV bone

Eleven further files appear on `Mesh0` of every head and nowhere else, always as the complete set. One
bone is named, its X and Y translation is scaled into a U and V delta, the delta is clamped to a
min/max pair, and the result offsets the coordinates `UV_vertex_id` lists — whose unshifted values
`UV_default_list` holds, two floats each.

That is how a face blinks and mouths words. The eye and mouth patches slide across a sprite sheet in
the diffuse texture while the head geometry stays where it is, driven by a bone that moves but is
never seen.

`UV_vertex_count` is derived from `UV_vertex_id` rather than carried, and `Face_groups/Count` from the
group directories the same way.

### Level fractions

`Fractions` holds one float per `Mesh`, and the counts match in every model, so the fraction is carried
on the `Level` rather than as a separate array — there is no way for the two to disagree. The distance
each fraction stands for comes from the INI that places the character, not from this file.

### Lod Bits

One byte per bone, one bit per level. **It is not a record of which levels reference the bone** —
bones with every bit set appear in no `Bone_id_chain` at all, and retail writes all bits or none, so
it reads as a permission rather than an index.

### Edge angles

Two files carry `Edge_indices` and `Edge_angles` on some of their face groups. The indices are
`uint16` pairs into `Points`, the angles one `float32` each, and within a group the angles run in
**descending order** — the shape a mesh simplifier leaves behind when it ranks edges by how sharp the
crease across them is. A handful come out slightly negative, as a signed dihedral measure would give
for a reflex edge.

Nothing is known to read them. They are carried because dropping them would silently shrink two files.

## Not modelled

- **`Face_indices`.** A face group may hold a plain triangle list instead of a strip; the reader and
  writer both handle it, but every retail group is a strip, so the branch has never been exercised
  against real data.
- **`Exporter Version`.** Read past, as it is for rigid models.
- **Materials and textures.** Ordinary siblings in the same container, owned by
  [MATERIAL.md](MATERIAL.md) and [TEXTURE.md](TEXTURE.md). Every face group's `Material_name` resolves
  inside its own file's library — a deformable model never reaches outside for one.
- **The `.anm` side.** A deformable model names its skeleton and the animation scripts live in that
  file. See [ANIMATION.md](ANIMATION.md).

---

## Corpus

Retail ships **204 models**, holding 9,456 bones and 1,220 meshes between them:

| Directory           | Files | Bones per file | Detached bones |
| ------------------- | ----- | -------------- | -------------- |
| `CHARACTERS/HEADS`  | 104   | 63 – 86        | 144            |
| `CHARACTERS/BODIES` | 88    | 28 – 57        | 0              |
| `CHARACTERS/HANDS`  | 12    | 22             | 12             |

**All 204 agree on the exporter's node order.** 116 of them have gaps in their bone numbering, and
**156 bone directories are detached** — no `Cmpnd` part, every one carrying a single fixed hardpoint
and one of the six shared-frame names.

| | Count |
| --- | --- |
| Bones | 9,456, `Index` matching directory position in all of them |
| Constraint records | 9,096, `Sphere` and `Loose` only |
| Meshes | 1,220 |
| — carrying `UV1` | 618 |
| Face groups | 4,184, **all `Tristrip_indices`** |
| Skinned points | 378,667 |
| `Exporter Version` values | 4, all build dates between June and November 2002 |

Influences per point never exceed four, which is what a fixed-function pipeline can blend: 239,931 at
one bone, 117,626 at two, 20,261 at three and 849 at four. **None has zero**, and the weights sum to
one to `1.08e-7` at worst, so nothing downstream has to renormalize or invent a fallback influence.

**378,667 points are declared and 378,318 are reached.** The 349 difference is points no
`Point_indices` entry names, spread over 134 of the 1,220 meshes — exporter residue that never becomes
a vertex. Both figures are right and they measure different things; the count above is the declared
one, `Points` divided by three, which is what `Point_bone_first` is parallel to.

**Elements and triangles.** The 1,220 meshes hold **855,377** `Point_indices` entries between them,
peaking at 8,667 in one mesh — so a renderer welding one vertex per element stays inside a `uint16`
index with room to spare. Unrolled, the strips give **547,731** triangles, and **996,073** further
strip entries are degenerate: the exporter stitches short runs together with repeated indices rather
than emitting one long strip, spending 1,014 entries on 204 triangles in the smallest hand mesh. A
reader that does not skip them draws zero-area triangles across the whole model.

**Winding.** Unrolled with the strip's own parity — `(i, i+1, i+2)` on even `i`, `(i+1, i, i+2)` on
odd, degenerates skipped without disturbing it — the face normal under a right-handed cross product
agrees with the stored vertex normals **542,903 times against 4,828**, with none zero-area. That is
the same convention the rigid meshes follow, and the opposite parity gives exactly the mirrored count.

**The UV bone** appears on `Mesh0` of all 104 heads. The scales are ±0.4 and the clamps ±0.2 in U and
±0.1035 in V across every head that has one, and `UV_plane_distance` is always 1. `UV_vertex_count`
agrees with `UV_vertex_id` in all 104; `Face_groups/Count` agrees with the group directories in all
1,220.

**Level fractions** come in two sets: `1, 0.8, 0.6, 0.4, 0.2, 0.1` for the 202 six-level models and
`1, 0.8, 0.6, 0.2` for the two four-level ones.

**`Lod Bits`** is `0x3f` on 8,436 bones, `0x0f` on the 44 belonging to the four-level models, and 0 on
976. 2,237 bones with every bit set appear in no `Bone_id_chain`.

**`Edge_angles`** occur in exactly two files — `br_female_elite_body.dfm` and
`br_female_guard_body.dfm` — on 36 face groups. The other 202 models do without them entirely, and
Librelancer's face group parser does not read them.

**Skeleton names**: `Head02.cmp` for every head, `AutoHeaderNode.cmp` for every body, `L Palm.cmp` and
`R Palm.cmp` for the hands, plus `torture_root.cmp` on one test asset.

### Round-trip

**All 204 models write back byte for byte, and writing is a fixed point** — with one exception, and it
is not this module's: every retail constraint record leaves stack residue past its name terminators,
which `writeConstraints` zero-fills. See [COMPOUND.md](COMPOUND.md#constraints-round-trip-by-value-not-byte-for-byte).

Constraint file names are written capitalized because that is the spelling all 1,024 retail `Cons`
files use. Lookups fold case, so the engine reads either.

---

## TODO

### Does anything read `Edge_angles`?

Two files carry `Edge_indices` and `Edge_angles` on 36 face groups, the angles descending within a
group — the shape a mesh simplifier leaves behind. Nothing is known to read them, and the other 202
models do without them.

The experiment is subtractive. Both files write back byte for byte, so deleting the two files from one
group and loading the character says whether the engine wants them: if it is a simplifier artefact
nothing changes, and if the engine uses them for LOD collapse or for smoothing normals across the
crease, that group will look different at distance or under a moving light. Doing it on the elite and
leaving the guard intact keeps a control standing next to it.

If it turns out nothing reads them, they stay carried anyway — round-trip fidelity is the reason they
are here, not a belief that they matter.

### The four-level models

`Fractions` runs six entries on 202 models and four on two. What distance each fraction stands for
comes from the INI that places the character, not from the file, so how the engine maps a four-entry
set onto the same distance bands is not derivable here — it wants watching a four-level character
switch levels as the camera pulls back.

## References

- [Librelancer `src/LibreLancer/Utf/Dfm`](https://github.com/Librelancer/Librelancer/tree/main/src/LibreLancer/Utf/Dfm)
  — the reference implementation this was checked against.
