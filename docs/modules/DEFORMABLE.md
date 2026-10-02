# Deformable

A character's `.dfm` file holds one skinned mesh per detail level, plus a tree of bones that poses
it.

A character is not one file. Body, head and each hand are separate models, each with its own bones,
mesh, materials and textures, joined at load time through the hardpoint names their bones share —
see [COSTUME.md](../refs/COSTUME.md).

What the game does with a `.dfm` is read out of retail `EXE/deformable2.dll` (image base
`0x65f0000`, reached through the DACOM interface `IDeformable`, vtable `0x6601228`); addresses below
are that binary's. The animation side is `engbase.dll`'s — [ANIMATION.md](ANIMATION.md).

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

**The game goes by position and never reads `Index`.** `deformable2.dll` builds its bone table by
enumerating `*.3db` directories in file order (`0x65f1100`), takes the first as the root
(`0x65f14b1`), and binds each record to the engine's instance of that bone by a forward-only search in
the same order (`0x65f14f0`) — so the compound's parts must be instantiated in `.3db` order too, or
bones are skipped. The table holds 150 bones (`0x65f3898`) and nothing checks the bound.

**The cursor.** After binding, the index of the last bone a `Cmpnd` part claims, plus one, is what
bounds the hardpoint walk that joins a character, the pass that destroys unjoined bones, and skinning
(`0x65f5a52`, `0x65f3d0a`, `0x65f6d0e`). A detached bone listed after every compound bone is never
joined and never skinned — its slot keeps the identity. A writer must keep detached bones ahead of the
last compound bone; every retail file does.

### Detached bones

Some bone directories have no `Cmpnd` part: named by no constraint, animated by no script, invisible
to a reader that walks the compound. Every one carries exactly one fixed hardpoint and nothing else,
is named `Neck`, `UpperTorso`, `LCollarBone`, `RCollarBone`, `L Wrist` or `R Wrist`, and occupies
one of the gaps the part numbering leaves.

They are the frame at which a head or a hand meets the body it attaches to. The bone follows the
host skeleton, so this model does not claim it as a part, but it holds a slot in the bone table and
`Bone_id_chain` still skins vertices to it. They are carried as bones with no `name`. Dropping them
unpicks both the attachment and the skin.

**The hardpoint each one carries names the host hardpoint it seats on.** The game instantiates each
as a standalone bone (`0x65f1617`) and links it to whichever bone of the host carries the same name —
the same rule that places the whole head, with no name known to the binary. What that means for
assembling a character, and what happens to a seam the host does not seat, is
[COSTUME.md](../refs/COSTUME.md).

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

`UV1_indices` and `UV1` come as a pair or not at all. `deformable2.dll` reads neither — it builds its
vertex buffer from `UV0` alone — so a character draws with one coordinate set whatever the file holds.

### Skinning

Each bone record holds the engine's world transform for the bone, `W`, and its `Bone to root`, `B`,
**used as stored** — it is the inverse bind, and nothing inverts it. The skinning matrix is taken
relative to the part's root (`0x65f1030`), and the mesh is drawn with the root's world (`0x65f740d`):

```
K(bone) = W(root)⁻¹ · W(bone) · B(bone)        v(world) = W(root) · Σ w · K · v
```

`W` is always the engine's pose of the compound — the `Cons` chain plus whatever a script has set —
never the bind pose; see [The chain is not the bind pose](#the-chain-is-not-the-bind-pose).

How the influences of a point combine depends on how many it has (`0x65f6ed9`–`0x65f7031`):

| Influences | Position                                   | Normal                                  |
| ---------- | ------------------------------------------ | --------------------------------------- |
| 1          | `K · v` — **the weight is ignored**        | transformed, not renormalised           |
| 2 – 4      | `Σ w · K · v` — weights not normalised     | blended, then renormalised              |
| 5 or more  | `w₀ · K₀ · v` — only the first influence   | likewise                                |

**`Point_bone_first` is never read.** The loader zips `Bone_id_chain` with `Bone_weight_chain` and
slices each point's influences cumulatively from `Point_bone_count` (`0x65f8239`–`0x65f832a`); no
retail binary contains the name. A file whose first-indices skip or overlap draws differently in game
from what they say. Retail's never do, and its weights need none of the corrections above
([Corpus](#corpus)).

A level the caller marks unskinned (the create parameters' skinned-level count, `0x65f2793`) draws
every bone with the identity — rigidly, at bind.

### The UV bone

Eleven further files appear on `Mesh0` of every head and nowhere else, always as the complete set:
per UV bone, a bone, a plane distance, an X-to-U and a Y-to-V scale, and a min/max clamp on each
(`0x65f8480` loads them as one record each).

This is the eyes: **only face groups whose material is the `EyeMaterial` class** — the one
`deformable2.dll` registers for names matching `^eye*` (`0x65fdfbb`) — take it, and only the first UV
bone (`0x65f75ca`). It moves no coordinate. Each frame the bone's Z axis, expressed in its parent's
frame, becomes a **texture offset** for the whole group (`0x6600061`–`0x66001c0`):

```
d  = R(parent)ᵀ · Z(bone)                  (Z(bone) alone if the bone has no parent)
du = clamp(X_to_U · d.x · plane, Min_du, Max_du)
dv = clamp(Y_to_V · d.y · plane, Min_dv, Max_dv)
uv' = uv + (du, dv)                        skipped when |du| and |dv| are both ≤ 1e-4 before clamping
```

So an eye looks by sliding its texture as the eye bone turns, while the geometry stays put.
`UV_vertex_id` and `UV_default_list` are read by no retail binary, and `UV_vertex_count` is loaded and
unused. `UV_vertex_count` is derived from `UV_vertex_id` rather than carried, and `Face_groups/Count`
from the group directories the same way.

### Level fractions

`Fractions` holds one float per `Mesh`, and the counts match in every model, so the fraction is
carried on the `Level` rather than as a separate array.

`deformable2.dll` loads up to `min(#Fractions, 8, what the caller asks)` levels, taking `Mesh`
directories in the order it finds them rather than by the digit in their name (`0x65f39b4`–`0x65f3a2e`),
and hands each level's fraction back to the caller (`0x65f3b7c`). It chooses nothing: the caller passes
one level index per part on every update (`IDeformable +0x3c`, `0x65f3fd0`), and an index out of range
hides the part.

The caller is `Freelancer.exe`, and the distance a fraction stands for is the
`[DetailSwitchTable]` of the part's `bodyparts.ini` group ([SECTIONS.md](../refs/SECTIONS.md#detailswitchtable)):
`get_switch_distance(fraction × 100)` (`0x443dac`), interpolated linearly between the table's
`switch = percent, distance` rows and clamped at both ends (`common.dll` `0x62fec00`). Every frame the
camera's distance is scaled by `adjust_distance` — `tan(fov) / tan(fovx ÷ 2)` against the table's
`fovx`, 40 by default (`common.dll` `0x62fecb0`, called at `0x445072`) — and **each part independently**
takes the first level whose distance reaches it, or none (`0x444f90`–`0x445229`). The comm window pins
every part to level 0 (`0x4cc809`).

### Lod Bits

One byte per bone, one bit per level. Not a record of which levels reference the bone — bones with
every bit set appear in no `Bone_id_chain` at all, and retail writes all bits or none, so it reads
as a permission rather than an index. **No retail binary contains the name**, so the game never reads
it.

### Edge angles

Two files carry `Edge_indices` and `Edge_angles` on some face groups. Indices are `uint16` pairs
into `Points`, angles one `float32` each, descending within a group — the shape a mesh simplifier
leaves when it ranks edges by crease sharpness. A handful are slightly negative, as a signed
dihedral measure gives for a reflex edge.

`deformable2.dll`, which reads a `.dfm`'s mesh, never names them. They are carried because dropping
them shrinks two files. See [TODO](#todo).

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

A body's `Cons` hierarchy is the animation rig — the frame an `.anm`'s joint maps drive — while
`Bone to root` carries the skin's bind pose, and the skinning matrix reconciles them.

**The game always poses the chain.** Every bone's world comes from the engine's instance of the
`skel_<name>` compound built from `Cmpnd` and `Cons` (`0x65f1363`–`0x65f15f6`), and nothing in
`deformable2.dll` poses a bone from its bind. A body with no script running is drawn in its chain
pose, skin displaced as above; in game a character always has one. A consumer that wants the model as
it was skinned poses each bone from its own `Bone to root` instead — that is a choice of view, not
what the game draws.

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
four. None has zero, and weights sum to one to `1.08e-7` at worst — a lone influence included, so the
game ignoring its weight changes nothing. In all 1,220 meshes `Point_bone_first` is the running sum of
`Point_bone_count`, so the game's cumulative slicing reads every chain as the file states it. No
detached bone is listed after the last compound bone, and every root is a compound bone.

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

Two files carry them on 36 face groups, and the other 202 models do without. `deformable2.dll`, the
binary that reads a `.dfm`'s mesh, never names them. `rendcomp.dll` does — its `TriMesh` component
reads the same `Mesh`/`Geometry`/`Face_groups` layout, edges included — but nothing read so far routes
a character through `TriMesh`, so the question narrows to whether anything ever does.

The experiment is subtractive. Both files write back byte for byte, so deleting the two files from
one group and loading the character says whether the engine wants them: if it is a simplifier
artefact nothing changes; if the engine uses them for LOD collapse or for smoothing normals across
the crease, that group looks different at distance or under a moving light. Doing it on the elite
and leaving the guard intact keeps a control.

If nothing reads them they stay carried anyway — round-trip fidelity is the reason they are here.

*(Closed: how a four-entry `Fractions` set maps onto the distance bands. The game looks each level's
distance up by the fraction's **value**, not its position — `get_switch_distance(fraction × 100)` — so
the four-level models' `1, 0.8, 0.6, 0.2` take the same table rows as the six-level models' levels of
those fractions; see [Level fractions](#level-fractions).)*

## References

- [Librelancer `src/LibreLancer/Utf/Dfm`](https://github.com/Librelancer/Librelancer/tree/main/src/LibreLancer/Utf/Dfm)
