# VMesh

Freelancer's geometry format. The game targets **Direct3D 8.1** (shipped February 2003; D3D9,
released December 2002, was too late for core development), and the binary layout maps directly onto
D3D8 GPU resources — vertex buffers, index buffers, FVF descriptors, and `DrawIndexedPrimitive`
parameters.

A VMesh asset lives inside a UTF tree, split across two cooperating structures: a **mesh library**
holding shared vertex and index data, and **mesh references** that address into it by offset and
count. Export names are in [API.md](API.md#vmesh).

## Architecture

```
VMeshLibrary (UTF directory)
  └─ <mesh name> (UTF directory per mesh)
       └─ VMeshData (UTF file) ── groups[], indices[], vertices[]

VMeshPart (UTF directory)
  └─ VMeshRef (UTF file) ── meshId (CRC), slice offsets + counts, bounds

MultiLevel (UTF directory)
  ├─ Switch2 (float[] distance breakpoints)
  └─ Level0..N
       └─ VMeshPart

VMeshWire (UTF directory)
  └─ VWireData (UTF file) ── meshId (CRC), vertex slice, LineList indices
```

A `VMeshRef` identifies a mesh by the CRC32 of its name and selects a slice of that mesh's groups,
indices and vertices. `getMesh` finds the mesh in a loaded library; `getMeshDraw` walks the reference
over it, yielding the per-group offsets `DrawIndexedPrimitive` takes.

`VMeshWire` is a **sibling** of `VMeshPart` rather than a child: it addresses the same library mesh
by CRC but carries its own index buffer, describing edges instead of faces.

---

## Mesh data

### `Primitive`

`D3DPRIMITIVETYPE` verbatim, so the value passes straight to `DrawIndexedPrimitive`. PrimitiveCount,
which the API takes separately, is derived from `elementCount`:

| Value | Constant        | D3D name              | PrimitiveCount     |
| ----- | --------------- | --------------------- | ------------------ |
| 0     | `None`          | —                     | —                  |
| 1     | `PointList`     | `D3DPT_POINTLIST`     | `elementCount`     |
| 2     | `LineList`      | `D3DPT_LINELIST`      | `elementCount / 2` |
| 3     | `LineStrip`     | `D3DPT_LINESTRIP`     | `elementCount - 1` |
| 4     | `TriangleList`  | `D3DPT_TRIANGLELIST`  | `elementCount / 3` |
| 5     | `TriangleStrip` | `D3DPT_TRIANGLESTRIP` | `elementCount - 2` |
| 6     | `TriangleFan`   | `D3DPT_TRIANGLEFAN`   | `elementCount - 2` |

### `VertexFormat`

A `D3DFVF_*` bitmask, passed as a DWORD to `SetVertexShader` (D3D8) or `SetFVF` (D3D9) to describe
the in-memory vertex layout.

| Flag                  | Value           | D3D name                    | Bytes of stride              |
| --------------------- | --------------- | --------------------------- | ---------------------------- |
| `Position`            | `0x002`         | `D3DFVF_XYZ`                | 12 (3× float32 x/y/z)        |
| `Normal`              | `0x010`         | `D3DFVF_NORMAL`             | 12 (3× float32)              |
| `PointSize`           | `0x020`         | `D3DFVF_PSIZE`              | 4 (1× float32)               |
| `Diffuse`             | `0x040`         | `D3DFVF_DIFFUSE`            | 4 (`D3DCOLOR`, uint32 ARGB)  |
| `Specular`            | `0x080`         | `D3DFVF_SPECULAR`           | 4 (`D3DCOLOR`, uint32 ARGB)  |
| `Texture1`–`Texture8` | `0x100`–`0x800` | `D3DFVF_TEX1`–`D3DFVF_TEX8` | 8 per set (2× float32 u/v)   |

> **The texture flags are a count, not independent bits.** Bits 8–11 (`0xf00`) hold the number of UV
> sets — `D3DFVF_TEX2` means "two sets total", not "the first and the second". Combining them with
> `|` is wrong; pick exactly one. `getMapCount` and `vertexByteLength` read the field.

### `VMeshData`

```ts
interface VMeshData {
  name: string
  type: 1                  // version field in the binary; always 1
  primitive: Primitive     // D3DPRIMITIVETYPE
  format: VertexFormat     // D3DFVF bitmask
  groups: VMeshGroup[]
  indices: Uint16Array     // D3DFMT_INDEX16 index buffer, shared across all groups
  vertices: Uint8Array     // FVF-described vertex buffer, stride = vertexByteLength(format)
}
```

`indices` maps to an `IDirect3DIndexBuffer8/9` created with `D3DFMT_INDEX16`; `vertices` to an
`IDirect3DVertexBuffer8/9` whose layout `format` describes.

| Field       | Type           | Notes                                            |
| ----------- | -------------- | ------------------------------------------------ |
| version     | uint32         | Must be `1`                                      |
| primitive   | uint32         | `D3DPRIMITIVETYPE` value                         |
| groupCount  | uint16         |                                                  |
| indexCount  | uint16         | Total indices across all groups                  |
| format      | uint16         | `D3DFVF` bitmask                                 |
| vertexCount | uint16         | Total vertices                                   |
| groups      | `VMeshGroup[]` | 12 bytes each, count = groupCount                |
| indices     | uint16[]       | count = indexCount                               |
| vertices    | uint8[]        | count = vertexCount × `vertexByteLength(format)` |

---

## Mesh group

Each group is **one `DrawIndexedPrimitive` call**, and its fields are that call's parameters. Fixed
size: **12 bytes**.

```ts
interface VMeshGroup {
  materialId: number   // int32 — CRC32 of the material name; bind before drawing
  vertexStart: number  // uint16 — MinIndex: base vertex; the group's indices are relative to it
  vertexEnd: number    // uint16 — last vertex, INCLUSIVE
  elementCount: number // uint16 — index count; PrimitiveCount = f(elementCount, primitive)
  padding: number      // uint16 — unused alignment field
}
```

```cpp
// D3D8; D3D9 adds BaseVertexIndex as an INT before MinVertexIndex, otherwise identical
device->DrawIndexedPrimitive(primitive,
  group.vertexStart,                        // MinIndex
  group.vertexEnd - group.vertexStart + 1,  // NumVertices
  startIndex,                               // ref.indexStart + Σ prior elementCount
  primitiveCount);
```

> **`vertexEnd` is inclusive.** A group's index values are relative to `vertexStart`, not absolute
> within the mesh, so `vertexStart + max(indices) === vertexEnd`. Treating it as exclusive silently
> drops the last vertex of every group.

---

## Mesh reference

A `VMeshRef` selects a sub-range of groups, indices and vertices from a named `VMeshData`. Fixed
size: **60 bytes**, the first uint32 being a self-describing size field holding 60.

> **The size field is read and discarded, not validated.** It is 60 in all 9,322 retail references,
> but the record is fixed-size, so the field carries nothing the layout does not already give — and
> the engine does not enforce it. A hand-authored model leaving it zero loads and renders. The
> writer always emits 60, so this is the one field a round trip normalizes rather than reproduces;
> that is safe precisely because nothing reads it. See [Empty references](#empty-references).

```ts
interface VMeshRef {
  meshId: number       // int32 — CRC32 of the target VMeshData name
  vertexStart: number  // uint16 — base vertex offset within the mesh's vertex buffer
  vertexCount: number  // uint16 — vertices in this slice
  indexStart: number   // uint16 — StartIndex: first index in the shared index buffer
  indexCount: number   // uint16 — indices across all groups of this reference
  groupStart: number   // uint16 — first VMeshGroup to render
  groupCount: number   // uint16 — how many
  boundingBox: BoundingBox       // { a: min, b: max } — D3DXComputeBoundingBox output
  boundingSphere: BoundingSphere // { center, radius } — D3DXComputeBoundingSphere output
}
```

There are no named D3D structs for the bounds; the fields match the output parameters of the D3DX
utility functions.

> **Bounding box byte order:** stored interleaved as `max.x, min.x, max.y, min.y, max.z, min.z`, not
> as two contiguous XYZ vectors. [SURFACE.md](SURFACE.md)'s `Extent` does *not* follow this
> convention.

**Both offsets apply to an index, and neither is absolute on its own** — the absolute vertex is
`ref.vertexStart + group.vertexStart + index`. Dropping `ref.vertexStart` draws the wrong geometry
rather than failing. [RENDERER.md §3.2](RENDERER.md#32-the-base-offset-scheme-and-what-it-really-means)
carries the measurement and §3.3 the four ways to apply a base vertex in an API that has none.

`VMeshPart` is a thin wrapper — a `VMeshPart` directory holding one `VMeshRef` file. `readVMeshPart`
returns `undefined` when the directory is absent, so a caller can probe
(`readMultiLevel(parent) ?? readVMeshPart(parent)`); a directory that exists without its `VMeshRef`
still throws.

### Empty references

**A `groupCount` of zero is a reference that draws nothing, and is legal.** Every retail reference
selects at least one group, so the case does not occur there, but it is the natural way to express a
compound part that exists only to carry a joint — an animation pivot, with children hanging off it
and no geometry of its own.

The alternative is to omit `VMeshPart` from the part entirely, which reads back as `undefined` and
is equally valid. Retail never does that either: all 5,811 of its `.cmp` parts carry geometry —
4,852 through `VMeshPart` and 959 through `MultiLevel`, none through neither. So both spellings of "this part draws nothing" are conventions the
engine accepts rather than anything the format prefers, and a consumer has to handle both — treating
an absent `VMeshPart` as the only empty case will still be handed a zero-group reference.

> **A reader must not take `groupCount === 0` as a signal to skip the record.** Such a reference
> still names a mesh: `meshId` is typically the sibling parts' library, left in place by the
> exporter rather than zeroed, and it resolves. Nothing follows from it, because the group range is
> empty — but it means a dangling-reference check keyed on `meshId` alone will report a mesh that is
> never drawn, and an eager one will upload buffers for it.

---

## Wireframe overlay

An edge-only companion to a part's geometry — the line overlay Freelancer draws over a ship in the
scanner and dealer views. It reuses a mesh already in the library and supplies its own index buffer,
drawn as `D3DPT_LINELIST`.

```ts
interface VWireData {
  meshId: number      // int32 — CRC32 of the target VMeshData name, same key space as VMeshRef
  vertexStart: number // uint16 — base vertex offset; indices are relative to it
  vertexCount: number // uint16 — unique vertex ids the indices reference
  vertexRange: number // uint16 — vertex span covering them (D3D NumVertices)
  indices: Uint16Array // uint16[] — LineList indices, two per edge, relative to vertexStart
}

interface VMeshWire {
  data: VWireData
}
```

| Field       | Type     | Notes                                        |
| ----------- | -------- | -------------------------------------------- |
| headerSize  | uint32   | Must be `0x10` — self-describing size        |
| meshId      | int32    | CRC32 of the target `VMeshData` name         |
| vertexStart | uint16   | Base vertex offset; indices are relative     |
| vertexCount | uint16   | Unique vertex ids referenced                 |
| indexCount  | uint16   | Number of indices that follow                |
| vertexRange | uint16   | Vertex span covering the referenced vertices |
| indices     | uint16[] | count = indexCount                           |

Header size is fixed at 16 bytes; the file is `16 + indexCount × 2`.

> **Field order caveat:** `indexCount` is stored *before* `vertexRange`, so the two trailing uint16s
> are not the (start, count) pair the leading ones are.

### Indices are relative to `vertexStart`

**Absolute vertex = `vertexStart + index`.** `vertexStart` is a base offset into the mesh's vertex
buffer, not the smallest index present — the indices themselves normally start at 0. This matters
because several parts routinely share one wire mesh, each claiming its own slice: read as relative
the slices tile the buffer, read as absolute every part draws the same vertices.

Together `vertexStart` and `vertexRange` are the `MinIndex`/`NumVertices` pair of
`DrawIndexedPrimitive` — the same role `VMeshGroup` fills with `vertexStart`/`vertexEnd`.

### Deriving the fields

When authoring new wireframe data from a set of absolute vertex ids:

```ts
vertexStart = Math.min(...ids)
indices = ids.map((id) => id - vertexStart) // relative, so min(indices) === 0
vertexCount = new Set(ids).size
vertexRange = Math.max(...ids) - Math.min(...ids) + 1
```

> The reader and writer **preserve whatever a file contains** and never normalise it, so assets
> round-trip byte-exactly regardless of which tool produced them. Use the formulas only when creating
> new data. `indexCount` is the one field genuinely derived on write.

The `+ 1` is canonical: as a vertex count it is exactly the `NumVertices` `DrawIndexedPrimitive`
expects, and it is what every original exporter emits. Two later tools emit one less, which
under-declares the span so the highest-numbered vertex falls outside it — see
[Corpus](#exporter-lineage-in-vwiredata).

---

## Levels of detail

```ts
interface MultiLevel {
  type: 'multilevel'
  ranges: number[]     // N+1 float distance breakpoints for N levels
  levels: VMeshPart[]  // Level0, Level1, … LevelN-1
}
```

A `MultiLevel` UTF directory holds `Switch2` — a float32 sequence of N+1 camera-distance breakpoints,
defaulting to `[0, 1000]` when the file is absent — and one `Level<n>` subdirectory per level, each
containing a `VMeshPart`.

`atRange(multiLevel, value)` returns the part whose range `[ranges[i], ranges[i+1])` contains the
distance, and `undefined` past the last breakpoint — which is the model's cue to vanish, not a bug to
clamp away. **LOD is per part, not per model**; a large ship's parts switch at different distances.

---

## Mesh library

```ts
type VMeshLibrary = VMeshData[]
```

A flat list in the order the meshes appear under the `VMeshLibrary` directory. `getMesh` finds one by
the CRC32 of its name. Conceptually it is a pool of shared GPU buffers: several `VMeshRef`s can
address into the same `VMeshData`.

`getMeshDraw(data, reference)` yields one `MeshDraw` per group, in index order:

```ts
{
  materialId: number   // int32 CRC of the material — bind before issuing this draw
  startIndex: number   // where the group's indices begin in the mesh index buffer
  elementCount: number // NumIndices
  baseVertex: number   // BaseVertex and MinIndex: ref.vertexStart + group.vertexStart
  numVertices: number  // vertexEnd - vertexStart + 1, vertexEnd being inclusive
}
```

With `data.primitive` and `data.format`, which belong to the mesh rather than to any group, that is
one `DrawIndexedPrimitive`.

**Offsets, not slices.** Nothing here subarrays `indices` or `vertices`. `baseVertex` is a draw
parameter in Direct3D and has nowhere to go in an API without one — WebGL2's `drawElements` takes a
byte offset and nothing else — so a consumer there folds it into the index values, the attribute
pointers or the upload. Picking one is the consumer's;
[RENDERER.md §3.3](RENDERER.md#33-webgl2-has-no-base-vertex) weighs the four options.

### Resolution is global, not per file

A `VMeshRef` names its mesh by CRC alone, with nothing to say which file that mesh lives in. At
runtime Freelancer resolves it against every library currently loaded, so a model may reference
geometry its own `VMeshLibrary` does not contain — and `getMesh` returns `undefined` for it when
handed only that one file's library. **A consumer that renders arbitrary models wants to merge
libraries across files rather than resolve one file at a time.**

`.vms` is not a distinct format: it is a UTF container holding nothing but a library, read by
`readVMeshLibrary` like any other.

---

## Corpus

Measured across the retail `DATA` tree; `corpus.test.ts` asserts each figure back through the
readers.

| | Count |
| --- | --- |
| Meshes | 2,178 |
| Mesh groups | 22,416 |
| Mesh references | 8,792 |
| — expanding to group draws | 22,090 |
| `VWireData` records | 6,308, across 3,931 `.cmp`/`.3db` files |
| Largest mesh | 22,391 vertices, so absolute indices stay inside `uint16` |
| Busiest single reference | 39 groups |
| Busiest file | 145 groups (`SHIPS/LIBERTY/LI_DREADNOUGHT/li_dreadnought.cmp`) |

**Every retail mesh is `TriangleList`**, so a renderer can hard-code triangles and treat anything else
as a load error rather than carry five untestable paths. Vertex format distribution and the base
offset measurements are in [RENDERER.md §3](RENDERER.md#3-vmesh--gpu-buffers).

`vertexEnd` is inclusive in all 22,416 groups without exception.

### Wireframe indices are relative

From `OSMIUM/node_asteroid_osmium03f.cmp`, four parts sharing one mesh:

```
absolute: [0,24] [0,99]   [0,83]    [0,68]      ← all overlapping
relative: [0,24] [36,135] [148,231] [244,312]   ← disjoint, ascending
```

Across the Freelancer/Discovery asset corpus the relative reading holds for **718 of 718** such
groups, while the absolute reading collides in 717 of them.

### Exporter lineage in `VWireData`

Over the 6,308 records, `vertexCount` matches the unique-id count in 99.3%, and `vertexRange` splits
perfectly along the tool that wrote it:

| Records | `max-min` | `max-min+1` | Exporter               |
| ------- | --------- | ----------- | ---------------------- |
| 1,816   | 0         | **1,816**   | `Nov 5 2002 11:41:55`  |
| 1,319   | **1,319** | 0           | `MAXLancer Tools 0.97` |
| 588     | **588**   | 0           | `MAXLancer Tools 0.98` |
| 495     | 0         | **495**     | `Aug 24 2002 12:33:14` |
| 473     | **473**   | 0           | `MAXLancer Tools`      |
| 311     | 0         | **311**     | `Jun 10 2002 16:27:11` |
| 21      | **20**    | 0           | `LancerEdit 2024.06.1` |

Every date-stamped build string is an original Digital Anvil exporter, and all of them emit
`max - min + 1` without exception.

### The one external reference

Retail has exactly one case of a model referencing geometry outside its own file:
**`INTERFACE/interface.generic.vms`**, a bare UTF tree whose only child is a `VMeshLibrary` holding
two meshes.

```
INTERFACE/interface.generic.vms
  VMeshLibrary/
    interface.generic-2.vms     ── id -493461457
    interface.generic-102.vms   ── id  324122324
```

The game loads it unprompted — the path is baked into the executable rather than named by any INI —
which is why 331 `INTERFACE/**` models reference those two meshes without declaring a library of
their own. Those **530 references are the only external ones in retail**; every other `VMeshRef`
resolves inside its own file.

### openFLAME roots read as empty

`readVMeshLibrary` returns an empty library for the four `openFLAME 3D N-mesh` trees rather than
throwing. See [RETAIL.md](RETAIL.md#openflame-leftovers).
