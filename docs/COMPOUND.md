# Compound

The `Cmpnd` layer, shared by every Freelancer model that has a hierarchy. A compound is a flat set of
named parts, each stored in its own UTF fragment directory, linked into a tree by **constraints**
that name a parent, a child, and the **joint** between them.

What lives inside a fragment is the consumer's business, and `Model<T>` is generic over exactly that:
[RIGID.md](RIGID.md) supplies mesh parts, cameras and spheres; [DEFORMABLE.md](DEFORMABLE.md)
supplies bones. The two formats share this layer **byte for byte** — the same
`Object name`/`File name`/`Index` triples, the same `Cons` records — which is why it lives on its own
rather than inside either of them. Export names are in [API.md](API.md#compound).

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

**The `Cmpnd` subdirectories carry only names and fragment filenames; the hierarchy itself is
reconstructed from the constraint list in `Cons`**, which links a parent object name to a child
object name via a joint. Directory nesting says nothing about it.

---

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

`readModel`/`writeModel` take a reader/writer pair for whatever lives inside a fragment directory, so
the layer is reusable: `rigid.ts` supplies the rigid pair, and `deformable/model.ts` builds the same
tree from bones through `arrangeByConstraints` alone, since a `.dfm` keeps its geometry off the
hierarchy entirely.

The root is the `Root`-prefixed subdirectory; remaining `Part_*` subdirectories become its
descendants. `readModel` throws when the `Cmpnd` directory, an `Object name`, a `File name`, the
fragment directory or the root object is missing. `writeModel` names the root `Root` and every other
part `Part_<name>`, writes each fragment as a top-level directory beside `Cmpnd`, and throws on empty
names, duplicate names, or a non-integer `index`.

> **Name matching goes through `getResourceId`**, so constraint and hardpoint lookups are
> case-insensitive.

## Joints

A `Joint` describes how a child part is attached to its parent, and which degrees of freedom
animation may drive.

| Type          | Fields                                                                           | Animation                                     |
| ------------- | -------------------------------------------------------------------------------- | --------------------------------------------- |
| `'fixed'`     | `position`, `rotation`                                                           | None — rigid attachment                       |
| `'revolute'`  | `position`, `offset`, `rotation`, `axis`, `min`, `max`                           | Angle around `axis`, clamped to `min`/`max`   |
| `'prismatic'` | `position`, `offset`, `rotation`, `axis`, `min`, `max`                           | Offset along `axis`, clamped to `min`/`max`   |
| `'cylinder'`  | `position`, `offset`, `rotation`, `axis`, `minPris`/`maxPris`, `minRev`/`maxRev` | Rotation + slide; **not animatable**          |
| `'sphere'`    | `position`, `offset`, `rotation`, `minX/maxX`, `minY/maxY`, `minZ/maxZ`          | Rotation by quaternion within per-axis limits |
| `'loose'`     | `position`, `rotation`                                                           | Unconstrained motion (vector + rotation)      |

`position`/`offset`/`axis` are `Vector3`, `rotation` is a `Matrix3`. The keyframes that drive these
degrees of freedom live in the `Animation` directory beside `Cmpnd` — see
[ANIMATION.md](ANIMATION.md). How a joint composes into a world transform is in
[RENDERER.md §5.2](RENDERER.md#52-composing-a-joint).

> **Cylinder joints read and write, but cannot be animated.** A cylinder's two driven floats have no
> representation in the channel type bitfield — see
> [Why cylinder joints cannot be animated](ANIMATION.md#why-cylinder-joints-cannot-be-animated).
> That is impossible rather than merely absent.

### Where the records come from

Every joint record here is **Conquest: Frontier Wars** structure, unchanged. Digital Anvil's earlier
game uses the same UTF container and declares these in `Libs/Include/PERSISTCOMPOUND.H` — the same
lineage that leaves an `openFLAME 3D N-mesh` tree in four Freelancer files (see
[RETAIL.md](RETAIL.md#openflame-leftovers)). The record sizes match those structs field for field:

| CFW struct      | Layout after the two 64-byte names                                         | Size |
| --------------- | -------------------------------------------------------------------------- | ---- |
| `Fix`           | `pos`, `orient`                                                            | 176  |
| `Rev` / `Pris`  | `parent_point`, `child_point`, `rel_orientation`, `axis`, `min`, `max`     | 208  |
| `Cyl`           | as `Rev`, then `min_trans`, `max_trans`, `min_rot`, `max_rot`              | 216  |
| `PersistSphere` | `parent_point`, `child_point`, `rel_orientation`, 3× min/max               | 212  |
| `Spring`        | `parent_point`, `child_point`, `spring_constant`, `damping`, `rest_length` | 164  |
| `Loose`/`Trans` | typedefs of `Fix`                                                          | 176  |

So a `Cyl` record is 216 bytes and its limits are stored **translation-first**. `Cyl` is implemented
on the strength of that struct alone; no retail model ships one, so it is the single joint kind with
no corpus backing.

> CFW's own `JointInfo.h` documents `min0`/`max0` as the *rotation* limits for a cylindrical joint,
> contradicting the `min_trans`-first field order in `PERSISTCOMPOUND.H`. `Compound.cpp` assigns
> `min0 = in.min_trans`, siding with the struct — the comment is the odd one out.

Two CFW joint kinds have no Freelancer counterpart and no `Joint` variant here: `Spr` (damped spring)
and `Trans` (translational). `readConstraints` refuses both.

## Constraints

```ts
interface Constraint {
  parent: string // parent object name
  child: string  // child object name
  joint: Joint
}
```

Constraints live in the `Cons` directory, one file per joint kind, each holding a packed array of
records. A record is two 64-byte NUL-padded names — parent, then child — followed by the joint
payload.

| File     | Joint type    | Record size |
| -------- | ------------- | ----------- |
| `Fix`    | `'fixed'`     | 176         |
| `Rev`    | `'revolute'`  | 208         |
| `Pris`   | `'prismatic'` | 208         |
| `Cyl`    | `'cylinder'`  | 216         |
| `Sphere` | `'sphere'`    | 212         |
| `Loose`  | `'loose'`     | 176         |

**A record carries no size of its own — the file name is the only thing that gives one**, so a
constraint file this module does not know is refused rather than skipped, which would silently
desynchronize every record after it. Records are fixed size and the file holds nothing else, so every
retail `Cons` file is an exact multiple of the size above, which is what pins the stride down.

File names are matched case-insensitively on read; the writer emits the retail capitalization.

A name occupies its whole 64-byte field and is terminated by the first NUL. Names are otherwise taken
verbatim, including the leading and trailing spaces a few retail part names carry.

## Hardpoints

Named attachment points — weapon mounts, engine nozzles, docking points — stored per part. Rigid
parts carry them; so do the bones of a `.dfm`, which is how a head, a body and a pair of hands
assemble into one character.

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

They are read from and written to the `Hardpoints/Fixed` and `Hardpoints/Revolute` groups.
`getModelHardpoint` searches a whole model tree and returns the hardpoint with the part that owns it.

> **Prismatic hardpoints exist in the type union but are neither read from nor written to the
> `Hardpoints` directory.**

---

## Corpus

| | Count |
| --- | --- |
| Constraint records in rigid `.cmp` models | 5,316 |
| Constraint records in deformable `.dfm` models | 9,096 |
| `Cons` files across both | 1,024, all capitalized |

Joint kinds across both corpora: `loose` 6,343, `fixed` 4,370, `sphere` 2,770, `prismatic` 504,
`revolute` 425, `cylinder` **0**.

### Constraints round-trip by value, not byte for byte

**Every retail constraint record leaves stack residue past the terminator of its two 64-byte name
fields** — usually a longer name written into the same buffer earlier: a `Loose` record naming `Head`
still has `Head02` sitting at offset 24 of the field. This holds for all 9,096 deformable and all
5,316 rigid records, not a handful of files. The names read out identically either way, since a field
stops at its first NUL, and `writeConstraints` zero-fills.

Librelancer works around it with a bare `for (int i = 22; i < 64; i++) buffer[i] = 0;` in
`DfmConstructs.cs`, which is the same observation with the magic number left in.

### One unresolvable constraint

`trade_turret01.cmp` constrains a part it never declares. `arrangeByConstraints` drops a constraint it
cannot resolve, so the rest of the hierarchy still assembles — which is what a consumer should do
rather than refuse the model.
