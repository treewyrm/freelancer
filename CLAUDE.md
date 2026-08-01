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

The `corpus.test.ts` suites (`src/vmesh/`, `src/animation/`, `src/surface/`, `src/rigid/`, `src/texture/`, `src/material/`, `src/deformable/`, `src/alchemy/`) validate the readers against retail game assets. They look for a
Freelancer `DATA` directory at `$FREELANCER_DATA`, falling back to `~/Downloads/Freelancer/DATA`,
and skips itself with a reason when neither exists — the rest of the suite never depends on it.

## Architecture

This is a TypeScript library for reading and writing **UTF (Universal Tree Format)** — a binary container format used by Freelancer (2003). The library is published as an ES module package with multiple entry points.

### Package entry points

| Export path | Source | Description |
|---|---|---|
| `.` (default) | `src/index.ts` | Core: `Directory` and `File` classes |
| `./utility` | `src/utility/index.ts` | `BufferView`, `Tree`, string/timestamp helpers |
| `./math` | `src/math/index.ts` | `Vector3`, `Vector4`, `Quat`, `Matrix3`, `Transform`, scalar math |
| `./alchemy` | `src/alchemy/index.ts` | Alchemy particle effect system (node library + effect library) |
| `./vmesh` | `src/vmesh/index.ts` | VMesh geometry part/library serialization |
| `./compound` | `src/compound/index.ts` | The `Cmpnd` hierarchy shared by rigid and deformable models: parts, constraints, joints, hardpoints |
| `./rigid` | `src/rigid/index.ts` | Rigid `.3db`/`.cmp`/`.sph` models: parts, cameras, spheres, material animation |
| `./animation` | `src/animation/index.ts` | Keyframe animation scripts shared by `.cmp` and `.anm` |
| `./surface` | `src/surface/index.ts` | `.sur` collision surfaces: parts, hulls, bounding volume hierarchy |
| `./texture` | `src/texture/index.ts` | `Texture library` entries: DDS surfaces, Targa mip chains, animations |
| `./material` | `src/material/index.ts` | `Material library` entries: shader type, colours, texture slots |
| `./deformable` | `src/deformable/index.ts` | `.dfm` character models: bone table, skinned meshes, detail levels |

Module documentation lives in `docs/`: [UTF.md](docs/UTF.md), [VMESH.md](docs/VMESH.md), [COMPOUND.md](docs/COMPOUND.md), [RIGID.md](docs/RIGID.md), [ANIMATION.md](docs/ANIMATION.md), [SURFACE.md](docs/SURFACE.md), [ALCHEMY.md](docs/ALCHEMY.md), [TEXTURE.md](docs/TEXTURE.md), [MATERIAL.md](docs/MATERIAL.md), [DEFORMABLE.md](docs/DEFORMABLE.md). [AUDIO.md](docs/AUDIO.md)
documents the `DATA/AUDIO` voice banks, which have no module — they are flat UTF directories of
RIFF payloads named by `getObjectId` of the `voices_*.ini` message nickname, read and written with
`Directory` directly.

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
- **`tree.ts`** — generic `Tree<T>` (`{ children: T[] }`) tree helpers: `listTreeElements`, `listTreePairs`, `findTreeElement`, `reduceTree`. Used by `src/compound/` for the `Cmpnd` hierarchy.
- **`timestamp.ts`** — conversions between `Date` and DOS timestamps / Windows 64-bit FILETIMEs.
- **`string.ts`** — `toHex`, `isHex`, `parseHex` utilities.
- **`hierarchy.ts`** — generic `assemble`/`flatten` for tree-to-flat-list conversions (used by alchemy effect library).

### Alchemy (`src/alchemy/`)

Particle effect system with two cooperating libraries:
- **Node library** — typed parameter blocks (`Node[]`), each with a `Node_Name` string property. Referenced by CRC from effect instances.
- **Effect library** — tree of `NodeInstance` records, each referencing a node by name CRC. Cross-tree links stored as `targets` (serialized as flat `Pair` records).

Property system is a discriminated union keyed by `PropertyType`. Boolean values are packed into the type field's bit 15 (no separate payload). Property lists are terminated by a `uint16(0)` sentinel.

Both libraries live in a `.ale` UTF container as `AlchemyNodeLibrary/AlchemyNodeLibrary` and `ALEffectLib/ALEffectLib`. **This is the one module that hashes case-sensitively** — `getResourceId(name, true)`. Most retail node names are mixed case, and folding them the way the rest of the library does strands roughly half the instance references.

Three points settled against retail and pinned by `corpus.test.ts`:

- **`NodeInstance.id` is preserved, not derived.** Retail entry identifiers are sparse and unordered; regenerating them from a traversal changed 567 of the 596 files for no reason.
- **`DefaultId` is `0xee223b51 | 0`.** Instance CRCs are read as `int32`, so the unsigned literal never compared equal to anything. It marks the root container every effect hangs its instances from, and names no node.
- **Pair record order is not preserved** (146 files) and the empty string has two retail encodings, only one of which the writer emits (2 files). Both are authoring residue; the links and values are identical either way, and writing is a fixed point everywhere. See [ALCHEMY.md](docs/ALCHEMY.md), which also lists the five property CRCs that match no known name.

`evaluation.ts` samples those properties, and retail data is looser than it first assumed: **a keyframe list of one, or of several sharing a key, spans no range** (11831 of the 27662 looped lists), **nine keyframes carry an easing byte outside `EaseType`**, and **empty keyframe lists are common** (14127 looped, 7 eased). Each used to produce `NaN` or throw; they now evaluate to the single value, to linear, and to `default` or zero respectively. The corpus test samples every animated property over a grid of sparam and time and requires finite results, so this cannot regress.

Two questions are deliberately left open, each marked `TODO` in the source and carried as a `todo` test that reports on every run without failing the suite:

- **`EaseType` may be missing a member.** Seven of the nine out-of-enum easing bytes are junk — bit 3 set, low three bits clear, all in `gf_bolt01.ale`, all on single-keyframe lists where easing is never read, in an effect no `[Effect]` entry names. The other two are a **6**, one past `Auto`, on the four-keyframe alpha envelope of the motion dust in `dust.ale` and `motionblur_dust.ale`. **Easing 6 and `FLDustAppearance` imply one another across the corpus** — that node type has exactly two instances, both use 6, and nothing else does; every other dust builds the same effect from `FxBasicAppearance` with easing 4 over an identical emitter. So it tracks Freelancer's own node type, not an author's slip. Treating it as linear is a placeholder, not a finding; the byte round-trips untouched, so a one-byte edit is a clean in-game experiment.
- **`limit` folds a key landing exactly on the end of an unflagged curve back to its start**, so the last keyframe is never sampled — right for a looping curve, wrong for a holding one, and unverified against the game.

Both want observing in the field. See [ALCHEMY.md](docs/ALCHEMY.md) for the per-file breakdown and what to compare against.

### VMesh (`src/vmesh/`)

Reads/writes VMesh geometry: `readVMeshPart`/`writeVMeshPart` for individual mesh parts, `readVMeshWire`/`writeVMeshWire` for the `VMeshWire` line-list overlay, and `readVMeshLibrary`/`writeVMeshLibrary` for the full mesh library. See `src/vmesh/data.ts` for binary layout details.

### Compound (`src/compound/`)

The `Cmpnd` hierarchy, **shared byte-for-byte by rigid `.cmp` models and deformable `.dfm` characters**. It is its own module rather than part of either because both consume it: `rigid/` supplies mesh parts as the fragment payload, `deformable/` supplies bones. Nothing here knows what a fragment contains.
- **`model.ts`** — generic `Model<T>` compound node (extends `Tree<Model<T>>`); `readModel`/`writeModel` take a fragment reader/writer callback. Hierarchy is reconstructed from the `Cons` constraint list, not from directory nesting. `arrangeByConstraints` is the part `deformable/` uses on its own.
- **`joint.ts`** / **`constraint.ts`** — parent↔child joints (`fixed`, `revolute`, `prismatic`, `cylinder`, `sphere`, `loose`) stored as fixed-size records in `Cons/Fix`, `Cons/Rev`, etc.
- **`hardpoint.ts`** — named attachment points under `Hardpoints/Fixed` and `Hardpoints/Revolute`. Carried by rigid parts and by `.dfm` bones alike.

See [COMPOUND.md](docs/COMPOUND.md).

### Rigid (`src/rigid/`)

Rigid models (`.3db` single part, `.cmp` compound, `.sph` sphere), layered on `compound/` for the hierarchy and VMesh for geometry:
- **`rigid.ts`** — `readRigidModel`/`writeRigidModel` dispatch between compound and single-part forms; a part is `Rigid` (hardpoints + `MultiLevel`/`VMeshPart`), `Camera` or `Sphere`.
- **`camera.ts`** — cockpit view frustum, detected via the `Camera` subdirectory. `Fovx`/`Fovy` are half-angles in radians.
- **`sphere.ts`** — `.sph` planets and suns: one material name per cube face, a radius, no geometry.
- **`materialanim.ts`** — `MaterialAnim`, a root-level sibling of `Cmpnd` animating material UV transforms. Read from the file root like `readVMeshLibrary`, not part of `RigidModel`. Lives here rather than in `compound/` because no `.dfm` carries one. `MAKeys` is stored rather than derived from `MADeltas`; see [RIGID.md](docs/RIGID.md) for the counterexamples.

### Animation (`src/animation/`)

Keyframe animation "scripts". Rigid compound models embed the `Animation` directory in the `.cmp` next to `Cmpnd`; deformable models keep it in a standalone `.anm`. Both use the same structures, so this module is a sibling of `rigid/` rather than part of it — `readAnimationLibrary(root)` takes a file root directory, like `readVMeshLibrary` does.

- **`channel.ts`** — `Header` (count, interval, type) + `Frames` (packed keyframes). `ChannelType` is a byte-wide bitfield; `keyframeByteLength` derives the stride from it. A negative interval means each keyframe carries its own timestamp.
- **`map.ts`** — `ObjectMap` (root object, `Parent name` only) and `JointMap` (`Parent name` + `Child name`, drives the joint between them).
- **`script.ts`** / **`library.ts`** — `Animation/Script/<name>` tree, plus `Root height` for deformable models.

Quaternions come in four flavours: full `float32` W-X-Y-Z (`0x04`), implied identity (`0x20`), and two `int16` quantizations (`0x40` restores W from unit length, `0x80` stores the axis scaled by angle/π). **The quantized decode follows [Librelancer](https://github.com/Librelancer/Librelancer/tree/main/src/LibreLancer/Utf/Anm), not MAXLancer, which assigns the half-angle function to the wrong flag.** [ANIMATION.md](docs/ANIMATION.md) documents the layout, the type combinations that occur in retail data, and the 55 keyframes that cannot round-trip exactly because their source data is out of encoding range.

### Surface (`src/surface/`)

`.sur` collision files — a standalone chunked binary, **not** a UTF tree. `readSurfaceLibrary`/`writeSurfaceLibrary` operate on `BufferView` and produce a flat `Part[]`, each part keyed by the CRC of a model part name. A part holds an `Extent` (bounding box), hardpoint IDs, and a `Surface` block whose bounding volume hierarchy (`Node`) has convex `Hull` leaves made of `Face`s indexing shared `Point`s. Chunks are identified by FourCC tags (`!fxd`, `exts`, `surf`, `hpid`).

The `surf` chunk is a verbatim memory image of **`IVP_Compact_Surface`** from Ipion Virtual Physics (later Havok); Freelancer only supplies the FourCC container around it. When touching this module, check the layout against [ChimpsAtSea/Ipion-Virtual-Physics](https://github.com/ChimpsAtSea/Ipion-Virtual-Physics) — `ivp_compact_surface.hxx`, `ivp_compact_ledge.hxx`, `ivp_surbuild_ledge_soup.cxx`. [SURFACE.md](docs/SURFACE.md) maps every field to its IVP name and explains the magic constants (`0xfa` is 250, from IVP's two `1.0f / 250.0f` quantization steps).

### Texture (`src/texture/`)

`Texture library` directories, found in `.txm` and `.mat` files and embedded in `.3db`/`.cmp`/`.dfm`/`.sph`. `readTextures(root)` takes a file root like `readVMeshLibrary` does. An entry holds one of four forms: a whole DirectDrawSurface in `MIPS`, a chain of uncompressed Targas in `MIP0..n`, an animation over sibling atlas entries (`Frame rects`), or a `CUBE` cubemap. Reading and writing are complete for the first three; `CUBE` is unimplemented in both directions, since `Texture` has nowhere to put six faces.

`Texture.storage` (`dds` or `targa`) says which image form an entry uses, because the pixel format does not: retail authored `rgb24_888` as 1,787 Targa chains and two surfaces. `writeTexture` follows it rather than guessing, and refuses what a form cannot express — a block-compressed texture as a Targa chain, a bottom-up bitmap as a DirectDrawSurface.

What round-trips, all pinned by `corpus.test.ts`:

- **Every one of the 4,447 DirectDrawSurfaces, byte for byte.** The 128-byte header is derived, not carried — retail varies only dimensions, mip count, pixel format and the mipmap caps bit. Two quirks are reproduced deliberately: `DDSD_CAPS` stays clear even though `dwCaps` is populated, and `DDSD_MIPMAPCOUNT` is set on the single-level surface too.
- **All twelve animated textures**, now that `Texture count` is written. It stays derived (highest frame index plus one, which holds across the corpus) rather than modelled, so `AnimatedTexture` has no field that can disagree with its own frames.
- **629 of the 2,400 Targa chains.** The rest cannot: 1,668 are colour-mapped and the palette is not carried, 102 are 16-bit and the expansion to 24 does not invert, and one declares attribute bits. Those come back larger with the same pixels. What holds everywhere is that **writing is a fixed point** — what is written reads back identical and writes again to the same bytes. See [TEXTURE.md](docs/TEXTURE.md).

Two decisions worth not re-litigating, both measured against retail and pinned by `corpus.test.ts`:

- **No `dxt1a` texture type.** DXT1's punch-through mode is per block, selected by the endpoint ordering inside the block, and nothing in the container records it — not one retail DXT1 texture sets `DDPF_ALPHAPIXELS`. `COMPRESSED_RGBA_S3TC_DXT1_EXT` decodes both modes correctly, so the distinction buys nothing.
- **No `alpha` flag on `Texture`.** Blending is decided by the material that binds the texture, through the `Oc`/`Ot` tokens in its `Type` string, never by the texture itself.

`Texture.flip` reports the vertical origin rather than reordering rows — DDS is always top-down, Targa is bottom-up unless descriptor bit 5 is set (nine retail textures). Whether Freelancer honours that bit is still unresolved; see [TEXTURE.md](docs/TEXTURE.md), which also records the openFLAME paletted form as deliberately out of scope.

### Material (`src/material/`)

`Material library` directories, siblings of `Texture library`, found in `.mat` files and embedded in `.3db`/`.cmp`/`.dfm`/`.sph`. `readMaterials(root)` takes a file root like `readTextures` does. A material is a directory of property files: a `Type` string naming the shader, `float[3]` colours, `float` scalars, and texture slots stored as a `<slot>_name` / `<slot>_flags` pair.

**All 7,525 retail materials write back byte for byte, and writing is a fixed point**, both pinned by `corpus.test.ts`. Three decisions worth not re-litigating:

- **The type does not determine the property set, so every property is independently optional.** `DcDtOcOt` occurs in six different property sets, four of which have no `Oc`; 245 `DcDt` materials carry a colour and no texture. A property that was absent stays absent rather than being defaulted, and `readMaterial` omits the key entirely rather than setting it to `undefined`.
- **`TileRate` is not bound to `Dm`.** The 25 `DetailMap2Dm1Msk2PassMaterial` materials pair a plain `TileRate` with `Dm1`, so the rates are carried flat rather than folded into the slots they scale.
- **`Material count` is derived, not carried** — it equals the directory count in all 1,428 libraries that have one. `SOLAR/SUNS/sun.sph` is the only library shipped without it and gains one.

File order inside a material is the one thing not reproduced: the writer emits the authored order (`Type` first, each slot name beside its flags), matching 6,569 materials; the other 956 are stored in case-insensitive name order by a second tool. The split falls along asset boundaries — 100 files sorted, 1,329 authored, none mixed.

**A `*_flags` word is three settings, not a flat bitfield.** The engine's property tables (`shading.dll`, and `flmaterials.dll` for `nt_flags`) name one triple per slot — `<Slot> Wrap Mode`, `<Slot> U Address Mode`, `<Slot> V Address Mode` — all sharing the single flags file. The low four bits are the two address modes (mirror/clamp per axis, and no retail material sets either mirror bit); bits 4 and 6 are the wrap mode, taking the value 4 or 5 and nothing else. `TextureFlags` keeps `Unknown0`/`Unknown1` for those two because the DLL proves a wrap mode shares the word without saying where the field ends — the 2+2+n partition is inference. Bit 4 appears only on `Bt` and `Et`, fitting a second UV set.

**Defaults are real and live in the DLLs, not the data.** Property tables run `<label>, <file name>[, <default>]`, and across `flmaterials.dll`, `shading.dll` and `deformable2.dll` exactly one property carries the third string: `nt_name` → `NomadRGB1_NomadAlpha1`, exported as `defaultNomadTextureName`. It resolves to the sole entry of that name in `SHIPS/NOMAD/nomad_fx.txm`, and **no material names it** — the default is the whole mechanism. `readMaterial` deliberately does not apply defaults; doing so would write files that were never there and end the byte-exact round trip. Numeric defaults would be float immediates and are not findable by string scanning.

`Sc`, `Sp` and the nomad slot are modelled from the documented property list but never authored. `EXE/dacom.ini` is **plain text, not BINI** — its `[MaterialMap]` section is directly readable, evaluated in reverse of the listed order, and also rewrites type-to-type (`DcDtEcEt`→`DcDtEt`, `EcEtOcOt`→`DcDtOcOt`), which is why `EcEt` appears in circulated type lists and in no asset. See [MATERIAL.md](docs/MATERIAL.md).

### Deformable (`src/deformable/`)

`.dfm` character models — one skinned mesh per detail level under `MultiLevel`, plus a tree of bones that poses it. `readDeformableModel(root)` takes a file root like `readTextures` does. Retail ships 204: 104 heads, 88 bodies, 12 hands, assembled into a character at load time through the hardpoints of the bones they share.

**The compound layer is byte-for-byte the rigid one** — the same `Object name`/`File name`/`Index` triples, the same `Cons` records read by `readConstraints` — so `compound/` is reused wholesale and `getBoneModel` hands back the same `Model<T>` tree a `.cmp` reads into. Only `Sphere` and `Loose` joints occur across the 9096 records.

**All 204 write back byte for byte, and writing is a fixed point**, both pinned by `corpus.test.ts`. Node order is uniform across the corpus down to the file order inside a `Geometry` directory, and the writer reproduces it. Three decisions worth not re-litigating:

- **Bones are an ordered table, not just a tree.** `Index` equals the bone's `.3db` directory position in all 204 files and all 9456 bones, and that position is what `Bone_id_chain` skins to — so it is derived on write, and a read whose two disagree throws. **156 bone directories have no `Cmpnd` part at all**: every one a single fixed hardpoint named `Neck`, `UpperTorso`, `LCollarBone`, `RCollarBone`, `L Wrist` or `R Wrist`, filling exactly the gaps the part numbering leaves. They belong to the host skeleton, are still skinned to, and are carried as bones with no `name`.
- **`Lod Bits` is a permission, not a usage mask.** All bits or none — 2237 bones with every bit set appear in no `Bone_id_chain`.
- **`Fractions` folds into the level, `Face_groups/Count` and `UV_vertex_count` are derived.** All three agree with what they count in every retail file.

The one thing that cannot be reproduced belongs to `compound/`, not here: **every retail constraint record leaves stack residue past the terminator of its two 64-byte name fields** — all 9096 here and all 5316 across the rigid models. `writeConstraints` zero-fills, and now writes the retail capitalization (`Fix`, `Rev`, `Pris`, `Sphere`, `Loose`, `Cyl`) rather than lowercase. The eleven `UV_*` files on `Mesh0` of 104 heads drive eye and mouth patches across a sprite sheet from a bone that moves but is never drawn. See [DEFORMABLE.md](docs/DEFORMABLE.md).

### openFLAME leftovers

Five retail files carry trees from **openFLAME**, the engine behind Digital Anvil's earlier *Conquest: Frontier Wars*. They share the UTF container with Freelancer and nothing else: the game cannot load them, no `.ini` names them, and no module here interprets their content. They are listed so a sweep of retail data recognizes them instead of mistaking them for an unread Freelancer structure — **find them, skip them, do not implement them.**

| File | Root nodes | Content |
|---|---|---|
| `EQUIPMENT/MODELS/HARDWARE/no_cargo_extender.3db` | `openFLAME 3D N-mesh`, `Rigid body` | Pre-VMesh geometry, plus a nested `Material library` and `Texture library` |
| `EQUIPMENT/MODELS/HARDWARE/no_invulnerability.3db` | same | same |
| `EQUIPMENT/MODELS/HARDWARE/no_key.3db` | same | same |
| `EQUIPMENT/MODELS/HARDWARE/no_power_boost.3db` | same | same |
| `SOLAR/BLACKHOLE/bh_flute4.pte` | `Particle Event`, `Rigid body` | `particle1.Def`, an `Animation library`, a paletted `Texture library`, `Scale`, `PointExtent` |

The four `.3db` files are openFLAME end to end — their root holds `Exporter Version` and the two trees, and no Freelancer geometry at all. `bh_flute4.pte` is the only `.pte` in the data.

**The vocabulary is the marker, not the extension.** openFLAME geometry is `Vertices` / `Edges` / `Normals` / `Face groups` (a space, where Freelancer writes `Face_groups`) over `Object vertex list`, `Face vertex chain` and `Face D-coefficient`; its materials key on `Material identifier` and nest `Ambient` / `Diffuse` / `Specular` / `Transparency` directories with a `Map` subdirectory, where a Freelancer material holds only flat property files; its textures are `Palette 8 bit` with `Image indices` and `Palette RGB 888`. `Rigid body` wraps `Mass properties` and either an `Extent tree` or, in the `.pte`, an `Extent data` / `Bounding volume` pair. None of these names occurs in a Freelancer-authored asset.

**Every reader already yields nothing on all five, without throwing, and that behaviour is deliberate.** `readVMeshLibrary` reads an openFLAME root as an empty library; `readTextures` and `readMaterials` come back empty because both libraries are nested inside the openFLAME tree rather than sitting at the file root where those readers look. Reaching an entry directly is covered too — `readTexture` returns `undefined` on a paletted entry rather than guessing. See [TEXTURE.md](docs/TEXTURE.md) for the paletted layout, [MATERIAL.md](docs/MATERIAL.md) for the nested library, and [COMPOUND.md](docs/COMPOUND.md) for the shared joint lineage, which is the one place the two engines genuinely overlap.

The two paletted texture forms nest oppositely, so neither reader can assume the other: the `.3db` files put `MIP0..n` **under** `Palette 8 bit`, while the `.pte` puts a `Palette 8 bit` under **each** `MIP0..n` and adds `U wrap mode` / `V wrap mode`.

**`FX/MISC/tlrtube.3db` is not one of these**, though it was grouped with them for a long time. Its root `Mesh` tree uses Freelancer's own deformable vocabulary — `Face_groups/Group0/{Material_name, Face_indices, Edge_indices, Edge_angles}` over `Geometry/{Point_indices, Points, Vertex_normals, UV0_indices, UV0}` — with no bone files, since nothing skins it, and `Face_indices` in place of `Tristrip_indices`, a form `readFaceGroup` already supports. Its `Material library` and `Texture library` are ordinary ones (`Dt_name`, a `MIP0..6` chain), it carries no openFLAME marker at all, and `EXE/dacom.ini` has a hand-written `[MaterialMap]` rule for its sole material (`name = ^tlr_energy$ = NebulaTwo`; `tlr_energy` occurs nowhere else in the retail install).

What it *is* residue of is **`FxMeshAppearance`, an unfinished feature**. `FX/MISC/gf_tlr_tube.ale` holds one naming this model by `MeshApp_MeshName = TLRtube`, registered as a `[VisEffect]` in `FX/MISC/misc_ale.ini`. The node type never worked — Freelancer crashes when a particle spawns for that appearance, and no way to make it work has been found — and the chain is broken independently of that, since no `[Effect]` entry names the `gf_TLR_tube` `[VisEffect]`. Only one other retail `.ale` uses the type (`intro_volcanoplanet.ale`, whose `beryl_asteroid*` values are `[Asteroid]` nicknames from `SOLAR/asteroidarch.ini`, so the property takes an INI nickname rather than a mesh name). Its animated UV set — `UV0_anim`, `UV0_anim_lookup`, `UV0_frame_count`, `UV0_fps`, `UV0_interpolate` — appears in no other asset. **Do not model it**: not because another engine authored it, but because there is no working in-game behaviour to validate a reader against. See [RIGID.md](docs/RIGID.md).

## Code style

- Prettier: single quotes, no semicolons, 100-char print width.
- `verbatimModuleSyntax` is enabled — use `import type` for type-only imports.
- All imports use `.js` extensions (NodeNext module resolution, even for `.ts` sources).
- `noUncheckedIndexedAccess` is enabled — array indexing returns `T | undefined`.
- Internal package imports use the `#/*` alias (maps to `./src/*` in development, `./dist/*` at runtime).
