# Rigid

Freelancer's rigid models — the `.3db` (single part), `.cmp` (compound) and `.sph` (procedural
sphere) UTF trees. A model is either a **single part** or a **compound**: a hierarchy of named parts,
each in its own UTF fragment directory, connected to its parent by a joint.

Two layers below this one do the shared work. The hierarchy — `Cmpnd`, `Cons`, joints and hardpoints
— is [COMPOUND.md](COMPOUND.md), which `.dfm` characters use unchanged; geometry delegates to
[VMESH.md](VMESH.md). What this module adds is the rigid fragment: what a part contains, the two part
kinds that contain no geometry at all, and the material UV animation that sits beside the hierarchy.
Export names are in [API.md](API.md#rigid).

## Architecture

```
Compound model (.cmp)
  Cmpnd (UTF directory)
    ├─ Root          ── Object name, Index, File name
    ├─ Part_<name>   ── Object name, Index, File name
    └─ Cons          ── Fix / Rev / Pris / Cyl / Sphere / Loose constraint files
  <File name> (one fragment directory per part, sibling of Cmpnd)
    ├─ MultiLevel | VMeshPart
    └─ Hardpoints
         ├─ Fixed/<name>    ── Position, Orientation
         └─ Revolute/<name> ── Position, Orientation, Axis, Min, Max

Single-part model (.3db)
  <root> (UTF directory)
    ├─ MultiLevel | VMeshPart
    └─ Hardpoints

Sphere model (.sph)
  <root> (UTF directory)
    └─ Sphere
         ├─ M0..M5 ── material name per cube face
         ├─ M6     ── atmosphere material name (optional)
         ├─ Radius (float32)
         └─ Sides  (int32, number of M entries)
```

`MaterialAnim` is a **root-level sibling of `Cmpnd`**, never nested inside a part fragment, so it is
not part of `RigidModel` and is read from a file root the way `readVMeshLibrary` and
`readAnimationLibrary` are.

## Parts

```ts
type MeshSource = MultiLevel | VMeshPart  // one reference, or a switch over several

interface Rigid {
  type: 'rigid'
  hardpoints: Hardpoint[]
  part?: MeshSource
  wireframe?: VMeshWire // optional edge overlay drawn over the geometry
}

type RigidPart = Rigid | Camera | Sphere
type RigidModel = Model<RigidPart> | RigidPart
```

A `RigidModel` is either a compound tree of rigid parts or a single bare part, which is why
`readRigidModel` dispatches on `isCompoundModel`. Within a compound, a part directory is dispatched by
what it holds: a `Camera` directory makes it a camera, a `Sphere` directory a sphere, otherwise it is
read as geometry plus hardpoints plus any `VMeshWire`.

### Cameras

```ts
interface Camera {
  type: 'camera'
  fovX: number
  fovY: number
  zNear: number
  zFar: number
}
```

A camera part is a compound fragment holding nothing but a `Camera` directory — no geometry, no
hardpoints. Its place in the model comes from the constraint attaching it to the part it is mounted
on.

```
<fragment>.cam/
  Camera/
    Fovx    float32
    Fovy    float32
    Znear   float32
    Zfar    float32
```

**`Fovx` and `Fovy` are half-angles in radians**, so the aspect ratio is `tan(fovX) / tan(fovY)`.
Reading them as full angles gives no sensible aspect.

### Procedural spheres

Planets and stars ship as `.sph` files, which carry **no geometry at all**. The game tessellates a
sphere at load time and skins it with one material per cube face, so the document is a `Sphere`
directory of material names, a radius and a count — plus, like any other part, the hardpoints
mounted on it.

```ts
interface Sphere {
  type: 'sphere'
  hardpoints: Hardpoint[] // from a Hardpoints directory beside Sphere, as a .3db part has
  sides: string[]         // material name per side, in M0..M6 order
  radius: number          // float32
}
```

| Entry      | Type    | Notes                                                          |
| ---------- | ------- | -------------------------------------------------------------- |
| `M0`..`M3` | ASCIIZ  | The four equatorial faces                                      |
| `M4`, `M5` | ASCIIZ  | The polar caps                                                 |
| `M6`       | ASCIIZ  | Atmosphere shell, drawn around the body; absent on some models |
| `Radius`   | float32 |                                                                |
| `Sides`    | int32   | Number of `M` entries; 1 to 7                                  |

`Sides` is the authority on how many materials to read, and `writeSphere` derives it from
`sides.length` rather than carrying it.

**`Hardpoints` is a sibling of `Sphere`, not a child of it**, exactly where `readRigid` looks for a
`.3db` part's. So `readSphere` and `writeSphere` both work on the **part** directory rather than on
`Sphere` — `writeSphere` returns the part directory the way `writeRigid` does, and a caller wanting
just the `Sphere` node takes it from there. `writeCamera` is the one that still returns its inner
directory, and that asymmetry is deliberate: nothing mounts to a camera.

> **Unhandled siblings.** Like `writeRigid`, `writeSphere` builds a fresh directory and does not carry
> unrecognised siblings across — which `sun.sph`, the one sphere with root-level `Texture Library` and
> `Material Library` directories, is now the only case of.

## Material UV animation

Animates a material's UV transform over time. Each subdirectory under `MaterialAnim` is named after
the material it drives and holds three or four files. No `.dfm` carries one, which is why this belongs
here rather than in the compound layer.

```ts
interface MaterialAnim {
  name: string                   // material name, from the directory
  flags: number                  // MAFlags; purpose unknown
  keyframes: MaterialKeyframe[]  // time + the four velocities
  keys: MaterialKey[]            // one fewer than keyframes
}
```

| Entry      | Type      | Notes                                                            |
| ---------- | --------- | ---------------------------------------------------------------- |
| `MACount`  | uint32    | Number of `MADeltas` keyframes                                   |
| `MADeltas` | float32[] | `MACount × 5` floats                                             |
| `MAKeys`   | float32[] | `(MACount − 1) × 4` floats; omitted entirely when `MACount` is 1 |
| `MAFlags`  | uint32    | Animation flags — see [TODO](#todo)                              |

Each `MADeltas` keyframe is `time`, `uOffsetSpeed`, `vOffsetSpeed`, `uScaleSpeed`, `vScaleSpeed`.
Each `MAKeys` keyframe is `uOffset`, `vOffset`, `uScale`, `vScale`. There is one fewer key than delta,
the first being implicit; retail omits the `MAKeys` file outright rather than writing it empty
whenever that leaves none. Layout per [the Starport wiki](https://the-starport.com/wiki/file-structures/utf/mat),
corroborated against the corpus.

> **`time` is a duration, not a timestamp.** The wiki calls it "keyframe time", which reads as
> absolute; the corpus says otherwise — see [Corpus](#material-animation).

**`MAKeys` is not `MADeltas` integrated, and a reader must not derive it.** The obvious guess is that
each key is its predecessor advanced by a segment's velocity over that segment's duration, which
would make the file a cache. No fixed alignment between the two survives the corpus, so both are read
and neither is derived.

---

## Nodes this module does not read

A census over all 1,852 retail `.cmp` and `.3db` files turns up 550 distinct node paths. Everything a
renderer needs is covered, `MaterialAnim` included; what follows is everything left over, so it does
not have to be rediscovered. Material and texture libraries are excluded — they are a separate job.

| Node                  | Files                   | What it is                                                                                                                                                                                          |
| --------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Exporter Version`    | 511 root, 1,341 fragment | Exporter build timestamp string, 35 distinct values from `Dec 15 1999` to `Nov 5 2002`                                                                                                              |
| `Extent tree`         | 14                      | Exporter bounding-volume hierarchy: `Sphere`/`Tube`/`Cylinder`/`Box` nesting through `Children`, bottoming out in a `Convex mesh` of vertex, edge, face and normal lists. Collision ships in `.sur` |
| `Mass properties`     | 5                       | `Mass` float32, `Center of mass` Vector3, `Inertia tensor` Matrix3 — real values, not placeholders                                                                                                  |
| `Rigid body`          | 4                       | Wrapper around `Mass properties` and `Extent tree`                                                                                                                                                  |
| `openFLAME 3D N-mesh` | 4                       | Conquest: Frontier Wars leftovers, neither supported nor used by Freelancer — see [RETAIL.md](RETAIL.md#openflame-leftovers)                                                                        |
| `Mesh`                | 1                       | `FX/MISC/tlrtube.3db` only. Freelancer's own, not openFLAME — see below                                                                                                                             |

`Extent tree`, `Mass properties` and `Rigid body` look like editor state the exporter failed to strip;
the game takes collision from `.sur` and mass from INI files.

### `FX/MISC/tlrtube.3db` is not an openFLAME leftover

It was grouped with the four `openFLAME 3D N-mesh` files for a long time, on the strength of being
pre-VMesh. It is not one of them, and the evidence runs three ways.

**Its vocabulary is Freelancer's.** The root `Mesh` tree is the deformable one —
`Face_groups/Group0/{Material_name, Face_indices, Edge_indices, Edge_angles}` over
`Geometry/{Point_indices, Points, Vertex_normals, UV0_indices, UV0}` — with no bone files, since
nothing skins it, and `Face_indices` in place of `Tristrip_indices`, a form `readFaceGroup` already
supports. Not one openFLAME marker name appears in it, and its material and texture libraries are
ordinary ones.

**The engine's own configuration names its material.** `EXE/dacom.ini` carries a hand-written
`[MaterialMap]` rule, `name = ^tlr_energy$ = NebulaTwo`, and `tlr_energy` — the sole material in this
file — occurs nowhere else in the retail install. No openFLAME asset gets that treatment.

**What it is residue of is `FxMeshAppearance`.** `FX/MISC/gf_tlr_tube.ale` holds one, naming this
model by `MeshApp_MeshName = TLRtube`, and `FX/MISC/misc_ale.ini` registers the effect as a
`[VisEffect]`. The node type never worked: Freelancer crashes when a particle spawns for that
appearance. The chain is broken at both ends anyway — no `[Effect]` entry names the `gf_TLR_tube`
`[VisEffect]`, and the only other retail `.ale` using the node type (`intro_volcanoplanet.ale`) names
`[Asteroid]` nicknames from `SOLAR/asteroidarch.ini`, so the property takes an INI nickname rather
than a mesh library name.

So it is an unmodelled **Freelancer** structure for an unfinished **Freelancer** feature. It stays
unread not because another engine authored it, but because there is no working in-game behaviour to
validate a reader against.

---

## Corpus

| | Count |
| --- | --- |
| `.cmp` and `.3db` files | 1,852 |
| Distinct node paths across them | 550 |
| Cameras | 17, all 4:3 |
| `MaterialAnim` entries | 82 |

**Cameras.** All 17 come out at 4:3 when `Fovx`/`Fovy` are read as half-angles. The common cockpit
value is `0.6457718` × `0.5144120`, a 74° × 59° field of view. They appear only in the 16 cockpit
models and in `BASES/LIBERTY/li_01_manhattan_cityscape_nosigns.cmp`.

**Spheres.** `Sides` always agrees with the number of `M` files present: 7 for planets with an
atmosphere, 6 for `planet_neutron_800.sph`, and 1 for `sun.sph`. Material names are NUL-terminated
everywhere except `sun.sph`, whose `M0` is exactly the four bytes `none`; the reader treats the
terminator as optional and the writer always emits one, so that single file grows by one byte on
rewrite.

**No retail sphere carries a hardpoint — 0 of 86**, and 85 of the 86 have a bare `Sphere`-only root
(`sun.sph` is the one that adds anything). So `Sphere.hardpoints` is not read off the corpus, which
is silent on it: a sphere placed in a system is an object like any other and its loadout addresses
hardpoints by name, which is an observation in the running game. The corpus suite asserts the zero
rather than ignoring it, so a reader that started inventing hardpoints would be caught.

### Material animation

Retail files re-serialise byte for byte. `MACount` is 1 in most of the 82 entries and reaches 340;
`MAFlags` is `2` in 78 and `0` in the other four. The `MAKeys` file is omitted whenever `MACount` is
1, in all 82.

**`time` is a duration.** Only 5 of the 16 multi-keyframe entries are ascending and none start at
zero, so it is the length of its own segment.
`BASES/RHEINLAND/rh_01_bizmark_cityscape.cmp` alternates `3.3333` and `0.0667`: a banner that holds a
frame for 3.3 seconds, then flips in two frames at 30fps.

**`MAKeys` is not derivable.** Key differences and segment displacements (`speed × time`) are drawn
from the same handful of magnitudes, so the two files clearly describe one motion — but no fixed
alignment survives. Of the seven entries with more than one key:

| Alignment                               | Entries                                                                       |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| `key[i] − key[i−1] = displacement[i]`   | `ocean_a_256` in `ocean_navy.cmp`                                             |
| `key[i] − key[i−1] = displacement[i+1]` | the Bizmark banner, `sign1.avi` in `ku_03_kyushu`, `watergreen`               |
| Neither                                 | `banner4_crop`, the 340-keyframe resort fountain, `monster` in `br_01_avalon` |

`br_01_avalon_cityscape.cmp`'s six-segment `monster` shows the problem plainly: its stored `vOffset`
keys run `0.1751, 0.3502, 0.1318, 0, 0` while the segment displacements are
`0, 0.3502, 0, −0.2185, −0.1318, 0`. The magnitudes line up — `0.2185 + 0.1318 = 0.3503` closes the
loop `0.3502` opened — but the first key is half the first displacement, and no shift accounts for
that. `corpus.test.ts` pins the counterexamples so a future attempt at deriving it has to confront
them.

`MAFlags` does not track `MACount`, the presence of `MAKeys`, or the containing file: the four `0`
entries span a one-keyframe rock material and the 340-keyframe fountain alike, and
`li_resort_waterscape.cmp` holds both values at once.

---

## TODO

### What `MAFlags` selects

A `uint32` on every `MaterialAnim` entry, `2` in 78 of the 82 and `0` in the other four. The value
round-trips untouched and nothing in this module reads it. Two settings across 82 entries is too
little to correlate against anything in the file, so the reading has to come from the game.

The four zero entries are the test: set each to `2`, and set a couple of the `2`s to `0`, and watch
the surface they drive. A looping banner that stops looping, an animation that stops playing, or a
scroll that reverses each names the bit directly. Until then `flags` stays a bare number rather than a
named enum.

### What the engine does with `MAKeys`

Both files are read and neither is derived. What is still unknown is which of them actually drives the
UV transform in game, and what the other contributes: whether `MAKeys` sets the absolute offset and
scale at each segment boundary with `MADeltas` interpolating between, or whether the velocities drive
continuously and the keys are a correction the engine snaps to.

`BASES/RHEINLAND/rh_01_bizmark_cityscape.cmp` is the readable subject — a banner that holds a frame
for 3.3 seconds and flips in 0.0667 — because a wrong reading there is visible as a mistimed flip
rather than a subtly wrong scroll rate. Zeroing `MADeltas` while leaving `MAKeys` intact, and then the
reverse, says which file the animation is coming from.

### `FX/MISC/tlrtube.3db`'s animated UV set

`UV0_anim`, `UV0_anim_lookup`, `UV0_frame_count`, `UV0_fps` and `UV0_interpolate` occur in no other
retail asset, and the layout is plain enough to guess at. It stays unread because the feature it
belongs to — `FxMeshAppearance` — crashes Freelancer when a particle spawns for it, so there is no
in-game behaviour to validate a reader against. **This one is blocked rather than pending**: it needs
the crash understood first, not an experiment designed.
