# VMesh

Parser and serializer for Freelancer's VMesh geometry format. Freelancer targets **Direct3D 8.1** (shipped February 2003; D3D9 released December 2002 was too late for core development). The VMesh binary layout maps directly to D3D8/9 GPU resource structures — vertex buffers, index buffers, FVF descriptors, and `DrawIndexedPrimitive` parameters.

A VMesh asset is stored inside a UTF tree and split across two cooperating structures: a **mesh library** holding shared vertex/index data, and **mesh references** that address into it by offset and count.

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

A `VMeshRef` identifies a mesh by the CRC32 of its name (`meshId`) and selects a slice of that mesh's groups, indices, and vertices. `getMesh` finds that mesh in a loaded `VMeshLibrary`, and `getMeshDraw` walks the reference over it, yielding the per-group offsets `DrawIndexedPrimitive` takes.

`VMeshWire` is a sibling of `VMeshPart` rather than a child: it addresses the same `VMeshLibrary` mesh by CRC, but carries its own index buffer describing edges instead of faces.

---

## `data.ts` — Mesh Data

### `Primitive` enum

Direct3D primitive type (`D3DPRIMITIVETYPE`). Values are identical to the D3D constants and can be passed directly to `DrawIndexedPrimitive`. PrimitiveCount (required by the API) is derived from `elementCount` as shown.

| Value | Constant        | D3D name              | PrimitiveCount formula |
| ----- | --------------- | --------------------- | ---------------------- |
| 0     | `None`          | —                     | —                      |
| 1     | `PointList`     | `D3DPT_POINTLIST`     | `elementCount`         |
| 2     | `LineList`      | `D3DPT_LINELIST`      | `elementCount / 2`     |
| 3     | `LineStrip`     | `D3DPT_LINESTRIP`     | `elementCount - 1`     |
| 4     | `TriangleList`  | `D3DPT_TRIANGLELIST`  | `elementCount / 3`     |
| 5     | `TriangleStrip` | `D3DPT_TRIANGLESTRIP` | `elementCount - 2`     |
| 6     | `TriangleFan`   | `D3DPT_TRIANGLEFAN`   | `elementCount - 2`     |

### `Format` enum

Direct3D flexible vertex format bitmask (`D3DFVF_*`). The value is a DWORD passed directly to `IDirect3DDevice8::SetVertexShader` (D3D8) or `IDirect3DDevice9::SetFVF` (D3D9) to describe the in-memory vertex layout.

| Flag                  | Value           | D3D name                    | Bytes added to vertex stride |
| --------------------- | --------------- | --------------------------- | ---------------------------- |
| `Position`            | `0x002`         | `D3DFVF_XYZ`                | 12 (3× float32 x/y/z)        |
| `Normal`              | `0x010`         | `D3DFVF_NORMAL`             | 12 (3× float32)              |
| `PointSize`           | `0x020`         | `D3DFVF_PSIZE`              | 4 (1× float32)               |
| `Diffuse`             | `0x040`         | `D3DFVF_DIFFUSE`            | 4 (`D3DCOLOR`, uint32 ARGB)  |
| `Specular`            | `0x080`         | `D3DFVF_SPECULAR`           | 4 (`D3DCOLOR`, uint32 ARGB)  |
| `Texture1`–`Texture8` | `0x100`–`0x800` | `D3DFVF_TEX1`–`D3DFVF_TEX8` | 8 per set (2× float32 u/v)   |

> **Texture flag encoding:** `Texture1`–`Texture8` are not independent bitmask flags — they encode a _count_ of UV sets in bits 8–11 (`TextureCountMask = 0xf00`, `TextureCountShift = 8`). `D3DFVF_TEX2` means "two UV sets total", not "first and second UV sets independently". Combining them with `|` is wrong; pick exactly one.

### Helper functions

| Function                   | Description                                                |
| -------------------------- | ---------------------------------------------------------- |
| `getMapCount(format)`      | Returns number of UV sets: `(format & 0xf00) >> 8`         |
| `vertexByteLength(format)` | Returns the vertex stride in bytes for a given FVF bitmask |

### `VMeshData` interface

```ts
interface VMeshData {
  name: string
  type: 1 // always 1 (version field in binary)
  primitive: Primitive // D3DPRIMITIVETYPE
  format: Format // D3DFVF bitmask
  groups: VMeshGroup[]
  indices: Uint16Array // D3DFMT_INDEX16 index buffer, shared across all groups
  vertices: Uint8Array // FVF-described vertex buffer, stride = vertexByteLength(format)
}
```

`indices` maps to an `IDirect3DIndexBuffer8/9` created with `D3DFMT_INDEX16`. `vertices` maps to an `IDirect3DVertexBuffer8/9` whose stride and layout are described by `format`.

### Binary layout (`VMeshData` UTF file)

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

### `readVMeshData(parent)` / `writeVMeshData(data)`

Reads/writes a `VMeshData` from/into a UTF `Directory` by looking up the `VMeshData` child file.

---

## `group.ts` — Mesh Group

Each `VMeshGroup` corresponds to one `DrawIndexedPrimitive` call. The fields map directly to D3D8 parameters (D3D9 adds `BaseVertexIndex` as an additional INT before `MinVertexIndex`, otherwise identical):

```cpp
// D3D8
device->DrawIndexedPrimitive(
  primitive,                               // D3DPRIMITIVETYPE
  group.vertexStart,                       // MinIndex
  group.vertexEnd - group.vertexStart + 1, // NumVertices
  startIndex,                              // StartIndex (accumulated from ref.indexStart + prior groups)
  primitiveCount                           // derived from group.elementCount + primitive type
);
```

### `VMeshGroup` interface

```ts
interface VMeshGroup {
  materialId: number // int32 — CRC32 of material name; set active material before drawing
  vertexStart: number // uint16 — MinIndex: base vertex of this group; its indices are relative to it
  vertexEnd: number // uint16 — last vertex of the group (inclusive); NumVertices = vertexEnd - vertexStart + 1
  elementCount: number // uint16 — total index count; PrimitiveCount = f(elementCount, primitive type)
  padding: number // uint16 — unused alignment field
}
```

Fixed size: **12 bytes** per group.

> **`vertexEnd` is inclusive.** Index values in a group are relative to `vertexStart`, not absolute
> within the mesh, so `vertexStart + max(indices) === vertexEnd`. This holds for all 22,416 groups in
> the retail data without exception, and `corpus.test.ts` asserts it. Treating `vertexEnd` as
> exclusive silently drops the last vertex of every group.

---

## `ref.ts` — Mesh Reference

A `VMeshRef` selects a sub-range of groups, indices, and vertices from a named `VMeshData` in the library. It provides everything needed to call `DrawIndexedPrimitive` for each group in the slice.

### `VMeshRef` interface

```ts
interface VMeshRef {
  meshId: number // int32 — CRC32 of target VMeshData name (key into VMeshLibrary)
  vertexStart: number // uint16 — base vertex offset within the mesh's vertex buffer
  vertexCount: number // uint16 — number of vertices in this ref's slice
  indexStart: number // uint16 — StartIndex: first index in the shared index buffer
  indexCount: number // uint16 — total indices across all groups in this ref
  groupStart: number // uint16 — first VMeshGroup index to render
  groupCount: number // uint16 — number of groups to render
  boundingBox: BoundingBox // { a: min corner, b: max corner } — D3DXComputeBoundingBox output
  boundingSphere: BoundingSphere // { center, radius } — D3DXComputeBoundingSphere output
}
```

Fixed size: **60 bytes**. The first uint32 is a self-describing size field that must equal `60`.

**Bounding volumes:** There are no named D3D structs for these. The fields match the output parameters of the D3DX utility functions: `D3DXComputeBoundingBox` returns `D3DXVECTOR3* pMin, D3DXVECTOR3* pMax`; `D3DXComputeBoundingSphere` returns `D3DXVECTOR3* pCenter, FLOAT* pRadius`.

> **Bounding box byte order:** components are stored interleaved as `max.x, min.x, max.y, min.y, max.z, min.z`, not as two contiguous XYZ vectors.

### `readVMeshRef(parent)` / `writeVMeshRef(ref)`

Reads/writes a `VMeshRef` from/into the `VMeshRef` child file within a given UTF `Directory`.

---

## `part.ts` — Mesh Part

### `VMeshPart` interface

```ts
interface VMeshPart {
  type: 'vmeshpart'
  reference: VMeshRef
}
```

A thin wrapper that reads/writes a `VMeshPart` UTF directory containing a single `VMeshRef` file.

### `readVMeshPart(parent)` / `writeVMeshPart(part)`

Looks up the `VMeshPart` subdirectory inside `parent`, then delegates to `readVMeshRef`/`writeVMeshRef`.

`readVMeshPart` returns `undefined` when the `VMeshPart` subdirectory is absent, so callers can probe for it (`readMultiLevel(parent) ?? readVMeshPart(parent)`); a `VMeshPart` directory that exists but lacks its `VMeshRef` file still throws.

---

## `wireframe.ts` — Wireframe Overlay

A `VMeshWire` is an edge-only companion to a rigid part's geometry — the line overlay Freelancer draws over a ship in the scanner and dealer views. It reuses a mesh already present in the `VMeshLibrary` but supplies its own index buffer, drawn as `D3DPT_LINELIST` (`PrimitiveCount = indices.length / 2`).

### Interfaces

```ts
interface VWireData {
  meshId: number // int32 — CRC32 of target VMeshData name, same key space as VMeshRef.meshId
  vertexStart: number // uint16 — base vertex offset; indices are relative to it
  vertexCount: number // uint16 — number of unique vertex ids referenced by indices
  vertexRange: number // uint16 — vertex span covering those vertices (D3D NumVertices)
  indices: Uint16Array // uint16[] — LineList indices, two per edge, relative to vertexStart
}

interface VMeshWire {
  data: VWireData
}
```

The wrapper mirrors the UTF shape: a `VMeshWire` directory holding a single `VWireData` file, the same way `VMeshPart` wraps `VMeshRef`.

### Indices are relative to `vertexStart`

**Absolute vertex = `vertexStart + index`.** `vertexStart` is a base offset into the wire mesh's vertex buffer, not the smallest index present — `indices` themselves normally start at 0.

This matters because several parts routinely share one wire mesh, each claiming its own slice. Reading the indices as relative makes those slices tile the buffer without overlapping; reading them as absolute makes every part draw the same vertices. From `OSMIUM/node_asteroid_osmium03f.cmp`, four parts sharing one mesh:

```
absolute: [0,24] [0,99]   [0,83]    [0,68]      ← all overlapping
relative: [0,24] [36,135] [148,231] [244,312]   ← disjoint, ascending
```

Across the Freelancer/Discovery asset corpus this holds for 718 of 718 such groups, while the absolute reading collides in 717 of them.

Together `vertexStart` and `vertexRange` are the `MinIndex`/`NumVertices` pair of `DrawIndexedPrimitive` — the same role `VMeshGroup` fills with `vertexStart`/`vertexEnd`.

### Binary layout (`VWireData` UTF file)

| Field       | Type     | Notes                                        |
| ----------- | -------- | -------------------------------------------- |
| headerSize  | uint32   | Must be `0x10` (16) — self-describing size   |
| meshId      | int32    | CRC32 of target `VMeshData` name             |
| vertexStart | uint16   | Base vertex offset; indices are relative     |
| vertexCount | uint16   | Unique vertex ids referenced                 |
| indexCount  | uint16   | Number of indices that follow                |
| vertexRange | uint16   | Vertex span covering the referenced vertices |
| indices     | uint16[] | count = indexCount                           |

Header size is fixed at **16 bytes**; total file size is `16 + indexCount × 2`.

> **Field order caveat:** `indexCount` is stored _before_ `vertexRange`, so the two trailing uint16s are not the (start, count) pair the leading ones are.

### Deriving the fields

When authoring new wireframe data from a set of absolute vertex ids referenced by the lines:

```ts
vertexStart = Math.min(...ids)
indices = ids.map((id) => id - vertexStart) // relative, so min(indices) === 0
vertexCount = new Set(ids).size
vertexRange = Math.max(...ids) - Math.min(...ids) + 1
```

**Provenance.** These formulas come from measuring 6,308 `VWireData` records across 3,931 `.cmp`/`.3db` files. `vertexCount` matches the unique-id count in 99.3% of them. `vertexRange` splits perfectly along exporter lineage:

| records | `max-min` | `max-min+1` | exporter               |
| ------- | --------- | ----------- | ---------------------- |
| 1816    | 0         | **1816**    | `Nov 5 2002 11:41:55`  |
| 1319    | **1319**  | 0           | `MAXLancer Tools 0.97` |
| 588     | **588**   | 0           | `MAXLancer Tools 0.98` |
| 495     | 0         | **495**     | `Aug 24 2002 12:33:14` |
| 473     | **473**   | 0           | `MAXLancer Tools`      |
| 311     | 0         | **311**     | `Jun 10 2002 16:27:11` |
| 21      | **20**    | 0           | `LancerEdit 2024.06.1` |

Every date-stamped build string is an original Digital Anvil exporter, and all of them emit `max - min + 1` without exception. MAXLancer and LancerEdit emit one less, which under-declares the span so the highest-numbered vertex falls outside it. The `+ 1` form is canonical: as a vertex count it is exactly the `NumVertices` that `DrawIndexedPrimitive` expects.

> The reader and writer **preserve whatever a file contains** and never normalise it, so assets round-trip byte-exactly regardless of which tool produced them. Use the formulas above only when creating new data. `indexCount` is the one field genuinely derived on write.

### `readVMeshWire(parent)` / `writeVMeshWire(wire)`

`readVMeshWire` returns `undefined` when `parent` has no `VMeshWire` subdirectory, throws when that directory exists without a `VWireData` file, and throws `RangeError` if the leading size field is not `0x10`. `writeVMeshWire` returns a fresh `VMeshWire` directory, recomputes `indexCount` from `indices.length`, and writes the three vertex fields unchanged.

Rigid parts read and write this through `Rigid.wireframe` — see [RIGID.md](RIGID.md).

---

## `multilevel.ts` — LOD Levels

### `MultiLevel` interface

```ts
interface MultiLevel {
  type: 'multilevel'
  ranges: number[] // N+1 float distance breakpoints for N levels
  levels: VMeshPart[] // Level0, Level1, … LevelN-1
}
```

Stored as a `MultiLevel` UTF directory with:

- `Switch2` — float32 sequence of N+1 camera-distance breakpoints for N LOD levels. Defaults to `[0, 1000]` if the file is absent.
- `Level0`, `Level1`, … — subdirectories, each containing a `VMeshPart`.

### `atRange(multiLevel, value)`

Returns the `VMeshPart` for the LOD level whose range `[ranges[i], ranges[i+1])` contains `value`. Returns `undefined` if no range matches.

### `readMultiLevel(parent)` / `writeMultiLevel(multiLevel)`

Reads/writes the `MultiLevel` subtree inside `parent`. `readMultiLevel` returns `undefined` if no `MultiLevel` subdirectory exists.

---

## `library.ts` — Mesh Library

```ts
type VMeshLibrary = VMeshData[]
```

The library is a flat list, in the order the meshes appear under the `VMeshLibrary` directory; `getMesh` finds one by the CRC32 of its name (computed via `getResourceId`). Conceptually this is a pool of shared GPU vertex/index buffers; multiple `VMeshRef`s can address into the same `VMeshData`.

### Functions

| Function                       | Description                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------ |
| `readVMeshLibrary(parent)`     | Reads every `VMeshData` inside the `VMeshLibrary` subdirectory                 |
| `writeVMeshLibrary(values)`    | Creates a `VMeshLibrary` directory containing one subdirectory per `VMeshData` |
| `getMesh(library, name)`       | Looks up a `VMeshData` by name string or CRC; `undefined` if absent            |
| `getMeshDraw(data, reference)` | Generator — yields one `MeshDraw` per group of the reference, in index order   |

### `MeshDraw`

```ts
{
  materialId: number // int32 CRC of material — set active material before issuing this draw call
  startIndex: number // StartIndex: where the group's indices begin in the mesh index buffer
  elementCount: number // NumIndices; elementCount / 3 primitives for a TriangleList
  baseVertex: number // BaseVertex and MinIndex: ref.vertexStart + group.vertexStart
  numVertices: number // NumVertices: vertexEnd - vertexStart + 1, vertexEnd being inclusive
}
```

Together with `data.primitive` and `data.format`, which belong to the mesh rather than to any one group, that is one `DrawIndexedPrimitive`:

```cpp
device->DrawIndexedPrimitive(data.primitive,
  draw.baseVertex, draw.numVertices, draw.startIndex, draw.elementCount / 3);
```

**Offsets, not slices.** Nothing here subarrays `indices` or `vertices`. `baseVertex` is a draw parameter in Direct3D and has nowhere to go in an API without one — WebGL2's `drawElements` takes a byte offset and nothing else — so a consumer there folds it into the index values, the attribute pointers or the upload. [RENDERER.md](RENDERER.md) §3.3 weighs the four options; picking one is the consumer's, which is why `getMeshDraw` hands out the numbers and stops.

Both offsets in `baseVertex` apply and neither is absolute on its own: 6,535 of the 8,792 retail references carry a non-zero `ref.vertexStart`, and dropping it draws the wrong geometry rather than failing. See §3.2 of the same document for the measurement.

---

## Mesh resolution is global, not per file

A `VMeshRef` names its mesh by CRC alone, with nothing to say which file that mesh lives in. At runtime Freelancer resolves it against every library currently loaded, so a model may reference geometry that its own `VMeshLibrary` does not contain — and `getMesh` returns `undefined` for it when handed only the one file's library.

The retail data has exactly one case: **`INTERFACE/interface.generic.vms`**, a bare UTF tree whose only child is a `VMeshLibrary` holding two meshes.

```
INTERFACE/interface.generic.vms
  VMeshLibrary/
    interface.generic-2.vms     ── id -493461457
    interface.generic-102.vms   ── id  324122324
```

`.vms` is not a distinct format — it is a UTF container with nothing but the library, read by `readVMeshLibrary` like any other. The game loads it unprompted (the path is baked into the executable rather than named by any INI), which is why 331 `INTERFACE/**` models reference those two meshes without ever declaring a library of their own. Those 530 references are the **only** external ones in retail data; every other `VMeshRef` in the game resolves inside its own file.

A consumer that renders arbitrary models therefore wants to merge libraries across files rather than resolve one file at a time.
