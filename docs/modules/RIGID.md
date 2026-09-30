# Rigid

Rigid models — the `.3db` (single part), `.cmp` (compound) and `.sph` (procedural sphere) UTF trees.
A model is either a single part or a compound: a hierarchy of named parts, each in its own UTF
fragment directory, connected to its parent by a joint.

The hierarchy — `Cmpnd`, `Cons`, joints, hardpoints — is [COMPOUND.md](COMPOUND.md); geometry
delegates to [VMESH.md](VMESH.md). This module adds the rigid fragment: what a part contains, the
two part kinds with no geometry, and the material UV animation beside the hierarchy.

## Layout

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

`MaterialAnim` is a root-level sibling of `Cmpnd`, never nested inside a part fragment, so it is read
from a file root — not part of `RigidModel` — the way `readVMeshLibrary` and `readAnimationLibrary`
are.

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
type RigidModel = CompoundNode<RigidPart> | RigidPart
```

`readRigidModel` dispatches on `isCompound`. Within a compound, a part directory is dispatched
by what it holds: a `Camera` directory makes it a camera, a `Sphere` directory a sphere, otherwise
geometry plus hardpoints plus any `VMeshWire`.

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
hardpoints. Its place in the model comes from the constraint attaching it.

```
<fragment>.cam/
  Camera/
    Fovx    float32
    Fovy    float32
    Znear   float32
    Zfar    float32
```

`Fovx` and `Fovy` are half-angles in radians, so the aspect ratio is `tan(fovX) / tan(fovY)`.

### Procedural spheres

Planets and stars ship as `.sph` files carrying no geometry. The game tessellates a sphere at load
time and skins it with one material per cube face.

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

`Sides` is the authority on how many materials to read; `writeSphere` derives it from `sides.length`.

`Hardpoints` is a sibling of `Sphere`, not a child, exactly where `readRigid` looks for a `.3db`
part's. So `readSphere` and `writeSphere` both work on the part directory rather than on `Sphere`;
`writeSphere` returns the part directory the way `writeRigid` does. `writeCamera` returns its inner
directory instead, because nothing mounts to a camera.

Like `writeRigid`, `writeSphere` builds a fresh directory and does not carry unrecognised siblings
across — `sun.sph`, the one sphere with root-level `Texture Library` and `Material Library`
directories, is the only case.

## Material UV animation

Animates a material's UV transform over time. Each subdirectory under `MaterialAnim` is named after
the material it drives and holds three or four files. No `.dfm` carries one.

```ts
interface MaterialAnim {
  name: string                 // material name, from the directory
  flags: number                // MAFlags; the game never reads it
  segments: MaterialSegment[]  // one per MADeltas entry
}

interface MaterialSegment {
  duration: number             // from MADeltas
  start: MaterialTransform     // MAKeys[i − 1]; the implicit zeros on the first segment
  velocity: MaterialTransform  // the four rates from MADeltas, per second
}

interface MaterialTransform {
  uOffset: number
  vOffset: number
  uScale: number               // a displacement from 1
  vScale: number
}
```

| Entry      | Type      | Notes                                                            |
| ---------- | --------- | ---------------------------------------------------------------- |
| `MACount`  | uint32    | Number of `MADeltas` keyframes                                   |
| `MADeltas` | float32[] | `MACount × 5` floats                                             |
| `MAKeys`   | float32[] | `(MACount − 1) × 4` floats; omitted entirely when `MACount` is 1 |
| `MAFlags`  | uint32    | Stored by the game and never read — see [below](#what-the-game-does-with-it) |

Each `MADeltas` entry is a duration and the four velocities, `uOffset`, `vOffset`, `uScale`,
`vScale`. Each `MAKeys` entry is a starting transform in the same order. There is one fewer key than
delta, the first being implicit; retail omits the `MAKeys` file outright rather than writing it
empty. Layout per [the Starport wiki](https://the-starport.com/wiki/file-structures/utf/mat),
corroborated against the corpus.

The model pairs them the way the game does ([below](#what-the-game-does-with-it)): one segment per
delta, starting at the key before it. So the two lists cannot fall out of step, and the writer only
has to refuse a first segment whose `start` is not zero, which the file has no room for.

`duration` is a duration, not a timestamp — see [Corpus](#material-animation).

`MAKeys` is not `MADeltas` integrated. See [What `MAKeys` is not](#what-makeys-is-not).

### What the game does with it

Read out of `shading.dll`, which loads the entries and evaluates them.

- **The keys are where each segment starts, and the deltas are rates within it.** Segment `i` starts
  at `MAKeys[i − 1]`, or at four zeros for `i = 0`, and each value is that plus its speed times the
  time elapsed in the segment (`0x6ec7330`). Nothing integrates across a boundary, so where a
  segment's velocities arrive and where the next key starts can differ — and the game jumps there.
- **The scales are displacements from 1.** The matrix the game builds is `u' = (1 + uScale) · u +
  uOffset` and `v' = (1 + vScale) · v + vOffset`, scaling about UV `(0, 0)` — offset *after* scale.
  It is applied to texture stage 0 as a two-coordinate texture transform.
- **Time is a duration, and the sequence always loops.** Each frame adds `dt` to the time elapsed in
  the current segment; while that is strictly past the segment's duration it is subtracted and the
  next segment begins, wrapping to the first past the last (`0x6ec72a0`). An instance starts at zero
  when its material is loaded, and every instance advances every frame.
- **`MAFlags` is never read.** The loader stores it beside the count (`0x6ec6a60`), and no code in any
  retail binary that reaches the animation library reads it back.

## Nodes this module does not read

A census over all 1,852 retail `.cmp` and `.3db` files turns up 550 distinct node paths. Everything
a renderer needs is covered, `MaterialAnim` included. Material and texture libraries are excluded.

| Node                  | Files                    | What it is                                                                                                                                                                                          |
| --------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Exporter Version`    | 511 root, 1,341 fragment | Exporter build timestamp string, 35 distinct values from `Dec 15 1999` to `Nov 5 2002`                                                                                                              |
| `Extent tree`         | 14                       | Exporter bounding-volume hierarchy: `Sphere`/`Tube`/`Cylinder`/`Box` nesting through `Children`, bottoming out in a `Convex mesh` of vertex, edge, face and normal lists. Collision ships in `.sur` |
| `Mass properties`     | 5                        | `Mass` float32, `Center of mass` Vector3, `Inertia tensor` Matrix3 — real values, not placeholders                                                                                                  |
| `Rigid body`          | 4                        | Wrapper around `Mass properties` and `Extent tree`                                                                                                                                                  |
| `openFLAME 3D N-mesh` | 4                        | Conquest: Frontier Wars leftovers, neither supported nor used by Freelancer — see [RETAIL.md](../refs/RETAIL.md#openflame-leftovers)                                                                |
| `Mesh`                | 1                        | `FX/MISC/tlrtube.3db` only. Freelancer's own, not openFLAME — see [Notes](#fxmisctlrtube3db-is-not-an-openflame-leftover)                                                                           |

`Extent tree`, `Mass properties` and `Rigid body` look like editor state the exporter failed to
strip; the game takes collision from `.sur` and mass from INI files.

## Notes

### What `MAKeys` is not

Each key is not its predecessor advanced by a segment's velocity over that segment's duration, which
would make the file a cache. No fixed alignment between the two survives the corpus, so both are
read and neither is derived. Counterexamples in [Corpus](#material-animation).

### `FX/MISC/tlrtube.3db` is not an openFLAME leftover

Its vocabulary is Freelancer's. The root `Mesh` tree is the deformable one —
`Face_groups/Group0/{Material_name, Face_indices, Edge_indices, Edge_angles}` over
`Geometry/{Point_indices, Points, Vertex_normals, UV0_indices, UV0}` — with no bone files and
`Face_indices` in place of `Tristrip_indices`, a form `readFaceGroup` already supports. No openFLAME
marker name appears in it, and its material and texture libraries are ordinary ones.

`EXE/dacom.ini` carries a hand-written `[MaterialMap]` rule, `name = ^tlr_energy$ = NebulaTwo`, and
`tlr_energy` — the sole material in this file — occurs nowhere else in the retail install.

It is residue of `FxMeshAppearance`. `FX/MISC/gf_tlr_tube.ale` holds one, naming this model
by `MeshApp_MeshName = TLRtube`, and `FX/MISC/misc_ale.ini` registers the effect as a `[VisEffect]`.
The node type never worked: Freelancer crashes when a particle spawns for that appearance. The chain
is broken at both ends — no `[Effect]` entry names the `gf_TLR_tube` `[VisEffect]`, and the only
other retail `.ale` using the node type (`intro_volcanoplanet.ale`) names `[Asteroid]` nicknames
from `SOLAR/asteroidarch.ini`, so the property takes an INI nickname rather than a mesh library
name.

It stays unread because there is no working in-game behaviour to validate a reader against.

## API

### `./rigid`

| Export                     | Kind      |                                                                                    |
| -------------------------- | --------- | ---------------------------------------------------------------------------------- |
| `Camera`                   | interface | Camera part of a compound model, used by cockpit models.                           |
| `getMaterialAnim`          | function  | Finds a material animation by name.                                                |
| `getMaterialAnimDuration`  | function  | Animation duration in seconds, the sum of its segment durations.                   |
| `isCamera`                 | function  | `(directory: Directory): boolean`                                                  |
| `isSphere`                 | function  | `(directory: Directory): boolean`                                                  |
| `MaterialAnim`             | interface | Animates the UV transform of a single material, named by the directory holding it. |
| `MaterialAnimLibrary`      | type      | `MaterialAnim[]`.                                                                  |
| `MaterialSegment`          | interface | One segment: `duration`, the `start` transform and its `velocity`.                 |
| `MaterialTransform`        | interface | A material's UV transform, or its rate of change per second.                       |
| `MeshSource`               | type      | What a rigid part hangs its geometry off: one reference, or a switch over several. |
| `readCamera`               | function  | `(parent: Directory): Camera`                                                      |
| `readMaterialAnim`         | function  | Reads a material animation from its directory.                                     |
| `readMaterialAnimLibrary`  | function  | Reads the material animation library from a file root directory.                   |
| `readRigidModel`           | function  | `(directory: Directory): RigidModel`                                               |
| `readSphere`               | function  | `(parent: Directory): Sphere`                                                      |
| `Rigid`                    | interface | `{ type: 'rigid', hardpoints, part?: MeshSource, wireframe?: VMeshWire }`.         |
| `RigidModel`               | type      | `CompoundNode<RigidPart> \| RigidPart` — a compound tree, or a lone part.          |
| `RigidPart`                | type      | `Rigid \| Camera \| Sphere`.                                                       |
| `Sphere`                   | interface | Procedural sphere model, used by `.sph` planet and star files.                     |
| `writeCamera`              | function  | `(camera: Camera): Directory`                                                      |
| `writeMaterialAnim`        | function  | Writes a material animation into a directory named after the material.             |
| `writeMaterialAnimLibrary` | function  | Writes a material animation library into a `MaterialAnim` directory.               |
| `writeRigidModel`          | function  | `(model: RigidModel): Directory`                                                   |
| `writeSphere`              | function  | `(sphere: Sphere): Directory`                                                      |

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
atmosphere, 6 for `planet_neutron_800.sph`, 1 for `sun.sph`. Material names are NUL-terminated
everywhere except `sun.sph`, whose `M0` is exactly the four bytes `none`; the reader treats the
terminator as optional and the writer always emits one, so that file grows by one byte on rewrite.

No retail sphere carries a hardpoint — 0 of 86 — and 85 of the 86 have a bare `Sphere`-only root.
`Sphere.hardpoints` is therefore not read off the corpus. The corpus suite asserts the zero rather
than ignoring it.

### Material animation

Retail files re-serialise byte for byte. `MACount` is 1 in most of the 82 entries and reaches 340;
`MAFlags` is `2` in 78 and `0` in the other four. The `MAKeys` file is omitted whenever `MACount` is
1, in all 82.

**`duration` is a duration.** Only 5 of the 16 multi-keyframe entries are ascending and none start
at zero. `BASES/RHEINLAND/rh_01_bizmark_cityscape.cmp` alternates `3.3333` and `0.0667`: a banner
that holds a frame for 3.3 seconds, then flips in two frames at 30fps.

**`MAKeys` is not derivable.** Key differences and segment displacements (`velocity × duration`) are
drawn from the same handful of magnitudes, but no fixed alignment survives. Of the seven entries
with more than one key:

| Alignment                               | Entries                                                                       |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| `key[i] − key[i−1] = displacement[i]`   | `ocean_a_256` in `ocean_navy.cmp`                                             |
| `key[i] − key[i−1] = displacement[i+1]` | the Bizmark banner, `sign1.avi` in `ku_03_kyushu`, `watergreen`               |
| Neither                                 | `banner4_crop`, the 340-keyframe resort fountain, `monster` in `br_01_avalon` |

`br_01_avalon_cityscape.cmp`'s six-segment `monster`: stored `vOffset` keys run
`0.1751, 0.3502, 0.1318, 0, 0` while the segment displacements are
`0, 0.3502, 0, −0.2185, −0.1318, 0`. The magnitudes line up — `0.2185 + 0.1318 = 0.3503` closes the
loop `0.3502` opened — but the first key is half the first displacement, and no shift accounts for
that. `corpus.test.ts` pins the counterexamples.

`MAFlags` does not track `MACount`, the presence of `MAKeys`, or the containing file: the four `0`
entries span a one-keyframe rock material and the 340-keyframe fountain alike, and
`li_resort_waterscape.cmp` holds both values at once.

## TODO

### `FX/MISC/tlrtube.3db`'s animated UV set

`UV0_anim`, `UV0_anim_lookup`, `UV0_frame_count`, `UV0_fps` and `UV0_interpolate` occur in no other
retail asset, and the layout is plain enough to guess at. It stays unread because
`FxMeshAppearance`, the feature it belongs to, crashes Freelancer when a particle spawns for it.
**Blocked rather than pending**: it needs the crash understood first, not an experiment designed.
