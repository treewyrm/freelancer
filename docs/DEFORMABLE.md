# Deformable

Reader and writer for Freelancer's deformable models — the `.dfm` files every character in the game
is built from. A deformable model is one skinned mesh per detail level, plus a tree of bones that
poses it. Retail ships **204 of them**, holding 9,456 bones and 1,220 meshes between them:

| Directory           | Files | Bones per file | Detached bones |
| ------------------- | ----- | -------------- | -------------- |
| `CHARACTERS/HEADS`  | 104   | 63 – 86        | 144            |
| `CHARACTERS/BODIES` | 88    | 28 – 57        | 0              |
| `CHARACTERS/HANDS`  | 12    | 22             | 12             |

A character is not one file. The body, the head and each hand are separate models, each with its
own bones, mesh, materials and textures, joined at load time through the hardpoints of the bones
their skeletons share. That is why 116 of the 204 have gaps in their bone numbering: the missing
slots belong to bones the host provides.

## Architecture

```
<file root>
  ├─ Exporter Version ────── string, the build date of the exporter (four distinct values)
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

The node order above is the exporter's, and it is uniform: **all 204 files agree on it**, down to
the file order inside a geometry directory and the `Object name`, `File name`, `Index` order inside
a part. `writeDeformableModel` reproduces it, minus `Exporter Version` and the two libraries, which
belong to their own modules and are the caller's to add.

`readDeformableModel(root)` takes the file root, the way `readVMeshLibrary` and `readTextures` do,
because the pieces are spread across it.

## The compound is the rigid one

`Cmpnd` and `Cons` are byte-for-byte the layout `.cmp` uses — the same `Object name`/`File name`/
`Index` triples, the same 64-byte name fields, the same joint records, read here by the very same
`readConstraints`. What differs is what a part names: in a `.cmp` it is a fragment holding geometry,
here it is a bone holding nothing but a bind pose.

Only two joint kinds occur across the 9,096 records: `Sphere` for a bone rotating in its socket, and
`Loose` for the root, which floats free. No `Fix`, `Rev` or `Pris` — a character's bones do not
translate along a rail.

`getBoneModel` assembles the constraints into the same `Model<T>` tree a rigid compound reads into,
so `listTreeElements` and `getModelHardpoint` work on a skeleton unchanged.

## Bones are a table, not just a tree

`Bone_id_chain` skins each point to bone numbers, and those numbers are what `Index` states. In all
204 files and all 9,456 bones, **`Index` equals the position of the bone's `.3db` directory among
the root's children** — so `DeformableModel.bones` is an ordered array and `Index` is derived from
position on write rather than carried. Reading a model whose two disagree throws, because a bone
table indexed one way and skinned another is not a model worth handing back.

That positional identity is also what makes the detached bones legible.

### Detached bones

**156 bone directories have no `Cmpnd` part at all** — they are named by no constraint, animated by
no script, and invisible to a reader that walks the compound. Every one of them:

- carries exactly one fixed hardpoint and nothing else,
- is named `Neck`, `UpperTorso`, `LCollarBone`, `RCollarBone`, `L Wrist` or `R Wrist`,
- occupies exactly one of the gaps the part numbering leaves.

They are the frame at which a head or a hand meets the body it attaches to. The bone belongs to the
host skeleton, which is why this model does not claim it as a part — but it still holds a slot in
the bone table, and `Bone_id_chain` still skins vertices to it. A head's crown really does follow
the body's neck. Dropping them would silently unpick both the attachment and the skin, so they are
carried as bones with no `name`.

## Geometry

Positions and texture coordinates are indexed separately. A drawn vertex is the pairing of
`Point_indices[i]` with `UV0_indices[i]`, so a UV seam splits the coordinate without splitting the
position — and the skinning weights, which hang off the position, are shared across the split. A
face group's own indices then address that element list, not the points.

Skinning weights are a shared pool sliced per point:

```
for (let i = boneFirst[p], end = i + boneCount[p]; i < end; i++)
  // boneIds[i] weighted by boneWeights[i]
```

Retail never exceeds four influences per point, which is what a fixed-function pipeline can blend.
The distribution across 378,667 points is 239,931 at one bone, 117,626 at two, 20,261 at three and
849 at four.

`UV1_indices` and `UV1` come as a pair or not at all — 618 of the 1,220 meshes have them.

### The UV bone

Eleven further files appear on `Mesh0` of **104 heads** and nowhere else, always as the complete
set. One bone is named, its X and Y translation is scaled into a U and V delta, the delta is clamped
to a min/max pair, and the result offsets the coordinates `UV_vertex_id` lists — whose unshifted
values `UV_default_list` holds, two floats each.

That is how a face blinks and mouths words. The eye and mouth patches slide across a sprite sheet in
the diffuse texture while the head geometry stays where it is, driven by a bone that moves but is
never seen. The scales are ±0.4 and the clamps ±0.2 in U and ±0.1035 in V across every head that has
one, and `UV_plane_distance` is always 1.

`UV_vertex_count` is derived from `UV_vertex_id` rather than carried, the two agreeing in all 104.
`Face_groups/Count` is derived from the group directories the same way, agreeing in all 1,220.

### Level fractions

`Fractions` holds one float per `Mesh`, and the counts match in every model, so the fraction is
carried on the `Level` rather than as a separate array — there is no way for the two to disagree.
Two sets occur: `1, 0.8, 0.6, 0.4, 0.2, 0.1` for the 202 six-level models and `1, 0.8, 0.6, 0.2` for
the two four-level ones. The distance each fraction stands for comes from the INI that places the
character, not from this file.

### Lod Bits

One byte per bone, one bit per level. It is **not** a record of which levels reference the bone:
2,237 bones with every bit set appear in no `Bone_id_chain` at all. Retail writes all bits or none —
`0x3f` on 8,436 bones, `0x0f` on the 44 belonging to the four-level models, and 0 on 976 — so it
reads as a permission rather than an index.

## Edge angles

Two files, `br_female_elite_body.dfm` and `br_female_guard_body.dfm`, carry `Edge_indices` and
`Edge_angles` on 36 of their face groups. The indices are `uint16` pairs into `Points`, the angles
one `float32` each, and within a group the angles run in **descending order** — the shape a mesh
simplifier leaves behind when it ranks edges by how sharp the crease across them is. A handful come
out slightly negative, as a signed dihedral measure would give for a reflex edge.

Nothing is known to read them. Librelancer's face group parser does not, and the other 202 files do
without them entirely. They are carried because dropping them would silently shrink two files.

## What does not round-trip

**All 204 models write back byte for byte, and writing is a fixed point** — with one exception, and
it is not this module's:

> **Every retail constraint record leaves stack residue past the terminator of its two 64-byte name
> fields**, usually a longer name written into the same buffer earlier: a `Loose` record naming
> `Head` still has `Head02` sitting at offset 24 of the field. This holds for all 9,096 records here
> and all 5,316 across the rigid models — not a handful of files, but every one. The names read out
> identically either way, since a field stops at its first NUL, and `writeConstraints` zero-fills.
>
> Librelancer works around it with a bare `for (int i = 22; i < 64; i++) buffer[i] = 0;` in
> `DfmConstructs.cs`, which is the same observation with the magic number left in.

Constraint file names are written capitalized — `Fix`, `Rev`, `Pris`, `Sphere`, `Loose`, and `Cyl`
after CFW's struct — because that is the spelling all 1,024 retail `Cons` files use. Lookups fold
case, so the engine reads either.

## Not modelled

- **`Face_indices`.** A face group may hold a plain triangle list instead of a strip; the reader and
  writer both handle it, but all 4,184 retail groups are strips, so the branch has never been
  exercised against real data.
- **`Exporter Version`.** Read past, as it is for rigid models. Four values occur, all build dates
  between June and November 2002.
- **Materials and textures.** Ordinary siblings in the same container, owned by
  [MATERIAL.md](MATERIAL.md) and [TEXTURE.md](TEXTURE.md). Every face group's `Material_name`
  resolves inside its own file's library — a deformable model never reaches outside for one.
- **The `.anm` side.** A deformable model names its skeleton (`Head02.cmp` for every head,
  `AutoHeaderNode.cmp` for every body, `L Palm.cmp` and `R Palm.cmp` for the hands, plus
  `torture_root.cmp` on one test asset) and the animation scripts live in that file. See
  [ANIMATION.md](ANIMATION.md).

## TODO

### Does anything read `Edge_angles`?

Two files carry `Edge_indices` and `Edge_angles` on 36 face groups, the angles descending within a
group — the shape a mesh simplifier leaves behind when it ranks edges by crease sharpness. Nothing
is known to read them: Librelancer's face group parser does not, and the other 202 models do without
them. They are carried only because dropping them would silently shrink two files.

The experiment is subtractive. `br_female_elite_body.dfm` and `br_female_guard_body.dfm` both write
back byte for byte, so deleting the two files from one group and loading the character says whether
the engine wants them: if it is a simplifier artefact nothing changes, and if the engine uses them
for LOD collapse or for smoothing normals across the crease, that group will look different at
distance or under a moving light. Doing it on the elite and leaving the guard intact keeps a control
standing next to it.

If it turns out nothing reads them, they stay carried anyway — round-trip fidelity is the reason
they are here, not a belief that they matter.

### The four-level models

`Fractions` runs `1, 0.8, 0.6, 0.4, 0.2, 0.1` on 202 models and `1, 0.8, 0.6, 0.2` on two. What
distance each fraction stands for comes from the INI that places the character, not from the file,
so how the engine maps a four-entry set onto the same distance bands is not derivable here — it
wants watching a four-level character switch levels as the camera pulls back.

## References

- [Librelancer `src/LibreLancer/Utf/Dfm`](https://github.com/Librelancer/Librelancer/tree/main/src/LibreLancer/Utf/Dfm)
  — the reference implementation this was checked against.
