# Compound

The `Cmpnd` layer. A compound is a flat set of named parts, each in its own UTF fragment directory,
linked into a tree by **constraints** naming a parent, a child, and the **joint** between them.

`CompoundNode<T>` is generic over the fragment payload: [RIGID.md](RIGID.md) supplies mesh parts,
cameras and spheres; [DEFORMABLE.md](DEFORMABLE.md) supplies bones. Both formats share this layer
byte for byte.

## Layout

```
Cmpnd (UTF directory)
  ├─ Root          ── Object name, Index, File name
  ├─ Part_<name>   ── Object name, Index, File name
  └─ Cons          ── Fix / Rev / Pris / Cyl / Sphere / Trans / Loose constraint files
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
interface CompoundNode<T> extends Tree<CompoundNode<T>> {
  type: 'compound'
  name: string        // part name ("Object name")
  index: number       // part index ("Index")
  filename: string    // fragment directory name ("File name")
  part: T             // fragment payload, produced by the reader callback
  joint?: Joint       // connection to parent; absent on the root
  children: CompoundNode<T>[]
}
```

Every part of the hierarchy is a node, and the root node is the compound: `readCompound` returns it.
`readCompound`/`writeCompound` take a reader/writer pair for the fragment contents. `rigid.ts`
supplies the rigid pair; `deformable/model.ts` builds the same tree from bones through
`arrangeByConstraints` alone, since a `.dfm` keeps its geometry off the hierarchy.

- Root is the `Root`-prefixed subdirectory; remaining `Part_*` subdirectories become descendants.
- `readCompound` throws when the `Cmpnd` directory, an `Object name`, a `File name`, the fragment
  directory or the root object is missing.
- `writeCompound` names the root `Root` and every other part `Part_<name>`, writes each fragment as
  a top-level directory beside `Cmpnd`, and throws on empty names, duplicate names, or a non-integer
  `index`.
- Constraint and hardpoint name matching goes through `getResourceId`, so lookups are
  case-insensitive.

## Joints

How a child part attaches to its parent, and which degrees of freedom animation may drive.

| Type              | Interface            | Fields                                                                              | Animation                                    |
| ----------------- | -------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------- |
| `'fixed'`         | `FixedJoint`         | `position`, `orientation`                                                           | None — rigid attachment                      |
| `'revolute'`      | `RevoluteJoint`      | `position`, `offset`, `orientation`, `axis`, `min`, `max`                           | Angle around `axis`, clamped to `min`/`max`  |
| `'prismatic'`     | `PrismaticJoint`     | `position`, `offset`, `orientation`, `axis`, `min`, `max`                           | Offset along `axis`, clamped to `min`/`max`  |
| `'cylinder'`      | `CylinderJoint`      | `position`, `offset`, `orientation`, `axis`, `minPris`/`maxPris`, `minRev`/`maxRev` | Rotation + slide; **not animatable**         |
| `'sphere'`        | `SphereJoint`        | `position`, `offset`, `orientation`, `minX/maxX`, `minY/maxY`, `minZ/maxZ`          | Rotation by quaternion; limits never applied |
| `'translational'` | `TranslationalJoint` | `position`, `orientation`                                                           | Unconstrained slide (vector)                 |
| `'loose'`         | `LooseJoint`         | `position`, `orientation`                                                           | Unconstrained motion (vector + rotation)     |

`position`/`offset`/`axis` are `Vector3`, `orientation` is a `Matrix3` — the same name and shape a
hardpoint's frame has. `JointOf<'revolute'>` narrows `Joint` to one arm. Keyframes driving these
live in the `Animation` directory beside `Cmpnd` — see [ANIMATION.md](ANIMATION.md). Composition
into a world transform is in [RENDERER.md §5.2](../refs/RENDERER.md#52-composing-a-joint).

`getJointMatrix(joint, state)` is the child's frame in its parent's for a joint driven to a state,
computed the way retail `engbase.dll` computes it (per-type builders dispatched from `0x662aa84`):

```
fixed          T(position) · R(orientation)
revolute       T(position) · R(axis, θ) · R(orientation) · T(-offset)        θ clamped to [min, max]
prismatic      T(position + d·axis) · R(orientation) · T(-offset)            d clamped to [min, max]
cylinder       T(position + d·axis) · R(axis, θ) · R(orientation) · T(-offset)
sphere         T(position) · R(q) · R(orientation) · T(-offset)
translational  T(position + p) · R(orientation)
loose          T(position + p) · R(q) · R(orientation)
```

`JointState` is `{ value?, rotation?, position?, orientation? }` — a channel sample has the same
shape — and anything absent stands at rest. The engine clamps a revolute or prismatic value when it
is set (`0x66226e0`: below `min` first, then above `max`; NaN passes) and clamps nothing else; the
sphere's and cylinder's limits are stored and never applied. A revolute axis is normalized before
use, a prismatic one is not — travel is `d` times the stored vector. Retail's axes are all unit
length, so the difference is for authored ones.

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

| File     | Joint type        | Record size |
| -------- | ----------------- | ----------- |
| `Fix`    | `'fixed'`         | 176         |
| `Rev`    | `'revolute'`      | 208         |
| `Pris`   | `'prismatic'`     | 208         |
| `Cyl`    | `'cylinder'`      | 216         |
| `Sphere` | `'sphere'`        | 212         |
| `Trans`  | `'translational'` | 176         |
| `Loose`  | `'loose'`         | 176         |

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
type Hardpoint = FixedHardpoint | RevoluteHardpoint

interface Base<T> {
  type: T
  name: string          // hardpoint directory name
  position?: Vector3    // Position file; absent when there is none, which places it at the origin
  orientation: Matrix3  // Orientation file, defaults to identity
}
// RevoluteHardpoint adds: axis: Vector3 (defaults to Y), min: number, max: number
```

Read from and written to the `Hardpoints/Fixed` and `Hardpoints/Revolute` groups.
`getCompoundHardpoint` searches a whole compound and returns the hardpoint with the node owning it.

`position` is left off rather than set to the origin when the file has no `Position`, so a
hardpoint written back gains no file it did not have. One retail hardpoint of 12,053 is stored that
way, in a stale fragment no part names ([Corpus](#corpus)). The orientation and axis defaults stay:
no retail hardpoint omits either.

## Notes

### Position and offset

The record fields are `parent_point` and `child_point` in the Conquest: Frontier Wars structs: the
point named in the child's frame lands on the point named in the parent's. So `offset` subtracts on
the far right of the composition, `T(position) · R(…) · T(-offset)`, rather than conjugating.
[RENDERER.md §5.2](../refs/RENDERER.md#52-composing-a-joint) carries the evidence. Retail leaves the field
zero in all 3,699 records that have one, so this bears on authored assets only. `fixed`,
`translational` and `loose` record no second point.

The engine applies `offset` on every type that carries one, prismatic included (`0x6625730`:
`t = position + d·axis − R·offset`), which closes the question RENDERER.md had left open.

### Translational joints

`Trans` is a joint kind retail's engine knows and retail's data never uses. The `Cons` loader
(`0x6620a0e`) accepts it as joint type 5, between `Sphere` and `Loose`, and reads it with the same
176-byte `Fix` layout — a position and an orientation, no limits. Its transform (`0x6625a80`) keeps
the rest orientation and adds the driven vector to the rest position in the parent frame: a loose
joint without the rotation, or a prismatic joint with three axes and no range. The state setter
stores the vector unclamped (`0x66227cd`), and animation reaches it through a position-only channel,
the one channel shape whose three floats match its state.

Neither retail nor Discovery ships a `Trans` record, and `engbase.dll` is the only retail binary
that names one.

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

One CFW joint kind has no Freelancer counterpart and no `Joint` variant: `Spr` (damped spring),
which `engbase.dll`'s `Cons` loader does not name. `readConstraints` refuses it. `Trans` is loaded —
see [Translational joints](#translational-joints).

## API

### `./compound`

| Export                 | Kind      |                                                                                         |
| ---------------------- | --------- | --------------------------------------------------------------------------------------- |
| `arrangeByConstraints` | function  | Arranges compound objects into hierarchy from constraints.                              |
| `CompoundNode`         | interface | `CompoundNode<T>` — a `Tree` node carrying `name`, `index`, filename and a payload `T`. |
| `Constraint`           | interface | `{ parent: string, child: string, joint: Joint }`.                                      |
| `CylinderJoint`        | interface | Revolute and prismatic on one shared axis; reads and writes, never animated.            |
| `FixedHardpoint`       | interface | `{ type: 'fixed', name, position?, orientation }`.                                      |
| `FixedJoint`           | interface | `{ type: 'fixed', position, orientation }` — a rigid attachment.                        |
| `getCompoundHardpoint` | function  | Finds a hardpoint anywhere in a compound, returning it with the node that owns it.      |
| `getHardpoint`         | function  | `(hardpoints: Hardpoint[], name: Hashable): Hardpoint \| undefined`                     |
| `getJointMatrix`       | function  | The child's frame in its parent's for a driven joint, as the engine computes it.        |
| `Hardpoint`            | type      | `FixedHardpoint \| RevoluteHardpoint`. There is no prismatic form.                      |
| `isCompound`           | function  | `(directory: Directory): boolean` — whether a file root holds a `Cmpnd`.                |
| `Joint`                | type      | Compound object child-to-parent connection joint, one of seven arms.                    |
| `JointOf`              | type      | Narrows `Joint` to the arm of a given `type`.                                           |
| `JointState`           | interface | `{ value?, rotation?, position?, orientation? }` — what drives a joint.                 |
| `LooseJoint`           | interface | `{ type: 'loose', position, orientation }` — unconstrained.                             |
| `PrismaticJoint`       | interface | A slide along `axis` between `min` and `max`.                                           |
| `readCompound`         | function  | Reads a compound from a file root, returning its root node.                             |
| `readConstraints`      | function  | `(files: Iterable<File>): Constraint[]` — reads compound hierarchy constraints.         |
| `readHardpoints`       | function  | `(parent: Directory): Hardpoint[]` — empty when the part carries none.                  |
| `RevoluteHardpoint`    | interface | A fixed hardpoint plus `axis`, `min` and `max`.                                         |
| `RevoluteJoint`        | interface | A turn about `axis` between `min` and `max`.                                            |
| `SphereJoint`          | interface | A rotation by quaternion; per-axis limits stored, never applied.                        |
| `TranslationalJoint`   | interface | `{ type: 'translational', position, orientation }` — a free slide.                      |
| `writeCompound`        | function  | Writes a compound into a file root.                                                     |
| `writeConstraints`     | function  | `(constraints: Iterable<Constraint>): File[]` — one file per constraint.                |
| `writeHardpoints`      | function  | `(hardpoints: Iterable<Hardpoint>): Directory`                                          |

## Corpus

| | Count |
| --- | --- |
| Hardpoints without a `Position`, of 12,053 | 1 — `bw_vheavy_fighter.cmp`'s stale `bw_port_wing02_lod1020911031436.3db` fragment, which no part names |
| Constraint records in rigid `.cmp` models | 5,316 |
| Constraint records in deformable `.dfm` models | 9,096 |
| `Cons` files across both | 1,024, all capitalized |

Joint kinds across both corpora: `loose` 6,343, `fixed` 4,370, `sphere` 2,770, `prismatic` 504,
`revolute` 425, `cylinder` **0**, `translational` **0**.

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
