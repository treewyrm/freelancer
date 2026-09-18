# Compound

The `Cmpnd` layer. A compound is a flat set of named parts, each in its own UTF fragment directory,
linked into a tree by **constraints** naming a parent, a child, and the **joint** between them.

`Model<T>` is generic over the fragment payload: [RIGID.md](RIGID.md) supplies mesh parts, cameras
and spheres; [DEFORMABLE.md](DEFORMABLE.md) supplies bones. Both formats share this layer byte for
byte.

## Layout

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

The `Cmpnd` subdirectories carry only names and fragment filenames. The hierarchy is reconstructed
from the constraint list in `Cons`; directory nesting says nothing about it.

## The hierarchy

```ts
interface Model<T> extends Tree<Model<T>> {
  type: 'compound'
  name: string        // part name ("Object name")
  index: number       // part index ("Index")
  filename: string    // fragment directory name ("File name")
  part: T             // fragment payload, produced by the reader callback
  joint?: Joint       // connection to parent; absent on the root
  children: Model<T>[]
}
```

`readModel`/`writeModel` take a reader/writer pair for the fragment contents. `rigid.ts` supplies
the rigid pair; `deformable/model.ts` builds the same tree from bones through
`arrangeByConstraints` alone, since a `.dfm` keeps its geometry off the hierarchy.

- Root is the `Root`-prefixed subdirectory; remaining `Part_*` subdirectories become descendants.
- `readModel` throws when the `Cmpnd` directory, an `Object name`, a `File name`, the fragment
  directory or the root object is missing.
- `writeModel` names the root `Root` and every other part `Part_<name>`, writes each fragment as a
  top-level directory beside `Cmpnd`, and throws on empty names, duplicate names, or a non-integer
  `index`.
- Constraint and hardpoint name matching goes through `getResourceId`, so lookups are
  case-insensitive.

## Joints

How a child part attaches to its parent, and which degrees of freedom animation may drive.

| Type          | Fields                                                                           | Animation                                     |
| ------------- | -------------------------------------------------------------------------------- | --------------------------------------------- |
| `'fixed'`     | `position`, `rotation`                                                           | None — rigid attachment                       |
| `'revolute'`  | `position`, `offset`, `rotation`, `axis`, `min`, `max`                           | Angle around `axis`, clamped to `min`/`max`   |
| `'prismatic'` | `position`, `offset`, `rotation`, `axis`, `min`, `max`                           | Offset along `axis`, clamped to `min`/`max`   |
| `'cylinder'`  | `position`, `offset`, `rotation`, `axis`, `minPris`/`maxPris`, `minRev`/`maxRev` | Rotation + slide; **not animatable**          |
| `'sphere'`    | `position`, `offset`, `rotation`, `minX/maxX`, `minY/maxY`, `minZ/maxZ`          | Rotation by quaternion within per-axis limits |
| `'loose'`     | `position`, `rotation`                                                           | Unconstrained motion (vector + rotation)      |

`position`/`offset`/`axis` are `Vector3`, `rotation` is a `Matrix3`. Keyframes driving these live in
the `Animation` directory beside `Cmpnd` — see [ANIMATION.md](ANIMATION.md). Composition into a
world transform is in [RENDERER.md §5.2](../refs/RENDERER.md#52-composing-a-joint).

`position` and `offset` are the two ends of one contact — `T(position) · R(…) · T(-offset)`, not a
conjugating pivot pair. See [Position and offset](#position-and-offset).

Cylinder joints read and write but cannot be animated — impossible rather than absent, see
[ANIMATION.md](ANIMATION.md#why-cylinder-joints-cannot-be-animated).

## Constraints

```ts
interface Constraint {
  parent: string // parent object name
  child: string  // child object name
  joint: Joint
}
```

One file per joint kind in the `Cons` directory, each a packed array of records. A record is two
64-byte NUL-padded names — parent, then child — followed by the joint payload.

| File     | Joint type    | Record size |
| -------- | ------------- | ----------- |
| `Fix`    | `'fixed'`     | 176         |
| `Rev`    | `'revolute'`  | 208         |
| `Pris`   | `'prismatic'` | 208         |
| `Cyl`    | `'cylinder'`  | 216         |
| `Sphere` | `'sphere'`    | 212         |
| `Loose`  | `'loose'`     | 176         |

A record carries no size of its own — the file name is the only thing that gives one, so an unknown
constraint file is refused rather than skipped. Records are fixed size and the file holds nothing
else, so every retail `Cons` file is an exact multiple of the size above.

File names are matched case-insensitively on read; the writer emits the retail capitalization.

A name occupies its whole 64-byte field and is terminated by the first NUL. Names are otherwise
taken verbatim, including the leading and trailing spaces a few retail part names carry.

## Hardpoints

Named attachment points — weapon mounts, engine nozzles, docking points — stored per part. Rigid
parts carry them, as do the bones of a `.dfm`.

```ts
type Hardpoint = Fixed | Revolute | Prismatic

interface Base<T> {
  type: T
  name: string        // hardpoint directory name
  position: Vector3   // Position file, defaults to origin
  orientation: Matrix3 // Orientation file, defaults to identity
}
// Revolute and Prismatic add: axis: Vector3 (defaults to Y), min: number, max: number
```

Read from and written to the `Hardpoints/Fixed` and `Hardpoints/Revolute` groups.
`getModelHardpoint` searches a whole model tree and returns the hardpoint with the part owning it.

Prismatic hardpoints exist in the type union but are neither read from nor written to the
`Hardpoints` directory.

## Notes

### Position and offset

The record fields are `parent_point` and `child_point` in the Conquest: Frontier Wars structs: the
point named in the child's frame lands on the point named in the parent's. So `offset` subtracts on
the far right of the composition, `T(position) · R(…) · T(-offset)`, rather than conjugating.
[RENDERER.md §5.2](../refs/RENDERER.md#52-composing-a-joint) carries the evidence. Retail leaves the field
zero in all 3,699 records that have one, so this bears on authored assets only. `fixed` and `loose`
record no second point.

### Where the records come from

Every joint record is Conquest: Frontier Wars structure, unchanged, declared in
`Libs/Include/PERSISTCOMPOUND.H`. Same lineage as the `openFLAME 3D N-mesh` trees in four
Freelancer files ([RETAIL.md](../refs/RETAIL.md#openflame-leftovers)). Record sizes match field for field:

| CFW struct      | Layout after the two 64-byte names                                         | Size |
| --------------- | -------------------------------------------------------------------------- | ---- |
| `Fix`           | `pos`, `orient`                                                            | 176  |
| `Rev` / `Pris`  | `parent_point`, `child_point`, `rel_orientation`, `axis`, `min`, `max`     | 208  |
| `Cyl`           | as `Rev`, then `min_trans`, `max_trans`, `min_rot`, `max_rot`              | 216  |
| `PersistSphere` | `parent_point`, `child_point`, `rel_orientation`, 3× min/max               | 212  |
| `Spring`        | `parent_point`, `child_point`, `spring_constant`, `damping`, `rest_length` | 164  |
| `Loose`/`Trans` | typedefs of `Fix`                                                          | 176  |

A `Cyl` record is 216 bytes and its limits are stored translation-first. CFW's `JointInfo.h`
documents `min0`/`max0` as the rotation limits, contradicting that field order; `Compound.cpp`
assigns `min0 = in.min_trans`, siding with the struct.

`Cyl` is implemented on the strength of the struct alone — no retail model ships one, so it is the
only joint kind with no corpus backing.

Two CFW joint kinds have no Freelancer counterpart and no `Joint` variant: `Spr` (damped spring)
and `Trans` (translational). `readConstraints` refuses both.

## API

### `./compound`

| Export                 | Kind      |                                                                                  |
| ---------------------- | --------- | -------------------------------------------------------------------------------- |
| `arrangeByConstraints` | function  | Arranges compound objects into hierarchy from constraints.                       |
| `Constraint`           | interface | `{ parent: string, child: string, joint: Joint }`.                               |
| `getHardpoint`         | function  | `(hardpoints: Hardpoint[], name: Hashable): Hardpoint \| undefined`              |
| `getModelHardpoint`    | function  | Finds a hardpoint anywhere in a model, returning it with the part that owns it.  |
| `Hardpoint`            | type      | Attachment hardpoint. There is no prismatic form — only `Fixed` and `Revolute`.  |
| `isCompoundModel`      | function  | `(directory: Directory): boolean`                                                |
| `Joint`                | type      | Compound object child-to-parent connection joint.                                |
| `Model`                | interface | `Model<T>` — a `Tree` node carrying `name`, `index`, filename and a payload `T`. |
| `readConstraints`      | function  | Reads compound hierarchy constraints.                                            |
| `readHardpoints`       | function  | Reads hardpoints from object directory.                                          |
| `readModel`            | function  | Reads compound object from directory.                                            |
| `writeConstraints`     | function  | Writes one file per constraint, for a caller to append together by name.         |
| `writeHardpoints`      | function  | `(hardpoints: Iterable<Hardpoint>): Directory`                                   |
| `writeModel`           | function  | Writes compound object into directory.                                           |

## Corpus

| | Count |
| --- | --- |
| Constraint records in rigid `.cmp` models | 5,316 |
| Constraint records in deformable `.dfm` models | 9,096 |
| `Cons` files across both | 1,024, all capitalized |

Joint kinds across both corpora: `loose` 6,343, `fixed` 4,370, `sphere` 2,770, `prismatic` 504,
`revolute` 425, `cylinder` **0**.

### Constraints round-trip by value, not byte for byte

Every retail constraint record leaves stack residue past the terminator of its two 64-byte name
fields — usually a longer name written into the same buffer earlier: a `Loose` record naming `Head`
still has `Head02` at offset 24 of the field. This holds for all 9,096 deformable and all 5,316
rigid records. Names read out identically either way, since a field stops at its first NUL, and
`writeConstraints` zero-fills.

Librelancer works around it with `for (int i = 22; i < 64; i++) buffer[i] = 0;` in
`DfmConstructs.cs`.

### One unresolvable constraint

`trade_turret01.cmp` constrains a part it never declares. `arrangeByConstraints` drops a constraint
it cannot resolve, so the rest of the hierarchy still assembles.
