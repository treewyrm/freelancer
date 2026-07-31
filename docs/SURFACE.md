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
| `Surface.rotationInertia` | `rotation_inertia` |
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

---

## `library.ts` — Surface Library

| Function                     | Description                                                     |
| ---------------------------- | ----------------------------------------------------------------- |
| `readSurfaceLibrary(view)`   | Reads a `BufferView` and returns `Part[]`; validates header      |
| `writeSurfaceLibrary(parts)` | Serializes `Part[]` into a `BufferView` with header prepended    |

The file begins with the signature `vers` (`0x73726576`) followed by a `float32` version, which must be exactly `2.0`. Parts are then read until the view is exhausted.

```ts
import { BufferView } from '@treewyrm/utf2json/utility'
import { readSurfaceLibrary } from '@treewyrm/utf2json/surface'
import { readFileSync } from 'node:fs'

const parts = readSurfaceLibrary(BufferView.from(readFileSync('ships/li_fighter.sur')))
```

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

Chunk payloads are not length-prefixed at the tag level, so an unrecognized tag cannot be skipped — continuing past one would silently desynchronize the rest of the file. `readPart` therefore throws a `RangeError` instead. No file in a 476-file survey used a tag outside the four above.

`fixed` is the **inverse** of the `!fxd` chunk: a part reads back as `fixed: true` when the chunk is absent. On write the chunk is emitted whenever `fixed` is falsy. The `hpid` chunk is written only when `hardpoints` is non-empty, matching Freelancer, which omits it for most parts.

Chunks are written in Freelancer's order: `!fxd` (conditional), `exts`, `surf`, `hpid` (conditional).

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

The extent bounds the part, which for a compound part is not obliged to enclose every hull: across 743 parts surveyed, 633 had all their points inside it.

---

## `surface.ts` — Surface Block

### `Surface` interface

```ts
interface Surface {
  massCenter: Vector3 // also the bounding sphere centre; used for the aiming reticle
  rotationInertia: Vector3 // not a drag coefficient
  radius: number // must encompass every hull in the part
  surfaceDeviation: number // quantized in steps of 1/250
  points: Point[] // shared hull vertices
  root: Node // ledgetree root
  padding: Vector3 // 16-byte alignment padding
}
```

`surfaceDeviation` is a **deviation**, not a scale factor: multiply it by `radius` to recover how far the surface departs from the bounding sphere. The builder computes it as `int(1 + deviation / (radius / 250))`.

`padding` is `int dummy[3]` in IVP and is zero in every file surveyed.

### Binary layout

The block is preceded by a `uint32` size, which duplicates the `byte_size` field inside the header — the two agreed on all 743 parts surveyed. Then a 48-byte header:

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

A well-formed tree is a full binary tree, so `nodeCount == 2 × terminalHulls − 1`. This held for all 743 parts surveyed.

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

`HullType` is not an enum in IVP but two packed flags: `has_children` (bits 0–1) and `is_compact` (bits 2–3). Every hull Freelancer emits is compact, so only 4 (terminal) and 5 (has children) occur — 3914 and 185 respectively in the survey.

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

`size_div_16` is the whole ledge size in 16-byte units: one header, one per triangle, one per point. Since a closed convex polyhedron has `V = 2 + F / 2` by Euler's formula, this reduces to `(12 + faceCount × 6) / 4`, which is what `getIndexCount` computes and validates on read (`RangeError` on mismatch). It held for all 4099 hulls surveyed.

### Helper functions

| Function            | Description                                                     |
| ------------------- | ----------------------------------------------------------------- |
| `getIndices(faces)` | Unique point indices referenced by a face list                   |
| `readHull(view)` / `writeHull(view, hull)` | Single hull, in place on the view        |

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

IVP declares `material_index` and `is_virtual` as adjacent bitfields, so this module splits them rather than exposing one byte. The survey bears the split out exactly: `material` was 0 for all 73264 faces, and `virtual` was true for all 11434 faces of type-5 hulls and false for all 61830 faces of type-4 hulls.

Each of the three edges is a `uint16` point index followed by a `uint16` holding `is_virtual` in bit 15 and a signed 15-bit `opposite_index` in the rest.

`opposite_index` is a delta in 4-byte slots, and a triangle occupies four slots — a header word plus three edges — so edge `v` of face `f` lives at slot `4f + v + 1`. `opposites` exposes this as the flat edge index `3f + v` instead. The two codecs convert through a matched pair of helpers in `hull.ts`, `toEdgeIndex` and `toSlot`, which are exact inverses.

---

## `point.ts` — Hull Point

```ts
interface Point extends Vector3 {
  clientData: number
}
```

Fixed size: **16 bytes** — float32 x/y/z, **then** the int32 `clientData`. `IVP_Compact_Poly_Point` derives from `IVP_U_Float_Hesse`, so the coordinates come first and the trailing word is the plane's `hesse_val` slot, reused as `client_data`. Freelancer uses it: it was non-zero for 72% of the 33352 points surveyed.

Points are shared across all the hulls of a part — the builder re-indexes each ledge into one common array — so faces reference them by index into `Surface.points`.

---

## `index.ts` — Public API

```ts
import {
  type Extent,
  type Point,
  type Face,
  type Hull,
  type Node,
  type Part,
  readSurfaceLibrary,
  writeSurfaceLibrary,
} from '@treewyrm/utf2json/surface'
```

`HullType`, the per-structure `read*`/`write*` pairs, and the traversal helpers (`getNodes`, `getHulls`, `getIndices`) are available from their individual modules but are not re-exported by the entry point.

---

## Round-tripping

`writeSurfaceLibrary` reproduces the IVP layout but not Freelancer's exact ordering: IVP's builder emits terminal ledges before subtree-bounding ones, whereas this writer emits them in tree order. Re-encoding is therefore not byte-identical to the original file, but it **is** a fixed point — writing a decoded library and reading it back yields the same structure, and encoding that again gives identical bytes. Both properties were verified across the 472 well-formed files of a 476-file survey.

The one value that does not survive verbatim is a type-5 hull's `id`, which is a derived offset and is reassigned on write.
