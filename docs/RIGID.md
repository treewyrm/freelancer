# Rigid

Reader and writer for Freelancer rigid models — the `.3db` (single part), `.cmp` (compound) and `.sph` (procedural sphere) UTF trees. A model is either a **single part** or a **compound**: a hierarchy of named parts, each stored in its own UTF fragment directory and connected to its parent by a joint.

Two layers below this one do the shared work. The hierarchy itself — `Cmpnd`, `Cons`, joints and hardpoints — lives in [COMPOUND.md](COMPOUND.md), which `.dfm` characters use unchanged. Geometry delegates to [VMESH.md](VMESH.md) (`VMeshPart` / `MultiLevel`). What this module adds is the rigid fragment: what a part contains, the two part kinds that contain no geometry at all, and the material UV animation that sits beside the hierarchy.

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

The `Cmpnd` subdirectories carry only names and fragment filenames; the hierarchy itself is reconstructed from the constraint list in `Cons`. See [COMPOUND.md](COMPOUND.md).

---

## `rigid.ts` — Rigid Models

### Types

```ts
interface Rigid {
  type: 'rigid'
  hardpoints: Hardpoint[]
  part?: MultiLevel | VMeshPart
  wireframe?: VMeshWire // optional edge overlay drawn over the geometry
}

type RigidPart = Rigid | Camera | Sphere
type RigidModel = Model<RigidPart> | RigidPart
```

A `RigidModel` is either a compound tree of rigid parts or a single bare part — which is why `readRigidModel` dispatches on `isCompoundModel`.

### Functions

| Function                    | Description                                                                                    |
| --------------------------- | ---------------------------------------------------------------------------------------------- |
| `readRigidModel(directory)` | Reads a `.cmp` compound or a `.3db` single part, whichever is present                          |
| `writeRigidModel(model)`    | Serializes either form back into a `Directory`                                                 |
| `readRigid(parent)`         | Reads hardpoints, `MultiLevel` (preferred) or `VMeshPart`, plus any `VMeshWire`                |
| `writeRigid(rigid)`         | Writes geometry and, when present, `Hardpoints` and `VMeshWire`                                |
| `readPart(directory)`       | Dispatches to `readCamera` or `readSphere` when the directory looks like one, else `readRigid` |
| `writePart(part)`           | Dispatches by `part.type`                                                                      |

---

## `camera.ts` — Cameras

```ts
interface Camera {
  type: 'camera'
  fovX: number
  fovY: number
  zNear: number
  zFar: number
}
```

A camera part is a compound fragment holding nothing but a `Camera` directory — no geometry, no hardpoints. Its place in the model comes from the constraint attaching it to the part it is mounted on. `isCamera(directory)` detects one by that directory.

```
<fragment>.cam/
  Camera/
    Fovx    float32
    Fovy    float32
    Znear   float32
    Zfar    float32
```

`Fovx` and `Fovy` are **half-angles in radians**, so the aspect ratio is `tan(fovX) / tan(fovY)`. All 17 cameras in retail data come out at 4:3 that way; reading them as full angles gives no sensible aspect. The common cockpit value is `0.6457718` × `0.5144120`, a 74° × 59° field of view.

Retail cameras only ever appear in the 16 cockpit models and in `BASES/LIBERTY/li_01_manhattan_cityscape_nosigns.cmp`.

---

## `sphere.ts` — Procedural Spheres

Planets and stars ship as `.sph` files, which carry **no geometry at all**. The game tessellates a sphere at load time and skins it with one material per cube face, so the whole document is a single `Sphere` directory of material names, a radius, and a count.

```ts
interface Sphere {
  type: 'sphere'
  sides: string[] // material name per side, in M0..M6 order
  radius: number // float32
}
```

`isSphere(directory)` detects a sphere document by the presence of a `Sphere` directory.

### Binary layout (`Sphere` UTF directory)

| Entry      | Type    | Notes                                                          |
| ---------- | ------- | -------------------------------------------------------------- |
| `M0`..`M3` | ASCIIZ  | The four equatorial faces                                      |
| `M4`, `M5` | ASCIIZ  | The polar caps                                                 |
| `M6`       | ASCIIZ  | Atmosphere shell, drawn around the body; absent on some models |
| `Radius`   | float32 |                                                                |
| `Sides`    | int32   | Number of `M` entries; 1 to 7                                  |

`Sides` is the authority on how many materials to read, and `writeSphere` derives it from `sides.length`. Across the retail data it always agrees with the number of `M` files present: 7 for planets with an atmosphere, 6 for `planet_neutron_800.sph`, and 1 for `sun.sph`.

> **Unterminated names:** material names are NUL-terminated everywhere except `sun.sph`, whose `M0` is exactly the four bytes `none`. The reader treats the terminator as optional; the writer always emits one, so that single file grows by one byte on rewrite.

> **Unhandled siblings:** `sun.sph` also carries root-level `Texture Library` and `Material Library` directories. Like `writeRigid`, `writeSphere` builds a fresh directory and does not carry unrecognised siblings across.

### Functions

| Function              | Description                                                             |
| --------------------- | ----------------------------------------------------------------------- |
| `isSphere(directory)` | True when the directory holds a `Sphere` child                          |
| `readSphere(parent)`  | Reads the `Sphere` directory; throws when it or a listed `M` is missing |
| `writeSphere(sphere)` | Writes a `Sphere` directory, deriving `Sides` from `sides.length`       |

---

## `materialanim.ts` — Material UV Animation

Animates a material's UV transform over time. `MaterialAnim` is a root-level sibling of `Cmpnd`, never nested inside a part fragment, so `readMaterialAnimLibrary(root)` takes a file root the way `readVMeshLibrary` and `readAnimationLibrary` do — it is not part of `RigidModel`. No `.dfm` carries one, which is why it belongs here rather than in the compound layer.

```ts
interface MaterialAnim {
  name: string // material name, from the directory
  flags: number // MAFlags; purpose unknown
  keyframes: MaterialKeyframe[] // time + the four velocities
  keys: MaterialKey[] // one fewer than keyframes
}
```

| Function                           | Description                                                       |
| ---------------------------------- | ----------------------------------------------------------------- |
| `readMaterialAnimLibrary(parent)`  | Reads every animation under `MaterialAnim`; `[]` when absent      |
| `writeMaterialAnimLibrary(values)` | Builds a `MaterialAnim` directory                                 |
| `readMaterialAnim(parent)`         | Reads one animation from its material-named directory             |
| `writeMaterialAnim(anim)`          | Writes `MACount`, `MAFlags`, `MADeltas`, `MAKeys` in retail order |
| `getMaterialAnim(library, name)`   | Finds an animation by name or CRC                                 |
| `getMaterialAnimDuration(anim)`    | Sum of the segment durations, in seconds                          |

Retail files re-serialise byte for byte. Each subdirectory is named after the material it drives and holds three or four files. Layout per [the Starport wiki](https://the-starport.com/wiki/file-structures/utf/mat), corroborated against the corpus below.

| Entry      | Type      | Notes                                                            |
| ---------- | --------- | ---------------------------------------------------------------- |
| `MACount`  | uint32    | Number of `MADeltas` keyframes; 1 in most files, up to 340       |
| `MADeltas` | float32[] | `MACount × 5` floats                                             |
| `MAKeys`   | float32[] | `(MACount − 1) × 4` floats; omitted entirely when `MACount` is 1 |
| `MAFlags`  | uint32    | Animation flags. `2` in 78 of 82 entries, `0` in the other 4     |

Each `MADeltas` keyframe is `time`, `uOffsetSpeed`, `vOffsetSpeed`, `uScaleSpeed`, `vScaleSpeed`. Each `MAKeys` keyframe is `uOffset`, `vOffset`, `uScale`, `vScale`. There is one fewer key than delta, the first being implicit; retail omits the `MAKeys` file outright rather than writing it empty whenever that leaves none, which holds for all 82 entries.

> **`time` is a duration, not a timestamp.** The wiki calls it "keyframe time", which reads as absolute, but only 5 of the 16 multi-keyframe entries are ascending and none start at zero — so it is the length of its own segment. `BASES/RHEINLAND/rh_01_bizmark_cityscape.cmp` alternates `3.3333` and `0.0667`: a banner that holds a frame for 3.3 seconds, then flips in two frames at 30fps.

### What `MAKeys` is not

The obvious guess is that `MAKeys` is `MADeltas` integrated — each key its predecessor advanced by a segment's velocity over that segment's duration — which would make it a cache. **It is not, and a reader must not derive it.**

Key differences and segment displacements (`speed × time`) are drawn from the same handful of magnitudes, so the two files clearly describe one motion. But no fixed alignment between them survives the corpus. Of the seven entries with more than one key:

| Alignment                               | Entries                                                                       |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| `key[i] − key[i−1] = displacement[i]`   | `ocean_a_256` in `ocean_navy.cmp`                                             |
| `key[i] − key[i−1] = displacement[i+1]` | the Bizmark banner, `sign1.avi` in `ku_03_kyushu`, `watergreen`               |
| Neither                                 | `banner4_crop`, the 340-keyframe resort fountain, `monster` in `br_01_avalon` |

`br_01_avalon_cityscape.cmp`'s six-segment `monster` shows the problem plainly: its stored `vOffset` keys run `0.1751, 0.3502, 0.1318, 0, 0` while the segment displacements are `0, 0.3502, 0, −0.2185, −0.1318, 0`. The magnitudes line up — `0.2185 + 0.1318 = 0.3503` closes the loop that `0.3502` opened — but the first key is half the first displacement, and no shift accounts for that.

So `MAKeys` is stored, not computed. `src/rigid/corpus.test.ts` pins the counterexamples down so a future attempt at deriving it has to confront them.

`MAFlags` is the other unexplained field. It does not track `MACount`, the presence of `MAKeys`, or the containing file: the four `0` entries span a one-keyframe rock material and the 340-keyframe fountain alike, and `li_resort_waterscape.cmp` holds both values at once.

---

## `index.ts` — Public API

```ts
import {
  type Camera,
  type Rigid,
  type RigidModel,
  type RigidPart,
  type Sphere,
  isCamera,
  isSphere,
  readCamera,
  readRigidModel,
  readSphere,
  writeCamera,
  writeRigidModel,
  writeSphere,
} from '@treewyrm/utf2json/rigid'
```

The hierarchy a compound model reads into — `Model`, `getModelHardpoint`, `Hardpoint`, `Joint`, `Constraint` — comes from `@treewyrm/utf2json/compound`.

---

## Nodes this module does not read

A census over all 1852 retail `.cmp` and `.3db` files turns up 550 distinct node paths. Everything the renderer needs is covered, `MaterialAnim` included; what follows is everything left over, so it does not have to be rediscovered. Material and texture libraries are excluded — they are a separate job.

| Node                  | Files                   | What it is                                                                                                                                                                                          |
| --------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Exporter Version`    | 511 root, 1341 fragment | Exporter build timestamp string, 35 distinct values from `Dec 15 1999` to `Nov 5 2002`                                                                                                              |
| `Extent tree`         | 14                      | Exporter bounding-volume hierarchy: `Sphere`/`Tube`/`Cylinder`/`Box` nesting through `Children`, bottoming out in a `Convex mesh` of vertex, edge, face and normal lists. Collision ships in `.sur` |
| `Mass properties`     | 5                       | `Mass` float32, `Center of mass` Vector3, `Inertia tensor` Matrix3 — real values, not placeholders                                                                                                  |
| `Rigid body`          | 4                       | Wrapper around `Mass properties` and `Extent tree`                                                                                                                                                  |
| `openFLAME 3D N-mesh` | 4                       | Conquest: Frontier Wars leftovers, neither supported nor used by Freelancer — see [VMESH.md](VMESH.md)                                                                                              |
| `Mesh`                | 1                       | `FX/MISC/tlrtube.3db` only. Freelancer's own, not openFLAME: residue of `FxMeshAppearance`, an unfinished feature — see below                                                                       |

`Extent tree`, `Mass properties` and `Rigid body` look like editor state the exporter failed to strip; the game takes collision from `.sur` and mass from INI files.

### `FX/MISC/tlrtube.3db` is not an openFLAME leftover

It was grouped with the four `openFLAME 3D N-mesh` files here for a long time, on the strength of being pre-VMesh. It is not one of them, and the evidence runs three ways.

**Its vocabulary is Freelancer's.** The root `Mesh` tree is the deformable one — `Face_groups/Group0/{Material_name, Face_indices, Edge_indices, Edge_angles}` over `Geometry/{Point_indices, Points, Vertex_normals, UV0_indices, UV0}` — with no bone files, since nothing skins it, and `Face_indices` in place of `Tristrip_indices`, a form `readFaceGroup` already supports. Not one of the openFLAME marker names appears in it, and its `Material library` and `Texture library` are ordinary ones.

**The engine's own configuration names its material.** `EXE/dacom.ini` carries a hand-written `[MaterialMap]` rule, `name = ^tlr_energy$ = NebulaTwo`, and `tlr_energy` — the sole material in this file — occurs nowhere else in the retail install. No openFLAME asset gets that treatment.

**What it is residue of is `FxMeshAppearance`.** `FX/MISC/gf_tlr_tube.ale` holds one, naming this model by `MeshApp_MeshName = TLRtube`, and `FX/MISC/misc_ale.ini` registers the effect as a `[VisEffect]`. The node type never worked: Freelancer crashes when a particle spawns for that appearance, and no way to make it work has been found. The chain is broken at both ends anyway — no `[Effect]` entry names the `gf_TLR_tube` `[VisEffect]`, and only one other retail `.ale` uses the node type at all (`intro_volcanoplanet.ale`, whose `beryl_asteroid*` names resolve to `[Asteroid]` nicknames in `SOLAR/asteroidarch.ini`, so the property takes an INI nickname rather than a mesh library name).

So it is an unmodelled **Freelancer** structure for an unfinished **Freelancer** feature. Its `UV0_anim`, `UV0_anim_lookup`, `UV0_frame_count`, `UV0_fps` and `UV0_interpolate` files are an animated UV set that occurs in no other retail asset. It stays unread — not because another engine authored it, but because there is no working in-game behaviour to validate a reader against.

---

### Example

```ts
import { Directory } from '@treewyrm/utf2json'
import { getModelHardpoint } from '@treewyrm/utf2json/compound'
import { readRigidModel } from '@treewyrm/utf2json/rigid'
import { readFileSync } from 'node:fs'

const root = Directory.read(readFileSync('ships/li_fighter.cmp'))
const model = readRigidModel(root)

if (model.type === 'compound') {
  const mount = getModelHardpoint(
    model,
    (part) => (part.type === 'rigid' ? part.hardpoints : []),
    'HpWeapon01',
  )
  console.log(mount?.parent.name, mount?.hardpoint.position)
}
```
