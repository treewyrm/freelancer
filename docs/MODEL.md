# Model

Reader and writer for Freelancer rigid models — the `.3db` (single part), `.cmp` (compound) and `.sph` (procedural sphere) UTF trees. A model is either a **single part** or a **compound**: a hierarchy of named parts, each stored in its own UTF fragment directory and connected to its parent by a **joint**.

Geometry itself is not handled here; parts delegate to [VMESH.md](VMESH.md) (`VMeshPart` / `MultiLevel`). This module covers the surrounding structure: compound hierarchy, constraints, joints, hardpoints, cameras, and spheres.

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

The `Cmpnd` subdirectories carry only names and fragment filenames; the hierarchy itself is reconstructed from the constraint list in `Cons`, which links a parent object name to a child object name via a joint.

---

## `model.ts` — Compound Hierarchy

### `Model<T>` interface

```ts
interface Model<T> extends Compound<Model<T>> {
  type: 'compound'
  name: string // part name ("Object name")
  index: number // part index ("Index")
  filename: string // fragment directory name ("File name")
  part: T // fragment payload, produced by the reader callback
  joint?: Joint // connection to parent; absent on the root
  children: Model<T>[] // from Compound<T>
}
```

`Model` is generic over the fragment payload, so the compound layer is reusable: `readModel`/`writeModel` take a reader/writer pair for whatever lives inside a fragment directory. `rigid.ts` supplies the rigid-model pair.

### Functions

| Function                                     | Description                                                                                         |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `readModel(parent, read)`                    | Reads the `Cmpnd` subtree; calls `read(fragment)` per part and returns the root `Model<T>`          |
| `writeModel(root, write)`                    | Serializes a `Model<T>` tree into a new `Directory`, calling `write(part)` per fragment             |
| `isCompoundModel(directory)`                 | True when the directory has a `Cmpnd` child (i.e. compound rather than single-part)                 |
| `arrangeByConstraints(objects, constraints)` | Links flat objects into a tree by matching constraint parent/child names, assigning `joint`         |
| `getModelHardpoint(root, predicate, name)`   | Searches the whole tree for a hardpoint by name/CRC; returns `{ hardpoint, parent }` or `undefined` |

`readModel` throws when the `Cmpnd` directory, an `Object name`, a `File name`, the fragment directory, or the root object is missing. The root is the `Root`-prefixed subdirectory; remaining `Part_*` subdirectories become its descendants.

`writeModel` names the root directory `Root` and every other part `Part_<name>`, writes each fragment as a top-level directory beside `Cmpnd`, and throws on empty names, duplicate names, or a non-integer `index`.

> **Name matching** is done through `getResourceId` (CRC32), so constraint and hardpoint lookups are case-insensitive.

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

## `joint.ts` — Joints

A `Joint` describes how a child part is attached to its parent, and which degrees of freedom animation may drive.

| Type          | Fields                                                                           | Animation                                     |
| ------------- | -------------------------------------------------------------------------------- | --------------------------------------------- |
| `'fixed'`     | `position`, `rotation`                                                           | None — rigid attachment                       |
| `'revolute'`  | `position`, `offset`, `rotation`, `axis`, `min`, `max`                           | Angle around `axis`, clamped to `min`/`max`   |
| `'prismatic'` | `position`, `offset`, `rotation`, `axis`, `min`, `max`                           | Offset along `axis`, clamped to `min`/`max`   |
| `'cylinder'`  | `position`, `offset`, `rotation`, `axis`, `minPris`/`maxPris`, `minRev`/`maxRev` | Rotation + slide; **not animatable**          |
| `'sphere'`    | `position`, `offset`, `rotation`, `minX/maxX`, `minY/maxY`, `minZ/maxZ`          | Rotation by quaternion within per-axis limits |
| `'loose'`     | `position`, `rotation`                                                           | Unconstrained motion (vector + rotation)      |

`position`/`offset`/`axis` are `Vector3`, `rotation` is `Matrix3`; both are read and written through the [`math`](../src/math) helpers. Each joint type has a matching `readX(view)` / `writeX(joint)` pair operating on a `BufferView`.

The keyframes that drive these degrees of freedom live in the `Animation` directory beside `Cmpnd` — see [ANIMATION.md](ANIMATION.md).

> **Cylinder joints read and write, but cannot be animated.** `readCylinder`/`writeCylinder` handle the 216-byte record, whose layout comes from CFW rather than from any measured file — no retail model ships one, so it is the single joint kind with no corpus backing. What is impossible rather than merely absent is driving one: a cylinder's two floats have no representation in the channel type bitfield. See [Why cylinder joints cannot be animated](ANIMATION.md#why-cylinder-joints-cannot-be-animated).
>
> A record carries no size of its own — the file name is the only thing that gives one — so any constraint file this module does _not_ know is refused rather than skipped, which would silently desynchronize every record after it.

### Where `Cyl` comes from

Every joint record here is **Conquest: Frontier Wars** structure, unchanged. Digital Anvil's earlier game uses the same UTF container and declares these in `Libs/Include/PERSISTCOMPOUND.H` — the same lineage that leaves an `openFLAME 3D N-mesh` tree in four Freelancer `EQUIPMENT/MODELS/HARDWARE` files (see [VMESH.md](VMESH.md)). The record sizes the corpus test measures against retail `.cmp` files match those structs field for field:

| CFW struct      | Layout after the two 64-byte names                                         | Size |
| --------------- | -------------------------------------------------------------------------- | ---- |
| `Fix`           | `pos`, `orient`                                                            | 176  |
| `Rev` / `Pris`  | `parent_point`, `child_point`, `rel_orientation`, `axis`, `min`, `max`     | 208  |
| `Cyl`           | as `Rev`, then `min_trans`, `max_trans`, `min_rot`, `max_rot`              | 216  |
| `PersistSphere` | `parent_point`, `child_point`, `rel_orientation`, 3× min/max               | 212  |
| `Spring`        | `parent_point`, `child_point`, `spring_constant`, `damping`, `rest_length` | 164  |
| `Loose`/`Trans` | typedefs of `Fix`                                                          | 176  |

So a `Cyl` record is **216 bytes**, and its limits are stored translation-first. Two CFW joint kinds have no Freelancer counterpart and no `Joint` variant here: `Spr` (damped spring) and `Trans` (translational). Neither appears in retail data, and `readConstraints` refuses both along with `Cyl`.

> CFW's own `JointInfo.h` documents `min0`/`max0` as the _rotation_ limits for a cylindrical joint, contradicting the `min_trans`-first field order in `PERSISTCOMPOUND.H`. `Compound.cpp` assigns `min0 = in.min_trans`, siding with the struct — the comment is the odd one out.

`Cyl` is implemented on the strength of that struct. The **animation** is not, and cannot be: a cylinder's two driven floats have no representation in the channel type bitfield, and CFW never animated one either — its exporter has no cylinder branch at all. See [Why cylinder joints cannot be animated](ANIMATION.md#why-cylinder-joints-cannot-be-animated).

---

## `constraint.ts` — Compound Constraints

### `Constraint` interface

```ts
interface Constraint {
  parent: string // parent object name
  child: string // child object name
  joint: Joint
}
```

Constraints live in the `Cons` directory, one file per joint kind, each holding a packed array of records. A record is two 64-byte NUL-padded names (parent, then child) followed by the joint payload.

| File     | Joint type    | Record size |
| -------- | ------------- | ----------- |
| `Fix`    | `'fixed'`     | 176         |
| `Rev`    | `'revolute'`  | 208         |
| `Pris`   | `'prismatic'` | 208         |
| `Cyl`    | `'cylinder'`  | 216         |
| `Sphere` | `'sphere'`    | 212         |
| `Loose`  | `'loose'`     | 176         |

Records are fixed size and the file holds nothing else, so every retail `Cons` file is an exact multiple of the size above — which is what pins the stride down.

| Function                        | Description                                                   |
| ------------------------------- | ------------------------------------------------------------- |
| `readConstraints(files)`        | Generator — yields a `Constraint` per record across all files |
| `writeConstraints(constraints)` | Generator — yields one `File` per constraint record           |

File names are matched case-insensitively on read. A file named anything outside the table above is refused, since its record size is unknowable.

A name occupies its whole 64-byte field and is terminated by the first NUL; retail exporters leave heap residue in the bytes after it, which the reader stops short of and the writer replaces with zeroes. Constraints therefore round-trip by value but not byte for byte.

Names are otherwise taken verbatim, including the leading and trailing spaces a few retail part names carry. One retail model, `trade_turret01.cmp`, constrains a part it never declares; `arrangeByConstraints` drops a constraint it cannot resolve, so the rest of the hierarchy still assembles.

---

## `hardpoint.ts` — Hardpoints

Hardpoints are named attachment points (weapon mounts, engine nozzles, docking points) stored per part.

### `Hardpoint` type

```ts
type Hardpoint = Fixed | Revolute | Prismatic

interface Base<T> {
  type: T
  name: string // hardpoint directory name
  position: Vector3 // Position file, defaults to origin
  orientation: Matrix3 // Orientation file, defaults to identity
}
// Revolute and Prismatic add: axis: Vector3 (defaults to Y), min: number, max: number
```

### Functions

| Function                                                                                           | Description                                                                                |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `readHardpoints(parent)`                                                                           | Generator — yields hardpoints from the `Hardpoints/Fixed` and `Hardpoints/Revolute` groups |
| `writeHardpoints(hardpoints)`                                                                      | Builds a `Hardpoints` directory with `Fixed` / `Revolute` subgroups                        |
| `getHardpoint(hardpoints, name)`                                                                   | Finds a hardpoint by name string or CRC (case-insensitive)                                 |
| `readFixed` / `writeFixed`                                                                         | Single fixed hardpoint directory                                                           |
| `readRevolute` / `writeRevolute`                                                                   | Single revolute hardpoint directory                                                        |
| `readPosition` / `writePosition`, `readOrientation` / `writeOrientation`, `readAxis` / `writeAxis` | Individual hardpoint files                                                                 |

> Prismatic hardpoints exist in the type union but are neither read from nor written to the `Hardpoints` directory.

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

Animates a material's UV transform over time. `MaterialAnim` is a root-level sibling of `Cmpnd`, never nested inside a part fragment, so `readMaterialAnimLibrary(root)` takes a file root the way `readVMeshLibrary` and `readAnimationLibrary` do — it is not part of `RigidModel`.

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

So `MAKeys` is stored, not computed. `src/model/corpus.test.ts` pins the counterexamples down so a future attempt at deriving it has to confront them.

`MAFlags` is the other unexplained field. It does not track `MACount`, the presence of `MAKeys`, or the containing file: the four `0` entries span a one-keyframe rock material and the 340-keyframe fountain alike, and `li_resort_waterscape.cmp` holds both values at once.

---

## `index.ts` — Public API

```ts
import {
  type Joint,
  type Hardpoint,
  type Model,
  type RigidModel,
  type RigidPart,
  type Sphere,
  isSphere,
  readSphere,
  writeSphere,
  getHardpoint,
  getModelHardpoint,
  readModel,
  writeModel,
  readRigidModel,
  writeRigidModel,
} from '@treewyrm/utf2json/model'
```

---

## Nodes this module does not read

A census over all 1852 retail `.cmp` and `.3db` files turns up 550 distinct node paths. Everything the renderer needs is covered, `MaterialAnim` included; what follows is everything left over, so it does not have to be rediscovered. Material and texture libraries are excluded — they are a separate job.

| Node                          | Files                   | What it is                                                                                                                                                                                          |
| ----------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Exporter Version`            | 511 root, 1341 fragment | Exporter build timestamp string, 35 distinct values from `Dec 15 1999` to `Nov 5 2002`                                                                                                              |
| `Extent tree`                 | 14                      | Exporter bounding-volume hierarchy: `Sphere`/`Tube`/`Cylinder`/`Box` nesting through `Children`, bottoming out in a `Convex mesh` of vertex, edge, face and normal lists. Collision ships in `.sur` |
| `Mass properties`             | 5                       | `Mass` float32, `Center of mass` Vector3, `Inertia tensor` Matrix3 — real values, not placeholders                                                                                                  |
| `Rigid body`                  | 4                       | Wrapper around `Mass properties` and `Extent tree`                                                                                                                                                  |
| `openFLAME 3D N-mesh`, `Mesh` | 4 + 1                   | Conquest: Frontier Wars leftovers, neither supported nor used by Freelancer — see [VMESH.md](VMESH.md)                                                                                              |

`Extent tree`, `Mass properties` and `Rigid body` look like editor state the exporter failed to strip; the game takes collision from `.sur` and mass from INI files.

---

### Example

```ts
import { Directory } from '@treewyrm/utf2json'
import { readRigidModel, getModelHardpoint } from '@treewyrm/utf2json/model'
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
