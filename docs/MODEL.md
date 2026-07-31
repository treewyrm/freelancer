# Model

Reader and writer for Freelancer rigid models — the `.3db` (single part) and `.cmp` (compound) UTF trees. A model is either a **single part** or a **compound**: a hierarchy of named parts, each stored in its own UTF fragment directory and connected to its parent by a **joint**.

Geometry itself is not handled here; parts delegate to [VMESH.md](VMESH.md) (`VMeshPart` / `MultiLevel`). This module covers the surrounding structure: compound hierarchy, constraints, joints, hardpoints, and cameras.

## Architecture

```
Compound model (.cmp)
  Cmpnd (UTF directory)
    ├─ Root          ── Object name, Index, File name
    ├─ Part_<name>   ── Object name, Index, File name
    └─ Cons          ── Fix / Rev / Pris / Sphere / Loose constraint files
  <File name> (one fragment directory per part, sibling of Cmpnd)
    ├─ MultiLevel | VMeshPart
    └─ Hardpoints
         ├─ Fixed/<name>    ── Position, Orientation
         └─ Revolute/<name> ── Position, Orientation, Axis, Min, Max

Single-part model (.3db)
  <root> (UTF directory)
    ├─ MultiLevel | VMeshPart
    └─ Hardpoints
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

| Function                                    | Description                                                                                       |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `readModel(parent, read)`                   | Reads the `Cmpnd` subtree; calls `read(fragment)` per part and returns the root `Model<T>`        |
| `writeModel(root, write)`                   | Serializes a `Model<T>` tree into a new `Directory`, calling `write(part)` per fragment           |
| `isCompoundModel(directory)`                | True when the directory has a `Cmpnd` child (i.e. compound rather than single-part)               |
| `arrangeByConstraints(objects, constraints)` | Links flat objects into a tree by matching constraint parent/child names, assigning `joint`       |
| `getModelHardpoint(root, predicate, name)`  | Searches the whole tree for a hardpoint by name/CRC; returns `{ hardpoint, parent }` or `undefined` |

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

type RigidPart = Rigid | Camera
type RigidModel = Model<RigidPart> | RigidPart
```

A `RigidModel` is either a compound tree of rigid parts or a single bare part — which is why `readRigidModel` dispatches on `isCompoundModel`.

### Functions

| Function                    | Description                                                             |
| --------------------------- | ------------------------------------------------------------------------ |
| `readRigidModel(directory)` | Reads a `.cmp` compound or a `.3db` single part, whichever is present   |
| `writeRigidModel(model)`    | Serializes either form back into a `Directory`                          |
| `readRigid(parent)`         | Reads hardpoints, `MultiLevel` (preferred) or `VMeshPart`, plus any `VMeshWire` |
| `writeRigid(rigid)`         | Writes geometry and, when present, `Hardpoints` and `VMeshWire`        |
| `readPart(directory)`       | Dispatches to `readCamera` when the directory looks like a camera        |
| `writePart(part)`           | Dispatches by `part.type`                                               |

---

## `joint.ts` — Joints

A `Joint` describes how a child part is attached to its parent, and which degrees of freedom animation may drive.

| Type          | Fields                                                                       | Animation                                     |
| ------------- | ---------------------------------------------------------------------------- | --------------------------------------------- |
| `'fixed'`     | `position`, `rotation`                                                       | None — rigid attachment                       |
| `'revolute'`  | `position`, `offset`, `rotation`, `axis`, `min`, `max`                       | Angle around `axis`, clamped to `min`/`max`   |
| `'prismatic'` | `position`, `offset`, `rotation`, `axis`, `min`, `max`                       | Offset along `axis`, clamped to `min`/`max`   |
| `'cylinder'`  | `position`, `rotation`, `axis`, `minPris`, `maxPris`, `minRev`, `maxRev`     | Rotation + slide; keyframe layout unknown     |
| `'sphere'`    | `position`, `offset`, `rotation`, `minX/maxX`, `minY/maxY`, `minZ/maxZ`      | Rotation by quaternion within per-axis limits |
| `'loose'`     | `position`, `rotation`                                                       | Unconstrained motion (vector + rotation)      |

`position`/`offset`/`axis` are `Vector3`, `rotation` is `Matrix3`; both are read and written through the [`math`](../src/math) helpers. Each joint type has a matching `readX(view)` / `writeX(joint)` pair operating on a `BufferView`.

> **Cylinder joints are not implemented.** `readCylinder`/`writeCylinder` do not exist; `cyl` constraint records are recognized but skipped, and a `'cylinder'` joint is dropped on write.

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

| File     | Joint type    |
| -------- | ------------- |
| `Fix`    | `'fixed'`     |
| `Rev`    | `'revolute'`  |
| `Pris`   | `'prismatic'` |
| `Cyl`    | `'cylinder'` (skipped) |
| `Sphere` | `'sphere'`    |
| `Loose`  | `'loose'`     |

| Function                     | Description                                                    |
| ---------------------------- | -------------------------------------------------------------- |
| `readConstraints(files)`     | Generator — yields a `Constraint` per record across all files  |
| `writeConstraints(constraints)` | Generator — yields one `File` per constraint record           |

File names are matched case-insensitively on read.

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

| Function                       | Description                                                            |
| ------------------------------ | ------------------------------------------------------------------------ |
| `readHardpoints(parent)`       | Generator — yields hardpoints from the `Hardpoints/Fixed` and `Hardpoints/Revolute` groups |
| `writeHardpoints(hardpoints)`  | Builds a `Hardpoints` directory with `Fixed` / `Revolute` subgroups     |
| `getHardpoint(hardpoints, name)` | Finds a hardpoint by name string or CRC (case-insensitive)            |
| `readFixed` / `writeFixed`     | Single fixed hardpoint directory                                        |
| `readRevolute` / `writeRevolute` | Single revolute hardpoint directory                                   |
| `readPosition` / `writePosition`, `readOrientation` / `writeOrientation`, `readAxis` / `writeAxis` | Individual hardpoint files |

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

`isCamera(directory)` detects a camera fragment by the presence of a `Fovx` file.

> **Stub:** `readCamera` currently returns fixed defaults (`90, 90, 1, 1000`) without parsing, and `writeCamera` returns an empty directory.

---

## `index.ts` — Public API

```ts
import {
  type Joint,
  type Hardpoint,
  type Model,
  type RigidModel,
  getHardpoint,
  getModelHardpoint,
  readModel,
  writeModel,
  readRigidModel,
  writeRigidModel,
} from '@treewyrm/utf2json/model'
```

### Example

```ts
import { Directory } from '@treewyrm/utf2json'
import { readRigidModel, getModelHardpoint } from '@treewyrm/utf2json/model'
import { readFileSync } from 'node:fs'

const root = Directory.read(readFileSync('ships/li_fighter.cmp'))
const model = readRigidModel(root)

if (model.type === 'compound') {
  const mount = getModelHardpoint(model, (part) => (part.type === 'rigid' ? part.hardpoints : []), 'HpWeapon01')
  console.log(mount?.parent.name, mount?.hardpoint.position)
}
```
