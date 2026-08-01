# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

TypeScript library for reading and writing **UTF (Universal Tree Format)** — the binary container
used by Freelancer (2003). Published as an ES module package with multiple entry points.

## Commands

```sh
npm run build   # compile TypeScript → dist/ via tsdown
npm test        # Node.js built-in test runner over src/**/*.test.ts (uses tsx, no build step)

node --import tsx --test src/directory.test.ts   # a single test file
```

- `corpus.test.ts` suites validate readers against retail game assets and skip themselves with a
  reason when none are installed. See [RETAIL.md](docs/RETAIL.md).

## Package entry points

| Export path | Source | Description |
|---|---|---|
| `.` (default) | `src/index.ts` | Core: `Directory` and `File` classes |
| `./utility` | `src/utility/index.ts` | `BufferView`, `Tree`, string/timestamp helpers |
| `./math` | `src/math/index.ts` | `Vector3`, `Vector4`, `Quat`, `Matrix3`, `Transform`, scalar math |
| `./alchemy` | `src/alchemy/index.ts` | Alchemy particle effects (node library + effect library) |
| `./vmesh` | `src/vmesh/index.ts` | VMesh geometry part/library serialization |
| `./compound` | `src/compound/index.ts` | The `Cmpnd` hierarchy: parts, constraints, joints, hardpoints |
| `./rigid` | `src/rigid/index.ts` | Rigid `.3db`/`.cmp`/`.sph` models: parts, cameras, spheres, material animation |
| `./animation` | `src/animation/index.ts` | Keyframe animation scripts shared by `.cmp` and `.anm` |
| `./surface` | `src/surface/index.ts` | `.sur` collision surfaces: parts, hulls, bounding volume hierarchy |
| `./texture` | `src/texture/index.ts` | `Texture library` entries: DDS surfaces, Targa mip chains, animations, cubemaps |
| `./material` | `src/material/index.ts` | `Material library` entries: shader type, colours, texture slots |
| `./deformable` | `src/deformable/index.ts` | `.dfm` character models: bone table, skinned meshes, detail levels |

## Core (`src/`)

- **`Directory`** — directory node holding `children: (Directory | File)[]`; `getDirectory`,
  `setDirectory`, `getFile`, `setFile`, `delete`, `append`. Static `read`/`write` do full binary
  serialization — `read` parses via a BFS queue.
- **`File`** — leaf node implementing `ArrayBufferView`. Typed iterators `readIntegers`/`writeIntegers`
  (32-bit, falling back to 16/8-bit for trailing bytes), `readFloats`/`writeFloats`,
  `readStrings`/`writeStrings` (NUL-separated). Write methods chain.
- **`hash.ts`** — `getResourceId` (CRC32, from the `dacom.dll` table) for material/mesh names and
  most UTF references; `getObjectId` (byte-swapped CRC32, `id32`) for INI nicknames. Path lookups
  use `getResourceId` for case-insensitive matching.
- **A UTF file is a fixed header plus three regions**: tree block (44-byte entries linked by
  sibling/child offsets), dictionary block (deduplicated NUL-terminated names), data block (payloads).
  See [UTF.md](docs/UTF.md).

## Utility (`src/utility/`)

- **`BufferView`** — stateful `DataView` subclass with an internal `#offset`; `allocate`, `join`,
  `from`. Little-endian by default. Every binary reader and writer operates on one.
- **`Dictionary`** — accumulates entry names for the names block during serialization.
- **`tree.ts`** — generic `Tree<T>` helpers: `listTreeElements`, `listTreePairs`, `findTreeElement`,
  `reduceTree`.
- **`timestamp.ts`** — `Date` ↔ DOS timestamps / Windows 64-bit FILETIMEs.
- **`string.ts`** — `toHex`, `isHex`, `parseHex`. **`hierarchy.ts`** — generic `assemble`/`flatten`.

## Modules

Each has a document in `docs/` carrying its binary layout, the retail measurements behind it, and
the decisions not worth re-litigating. **Read the module's document before changing its reader or
writer** — most design choices there are pinned by corpus tests against counterexamples.

- **[VMESH.md](docs/VMESH.md)** (`src/vmesh/`) — mesh parts, the `VMeshWire` line-list overlay, the
  mesh library, LOD levels. Binary layout in `src/vmesh/data.ts`.
- **[COMPOUND.md](docs/COMPOUND.md)** (`src/compound/`) — the `Cmpnd` hierarchy, **shared
  byte-for-byte by rigid `.cmp` models and deformable `.dfm` characters**, which is why it is its own
  module: `rigid/` supplies mesh parts as the fragment payload, `deformable/` supplies bones, and
  nothing here knows what a fragment contains. Hierarchy is rebuilt from the `Cons` constraint list,
  not from directory nesting. Joints and hardpoints live here.
- **[RIGID.md](docs/RIGID.md)** (`src/rigid/`) — `.3db`/`.cmp`/`.sph`, layered on `compound/` and
  VMesh. A part is `Rigid`, `Camera` or `Sphere`. `MaterialAnim` is a root-level sibling of `Cmpnd`,
  read from the file root rather than being part of `RigidModel`.
- **[ANIMATION.md](docs/ANIMATION.md)** (`src/animation/`) — keyframe scripts, embedded in a `.cmp`
  or standalone in an `.anm`; `readAnimationLibrary(root)` takes a file root. Channel types are a
  byte-wide bitfield deriving the keyframe stride. **The quantized quaternion decode follows
  [Librelancer](https://github.com/Librelancer/Librelancer/tree/main/src/LibreLancer/Utf/Anm), not
  MAXLancer, which assigns the half-angle function to the wrong flag.**
- **[SURFACE.md](docs/SURFACE.md)** (`src/surface/`) — `.sur` collision files, a standalone chunked
  binary, **not a UTF tree**; readers take a `BufferView`. The `surf` chunk is a verbatim memory image
  of **`IVP_Compact_Surface`** from Ipion Virtual Physics (later Havok), so check layout changes
  against [ChimpsAtSea/Ipion-Virtual-Physics](https://github.com/ChimpsAtSea/Ipion-Virtual-Physics).
- **[TEXTURE.md](docs/TEXTURE.md)** (`src/texture/`) — `Texture library` entries in four forms: a DDS
  in `MIPS`, a Targa chain in `MIP0..n`, an animation over sibling atlas entries, or a `CUBE` cubemap.
  All four read and write. `TextureStorage` says which form an entry uses, because the pixel format
  does not. **A cubemap is `CubeTexture`, a sibling of `Texture` rather than a flag on it**, so
  uploading one as a 2D texture is a type error.
- **[MATERIAL.md](docs/MATERIAL.md)** (`src/material/`) — `Material library` entries: a `Type` string
  naming the shader, colours, scalars, and texture slots as `<slot>_name`/`<slot>_flags` pairs.
  **The type does not determine the property set, so every property is independently optional** and a
  property that was absent stays absent. A `*_flags` word is three settings, not a flat bitfield.
- **[DEFORMABLE.md](docs/DEFORMABLE.md)** (`src/deformable/`) — `.dfm` characters: one skinned mesh
  per detail level under `MultiLevel`, plus a tree of bones. **Bones are an ordered table, not just a
  tree** — `Index` is the bone's directory position and is what `Bone_id_chain` skins to, so it is
  derived on write and a disagreement throws.
- **[ALCHEMY.md](docs/ALCHEMY.md)** (`src/alchemy/`) — `.ale` particle effects: a node library of
  typed parameter blocks and an effect library of `NodeInstance` records referencing them by name CRC.
  Properties are a discriminated union with booleans packed into the type field's bit 15.
  **This is the one module that hashes case-sensitively** — `getResourceId(name, true)`; folding case
  the way the rest of the library does strands roughly half the instance references. Two questions are
  deliberately open, marked `TODO` in the source and carried as `todo` tests that report without
  failing.

Three documents are not per-module:

- **[RETAIL.md](docs/RETAIL.md)** — the retail install as a whole: where the corpus lives, what each
  module round-trips, and the five **openFLAME** files (leftovers from Digital Anvil's *Conquest:
  Frontier Wars*) that share only the container. **Find them, skip them, do not implement them** —
  every reader already yields nothing on them without throwing, deliberately. It also indexes every
  open question across the modules — see below.
- **[AUDIO.md](docs/AUDIO.md)** — `DATA/AUDIO` voice banks, which have no module: flat UTF
  directories of RIFF payloads named by `getObjectId` of the `voices_*.ini` nickname, handled with
  `Directory` directly.
- **[RENDERER.md](docs/RENDERER.md)** — consumer-facing rather than per-module: maps the structures
  onto a WebGL2 renderer (base offsets, VAO strategies, joint composition, winding and matrix
  conventions) and records the measurements behind each choice.

### Open questions live in a `TODO` section

A module document's last section before its footer is **`## TODO`**, holding what is pending
*observation in the running game* rather than pending code: the question, why the corpus cannot
settle it, the reading taken meanwhile, and the experiment that would decide it. Present in
ALCHEMY, ANIMATION, RIGID, MATERIAL, TEXTURE, DEFORMABLE and RENDERER;
[RETAIL.md](docs/RETAIL.md#todo--what-is-pending-in-the-game) indexes all of them in one table.

- **Everything listed round-trips already.** A `TODO` marks an unread meaning, never an unread byte
  — do not "fix" one by guessing, and do not derive a value the game might disagree with.
- A source `// TODO: observe in game` comment states the same question at the code it constrains,
  and some are also pinned as `todo` tests that report without failing.
- Closed questions are called out as closed where they would otherwise look open (cylinder joint
  animation is impossible, not missing; `tlrtube.3db` is blocked on a crash, not on an experiment).

## Code style

- Prettier: single quotes, no semicolons, 100-char print width.
- `verbatimModuleSyntax` — use `import type` for type-only imports.
- All imports use `.js` extensions (NodeNext resolution, even for `.ts` sources).
- `noUncheckedIndexedAccess` — array indexing returns `T | undefined`.
- Internal package imports use the `#/*` alias (`./src/*` in development, `./dist/*` at runtime).
- Prefer type-enforced invariants over redundant fields: model distinctions as discriminated unions
  so a wrong consumer breaks at compile time.
