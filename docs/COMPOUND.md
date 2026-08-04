# Compound

The `Cmpnd` layer, shared by every Freelancer model that has a hierarchy. A compound is a flat set of named parts, each stored in its own UTF fragment directory, linked into a tree by **constraints** that name a parent, a child, and the **joint** between them.

What lives inside a fragment is the consumer's business, and `Model<T>` is generic over exactly that: [RIGID.md](RIGID.md) supplies mesh parts, cameras and spheres; [DEFORMABLE.md](DEFORMABLE.md) supplies bones. The two formats share this layer byte for byte — the same `Object name`/`File name`/`Index` triples, the same `Cons` records — which is why it lives on its own rather than inside either of them.

## Architecture

```
Cmpnd (UTF directory)
  ├─ Root          ── Object name, Index, File name
  ├─ Part_<name>   ── Object name, Index, File name
  └─ Cons          ── Fix / Rev / Pris / Cyl / Sphere / Loose constraint files
<File name> (one fragment directory per part, sibling of Cmpnd)
  └─ …             ── whatever the consuming format puts there
       Hardpoints
         ├─ Fixed/<name>    ── Position, Orientation
         └─ Revolute/<name> ── Position, Orientation, Axis, Min, Max
```

The `Cmpnd` subdirectories carry only names and fragment filenames; the hierarchy itself is reconstructed from the constraint list in `Cons`, which links a parent object name to a child object name via a joint.

---

## `model.ts` — Compound Hierarchy

### `Model<T>` interface

```ts
interface Model<T> extends Tree<Model<T>> {
  type: 'compound'
  name: string // part name ("Object name")
  index: number // part index ("Index")
  filename: string // fragment directory name ("File name")
  part: T // fragment payload, produced by the reader callback
  joint?: Joint // connection to parent; absent on the root
  children: Model<T>[] // from Tree<T>
}
```

`Model` is generic over the fragment payload, so the compound layer is reusable: `readModel`/`writeModel` take a reader/writer pair for whatever lives inside a fragment directory. `rigid.ts` supplies the rigid-model pair; `deformable/model.ts` builds the same tree from bones through `arrangeByConstraints` alone, since a `.dfm` keeps its geometry off the hierarchy entirely.

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

Every joint record here is **Conquest: Frontier Wars** structure, unchanged. Digital Anvil's earlier game uses the same UTF container and declares these in `Libs/Include/PERSISTCOMPOUND.H` — the same lineage that leaves an `openFLAME 3D N-mesh` tree in four Freelancer `EQUIPMENT/MODELS/HARDWARE` files (see [RETAIL.md](RETAIL.md)). The record sizes the corpus test measures against retail `.cmp` files match those structs field for field:

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

File names are matched case-insensitively on read; the writer emits the retail capitalization (`Fix`, `Rev`, `Pris`, `Sphere`, `Loose`, `Cyl`). A file named anything outside the table above is refused, since its record size is unknowable.

A name occupies its whole 64-byte field and is terminated by the first NUL; retail exporters leave heap residue in the bytes after it, which the reader stops short of and the writer replaces with zeroes. Constraints therefore round-trip by value but not byte for byte — for all 5316 records across the rigid models and all 9096 across the deformable ones.

Names are otherwise taken verbatim, including the leading and trailing spaces a few retail part names carry. One retail model, `trade_turret01.cmp`, constrains a part it never declares; `arrangeByConstraints` drops a constraint it cannot resolve, so the rest of the hierarchy still assembles.

---

## `hardpoint.ts` — Hardpoints

Hardpoints are named attachment points (weapon mounts, engine nozzles, docking points) stored per part. Rigid parts carry them; so do the bones of a `.dfm`, which is how a head, a body and a pair of hands assemble into one character.

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

## `index.ts` — Public API

```ts
import {
  type Constraint,
  type Hardpoint,
  type Joint,
  type Model,
  arrangeByConstraints,
  getHardpoint,
  getModelHardpoint,
  isCompoundModel,
  readConstraints,
  readHardpoints,
  readModel,
  writeConstraints,
  writeHardpoints,
  writeModel,
} from '@treewyrm/freelancer/compound'
```
