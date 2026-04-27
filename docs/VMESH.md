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
```

A `VMeshRef` identifies a mesh by the CRC32 of its name (`meshId`) and selects a slice of that mesh's groups, indices, and vertices. `getMeshDraw` resolves the reference against a loaded `VMeshLibrary` and yields per-group draw calls ready to pass to `DrawIndexedPrimitive`.

---

## `data.ts` — Mesh Data

### `Primitive` enum

Direct3D primitive type (`D3DPRIMITIVETYPE`). Values are identical to the D3D constants and can be passed directly to `DrawIndexedPrimitive`. PrimitiveCount (required by the API) is derived from `elementCount` as shown.

| Value | Constant | D3D name | PrimitiveCount formula |
|-------|----------|----------|------------------------|
| 0 | `None` | — | — |
| 1 | `PointList` | `D3DPT_POINTLIST` | `elementCount` |
| 2 | `LineList` | `D3DPT_LINELIST` | `elementCount / 2` |
| 3 | `LineStrip` | `D3DPT_LINESTRIP` | `elementCount - 1` |
| 4 | `TriangleList` | `D3DPT_TRIANGLELIST` | `elementCount / 3` |
| 5 | `TriangleStrip` | `D3DPT_TRIANGLESTRIP` | `elementCount - 2` |
| 6 | `TriangleFan` | `D3DPT_TRIANGLEFAN` | `elementCount - 2` |

### `Format` enum

Direct3D flexible vertex format bitmask (`D3DFVF_*`). The value is a DWORD passed directly to `IDirect3DDevice8::SetVertexShader` (D3D8) or `IDirect3DDevice9::SetFVF` (D3D9) to describe the in-memory vertex layout.

| Flag | Value | D3D name | Bytes added to vertex stride |
|------|-------|----------|------------------------------|
| `Position` | `0x002` | `D3DFVF_XYZ` | 12 (3× float32 x/y/z) |
| `Normal` | `0x010` | `D3DFVF_NORMAL` | 12 (3× float32) |
| `PointSize` | `0x020` | `D3DFVF_PSIZE` | 4 (1× float32) |
| `Diffuse` | `0x040` | `D3DFVF_DIFFUSE` | 4 (`D3DCOLOR`, uint32 ARGB) |
| `Specular` | `0x080` | `D3DFVF_SPECULAR` | 4 (`D3DCOLOR`, uint32 ARGB) |
| `Texture1`–`Texture8` | `0x100`–`0x800` | `D3DFVF_TEX1`–`D3DFVF_TEX8` | 8 per set (2× float32 u/v) |

> **Texture flag encoding:** `Texture1`–`Texture8` are not independent bitmask flags — they encode a *count* of UV sets in bits 8–11 (`TextureCountMask = 0xf00`, `TextureCountShift = 8`). `D3DFVF_TEX2` means "two UV sets total", not "first and second UV sets independently". Combining them with `|` is wrong; pick exactly one.

### Helper functions

| Function | Description |
|----------|-------------|
| `getMapCount(format)` | Returns number of UV sets: `(format & 0xf00) >> 8` |
| `vertexByteLength(format)` | Returns the vertex stride in bytes for a given FVF bitmask |

### `VMeshData` interface

```ts
interface VMeshData {
  name: string
  type: 1               // always 1 (version field in binary)
  primitive: Primitive  // D3DPRIMITIVETYPE
  format: Format        // D3DFVF bitmask
  groups: VMeshGroup[]
  indices: Uint16Array  // D3DFMT_INDEX16 index buffer, shared across all groups
  vertices: Uint8Array  // FVF-described vertex buffer, stride = vertexByteLength(format)
}
```

`indices` maps to an `IDirect3DIndexBuffer8/9` created with `D3DFMT_INDEX16`. `vertices` maps to an `IDirect3DVertexBuffer8/9` whose stride and layout are described by `format`.

### Binary layout (`VMeshData` UTF file)

| Field | Type | Notes |
|-------|------|-------|
| version | uint32 | Must be `1` |
| primitive | uint32 | `D3DPRIMITIVETYPE` value |
| groupCount | uint16 | |
| indexCount | uint16 | Total indices across all groups |
| format | uint16 | `D3DFVF` bitmask |
| vertexCount | uint16 | Total vertices |
| groups | `VMeshGroup[]` | 12 bytes each, count = groupCount |
| indices | uint16[] | count = indexCount |
| vertices | uint8[] | count = vertexCount × `vertexByteLength(format)` |

### `readVMeshData(parent)` / `writeVMeshData(data)`

Reads/writes a `VMeshData` from/into a UTF `Directory` by looking up the `VMeshData` child file.

---

## `group.ts` — Mesh Group

Each `VMeshGroup` corresponds to one `DrawIndexedPrimitive` call. The fields map directly to D3D8 parameters (D3D9 adds `BaseVertexIndex` as an additional INT before `MinVertexIndex`, otherwise identical):

```cpp
// D3D8
device->DrawIndexedPrimitive(
  primitive,                           // D3DPRIMITIVETYPE
  group.vertexStart,                   // MinIndex
  group.vertexEnd - group.vertexStart, // NumVertices
  startIndex,                          // StartIndex (accumulated from ref.indexStart + prior groups)
  primitiveCount                       // derived from group.elementCount + primitive type
);
```

### `VMeshGroup` interface

```ts
interface VMeshGroup {
  materialId: number    // int32 — CRC32 of material name; set active material before drawing
  vertexStart: number   // uint16 — MinIndex: lowest vertex index referenced by this group
  vertexEnd: number     // uint16 — MinIndex + NumVertices (exclusive); NumVertices = vertexEnd - vertexStart
  elementCount: number  // uint16 — total index count; PrimitiveCount = f(elementCount, primitive type)
  padding: number       // uint16 — unused alignment field
}
```

Fixed size: **12 bytes** per group.

---

## `ref.ts` — Mesh Reference

A `VMeshRef` selects a sub-range of groups, indices, and vertices from a named `VMeshData` in the library. It provides everything needed to call `DrawIndexedPrimitive` for each group in the slice.

### `VMeshRef` interface

```ts
interface VMeshRef {
  meshId: number        // int32 — CRC32 of target VMeshData name (key into VMeshLibrary)
  vertexStart: number   // uint16 — base vertex offset within the mesh's vertex buffer
  vertexCount: number   // uint16 — number of vertices in this ref's slice
  indexStart: number    // uint16 — StartIndex: first index in the shared index buffer
  indexCount: number    // uint16 — total indices across all groups in this ref
  groupStart: number    // uint16 — first VMeshGroup index to render
  groupCount: number    // uint16 — number of groups to render
  boundingBox: BoundingBox      // { a: min corner, b: max corner } — D3DXComputeBoundingBox output
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

---

## `multilevel.ts` — LOD Levels

### `MultiLevel` interface

```ts
interface MultiLevel {
  type: 'multilevel'
  ranges: number[]     // N+1 float distance breakpoints for N levels
  levels: VMeshPart[]  // Level0, Level1, … LevelN-1
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
type VMeshLibrary = Map<number, VMeshData>
```

The library is a `Map` keyed by the CRC32 of each mesh's name (computed via `getResourceId`). Conceptually this is a pool of shared GPU vertex/index buffers; multiple `VMeshRef`s can address into the same `VMeshData`.

### Functions

| Function | Description |
|----------|-------------|
| `readVMeshLibrary(parent)` | Generator — yields each `VMeshData` found inside the `VMeshLibrary` subdirectory |
| `writeVMeshLibrary(values)` | Creates a `VMeshLibrary` directory containing one subdirectory per `VMeshData` |
| `getMesh(library, name)` | Looks up a `VMeshData` by name string or CRC |
| `getMeshDraw(library, reference)` | Generator — resolves a `VMeshRef` and yields per-group draw descriptors |

### `getMeshDraw` yield shape

```ts
{
  materialId: number    // int32 CRC of material — set active material before issuing this draw call
  primitive: Primitive  // D3DPRIMITIVETYPE
  base: number          // StartIndex for DrawIndexedPrimitive (accumulated per group)
  elements: Uint16Array // subarray of the mesh's D3DFMT_INDEX16 index buffer
  format: Format        // D3DFVF bitmask — pass to SetVertexShader (D3D8) or SetFVF (D3D9)
  size: number          // vertex stride in bytes = vertexByteLength(format)
  vertices: Uint8Array  // subarray of the mesh's vertex buffer
}
```

Each yielded object provides everything needed to issue one `DrawIndexedPrimitive` call. The `elements` and `vertices` slices are `subarray` views into the shared `VMeshData` buffers — no copying occurs.
