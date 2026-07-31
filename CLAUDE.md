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

The `corpus.test.ts` suites (`src/vmesh/`, `src/animation/`, `src/surface/`, `src/model/`) validate the readers against retail game assets. They look for a
Freelancer `DATA` directory at `$FREELANCER_DATA`, falling back to `~/Downloads/Freelancer/DATA`,
and skips itself with a reason when neither exists — the rest of the suite never depends on it.

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
| `./animation` | `src/animation/index.ts` | Keyframe animation scripts shared by `.cmp` and `.anm` |
| `./surface` | `src/surface/index.ts` | `.sur` collision surfaces: parts, hulls, bounding volume hierarchy |

Module documentation lives in `docs/`: [UTF.md](docs/UTF.md), [VMESH.md](docs/VMESH.md), [MODEL.md](docs/MODEL.md), [ANIMATION.md](docs/ANIMATION.md), [SURFACE.md](docs/SURFACE.md), [ALCHEMY.md](docs/ALCHEMY.md).

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

Reads/writes VMesh geometry: `readVMeshPart`/`writeVMeshPart` for individual mesh parts, `readVMeshWire`/`writeVMeshWire` for the `VMeshWire` line-list overlay, and `readVMeshLibrary`/`writeVMeshLibrary` for the full mesh library. See `src/vmesh/data.ts` for binary layout details.

### Model (`src/model/`)

Rigid models (`.3db` single part, `.cmp` compound), layered on top of VMesh geometry:
- **`model.ts`** — generic `Model<T>` compound node (extends `Compound<Model<T>>`); `readModel`/`writeModel` take a fragment reader/writer callback. Hierarchy is reconstructed from the `Cons` constraint list, not from directory nesting.
- **`rigid.ts`** — `readRigidModel`/`writeRigidModel` dispatch between compound and single-part forms; a part is `Rigid` (hardpoints + `MultiLevel`/`VMeshPart`) or `Camera`.
- **`joint.ts`** / **`constraint.ts`** — parent↔child joints (`fixed`, `revolute`, `prismatic`, `cylinder`, `sphere`, `loose`) stored as fixed-size records in `Cons/Fix`, `Cons/Rev`, etc. Cylinder joints are unimplemented.
- **`hardpoint.ts`** — named attachment points under `Hardpoints/Fixed` and `Hardpoints/Revolute`.
- **`camera.ts`** — cockpit view frustum, detected via the `Camera` subdirectory. `Fovx`/`Fovy` are half-angles in radians.
- **`materialanim.ts`** — `MaterialAnim`, a root-level sibling of `Cmpnd` animating material UV transforms. Read from the file root like `readVMeshLibrary`, not part of `RigidModel`. `MAKeys` is stored rather than derived from `MADeltas`; see [MODEL.md](docs/MODEL.md) for the counterexamples.

### Animation (`src/animation/`)

Keyframe animation "scripts". Rigid compound models embed the `Animation` directory in the `.cmp` next to `Cmpnd`; deformable models keep it in a standalone `.anm`. Both use the same structures, so this module is a sibling of `model/` rather than part of it — `readAnimationLibrary(root)` takes a file root directory, like `readVMeshLibrary` does.

- **`channel.ts`** — `Header` (count, interval, type) + `Frames` (packed keyframes). `ChannelType` is a byte-wide bitfield; `keyframeByteLength` derives the stride from it. A negative interval means each keyframe carries its own timestamp.
- **`map.ts`** — `ObjectMap` (root object, `Parent name` only) and `JointMap` (`Parent name` + `Child name`, drives the joint between them).
- **`script.ts`** / **`library.ts`** — `Animation/Script/<name>` tree, plus `Root height` for deformable models.

Quaternions come in four flavours: full `float32` W-X-Y-Z (`0x04`), implied identity (`0x20`), and two `int16` quantizations (`0x40` restores W from unit length, `0x80` stores the axis scaled by angle/π). **The quantized decode follows [Librelancer](https://github.com/Librelancer/Librelancer/tree/main/src/LibreLancer/Utf/Anm), not MAXLancer, which assigns the half-angle function to the wrong flag.** [ANIMATION.md](docs/ANIMATION.md) documents the layout, the type combinations that occur in retail data, and the 55 keyframes that cannot round-trip exactly because their source data is out of encoding range.

### Surface (`src/surface/`)

`.sur` collision files — a standalone chunked binary, **not** a UTF tree. `readSurfaceLibrary`/`writeSurfaceLibrary` operate on `BufferView` and produce a flat `Part[]`, each part keyed by the CRC of a model part name. A part holds an `Extent` (bounding box), hardpoint IDs, and a `Surface` block whose bounding volume hierarchy (`Node`) has convex `Hull` leaves made of `Face`s indexing shared `Point`s. Chunks are identified by FourCC tags (`!fxd`, `exts`, `surf`, `hpid`).

The `surf` chunk is a verbatim memory image of **`IVP_Compact_Surface`** from Ipion Virtual Physics (later Havok); Freelancer only supplies the FourCC container around it. When touching this module, check the layout against [ChimpsAtSea/Ipion-Virtual-Physics](https://github.com/ChimpsAtSea/Ipion-Virtual-Physics) — `ivp_compact_surface.hxx`, `ivp_compact_ledge.hxx`, `ivp_surbuild_ledge_soup.cxx`. [SURFACE.md](docs/SURFACE.md) maps every field to its IVP name and explains the magic constants (`0xfa` is 250, from IVP's two `1.0f / 250.0f` quantization steps).

## Code style

- Prettier: single quotes, no semicolons, 100-char print width.
- `verbatimModuleSyntax` is enabled — use `import type` for type-only imports.
- All imports use `.js` extensions (NodeNext module resolution, even for `.ts` sources).
- `noUncheckedIndexedAccess` is enabled — array indexing returns `T | undefined`.
- Internal package imports use the `#/*` alias (maps to `./src/*` in development, `./dist/*` at runtime).
