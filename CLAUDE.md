# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
npm run build   # compile TypeScript → dist/ via tsdown
npm test        # run Node.js built-in test runner over src/**/*.test.ts (uses tsx, no separate build step needed)
```

To run a single test file:
```sh
node --import tsx --test src/directory.test.ts
```

## Architecture

This is a TypeScript library for reading and writing **UTF (Universal Tree Format)** — a binary container format used by Freelancer (2003). The library is published as an ES module package with multiple entry points.

### Package entry points

| Export path | Source | Description |
|---|---|---|
| `.` (default) | `src/index.ts` | Core: `Directory` and `File` classes |
| `./utility` | `src/utility/index.ts` | `BufferView`, `Compound`, string/timestamp helpers |
| `./math` | `src/math/index.ts` | `Vector3`, `Vector4`, `Quat`, `Matrix3`, `Transform`, scalar math |
| `./alchemy` | `src/alchemy/index.ts` | Alchemy particle effect system (node library + effect library) |
| `./vmesh` | `src/vmesh/index.ts` | VMesh geometry part/library serialization |
| `./model` | `src/model/index.ts` | Rigid models: compound hierarchy, joints, hardpoints |
| `./surface` | `src/surface/index.ts` | `.sur` collision surfaces: parts, hulls, bounding volume hierarchy |

Module documentation lives in `docs/`: [UTF.md](docs/UTF.md), [VMESH.md](docs/VMESH.md), [MODEL.md](docs/MODEL.md), [SURFACE.md](docs/SURFACE.md), [ALCHEMY.md](docs/ALCHEMY.md).

### Binary format overview

A UTF file has three data regions, preceded by a fixed header:
- **Tree block** — 44-byte entries describing the node hierarchy (directories and files linked by sibling/child offsets)
- **Dictionary block** — NUL-terminated ASCII entry names, deduplicated
- **Data block** — raw file payloads

`Directory.read(view)` parses the binary using a BFS queue. `Directory.write()` re-serializes the in-memory tree back to binary. Both operate on `BufferView`, an internal stateful `DataView` subclass with sequential read/write methods and little-endian default.

### Core classes (`src/`)

- **`Directory`** — represents a directory node; holds `children: (Directory | File)[]`. Provides `getDirectory`, `setDirectory`, `getFile`, `setFile`, `delete`, `append` for tree traversal and mutation. Static `read`/`write` handle full binary serialization.
- **`File`** — represents a leaf file node; implements `ArrayBufferView`. Provides typed read/write iterators: `readIntegers`/`writeIntegers` (32-bit, with fallback to 16/8-bit for trailing bytes), `readFloats`/`writeFloats` (32-bit), `readStrings`/`writeStrings` (NUL-separated). All write methods chain (`return this`).
- **`hash.ts`** — two hash algorithms matching Freelancer conventions:
  - `getResourceId` — CRC32 (from `dacom.dll` table). Used for material names, mesh names, most UTF resource references.
  - `getObjectId` — byte-swapped CRC32 (`id32`). Used for object/archetype nicknames in INI files.
  - Path lookups (`getDirectory`, `getFile`) use `getResourceId` for case-insensitive name matching.

### Utility (`src/utility/`)

- **`BufferView`** — stateful `DataView` subclass with internal `#offset` pointer; `allocate(n)` creates a zeroed buffer, `join(...views)` concatenates views, `from(view)` wraps an existing `ArrayBufferView`. All data is little-endian by default.
- **`Dictionary`** — accumulates NUL-terminated entry names for the names block during serialization.
- **`compound.ts`** — generic `Compound<T>` (`{ children: T[] }`) tree helpers: `listCompoundElements`, `listCompoundPairs`, `findCompoundElement`, `reduceCompount`. Used by `src/model/` for the `Cmpnd` hierarchy.
- **`timestamp.ts`** — conversions between `Date` and DOS timestamps / Windows 64-bit FILETIMEs.
- **`string.ts`** — `toHex`, `isHex`, `parseHex` utilities.
- **`hierarchy.ts`** — generic `assemble`/`flatten` for tree-to-flat-list conversions (used by alchemy effect library).

### Alchemy (`src/alchemy/`)

Particle effect system with two cooperating libraries:
- **Node library** — typed parameter blocks (`Node[]`), each with a `Node_Name` string property. Referenced by CRC from effect instances.
- **Effect library** — tree of `NodeInstance` records, each referencing a node by name CRC. Cross-tree links stored as `targets` (serialized as flat `Pair` records).

Property system is a discriminated union keyed by `PropertyType`. Boolean values are packed into the type field's bit 15 (no separate payload). Property lists are terminated by a `uint16(0)` sentinel.

### VMesh (`src/vmesh/`)

Reads/writes VMesh geometry: `readVMeshPart`/`writeVMeshPart` for individual mesh parts and `readVMeshLibrary`/`writeVMeshLibrary` for the full mesh library. See `src/vmesh/data.ts` for binary layout details.

### Model (`src/model/`)

Rigid models (`.3db` single part, `.cmp` compound), layered on top of VMesh geometry:
- **`model.ts`** — generic `Model<T>` compound node (extends `Compound<Model<T>>`); `readModel`/`writeModel` take a fragment reader/writer callback. Hierarchy is reconstructed from the `Cons` constraint list, not from directory nesting.
- **`rigid.ts`** — `readRigidModel`/`writeRigidModel` dispatch between compound and single-part forms; a part is `Rigid` (hardpoints + `MultiLevel`/`VMeshPart`) or `Camera`.
- **`joint.ts`** / **`constraint.ts`** — parent↔child joints (`fixed`, `revolute`, `prismatic`, `cylinder`, `sphere`, `loose`) stored as fixed-size records in `Cons/Fix`, `Cons/Rev`, etc. Cylinder joints are unimplemented.
- **`hardpoint.ts`** — named attachment points under `Hardpoints/Fixed` and `Hardpoints/Revolute`.
- **`camera.ts`** — stub reader/writer detected via the `Fovx` file.

### Surface (`src/surface/`)

`.sur` collision files — a standalone chunked binary, **not** a UTF tree. `readSurfaceLibrary`/`writeSurfaceLibrary` operate on `BufferView` and produce a flat `Part[]`, each part keyed by the CRC of a model part name. A part holds an `Extent` (bounding box), hardpoint IDs, and a `Surface` block whose bounding volume hierarchy (`Node`) has convex `Hull` leaves made of `Face`s indexing shared `Point`s. Chunks are identified by FourCC tags (`!fxd`, `exts`, `surf`, `hpid`).

The `surf` chunk is a verbatim memory image of **`IVP_Compact_Surface`** from Ipion Virtual Physics (later Havok); Freelancer only supplies the FourCC container around it. When touching this module, check the layout against [ChimpsAtSea/Ipion-Virtual-Physics](https://github.com/ChimpsAtSea/Ipion-Virtual-Physics) — `ivp_compact_surface.hxx`, `ivp_compact_ledge.hxx`, `ivp_surbuild_ledge_soup.cxx`. [SURFACE.md](docs/SURFACE.md) maps every field to its IVP name and explains the magic constants (`0xfa` is 250, from IVP's two `1.0f / 250.0f` quantization steps).

## Code style

- Prettier: single quotes, no semicolons, 100-char print width.
- `verbatimModuleSyntax` is enabled — use `import type` for type-only imports.
- All imports use `.js` extensions (NodeNext module resolution, even for `.ts` sources).
- `noUncheckedIndexedAccess` is enabled — array indexing returns `T | undefined`.
- Internal package imports use the `#/*` alias (maps to `./src/*` in development, `./dist/*` at runtime).
