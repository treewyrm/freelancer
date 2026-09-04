# Surface

Freelancer's `.sur` collision files. Unlike meshes and models, a surface library is **not** a UTF tree
— it is a standalone chunked binary that pairs with a model by part ID, so the readers take a
`BufferView`. Export names are in [API.md](API.md#surface).

A surface library is a flat list of **parts**. Each part carries a bounding box, a bounding sphere, a
list of hardpoint IDs, and a bounding-volume hierarchy whose leaves are convex **hulls** built from
shared **points**.

## Relationship to IVP

The `surf` chunk is not a Freelancer invention. It is a verbatim memory image of
**`IVP_Compact_Surface`** from Ipion Virtual Physics — the middleware that later became Havok.
Freelancer wraps it in a thin FourCC container (`vers`, `!fxd`, `exts`, `surf`, `hpid`) and stores a
part CRC where IVP stores user data.

Source: [ChimpsAtSea/Ipion-Virtual-Physics](https://github.com/ChimpsAtSea/Ipion-Virtual-Physics),
chiefly `ivp_surface_manager/ivp_compact_surface.hxx`,
`ivp_collision/ivp_compact_ledge.hxx` and the builder in
`ivp_compact_builder/ivp_surbuild_ledge_soup.cxx`. **Check any layout change against it.**

| This module | IVP class                                       | Size              |
| ----------- | ----------------------------------------------- | ----------------- |
| `Surface`   | `IVP_Compact_Surface`                           | 48 bytes (header) |
| `Node`      | `IVP_Compact_Ledgetree_Node`                    | 28 bytes          |
| `Hull`      | `IVP_Compact_Ledge`                             | 16 bytes (header) |
| `Face`      | `IVP_Compact_Triangle` + 3 × `IVP_Compact_Edge` | 16 bytes          |
| `Point`     | `IVP_Compact_Poly_Point` (an `IVP_U_Float_Hesse`) | 16 bytes        |

Two constants explain most of the magic numbers below. `IVP_COMPACT_BOUNDINGBOX_STEP_SIZE` and
`IVP_COMPACT_SURFACE_DEVIATION_STEP_SIZE` are both `1.0f / 250.0f`, and 250 is `0xfa` — the divisor
applied to `Node.boxSizes` and `Surface.surfaceDeviation`.

Field names follow IVP's meaning in this repository's camelCase style rather than its `snake_case`
identifiers:

| This module                            | IVP field                                                  |
| -------------------------------------- | ------------------------------------------------------------ |
| `Surface.massCenter`                   | `mass_center`                                              |
| `Surface.rotationInertia`              | `rotation_inertia` (MAXLancer names the same slot `drag`)  |
| `Surface.radius`                       | `upper_limit_radius`                                       |
| `Surface.surfaceDeviation`             | `max_factor_surface_deviation`                             |
| `Surface.padding`                      | `dummy[3]`                                                 |
| `Node.boxSizes`                        | `box_sizes`                                                |
| `Node.padding`                         | `free_0`                                                   |
| `Hull.reserved`                        | `for_future_use`                                           |
| `Face.material` / `Face.virtual`       | `material_index` / `is_virtual`                            |
| `Face.pierce`                          | `pierce_index`                                             |
| `Face.points`                          | per-edge `start_point_index`                               |
| `Face.opposites` / `Face.virtualEdges` | per-edge `opposite_index` / `is_virtual`                   |
| `Point.clientData`                     | `hesse_val`, reused as `client_data`                       |

## Architecture

```
Surface library (.sur)
  header ── 'vers' + float32 2.0
  └─ Part[]                     ── one per collision-enabled model part
       ├─ '!fxd'                ── part is not fixed to the root
       ├─ 'exts' → Extent       ── bounding box
       ├─ 'surf' → Surface      ── IVP_Compact_Surface
       │    ├─ massCenter, rotationInertia, radius, surfaceDeviation
       │    ├─ Hull[]           ── ledges
       │    ├─ Point[]          ── shared hull vertices
       │    └─ Node             ── ledgetree root
       │         ├─ left / right ── child nodes
       │         └─ hull?        ── Hull → Face[]
       └─ 'hpid' → number[]     ── hardpoint IDs
```

A part is matched to a model part by `id`, the CRC32 of the part name.

The file begins with the signature `vers` (`0x73726576`) followed by a `float32` version, which must
be exactly `2.0`. Parts are then read until the view is exhausted.

**Everything the format records but does not let a writer omit** — half-edge adjacency, pierce
indices, the bounding spheres and their quantized boxes, the mass properties — **is derivable from the
triangles, and this module derives it.** See [Building a hitbox](#building-a-hitbox).

---

## Part

```ts
interface Part extends Extent, Surface {
  id: number           // int32 — CRC32 of the model part name
  fixed: boolean       // false when the '!fxd' chunk is present
  hardpoints: number[] // int32 CRCs of hardpoints this part covers
}
```

| Field  | Type   | Notes                            |
| ------ | ------ | -------------------------------- |
| `id`   | int32  | Part identifier                  |
| count  | uint32 | Number of chunks that follow     |
| chunks | —      | Each prefixed by a uint32 FourCC |

| FourCC | Value        | Payload                                      |
| ------ | ------------ | -------------------------------------------- |
| `!fxd` | `0x64786621` | None — marks the part as not fixed           |
| `exts` | `0x73747865` | `Extent` (24 bytes)                          |
| `surf` | `0x66727573` | uint32 size, then the `Surface` block        |
| `hpid` | `0x64697068` | uint32 count followed by that many int32 IDs |

**Chunk payloads are not length-prefixed at the tag level, so an unrecognized tag cannot be skipped** —
continuing past one would silently desynchronize the rest of the file. `readPart` throws a
`RangeError` instead.

### Matching a part to a model part

**There are two rules and the id-by-name one is only the second.** A part built for a **non-compound**
model carries `id` **0**, not the CRC of anything — MAXLancer's `SurfacePart.Parse` sets
`partID = if compound then Hash target.name else 0`, and `SurfaceLibrary.Build` looks it back up the
same way. So a consumer resolves a part as:

1. `id === 0` → the model root, for a `.3db` with no `Cmpnd`.
2. `id === getResourceId(partName)` → that compound part.

Measured over the 1,308 parts in the 735 retail `.sur` files with a sibling model: **549 match by the
zero, 747 by name, 12 by neither**. The zero is not an edge case — it is 549 of the 551 single-part
`.3db` surfaces — so a reader implementing rule 2 alone loses every one of them, silently.

**Compare ids unsigned.** `readPart` reads `id` with `readInt32` and `readHull` with `readUint32`,
while `getResourceId` returns a signed int32, so a CRC with the high bit set matches neither under a
bare `===`.

`fixed` is the **inverse** of the `!fxd` chunk: a part reads back as `fixed: true` when the chunk is
absent, and on write the chunk is emitted whenever `fixed` is falsy. The `hpid` chunk is written only
when `hardpoints` is non-empty, matching Freelancer. Chunks are written in Freelancer's order: `!fxd`
(conditional), `exts`, `surf`, `hpid` (conditional).

## Extent

```ts
interface Extent {
  minimum: Vector3
  maximum: Vector3
}
```

Fixed size: **24 bytes**.

> **Component order:** stored as two contiguous XYZ vectors — `min.x, min.y, min.z, max.x, max.y,
> max.z`. This does *not* follow [`VMeshRef`](VMESH.md#mesh-reference)'s interleaved convention.

The extent bounds the part, which for a compound part is not obliged to enclose every hull.

`createBox` indexes its corners by axis bit — corner `n` takes the maximum on axis `a` when bit `a` of
`n` is set — so corner 0 is the minimum and corner 7 the maximum. It is the shortest path to a
hitbox: `createPart(id, [{ id, ...createBox(extent) }])`.

## Surface

```ts
interface Surface {
  massCenter: Vector3      // also the bounding sphere centre; used for the aiming reticle
  rotationInertia: Vector3 // not a drag coefficient — debris tumbles by it, observed in game
  radius: number           // must encompass every hull in the part
  surfaceDeviation: number // quantized in steps of 1/250
  points: Point[]          // shared hull vertices
  root: Node               // ledgetree root
  padding: Vector3         // 16-byte alignment padding
}
```

The block is preceded by a `uint32` size, which duplicates the `byte_size` field inside the header.
Then a 48-byte header:

| Field             | Type      | IVP name                                                              |
| ----------------- | --------- | ----------------------------------------------------------------------- |
| `massCenter`      | float32×3 | `mass_center`                                                         |
| `rotationInertia` | float32×3 | `rotation_inertia`                                                    |
| `radius`          | float32   | `upper_limit_radius`                                                  |
| header            | uint32    | Low byte = `max_factor_surface_deviation`; upper 24 bits = `byte_size` |
| `startOffset`     | int32     | `offset_ledgetree_root`                                               |
| `padding`         | int32×3   | `dummy[3]`                                                            |

Hulls, points and nodes follow, in that order — the layout `IVP_SurfaceBuilder_Ledge_Soup` emits.
**Offsets inside the block are relative to the field that holds them**, so the block is position
independent. The reader walks the tree from `startOffset` with a queue, resolving each node's
right-child and hull offsets; offsets outside `[startOffset, byte_size]` raise a `RangeError`. Each
hull records a relative offset to the shared point block; points are read from there up to
`startOffset`.

**Descent stops at a node whose hull has type `Enabled`**; nodes with no hull or with a `Skip` hull
continue into their children. IVP's own test is `offset_right_node != 0`, which agrees on well-formed
data because a leaf node always carries a terminal ledge.

`surfaceDeviation` is a **deviation, not a scale factor**: multiply it by `radius` to recover how far
the surface departs from the bounding sphere. The builder computes it as
`int(1 + deviation / (radius / 250))`.

> **MAXLancer reads this byte as something else, and the disagreement is unresolved.** Its
> `SurfacePart.scaler` is `minRadius / maxRadius`, where `maxRadius` covers every point of the part
> and `minRadius` only the points of hulls **whose id is not in the `hpid` list** — a bounding-sphere
> scale that deliberately excludes hardpoint hulls. Both readings divide by 250 and land in the same
> range, so this module's reproducing retail in 1,349 of 1,365 does not by itself separate them.
> That reading is more plausible than it first looks, now that hardpoint hulls are known to be a real
> category — 1,272 of the 9,111. Nothing here depends on the answer, since the field is written from
> the derivation and round-trips either way. **It is settleable by measurement, not by observation**,
> which is why it is not in [TODO](#todo): compute both quantities over the corpus and compare each
> against the stored byte, on the parts that discriminate — those whose hardpoint hulls reach further
> than the rest, where `minRadius / maxRadius` departs from 1.

### Where the four derived values come from

`getMassProperties` is IVP's `insert_radius_in_compact_surface`, and reads the **terminal** hulls
only, skipping anything that merely bounds a subtree, exactly as IVP's `get_all_ledges` does.

- **`massCenter`** is the centroid of the volume the hulls enclose, by the divergence theorem: each
  face spans a tetrahedron with the origin of signed volume `dot(normal, a) / 6` and centroid the mean
  of its four points. A hull enclosing no volume — the flat two-face hulls the corpus is full of — has
  nothing to integrate, and IVP falls back to the centre of the bounding box, tested as the summed
  determinant against the summed area to the power of three halves.
- **`radius`** is how far the farthest point sits from `massCenter`.
- **`surfaceDeviation`** comes off the same pass: the deviation is how far a point sits off the axis
  through `massCenter` along its own face's normal, and the byte is `int(1 + deviation / (radius / 250))`.
- **`rotationInertia`** integrates each axis with the other two rotated into place and combines the
  three second moments pairwise. Where the hull encloses no volume it takes the same fallback,
  `0.5 × r²` uniform across the three axes.

Three of the four reproduce retail outright; `rotationInertia` does not, and [TODO](#todo) says why.

## Node

```ts
interface Node {
  center: Vector3  // boundary center, in object coordinates
  radius: number   // bounding sphere radius
  boxSizes: Vector3 // stored as uint8 / 250
  padding: number  // always zero
  hull?: Hull      // leaf hull, when present
  left?: Node
  right?: Node
}
```

Fixed size: **28 bytes** — right-child offset (int32), hull offset (int32), then a 20-byte payload. A
zero offset means "absent"; the left child, when present, immediately follows its parent.

Multiply `boxSizes` by `radius` to get the half-extents of the axis-aligned box around `center`.

**A well-formed tree is a full binary tree**, so `nodeCount == 2 × terminalHulls − 1`.

A leaf's sphere is centred on its hull's bounding box and reaches the corners of it, and each box size
is `int(halfExtent / (radius / 250)) + 1` — **truncated and then stepped past**, so the quantized box
always contains the one it came from. The half-extent never exceeds the radius, so the count never
exceeds 251 and always fits its byte.

`mergeNodes` unions the children's **quantized** boxes rather than their spheres, which is what lets a
parent's bounds follow from what was written for its children without visiting anything below again.
Both rules are IVP's `ledges_to_boxes_and_spheres` and `build_minimal_sphere`.

`createHierarchy` merges whichever pair of nodes yields the tightest bounds until one is left, which
is the rule IVP's sphere clustering minimizes — without the interval hash it uses to avoid comparing
every pair. Inner nodes come back **without a hull**; `createPart` is what fills them.

## Hull

```ts
enum HullType {
  Enabled = 4, // terminal ledge; `id` is the model part ID
  Skip = 5,    // bounds a subtree; `id` is an offset back to the owning node
}

interface Hull {
  id: number
  type: HullType
  faces: Face[]
  reserved: number // always zero
}
```

| Field        | Type   | IVP name                                             |
| ------------ | ------ | ------------------------------------------------------ |
| point offset | int32  | `c_point_offset`, relative to the hull               |
| `id`         | int32  | `ledgetree_node_offset` / `client_data`              |
| header       | uint32 | Low byte = type flags; upper 24 bits = `size_div_16` |
| face count   | int16  | `n_triangles`                                        |
| `reserved`   | int16  | `for_future_use`                                     |
| faces        | —      | 16 bytes each                                        |

`HullType` is not an enum in IVP but two packed flags: `has_children` (bits 0–1) and `is_compact`
(bits 2–3). Every hull Freelancer emits is compact, so only 4 and 5 occur.

That distinction is what gives **`id` two meanings**: it is IVP's
`union { ledgetree_node_offset; client_data; }`. A terminal ledge stores user data — Freelancer's part
CRC, which may differ from the id of the surface part containing it — while a subtree-bounding ledge
stores a relative offset back to the node that owns it.

> **A terminal hull's `id` is a label, not a coordinate frame.** Its points are in the frame of the
> **part containing it**, whatever the id names. MAXLancer's `SurfaceLibrary.GetPartSurfaces` walks
> descendant parts joined by a **fixed** joint and folds their hulls into the nearest non-fixed
> ancestor's part, reading every vertex `in coordsys target`; `SurfacePart.Build` restates it by
> hanging each rebuilt hull at `hull.transform = target.transform`, with no per-hull transform
> anywhere. Scored against the named part's own mesh bounding sphere over the 1,801 retail hulls
> where the two candidate frames differ, the containing part wins **1,753 to 48**. The id survives as
> provenance — which part or hardpoint the geometry came from, for damage attribution.
>
> It differs from its part's id in **3,164 of the 9,111** terminal hulls and **321 of 1,365** parts
> hold hulls under more than one id, so reading it as a frame misplaces a third of the corpus — and
> still draws something.

**The fold does not move a hull, it copies it.** `SurfaceLibrary.Parse` runs `GetPartSurfaces` for
every part, and the descent into fixed children is transitive, so a hull on a fixed-jointed child is
written into that child's own part **and** into each of its fixed ancestors' — the same geometry,
re-expressed once per frame it lands in. The game wants that: a parent answers for its whole fixed
subtree without descending into it. It reaches **hardpoint hulls as well as part hulls**, and the
ancestor's `hpid` chunk grows to list the descendants' hardpoints accordingly, which is why a root's
`hpid` is routinely a superset of the hardpoints its own part carries. Over the retail files with a
sibling model, **1,377 of 8,982** placeable hulls across **62 files** are copies of another part's;
`freeport7_dmg.sur` is exactly half. A reader that wants each hull once drops those whose id names a
part reached through an unbroken chain of fixed joints that holds them itself — MAXLancer's import
default, its "Keep Duplicates" checkbox being the opt-out — and a reader that wants the file as the
game sees it keeps them. **This library does neither**: `readSurfaceLibrary` reports what the bytes
say, and which of the two a consumer wants is a policy.

**A hull id is one of three things, and `hpid` is what tells them apart.** `GetPartSurfaces` also
collects `HardpointHelper` children carrying a hull shape, hashing the **hardpoint's** name for the
id, and `SurfacePart.hardpoints` — the `hpid` chunk — ends up holding exactly that set. So across the
9,111 terminal hulls: **1,272** have an id listed in their part's `hardpoints` and are collision
volumes on a hardpoint, **5,314** name a model part, and **2,525** are `0`. **`writeSurface` recomputes the type-5 value**,
since it depends on where the node tree lands.

`size_div_16` is the whole ledge size in 16-byte units: one header, one per triangle, one per point.
Since a closed convex polyhedron has `V = 2 + F / 2` by Euler's formula, this reduces to
`(12 + faceCount × 6) / 4`, which is what `getIndexCount` computes and validates on read.

`createHull` leaves a `Skip` hull's `id` at zero, since only `writeSurface` can know the offset it
holds, and marks its faces and every edge of them virtual.

## Face

```ts
interface Face {
  material: number           // material index, 7 bits
  virtual: boolean           // face belongs to a subtree-bounding hull
  pierce: number             // the face found by casting a ray along the inverted normal
  points: TriangleIndices    // point indices into the part's shared point list
  opposites: TriangleIndices // flat index (face × 3 + edge) of each opposing half-edge
  virtualEdges: TriangleFlags // per-edge counterpart of `virtual`; set when hull type is 5
}
```

Fixed size: **16 bytes**. The leading `uint32` packs `virtual` (bit 31), `material` (bits 24–30),
`pierce` (bits 12–23), and the face's own `tri_index` (bits 0–11) — **faces are therefore stored out
of order** and placed into `faces[index]` on read.

IVP declares `material_index` and `is_virtual` as adjacent bitfields, so this module splits them
rather than exposing one byte.

Each of the three edges is a `uint16` point index followed by a `uint16` holding `is_virtual` in bit
15 and a signed 15-bit `opposite_index` in the rest.

`opposite_index` is a **delta in 4-byte slots**, and a triangle occupies four slots — a header word
plus three edges — so edge `v` of face `f` lives at slot `4f + v + 1`. `opposites` exposes this as the
flat edge index `3f + v` instead. The two codecs convert through a matched pair of helpers,
`toEdgeIndex` and `toSlot`, which are exact inverses.

Triangles are three indices into the point list, **wound counter-clockwise seen from outside**, so the
outward normal is `(b - a) × (c - a)`. That winding is not a convention this module picked: shooting a
ray the other way matches nothing in the corpus, and it is what [RENDERER.md](RENDERER.md) records for
positions taken verbatim.

`createFaces` **refuses geometry the format cannot hold** rather than writing something a reader will
throw on: an open surface, where a half-edge has nothing running the other way; a half-edge two
triangles both wind; a degenerate triangle; and a point count Euler's `V = 2 + F / 2` does not allow,
which is what the ledge size the writer encodes assumes.

**`opposites` is fully determined** by the triangles. **`pierce` is not.** IVP's `insert_pierce_info`
pairs each face with the one whose normal points most nearly the other way, walking its own triangle
list in order and skipping a face that already has a partner — but *not* skipping one as a candidate,
which is why the result is not an involution and neither is retail's. The order it walked is the
builder's, not the order the compact ledge stores, so every tie it broke is lost.

## Point

```ts
interface Point extends Vector3 {
  clientData: number
}
```

Fixed size: **16 bytes** — float32 x/y/z, **then** the int32 `clientData`.
`IVP_Compact_Poly_Point` derives from `IVP_U_Float_Hesse`, so the coordinates come first and the
trailing word is the plane's `hesse_val` slot, reused as `client_data`.

Points are shared across all the hulls of a part — the builder re-indexes each ledge into one common
array — so faces reference them by index into `Surface.points`.

**`clientData` is the id of the hull the point belongs to.** MAXLancer names the field
`SurfacePoint.hullID`, and its `GetPointIndex position hullID` reuses an existing point only when the
*hull id matches as well as the position* — so the array is partitioned by hull rather than shared
across hulls in the way "shared" suggests. Measured: **every point of 9,085 of the 9,111 terminal
hulls carries that hull's own id**, 26 hulls match partially, and none match not at all. The 25% of
points whose `clientData` is zero are the points of the 2,525 id-zero hulls.

Nothing in this module reads it — faces index points directly and `createPart` carries through
whatever a caller supplies — but it means two hulls never share a point, which a reader building
per-hull vertex buffers can rely on.

---

## Building a hitbox

`createPart(id, hulls, options?)` is the construction entry point. `HullGeometry` is one convex hull
as a caller has it — an `id`, its **own** points, and triangles indexing them. Whether two hulls share
a point is not the caller's problem: `createPart` folds them into the one list a surface part holds
and re-indexes the triangles, which is what IVP's builder does.

| Option          | Default | Effect                                                        |
| --------------- | ------- | ------------------------------------------------------------- |
| `fixed`         | `true`  | `false` writes the `!fxd` chunk                               |
| `hardpoints`    | `[]`    | Written as `hpid` only when non-empty                         |
| `bounds`        | `'box'` | What to hang on an inner node — see below                     |
| mass properties | derived | Any of the four in `MassProperties` overrides what is derived |

A box, from nothing:

```ts
import { createBox, createPart, writeSurfaceLibrary } from '@treewyrm/freelancer/surface'
import { getResourceId } from '@treewyrm/freelancer'

const id = getResourceId('Root')
const extent = { minimum: { x: -2, y: -1, z: -6 }, maximum: { x: 2, y: 1, z: 6 } }

const part = createPart(id, [{ id, ...createBox(extent) }])
const bytes = writeSurfaceLibrary([part])
```

Several hulls, which is what a compound model wants — one per collision-enabled part, each keyed by
the CRC32 of the model part name:

```ts
const part = createPart(getResourceId('Root'), [
  { id: getResourceId('Root'), ...createBox(hull) },
  { id: getResourceId('wing_lt'), points, triangles },
], { hardpoints: [getResourceId('HpWeapon01')] })
```

What happens, in order:

1. Every hull's points are merged into the part's shared list and its triangles re-indexed onto it.
2. `createFaces` derives each face's half-edge adjacency and pierce index, and refuses geometry the
   format cannot hold.
3. `createNode` gives each hull its bounding sphere and quantized box.
4. `createHierarchy` folds the leaves into a full binary tree, tightest pair first.
5. Each inner node gets the box it bounds as a `Skip` hull, unless `bounds: 'none'`.
6. `getMassProperties` derives `massCenter`, `radius`, `surfaceDeviation` and `rotationInertia`.
7. The extent comes off the collision geometry, taken **before** step 5 added anything.

### `bounds`

Retail always puts a hull on the root: a terminal one when the part is a single convex shape,
otherwise a `Skip` hull bounding everything below, carrying real convex geometry. **Generating a
convex hull of a subtree is an algorithm this library does not own**, so `bounds: 'box'` hangs the box
the node already bounds on it instead — a valid convex bound, eight more points and twelve more faces
per inner node, and the same shape retail has.

The box used is the union of the children's boxes *before* it was quantized, which is exactly the box
the node's sphere circumscribes. Taking the quantized box back would put its corners outside that
sphere, and every retail file keeps what a node holds inside it.

`bounds: 'none'` leaves inner nodes bare. IVP emits that too — `build_ledgetree` writes
`offset_compact_ledge = 0` whenever no bounding ledge was built — and this reader descends through a
hull-less node either way. It has not been observed in game.

### What the caller still owns

None of it is measurable from the bytes:

- **Convexity.** Nothing here checks it, and IVP's whole layout assumes it — `V = 2 + F / 2` is
  enforced, which a non-convex closed mesh will usually fail, but not always.
- **Decimation.** How many faces a collision hull should have is a budget, not a fact.
- **Splitting a concave shape into convex hulls.** Retail parts carry up to hundreds of them.
- **`Point.clientData`.** The owning hull's id — see [Point](#point). `createPart` carries through
  whatever a caller puts on its input points and otherwise writes zero, so a caller that wants
  retail's convention sets it to the hull id itself.

A part built this way is a fixed point: write it, read it back, write it again, and the bytes match.

---

## Corpus

| | Count |
| --- | --- |
| `.sur` files | 798, of which **781 the reader accepts** |
| — predating the container | 17 |
| Parts | 1,365 |
| Terminal (type-4) hulls | 9,111 |
| Subtree-bounding (type-5) hulls | 415, averaging 69 faces |
| Faces | 177,824 — 149,180 terminal, 28,644 virtual |
| Points | 79,596 |

`nodeCount == 2 × terminalHulls − 1` holds for all 1,365 parts, `size_div_16` for all 9,526 hulls, and
the `surf` chunk's two size fields agree in all 1,365. `Surface.padding` is zero in every file.

`Face.material` is 0 for all 177,824 faces; `virtual` is true for all 28,644 faces of type-5 hulls and
false for all 149,180 of type-4, and the three per-edge `is_virtual` flags always agree with it.
`Point.clientData` is the owning hull's id: it agrees on **every point of 9,085 of the 9,111**
terminal hulls, partially on 26, and on none of none. The 25% of points that are zero belong to the
2,525 hulls whose own id is zero.

Terminal hull ids split **5,314 naming a model part · 1,272 listed in their part's `hpid` · 2,525
zero**, and surface parts match a model **549 by the id-zero rule · 747 by part name · 12 by
neither**.

The extent encloses every point of its part in 1,134 of 1,365; every point a part holds is indexed by
some face, in all 1,365.

### Files that predate the container

17 files carry no signature at all. They open with the 24-byte bounding box, then a length-prefixed
part **name** where the modern format puts a part CRC, then the chunk list — whose tags include
`ledg`, which `vers` files never use. `li_battleship.sur` and the freight train are the notable ones.

Nothing past the bounding box is shared with the version 2 layout, so `readSurfaceLibrary` rejects them
with `Invalid SUR header` rather than misreading them. **This module does not support the older
format.**

### What the derivations reproduce

| Derived value                      | Reproduces retail                            |
| ---------------------------------- | -------------------------------------------- |
| `Face.opposites`                   | **177,824 of 177,824** — fully determined    |
| `Face.pierce`                      | 151,761 of 177,824                           |
| `Surface.massCenter`               | **all 1,365 parts**, to within 1e-4 × radius |
| `Surface.radius`                   | **all 1,365**                                |
| `Surface.surfaceDeviation`         | 1,349 of 1,365                               |
| `Surface.rotationInertia`          | 2,067 of 4,095 components                    |
| — on parts enclosing no volume     | **84 of 84**, uniform across the axes        |
| Leaf node centre and radius        | **all 9,111**, to within 1e-4 relative       |
| Leaf node quantized box, all three bytes | 9,110 of 9,111                         |

The `pierce` residue is ties on symmetric hulls, where two faces are equally opposite and the file
records the one this module cannot know it picked. The 16 `surfaceDeviation` misses sit on a step and
the truncation falls the other side of it. `rotationInertia` is the one real disagreement — see
[TODO](#todo).

### Round-trip

`writeSurfaceLibrary` reproduces the IVP layout but not Freelancer's exact ordering: **IVP's builder
emits terminal ledges before subtree-bounding ones, whereas this writer emits them in tree order.**
Re-encoding is therefore not byte-identical to the original file, but it **is a fixed point** —
writing a decoded library and reading it back yields the same structure, and encoding that again gives
identical bytes. Both properties hold across all 781 files the reader accepts; **574 of them re-encode
byte for byte regardless.**

The one value that does not survive verbatim is a type-5 hull's `id`, which is a derived offset and is
reassigned on write.

---

## TODO

### How close `rotationInertia` has to be

**The field is read.** A part blown off a model becomes debris and tumbles by it — observed in game.
MAXLancer carries the same slot as `drag` and says the question is open; it is not.

`getMassProperties` implements IVP's `IVP_Rot_Inertia_Solver` as written, and it is right where it can
be checked. Every one of the 84 parts that take the degenerate fallback reproduces exactly. On hulls
that are still exact boxes — `crate_blue.sur` and the rest of the twelve-face crates — it reproduces
the shipped figure to better than a part in a thousand. Over the whole corpus it does not: **2,067 of
4,095 components agree within 0.1%**, another ~700 are within a few percent, and roughly a quarter are
off by more than 25%. `pod_drab.sur` computes 72.27 where the file says 122.50.

**The disagreement tracks decimation.** `crate_grey.sur`'s hull has **ten** faces where a box has
twelve, and it misses by 0.5%; `pod_drab.sur`'s has 62 and misses by 41%. `massCenter` and `radius`
agree on every one of those same parts, so the geometry is being read correctly. The reading is that
Freelancer measured the inertia on the art mesh and then simplified the collision hull, and the file
kept the earlier number. **Nothing in the file can recover it**, because the mesh it was measured from
is not in the file.

So the open question is not whether to derive it but how far off is too far. What is known:

- The derived value is much the closer of the two candidates. Against retail it wins on **3,590 of
  4,095 components**, and is within 0.1% on 2,067 where MAXLancer's rule manages 4.
- MAXLancer generates the field as `0.2 × radius²` on all three axes, jittered by ±0.1% so they
  differ, and mods built with it work. That rule is within 25% of retail on barely a quarter of
  components — retail's own mean ratio to `radius²` is **0.137**, not 0.2 — so **the game tolerates a
  figure that is wrong by tens of percent**, which bounds how much the residual gap here can matter.
- The jitter is not required by anything measurable: retail ships 92 parts whose three components are
  identical, and this module reproduces 84 of them exactly. A builder here stays deterministic.

**The experiment that would sharpen it:** take a retail `.sur` whose stored inertia is far from the
derived one — the `pod_*` debris are the clearest, being loose objects that tumble — rewrite it with
the derived value and shoot the object, then again with `0.2 × radius²`. The difference between those
two spins is the whole size of the question.

Until then `createPart` derives it, because a number from the right algorithm on a simplified mesh
beats a constant that is wrong by 46% at the median. Pass the art mesh's figure through `PartOptions`
when it is at hand, which is why the override exists.
