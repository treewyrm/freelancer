# Surface

Reader and writer for Freelancer's `.sur` collision files. Unlike meshes and models, a surface library is **not** a UTF tree — it is a standalone chunked binary that pairs with a model by part ID.

A surface library is a flat list of **parts**. Each part carries a bounding box, a bounding sphere, a list of hardpoint IDs, and a bounding-volume hierarchy whose leaves are convex **hulls** built from shared **points**.

## Relationship to IVP

The `surf` chunk is not a Freelancer invention. It is a verbatim memory image of **`IVP_Compact_Surface`** from Ipion Virtual Physics — the middleware that later became Havok. Freelancer wraps it in a thin FourCC container (`vers`, `!fxd`, `exts`, `surf`, `hpid`) and stores a part CRC where IVP stores user data.

Source: [ChimpsAtSea/Ipion-Virtual-Physics](https://github.com/ChimpsAtSea/Ipion-Virtual-Physics), chiefly `ivp_surface_manager/ivp_compact_surface.hxx`, `ivp_collision/ivp_compact_ledge.hxx` and the builder in `ivp_compact_builder/ivp_surbuild_ledge_soup.cxx`.

| This module | IVP class | Size |
| --- | --- | --- |
| `Surface` | `IVP_Compact_Surface` | 48 bytes (header) |
| `Node` | `IVP_Compact_Ledgetree_Node` | 28 bytes |
| `Hull` | `IVP_Compact_Ledge` | 16 bytes (header) |
| `Face` | `IVP_Compact_Triangle` + 3 × `IVP_Compact_Edge` | 16 bytes |
| `Point` | `IVP_Compact_Poly_Point` (an `IVP_U_Float_Hesse`) | 16 bytes |

Two constants explain most of the magic numbers below. `IVP_COMPACT_BOUNDINGBOX_STEP_SIZE` and `IVP_COMPACT_SURFACE_DEVIATION_STEP_SIZE` are both `1.0f / 250.0f`, and 250 is `0xfa` — the divisor applied to `Node.boxSizes` and `Surface.surfaceDeviation`.

Field names follow IVP's meaning in this repository's camelCase style rather than its `snake_case` identifiers:

| This module | IVP field |
| --- | --- |
| `Surface.massCenter` | `mass_center` |
| `Surface.rotationInertia` | `rotation_inertia` (MAXLancer names the same slot `drag`) |
| `Surface.radius` | `upper_limit_radius` |
| `Surface.surfaceDeviation` | `max_factor_surface_deviation` |
| `Surface.padding` | `dummy[3]` |
| `Node.boxSizes` | `box_sizes` |
| `Node.padding` | `free_0` |
| `Hull.reserved` | `for_future_use` |
| `Face.material` / `Face.virtual` | `material_index` / `is_virtual` |
| `Face.pierce` | `pierce_index` |
| `Face.points` | per-edge `start_point_index` |
| `Face.opposites` / `Face.virtualEdges` | per-edge `opposite_index` / `is_virtual` |
| `Point.clientData` | `hesse_val`, reused as `client_data` |

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

A part is matched to a model part by `id`, the CRC32 of the part name (`getResourceId`).

Everything the format records but does not let a writer omit — half-edge adjacency, pierce indices,
the bounding spheres and their quantized boxes, the mass properties — is derivable from the
triangles, and this module derives it. See [Building a hitbox](#building-a-hitbox).

---

## `library.ts` — Surface Library

| Function                     | Description                                                     |
| ---------------------------- | ----------------------------------------------------------------- |
| `readSurfaceLibrary(view)`   | Reads a `BufferView` and returns `Part[]`; validates header      |
| `writeSurfaceLibrary(parts)` | Serializes `Part[]` into a `BufferView` with header prepended    |

The file begins with the signature `vers` (`0x73726576`) followed by a `float32` version, which must be exactly `2.0`. Parts are then read until the view is exhausted.

```ts
import { BufferView } from '@treewyrm/freelancer/utility'
import { readSurfaceLibrary } from '@treewyrm/freelancer/surface'
import { readFileSync } from 'node:fs'

const parts = readSurfaceLibrary(BufferView.from(readFileSync('ships/li_fighter.sur')))
```

### Files that predate the container

17 of the 798 retail `.sur` files carry no signature at all. They open with the 24-byte bounding box, then a length-prefixed part **name** where the modern format puts a part CRC, then the chunk list — whose tags include `ledg`, which `vers` files never use. `li_battleship.sur` and the freight train are the notable ones.

Nothing past the bounding box is shared with the version 2 layout, so `readSurfaceLibrary` rejects them with `Invalid SUR header` rather than misreading them. This module does not support the older format.

---

## `part.ts` — Surface Part

### `Part` interface

```ts
interface Part extends Extent, Surface {
  id: number // int32 — CRC32 of the model part name
  fixed: boolean // false when the '!fxd' chunk is present
  hardpoints: number[] // int32 CRCs of hardpoints this part covers
}
```

### Binary layout

| Field   | Type     | Notes                                     |
| ------- | -------- | ------------------------------------------- |
| `id`    | int32    | Part identifier                           |
| count   | uint32   | Number of chunks that follow              |
| chunks  | —        | Each prefixed by a uint32 FourCC          |

| FourCC   | Value        | Payload                                        |
| -------- | ------------ | ------------------------------------------------ |
| `!fxd`   | `0x64786621` | None — marks the part as not fixed             |
| `exts`   | `0x73747865` | `Extent` (24 bytes)                            |
| `surf`   | `0x66727573` | uint32 size, then the `Surface` block           |
| `hpid`   | `0x64697068` | uint32 count followed by that many int32 IDs   |

Chunk payloads are not length-prefixed at the tag level, so an unrecognized tag cannot be skipped — continuing past one would silently desynchronize the rest of the file. `readPart` therefore throws a `RangeError` instead. No file in the retail corpus used a tag outside the four above.

`fixed` is the **inverse** of the `!fxd` chunk: a part reads back as `fixed: true` when the chunk is absent. On write the chunk is emitted whenever `fixed` is falsy. The `hpid` chunk is written only when `hardpoints` is non-empty, matching Freelancer, which omits it for most parts.

Chunks are written in Freelancer's order: `!fxd` (conditional), `exts`, `surf`, `hpid` (conditional).

### `createPart`

```ts
createPart(id: number, hulls: HullGeometry[], options?: PartOptions): Part
```

`HullGeometry` is one convex hull as a caller has it — an `id`, its **own** points, and triangles
indexing them. Whether two hulls share a point is not the caller's problem: `createPart` folds
them into the one list a surface part holds and re-indexes the triangles, which is what IVP's
builder does and what the corpus shows (every point a part holds is indexed by some face, in all
1365 of them).

| Option            | Default          | Effect                                                     |
| ----------------- | ---------------- | ------------------------------------------------------------ |
| `fixed`           | `true`           | `false` writes the `!fxd` chunk                            |
| `hardpoints`      | `[]`             | Written as `hpid` only when non-empty                      |
| `bounds`          | `'box'`          | What to hang on an inner node — see below                  |
| mass properties   | derived          | Any of the four in `MassProperties` overrides what is derived |

The extent is taken **before** any bounding box is added, so it covers the collision geometry and
not the boxes wrapped around it.

#### `bounds`

Retail always puts a hull on the root: a terminal one when the part is a single convex shape,
otherwise a `Skip` hull bounding everything below, and 415 such hulls carry real convex geometry
averaging 69 faces. **Generating a convex hull of a subtree is an algorithm this library does not
own**, so `bounds: 'box'` hangs the box the node already bounds on it instead — a valid convex
bound, eight more points and twelve more faces per inner node, and the same shape retail has.

The box used is the union of the children's boxes *before* it was quantized, which is exactly the
box the node's sphere circumscribes. Taking the quantized box back would put its corners outside
that sphere, and every retail file keeps what a node holds inside it.

`bounds: 'none'` leaves inner nodes bare. IVP emits that too — `build_ledgetree` writes
`offset_compact_ledge = 0` whenever no bounding ledge was built — and this reader descends through
a hull-less node either way. It has not been observed in game.

---

## `extent.ts` — Bounding Box

```ts
interface Extent {
  minimum: Vector3
  maximum: Vector3
}
```

Fixed size: **24 bytes**.

> **Component order:** stored as two contiguous XYZ vectors — `min.x, min.y, min.z, max.x, max.y, max.z`. This does *not* follow `VMeshRef`'s interleaved convention.

`readExtent(view, extent)` fills an existing object in place (parts are `Extent`s); `writeExtent(extent)` returns a new `BufferView`.

The extent bounds the part, which for a compound part is not obliged to enclose every hull: across the 1365 retail parts, 1134 had all their points inside it.

| Function              | Description                                                                    |
| --------------------- | -------------------------------------------------------------------------------- |
| `getExtent(points)`   | Axis-aligned bounds of a point set; an empty set gives an inverted, union-safe extent |
| `createBox(extent)`   | The eight corners and twelve outward-wound triangles of a box                  |

`createBox` indexes its corners by axis bit — corner `n` takes the maximum on axis `a` when bit `a`
of `n` is set — so corner 0 is the minimum and corner 7 the maximum. It is the shortest path to a
hitbox: `createPart(id, [{ id, ...createBox(extent) }])`.

---

## `surface.ts` — Surface Block

### `Surface` interface

```ts
interface Surface {
  massCenter: Vector3 // also the bounding sphere centre; used for the aiming reticle
  rotationInertia: Vector3 // not a drag coefficient — debris tumbles by it, observed in game
  radius: number // must encompass every hull in the part
  surfaceDeviation: number // quantized in steps of 1/250
  points: Point[] // shared hull vertices
  root: Node // ledgetree root
  padding: Vector3 // 16-byte alignment padding
}
```

`surfaceDeviation` is a **deviation**, not a scale factor: multiply it by `radius` to recover how far the surface departs from the bounding sphere. The builder computes it as `int(1 + deviation / (radius / 250))`.

`padding` is `int dummy[3]` in IVP and is zero in every file surveyed.

### Where the four derived values come from

`getMassProperties` is IVP's `insert_radius_in_compact_surface`, and three of the four reproduce
retail outright.

- **`massCenter`** is the centroid of the volume the hulls enclose, by the divergence theorem: each
  face spans a tetrahedron with the origin of signed volume `dot(normal, a) / 6` and centroid the
  mean of its four points. A hull enclosing no volume — the flat two-face hulls the corpus is full
  of — has nothing to integrate, and IVP falls back to the centre of the bounding box, tested as
  the summed determinant against the summed area to the power of three halves. **All 1365 retail
  parts, to within 1e-4 of the radius.**
- **`radius`** is how far the farthest point sits from `massCenter`. **All 1365.**
- **`surfaceDeviation`** comes off the same pass: the deviation is how far a point sits off the axis
  through `massCenter` along its own face's normal, and the byte is
  `int(1 + deviation / (radius / 250))`. **1349 of 1365 exactly**; the other 16 sit on a step and
  the truncation falls the other side of it.
- **`rotationInertia`** integrates each axis with the other two rotated into place and combines the
  three second moments pairwise. Where the hull encloses no volume it takes the same fallback,
  `0.5 × r²` uniform across the three axes, and **all 84 retail parts that reach that path carry
  exactly what it produces** — so a uniform inertia is what Freelancer ships (92 parts have one)
  and is not worth perturbing away from. On the volumetric path it agrees on **2067 of 4095
  components** and is off by more than a quarter on roughly a quarter of them — see
  [TODO](#todo).

### Binary layout

The block is preceded by a `uint32` size, which duplicates the `byte_size` field inside the header — the two agree on all 1365 retail parts. Then a 48-byte header:

| Field              | Type       | IVP name                          |
| ------------------ | ---------- | ----------------------------------- |
| `massCenter`       | float32×3  | `mass_center`                     |
| `rotationInertia`  | float32×3  | `rotation_inertia`                |
| `radius`           | float32    | `upper_limit_radius`              |
| header             | uint32     | Low byte = `max_factor_surface_deviation`; upper 24 bits = `byte_size` |
| `startOffset`      | int32      | `offset_ledgetree_root`           |
| `padding`          | int32×3    | `dummy[3]`                        |

Hulls, points, and nodes follow, in that order — the layout `IVP_SurfaceBuilder_Ledge_Soup` emits. Offsets inside the block are relative to the field that holds them, so the block is position independent. The reader walks the tree from `startOffset` with a queue, resolving each node's right-child and hull offsets; offsets outside `[startOffset, byte_size]` raise a `RangeError`. Each hull records a relative offset to the shared point block; points are read from there up to `startOffset`.

Descent stops at a node whose hull has type `Enabled`; nodes with no hull or with a `Skip` hull continue into their children. IVP's own test is `offset_right_node != 0`, which agrees on well-formed data because a leaf node always carries a terminal ledge.

### Traversal helpers

| Function          | Description                                            |
| ----------------- | -------------------------------------------------------- |
| `getNodes(root)`  | Generator — depth-first walk over every node in the BVH |
| `getHulls(root)`  | Generator — yields the hull of each node that has one   |

### Construction

| Function                                | Description                                                          |
| --------------------------------------- | ---------------------------------------------------------------------- |
| `createHierarchy(nodes)`                | Folds leaf nodes into the full binary tree the format wants          |
| `getMassProperties(hulls, points)`      | `massCenter`, `rotationInertia`, `radius` and `surfaceDeviation`     |
| `createSurface(root, points, overrides?)` | The block around a hierarchy, deriving what is not overridden      |

`createHierarchy` merges whichever pair of nodes yields the tightest bounds until one is left,
which is the rule IVP's sphere clustering minimizes — without the interval hash it uses to avoid
comparing every pair. Inner nodes come back **without a hull**; `createPart` is what fills them.

`getMassProperties` reads the **terminal** hulls only, skipping anything that merely bounds a
subtree, exactly as IVP's `get_all_ledges` does.

---

## `node.ts` — BVH Node

```ts
interface Node {
  center: Vector3 // boundary center, in object coordinates
  radius: number // bounding sphere radius
  boxSizes: Vector3 // stored as uint8 / 250
  padding: number // always zero
  hull?: Hull // leaf hull, when present
  left?: Node
  right?: Node
}
```

Fixed size: **28 bytes** — right-child offset (int32), hull offset (int32), then the 20-byte payload `readNode`/`writeNode` handle. A zero offset means "absent"; the left child, when present, immediately follows its parent.

Multiply `boxSizes` by `radius` to get the half-extents of the axis-aligned box around `center`. For `ge_cm_mark1.sur` the root yields `(0.505, 0.505, 0.379)` against an extent half-size of `(0.5, 0.5, 0.375)`.

A well-formed tree is a full binary tree, so `nodeCount == 2 × terminalHulls − 1`. This holds for all 1365 retail parts.

### Construction

| Function                       | Description                                                   |
| ------------------------------ | --------------------------------------------------------------- |
| `createNode(hull, points)`     | Leaf node bounding one terminal hull                          |
| `mergeNodes(left, right, hull?)` | Inner node bounding two children                            |
| `getNodeExtent(node)`          | The box a node holds, back out of `radius` and `boxSizes`     |

A leaf's sphere is centred on its hull's bounding box and reaches the corners of it, and each box
size is `int(halfExtent / (radius / 250)) + 1` — **truncated and then stepped past**, so the
quantized box always contains the one it came from. The half-extent never exceeds the radius, so
the count never exceeds 251 and always fits its byte.

`mergeNodes` unions the children's **quantized** boxes rather than their spheres, which is what
lets a parent's bounds follow from what was written for its children without visiting anything
below again.

Both rules are IVP's `ledges_to_boxes_and_spheres` and `build_minimal_sphere`, and both reproduce
retail exactly: over all 9111 leaf nodes in the corpus the centre and radius agree to within 1e-4
relative, and 9110 of the 9111 reproduce all three box bytes.

---

## `hull.ts` — Convex Hull

```ts
enum HullType {
  Enabled = 4, // terminal ledge; `id` is the model part ID
  Skip = 5, // bounds a subtree; `id` is an offset back to the owning node
}

interface Hull {
  id: number
  type: HullType
  faces: Face[]
  reserved: number // always zero
}
```

`HullType` is not an enum in IVP but two packed flags: `has_children` (bits 0–1) and `is_compact` (bits 2–3). Every hull Freelancer emits is compact, so only 4 (terminal) and 5 (has children) occur — 9111 and 415 respectively in the retail corpus.

That distinction is what gives `id` two meanings: it is IVP's `union { ledgetree_node_offset; client_data; }`. A terminal ledge stores user data — Freelancer's part CRC, which may differ from the id of the surface part containing it — while a subtree-bounding ledge stores a relative offset back to the node that owns it. **`writeSurface` recomputes the type-5 value**, since it depends on where the node tree lands.

### Binary layout

| Field        | Type   | IVP name                                                   |
| ------------ | ------ | ------------------------------------------------------------ |
| point offset | int32  | `c_point_offset`, relative to the hull                     |
| `id`         | int32  | `ledgetree_node_offset` / `client_data`                    |
| header       | uint32 | Low byte = type flags; upper 24 bits = `size_div_16`       |
| face count   | int16  | `n_triangles`                                              |
| `reserved`   | int16  | `for_future_use`                                           |
| faces        | —      | 16 bytes each                                              |

`readHull` is entered after the caller has consumed the point offset.

`size_div_16` is the whole ledge size in 16-byte units: one header, one per triangle, one per point. Since a closed convex polyhedron has `V = 2 + F / 2` by Euler's formula, this reduces to `(12 + faceCount × 6) / 4`, which is what `getIndexCount` computes and validates on read (`RangeError` on mismatch). It holds for all 9526 retail hulls.

### Helper functions

| Function            | Description                                                     |
| ------------------- | ----------------------------------------------------------------- |
| `getIndices(faces)` | Unique point indices referenced by a face list                   |
| `readHull(view)` / `writeHull(view, hull)` | Single hull, in place on the view        |
| `createHull(id, points, triangles, type?)` | Builds one hull from triangles indexing the part's shared point list |

`createHull` leaves a `Skip` hull's `id` at zero, since only `writeSurface` can know the offset it
holds, and marks its faces and every edge of them virtual, which is what all 28644 retail type-5
faces do.

---

## `face.ts` — Hull Face

```ts
interface Face {
  material: number // material index, 7 bits
  virtual: boolean // face belongs to a subtree-bounding hull
  pierce: number // the face found by casting a ray along the inverted normal
  points: TriangleIndices // point indices into the part's shared point list
  opposites: TriangleIndices // flat index (face × 3 + edge) of each opposing half-edge
  virtualEdges: TriangleFlags // per-edge counterpart of `virtual`; set when hull type is 5
}
```

Fixed size: **16 bytes**. The leading `uint32` packs `virtual` (bit 31), `material` (bits 24–30), `pierce` (bits 12–23), and the face's own `tri_index` (bits 0–11) — faces are therefore stored out of order and placed into `faces[index]` on read.

IVP declares `material_index` and `is_virtual` as adjacent bitfields, so this module splits them rather than exposing one byte. The retail corpus bears the split out exactly: `material` is 0 for all 177824 faces, and `virtual` is true for all 28644 faces of type-5 hulls and false for all 149180 faces of type-4 hulls. The three per-edge `is_virtual` flags always agree with it.

Each of the three edges is a `uint16` point index followed by a `uint16` holding `is_virtual` in bit 15 and a signed 15-bit `opposite_index` in the rest.

`opposite_index` is a delta in 4-byte slots, and a triangle occupies four slots — a header word plus three edges — so edge `v` of face `f` lives at slot `4f + v + 1`. `opposites` exposes this as the flat edge index `3f + v` instead. The two codecs convert through a matched pair of helpers in `hull.ts`, `toEdgeIndex` and `toSlot`, which are exact inverses.

### Construction

| Function                                     | Description                                              |
| -------------------------------------------- | ---------------------------------------------------------- |
| `getNormal(a, b, c)`                         | Outward normal, unnormalized — IVP's `hesse` vector      |
| `createFaces(points, triangles, virtual?)`   | Face list of one hull, adjacency and pierce derived      |

Triangles are three indices into the point list, **wound counter-clockwise seen from outside**, so
`getNormal` is `(b - a) × (c - a)`. That winding is not a convention this module picked: shooting a
ray the other way matches nothing in the corpus, and it is what [RENDERER.md](RENDERER.md) records
for positions taken verbatim.

`createFaces` refuses geometry the format cannot hold rather than writing something a reader will
throw on: an open surface, where a half-edge has nothing running the other way; a half-edge two
triangles both wind; a degenerate triangle; and a point count Euler's `V = 2 + F / 2` does not
allow, which is what the ledge size the writer encodes assumes.

**`opposites` is fully determined**, and the derivation reproduces all 177,824 retail faces.

**`pierce` is not.** IVP's `insert_pierce_info` pairs each face with the one whose normal points
most nearly the other way, walking its own triangle list in order and skipping a face that already
has a partner — but *not* skipping one as a candidate, which is why the result is not an involution
and neither is retail's. The order it walked is the builder's, not the order the compact ledge
stores, so every tie it broke is lost. Following the rule anyway reproduces **151,761 of 177,824**;
the rest are ties on symmetric hulls, where two faces are equally opposite and the file records the
one this module cannot know it picked.

---

## `point.ts` — Hull Point

```ts
interface Point extends Vector3 {
  clientData: number
}
```

Fixed size: **16 bytes** — float32 x/y/z, **then** the int32 `clientData`. `IVP_Compact_Poly_Point` derives from `IVP_U_Float_Hesse`, so the coordinates come first and the trailing word is the plane's `hesse_val` slot, reused as `client_data`. Freelancer uses it: it is non-zero for 75% of the 79596 retail points.

Points are shared across all the hulls of a part — the builder re-indexes each ledge into one common array — so faces reference them by index into `Surface.points`.

---

## `index.ts` — Public API

```ts
import {
  // Types
  type Extent, type Point, type Face, type Hull, type Node, type Surface, type Part,
  type HullGeometry, type MassProperties, type PartOptions,
  type TriangleIndices, type TriangleFlags,
  HullType,

  // Geometry
  getExtent, createBox,

  // Structures
  createFaces, createHull, createNode, mergeNodes, createHierarchy, createSurface, createPart,

  // Inspection
  getIndices, getNodes, getHulls, getNodeExtent, getNormal, getMassProperties,

  // Serialization
  readSurfaceLibrary, writeSurfaceLibrary,
} from '@treewyrm/freelancer/surface'
```

The per-structure `read*`/`write*` pairs are available from their individual modules but are not
re-exported by the entry point — a consumer reads or writes a whole library.

---

## Building a hitbox

A box, from nothing:

```ts
import { createBox, createPart, writeSurfaceLibrary } from '@treewyrm/freelancer/surface'
import { getResourceId } from '@treewyrm/freelancer'

const id = getResourceId('Root')
const extent = { minimum: { x: -2, y: -1, z: -6 }, maximum: { x: 2, y: 1, z: 6 } }

const part = createPart(id, [{ id, ...createBox(extent) }])
const bytes = writeSurfaceLibrary([part])
```

Several hulls, which is what a compound model wants — one per collision-enabled part, each keyed
by the CRC32 of the model part name:

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
7. The extent comes off the collision geometry, taken before step 5 added anything.

**What the caller still owns**, because none of it is measurable from the bytes:

- **Convexity.** Nothing here checks it, and IVP's whole layout assumes it — `V = 2 + F / 2` is
  enforced, which a non-convex closed mesh will usually fail, but not always.
- **Decimation.** How many faces a collision hull should have is a budget, not a fact.
- **Splitting a concave shape into convex hulls.** Retail parts carry up to hundreds of them.
- **`Point.clientData`.** Non-zero on 75% of retail points and unexplained; `createPart` carries
  through whatever a caller puts on its input points and otherwise writes zero.

A part built this way is a fixed point: write it, read it back, write it again, and the bytes match.

---

## Round-tripping

`writeSurfaceLibrary` reproduces the IVP layout but not Freelancer's exact ordering: IVP's builder emits terminal ledges before subtree-bounding ones, whereas this writer emits them in tree order. Re-encoding is therefore not byte-identical to the original file, but it **is** a fixed point — writing a decoded library and reading it back yields the same structure, and encoding that again gives identical bytes. Both properties hold across all 781 files the reader accepts; 574 of them re-encode byte for byte regardless.

The one value that does not survive verbatim is a type-5 hull's `id`, which is a derived offset and is reassigned on write.

---

## TODO

### How close `rotationInertia` has to be

**The field is read.** A part blown off a model becomes debris and tumbles by it — observed in
game, which settles what a static comparison could not and closes the older reading that IVP's
`rotation_inertia` slot had been repurposed as a linear drag. MAXLancer carries it as `drag` for
that reason and says the question is open; it is not.

`getMassProperties` implements IVP's `IVP_Rot_Inertia_Solver` as written, and it is right where it
can be checked. Every one of the 84 parts that take the degenerate fallback reproduces exactly. On
the hulls that are still exact boxes — `crate_blue.sur` and the rest of the twelve-face crates —
it reproduces the shipped figure to better than a part in a thousand. Over the whole corpus it does
not: **2067 of 4095 components agree within 0.1%**, another ~700 are within a few percent, and
roughly a quarter are off by more than 25%. `pod_drab.sur` computes 72.27 where the file says
122.50.

**The disagreement tracks decimation.** `crate_grey.sur`'s hull has **ten** faces where a box has
twelve, and it misses by 0.5%; `pod_drab.sur`'s has 62 and misses by 41%. `massCenter` and `radius`
agree on every one of those same parts, so the geometry is being read correctly. The reading is
that Freelancer measured the inertia on the art mesh and then simplified the collision hull, and
the file kept the earlier number. **Nothing in the file can recover it**, because the mesh it was
measured from is not in the file.

So the open question is not whether to derive it but how far off is too far. What is known:

- The derived value is much the closer of the two candidates. Against retail it wins on **3590 of
  4095 components**, and is within 0.1% on 2067 where MAXLancer's rule manages 4.
- MAXLancer generates the field as `0.2 × radius²` on all three axes, jittered by ±0.1% so they
  differ, and mods built with it work. That rule is within 25% of retail on barely a quarter of
  components — retail's own mean ratio to `radius²` is 0.137, not 0.2 — so **the game tolerates a
  figure that is wrong by tens of percent**, which bounds how much the residual gap here can
  matter.
- The jitter is not required by anything measurable: retail ships 92 parts whose three components
  are identical, and this module reproduces 84 of them exactly. A builder here stays
  deterministic.

**The experiment that would sharpen it:** take a retail `.sur` whose stored inertia is far from the
derived one — the `pod_*` debris are the clearest, being loose objects that tumble — rewrite it
with the derived value and shoot the object, then again with `0.2 × radius²`. The difference
between those two spins is the whole size of the question.

Until then `createPart` derives it, because a number from the right algorithm on a simplified mesh
beats a constant that is wrong by 46% at the median. Pass the art mesh's figure through
`PartOptions` when it is at hand, which is why the override exists.
