# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this
repository.

**An isomorphic infrastructure library providing a clean API and types representing Freelancer's
data (Digital Anvil, 2003), for applications to be built on top of.** Not a converter — the product
is the type surface and the knowledge in `docs/`, what the bytes mean, not any particular output
format. Published as an ES module package with many subpath exports.

It covers the binary **UTF** containers the assets ship in, **INI** (plain text and the compiled
**BINI**), the **THN** Lua 3.2 scene scripts, and the **resource DLLs** every `ids_name` and
`ids_info` resolves into. This repository is the merge of the former `utf2json` and `ini2json`;
[PLAN.md](docs/PLAN.md) carries the goal, the invariants and the reasoning, and both histories are
in the log.

**Status.** Everything listed under _Modules_ below reads and writes. **This is the format layer,
and it stops there.** For INI that means both encodings and the interim document, pinned by the
corpus — and nothing above them: no entry point of this package interprets what a section *means*,
and none will. `[Solar]`, `[Ship]`, `[Nebula]` are section names to this library and nothing more.
Nothing here walks `freelancer.ini` or follows the game's load order either. The cross-reference
layer — archetype → model, material → texture library — is deferred.

Every count in `docs/` was measured from the retail install rather than recalled, and the corpus
suites assert those numbers back, so a figure that stops matching means a reader drifted rather than
that the figure needs updating. Do not treat a number in these documents as decoration — each one
pins a design decision, and they are listed with their evidence in [RETAIL.md](docs/RETAIL.md).

## Commands

```sh
npm run build   # compile TypeScript → dist/ via tsdown
npm test        # Node.js built-in test runner over src/**/*.test.ts (uses tsx, no build step)

node --import tsx --test src/utf/directory.test.ts   # a single test file
```

- `corpus.test.ts` suites validate readers against retail game assets and skip themselves with a
  reason when none are installed. See [RETAIL.md](docs/RETAIL.md). **The rest of the suite must
  never depend on retail data being present.**

## Three layers

Every format is read in the same three steps, and each step is usable on its own.

| Layer | Form | Rule |
|---|---|---|
| Binary | `BufferView` over bytes | No choices made. |
| Interim | **Classes and plain records** — identity and mutation are the point | Methods are *structural*, never semantic. |
| Meaning | **Plain data** — interfaces, no methods, no identity | Interprets choices the game already made. |

```
   UTF bytes  ──▶  Directory / File          ◀──▶  rigid, vmesh, texture, material, …

   INI text  ─┐
              ├─▶  Section / Property / Value ◀──▶  (not modelled — see Scope)
   BINI bytes ─┘

   bytecode  ─┐
              ├─▶  Value / Global             ◀──▶  entities and events (./thn/scene)
   Lua text  ─┘

   DLL image ───▶  Resource[]                 ◀──▶  names and infocards, by global id
```

- Interim objects are **public** — an editor builds a tree by hand and writes it out.
  `Directory`/`File` are the model.
- A method belongs to the interim layer only if it does not need to know what the game *does* with
  the bytes. `Directory.getFile()` yes; `MaterialLibrary.resolveTexture()` no.
- The encoding layer owns byte-exactness; the typed layer owns meaning and is only a fixed point. A
  tool that must not perturb bytes edits the interim document.
- Third-layer types are **plain data, not JSON-safe**. JSON-safety falls out per module where it is
  free (all of `ini`, `thn`, most of `material`, `compound`, `animation`) and is stated in that
  module's document; `texture` and `vmesh` carry typed arrays and do not contort to meet it.
- **The resource module's typed layer is the odd one: a fixed point _and_ byte-exact.** Nothing is
  coerced on the way through, so there is nothing for the round trip to lose.

## Invariants

1. **No filesystem, no fetching.** The library resolves *references* — this hash, into this
   structure you handed me. The consumer supplies the loader, and finding the file, applying the
   load order and caching the result are all theirs. This is what keeps it isomorphic;
   `platform: 'neutral'` in `tsdown.config.ts` is what keeps it true rather than aspirational.
   **Every reader is synchronous** and is handed bytes that have already arrived.
2. **Dependency direction.** Format modules never import each other's meaning layer or the
   cross-reference layer; the cross-reference layer imports downward only.
3. **Lossless read-modify-write.** Anything the library does not model survives a round trip
   untouched. "The reader is correct" and "an editor won't damage a mod" are different guarantees.
4. **Absence is a missing key**, never `null`. [MATERIAL.md](docs/MATERIAL.md)'s absent-stays-absent
   invariant depends on it and types will not catch a violation.
5. **Helpers are opt-in.** Math, evaluation and conversion never force themselves into the type
   design. `Vector3` is an interface plus a companion const of free functions — plain data that
   still gets `Vector3.lerp`. That pattern is the rule for anything added later.
6. **Scope.** *The library models what the game's data means. It never decides what an application
   should do with it.* If a behaviour can be falsified against retail assets or by observation in
   game, it belongs here. If it needs a policy — resolution order, default, budget, cache, output
   convention — it belongs to the consumer. This is what keeps [RENDERER.md](docs/RENDERER.md) a
   document instead of a `renderer/` module. **The line is drawn below meaning-of-a-section, not
   just below policy**: what a `[Ship]`'s fields do, which files an install loads and in what order,
   how an archetype becomes a rendered object — all of that is the consumer's, and this library
   exists so it can be written against types instead of against bytes.

## Package entry points

| Export path | Source | Description |
|---|---|---|
| `.` (default) | `src/index.ts` | Hashing: `getResourceId`, `getObjectId`, and the lookups built on them |
| `./utf` | `src/utf/index.ts` | The UTF container: `Directory`, `File` |
| `./utility` | `src/utility/index.ts` | `BufferView`, windows-1252, `Tree`, timestamp, number and name helpers |
| `./math` | `src/math/index.ts` | `Vector3`, `Vector4`, `Quat`, `Matrix3`, `Matrix4`, `Transform`, scalar math |
| `./alchemy` | `src/alchemy/index.ts` | Alchemy particle effects (node library + effect library) |
| `./vmesh` | `src/vmesh/index.ts` | VMesh geometry part/library serialization |
| `./compound` | `src/compound/index.ts` | The `Cmpnd` hierarchy: parts, constraints, joints, hardpoints |
| `./rigid` | `src/rigid/index.ts` | Rigid `.3db`/`.cmp`/`.sph` models: parts, cameras, spheres, material animation |
| `./animation` | `src/animation/index.ts` | Keyframe animation scripts shared by `.cmp` and `.anm` |
| `./surface` | `src/surface/index.ts` | `.sur` collision surfaces: parts, hulls, bounding volume hierarchy, and `createPart` to build one |
| `./texture` | `src/texture/index.ts` | `Texture library` entries: DDS surfaces, Targa mip chains, animations, cubemaps |
| `./material` | `src/material/index.ts` | `Material library` entries: shader type, colours, texture slots |
| `./deformable` | `src/deformable/index.ts` | `.dfm` character models: bone table, skinned meshes, detail levels |
| `./ini` | `src/ini/index.ts` | The interim model, value coercion, document lookups, `read`/`write` by signature |
| `./ini/text` | `src/ini/text/index.ts` | Text INI parser and serializer |
| `./ini/binary` | `src/ini/binary/index.ts` | BINI reader and writer |
| `./thn` | `src/thn/index.ts` | The scene script model, value helpers, `read`/`write` by signature |
| `./thn/text` | `src/thn/text/index.ts` | Lua source parser and serializer — the whole write path |
| `./thn/bytecode` | `src/thn/bytecode/index.ts` | Compiled Lua 3.2 reader, and the opcode table. **No writer** |
| `./thn/scene` | `src/thn/scene/index.ts` | The typed layer: entities and events as records, and THORN's vocabulary |
| `./resource` | `src/resource/index.ts` | Resource DLLs: the PE container, `RT_STRING` tables, `RT_HTML` infocards, the `ids_*` id space |

`./thn/scene` is deliberately *not* re-exported from `./thn`, so a consumer that wants the interim
model does not pull the vocabulary in with it. **The list above is the whole surface** — there is no
pending entry point, and a new one is a new format, not a new subject.

## Structure

**Flat, one directory per subsystem.** `utf/rigid` would reinstate the container seam this library
does not have: `surface` is not UTF, `thn` is not INI, `resource` is neither. Nest when the child is
a variant or a layer of the parent (`ini/{text,binary}`, `thn/{text,bytecode,scene}`); keep flat
when the child merely depends on the parent (`rigid` consumes `utf` the same way it consumes `vmesh`).

### The `.` export

> **`.` holds identity and naming — how things are named, and how a name resolves to a reference.
> Nothing at `.` reads or interprets a format.**

That is hashing, and only hashing. **`src/hash.ts`** holds `getResourceId` (CRC32, from the
`dacom.dll` table) for material/mesh names and most UTF references, and `getObjectId` (byte-swapped
CRC32, `id32`) for INI nicknames and the `DATA/AUDIO` voice files, plus
`getResource`/`getObject`/`filterResources`/`filterObjects`/`setResource`/`setObject`. `crc32.ts`
and `id32.ts` are internal.

It is **domain knowledge, not utility** — the table comes from `dacom.dll`, the byte-swap is the
game's convention, case-folding is the game's behaviour — which is why it does not live in
`utility/`. Three silently-confusable facts sit adjacent here on purpose: `getResourceId`,
`getObjectId`, and Alchemy's case-sensitive variant. Picking wrong yields a number, just the wrong
one. Strings hash as **windows-1252**, which is what the game hashed.

When the cross-reference layer lands it takes its own subpath, because resolving an archetype to a
model interprets formats.

## Core (`src/utf/`)

- **`Directory`** — directory node holding `children: (Directory | File)[]`; `getDirectory`,
  `setDirectory`, `getFile`, `setFile`, `delete`, `append`. Static `read`/`write` do full binary
  serialization — `read` parses via a BFS queue.
- **`File`** — leaf node implementing `ArrayBufferView`. Typed iterators `readIntegers`/`writeIntegers`
  (32-bit, falling back to 16/8-bit for trailing bytes), `readFloats`/`writeFloats`,
  `readStrings`/`writeStrings` (NUL-separated). Write methods chain.
- **A UTF file is a fixed header plus three regions**: tree block (44-byte entries linked by
  sibling/child offsets), dictionary block (deduplicated NUL-terminated names), data block (payloads).
  See [UTF.md](docs/UTF.md).

## Utility (`src/utility/`)

- **`BufferView`** — stateful `DataView` subclass with an internal `#offset`; `allocate`, `concat`,
  `join`, `from`, `bytes`, `findTerminator`. Little-endian by default, and the `littleEndian`
  constructor parameter is what lets THN read big-endian without a second implementation. Every
  binary reader and writer operates on one.
- **`encoding.ts`** — windows-1252 both ways. Needed for `initialworld.ini`'s U+00A0 padding, and
  it is the encoding hashing uses.
- **`Dictionary`** — accumulates entry names for the UTF names block during serialization.
- **`number.ts`** — C `atoi`/`atof`, shortest-round-trip float32 formatting, and the text token
  classifier the INI compiler's behaviour is reproduced from.
- **`string.ts`** — `fold`/`equals` (ASCII-only, which is what `stricmp` does), `trim` (including
  U+00A0), `toHex`, `isHex`, `parseHex`.
- **`tree.ts`** — generic `Tree<T>` helpers: `listTreeElements`, `listTreePairs`, `findTreeElement`,
  `reduceTree`. **`timestamp.ts`** — `Date` ↔ DOS timestamps / Windows 64-bit FILETIMEs.
  **`hierarchy.ts`** — generic `assemble`/`flatten`. **`chunkview.ts`** — chunked-binary cursor,
  used by `surface/`.

## Modules

Each has a document in `docs/` carrying its binary layout, the retail measurements behind it, and
the decisions not worth re-litigating. **Read the module's document before changing its reader or
writer** — most design choices there are pinned by corpus tests against counterexamples, and
re-deriving one from first principles will usually get it wrong in the same way the circulated
format tables do.

### Assets

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
  It is the one module with a **construction layer**: `createPart` builds a part from convex hulls,
  deriving everything the format records but does not let a writer omit — half-edge adjacency
  (all 177,824 retail faces), the bounding spheres and their quantized boxes (all 9,111 leaves),
  and the mass properties (all 1,365 parts). Every rule is IVP's builder, ported and measured back;
  `pierce` and `rotationInertia` are the two that retail does not fully reproduce, and both say why.
  **`rotationInertia` is read** — debris tumbles by it — so it is derived rather than defaulted, and
  retail's residual disagreement is decimation, not a wrong algorithm.
  **Convexity, decimation and convex decomposition stay the consumer's** — they are budgets, not facts.
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

### Data

- **[INI.md](docs/INI.md)** (`src/ini/`) — both encodings and the document model they share.
  `types.ts` is plain data, so a document read from BINI, parsed from text or written by hand is the
  same thing and either writer accepts any of them. **`Value` is a discriminated union carrying the
  type the file recorded** — not derivable, since 14,209 retail values are float-typed with an
  integral value, and dropping the tag costs byte-exactness. **The coercions in `value.ts` follow
  `INI_Reader`, not JavaScript**: `toBoolean` on a string takes only `true`/`false` by name so `yes`
  is false; `toInteger` truncates toward zero; an unparseable string is `0`, never a throw.
  **Booleans occur zero times in 876,034 retail values** — a boolean is the string `true`, a bare
  property is a value left out and reads as true, and the writer must never emit a type-`0x0` value. In `binary/`, **the dictionary is one table for
  names and values**, filled names-first in two passes; that rule is what makes the round trip
  byte-exact, and splitting it produces a working, different file.
- **[THN.md](docs/THN.md)** (`src/thn/`) — `.thn` is **not INI**: all 1,506 retail files are compiled
  Lua 3.2, read by THORN (`EXE/thorn.dll`). **A THN is a serialization format, not a program** —
  fifteen opcodes across the corpus, all value-pushing or table-building, no function prototype
  anywhere. **`Value` has four arms and no boolean one**: number, string, identifier, table. The
  identifier arm is the whole reason the model exists — `type = SCENE` is a global *read*, and
  quoting it hands the engine a string where it wants a number; `Y`/`N` are identifiers like any
  other, and the missing boolean arm makes folding them a compile error. **A number carries its
  literal, not a parsed value.** `bytecode/` is big-endian, the one thing every other binary format
  here is not, and is written for both directions even though there is no writer. `text/` is a Lua
  **literal** parser, not a Lua parser. `scene/` is the typed layer and **folds the two export
  forms**; every number in its `data.ts` is measured from the corpus, and a name with no measured
  value is exported without one and is an error to read.
- **[RESOURCE.md](docs/RESOURCE.md)** (`src/resource/`) — the seven DLLs `ids_name` and `ids_info`
  resolve into, in `EXE` and **not** in `DLLS`. **The three-level PE directory is flattened
  deliberately** and both required orderings are re-derived on write, which is what lets an unordered
  list reproduce retail's `.rsrc` byte for byte. `write` **mints a resource-only image** rather than
  patching one — no code, no imports, entry point zero, which is how six of the seven libraries
  already ship. Three rules a naive writer misses: directory entries are **sorted** (`FindResource`
  binary-searches, so an unsorted directory fails for *some* ids), payloads are DWORD-aligned, and
  `IMAGE_RESOURCE_DATA_ENTRY.OffsetToData` is an image RVA while every other offset is
  directory-relative. **A string resource is not a string**: the table is blocked sixteen to an
  entry, and a hole must be written as a zero-length run. `writeLibrary` is the editing counterpart
  of `readLibrary` and its whole content is one rule — **carry through exactly what the readers did
  not consume**, which is more than "not a string or a card": a named entry id, another language,
  and a block that is all holes are each skipped by the readers and each vanish from a rewrite that
  restates the rule instead of complementing it.

## Documents that are not per-module

- **[RETAIL.md](docs/RETAIL.md)** — the retail install as it bears on the format layer: where the
  corpus lives, what is in it, what each format module round-trips, the measurement table with what
  each number pins, the quirks index, and the five **openFLAME** files (leftovers from Digital
  Anvil's *Conquest: Frontier Wars*) that share only the container. **Find them, skip them, do not
  implement them** — every reader already yields nothing on them without throwing, deliberately. It
  indexes every open question across the format modules.
- **[THORN.md](docs/THORN.md)** — the scene vocabulary the typed THN layer is built from. **Every row
  carries a provenance mark** — `thorn.dll`'s string table, `thorn.dll`'s **global-registration
  routine**, the corpus, or the author's scripting guide — because they disagree and the
  disagreements are the content. The first two are the same file and not the same claim: the string
  table proves a name was compiled in, the routine proves what the global holds, and **a name can be
  registered twice** (`HARDPOINT` is set to 8 and then to 1, so scripts see 1). **All 73 registered
  globals are read off that routine and agree with every one of the 25 corpus measurements** —
  the name arrays are not in value order, so nothing here may be derived from position.
- **[RDL.md](docs/RDL.md)** — the markup every `ids_info` resolves to, which has **no module and
  will not get one**: `readCard` hands the text back and the round trip is exact precisely because
  nothing interprets it, and any renderer for it is DOM-bound. It is here because the meaning is
  still ours to record. **It is XML that is not a tree** — a flat sequence of state changes, so
  there are no closing tags to pair. Two rules read backwards on first inspection and the corpus
  catches both: `JUST` sets alignment *before* the paragraph it aligns (all 1,756 retail occurrences,
  so a reader that applies it to an open paragraph drops every one), and `TRA` **merges** — bits
  outside `mask` keep their current value, which matters because retail's masks are as small as `1`
  and never `0xFFFFFFFF`. The font index is not RDL's: it indexes `DATA/FONTS/rich_fonts.ini`.
- **[ENGINE.md](docs/ENGINE.md)** — the INI vocabularies the executables hardcode, which have **no
  module and will not get one**: what `[Solar] type`, `hp_type`, `[Zone] shape` and the rest actually
  accept. It is the counterpart to [THORN.md](docs/THORN.md) for INI, and it exists for the same
  reason [RDL.md](docs/RDL.md) does — the meaning is measurable and the library deliberately does not
  model it. **`EXE/common.dll` keeps `{ const char *name; int value }` tables and `DLLS/BIN/content.dll`
  does not**, so the first half carries numbers and the second half carries names only; a name list
  from `content.dll` is not evidence of a value. Two rules a reader gets wrong by reading position:
  the tables are in **declaration order, not value order** (`ASTEROID` is the fifth entry and holds
  bit 29), and five unrelated enums sit **contiguous and numerically overlapping** in one run, so
  `weapon` and `TRADELANE_RING` are both `0x80` and nothing resolves across them. It also carries the
  **property-name** vocabulary, recovered two ways whose disagreement is the content: string lookup
  is an upper bound, disassembling `INI_Reader::is_value` call sites is a lower bound with
  attribution, and **105 of the 1,375 keys retail sets are matched by nothing** — `faction_weight`
  ×5,611 among them. **The retail `Freelancer.exe` is SecuROM-wrapped** (`.text` entropy 7.98, zero
  standard prologues) so only its `.rdata` is readable; call-site figures come from an unprotected
  build of the same executable.
- **[SECTIONS.md](docs/SECTIONS.md)** — the enumeration [ENGINE.md](docs/ENGINE.md) points at: **283
  sections, the 2,222 section/property pairs retail shows plus 522 recovered from the binaries** —
  properties the engine reads in a section that no retail file sets there, which is the only way
  `dispersion_angle` on `[Gun]` gets into a table at all. Three placement rules with their measured
  worth: within-function address order (**94%**), exported block-reader names (**88%**), and the
  archetype class chain, which is **exact** — `common.dll` has no RTTI but a virtual override calls
  its base, so the call graph yields `Gun → Launcher → AttachedEquipment → Equipment → Root` outright,
  and the document lists what each of the 28 classes contributes (154 readings; `hit_pts` is the only
  key read twice in one chain, by `Root` and again by `Equipment`) and **which class each header
  instantiates**, from the constructor the `Load*` dispatcher calls — `[Ship]` direct, `[Solar]` via
  its `EqObj` base; that agrees with the data-fitted class in 30 of 34 and corrects two.
  **Function boundaries come from call targets, not exports** — every address a direct `call` targets
  is a function start, which lifts `content.dll` from 31% to 94%. **26 of the 35 matched-but-absent sections have no
  properties by construction**: ten are **obsolete** (the header is matched only to emit
  `*** WARNING: [Cloud] is obsolete` and skip), and fifteen are read *positionally* via the indexed
  `get_value_*` accessors, so `[MsnShipSave]` accepts a sequence rather than named keys. The
  consequence to keep in mind: **an unmarked property's read status is a fact about the name, not the
  name in that section** — struck is the strong claim, plain is the weak one. It also carries
  **declared value shapes for 542 names**, read off the accessor the engine calls after matching the
  key (`push 2; call get_value_float` is "index 2 as a float"), with `is_value_empty` probes marking
  optional positions — which is how `[Zone] size` takes one value for a sphere and three for a box.
  **Declared is what the engine coerces to, recorded is what the file holds**, and they differ freely;
  of 495 positions 315 match exactly, 176 are compatible under coercion, 4 are neither. **A shape is
  per name and a name is occasionally per section** — 11 of the 542 genuinely differ between call
  sites (`[CollisionConsts] damage` is a name and an amount, `[Zone] damage` a number).
- **[AUDIO.md](docs/AUDIO.md)** — `DATA/AUDIO` voice banks, which have no module: flat UTF
  directories of RIFF payloads named by `getObjectId` of the `voices_*.ini` nickname, handled with
  `Directory` directly.
- **[RENDERER.md](docs/RENDERER.md)** — consumer-facing rather than per-module: maps the structures
  onto a WebGL2 renderer (base offsets, VAO strategies, joint composition, winding and matrix
  conventions) and records the measurements behind each choice.
- **[PLAN.md](docs/PLAN.md)** — the goal, the layer rules, the invariants, and what the merge of
  `utf2json` and `ini2json` did and deferred.

### Open questions live in a `TODO` section

A document's last section before its footer is **`## TODO`**, holding what is pending *observation in
the running game* rather than pending code: the question, why the corpus cannot settle it, the
reading taken meanwhile, and the experiment that would decide it. Present in ALCHEMY, ANIMATION,
RIGID, MATERIAL, TEXTURE, SURFACE, DEFORMABLE, RENDERER, INI, THN, THORN, ENGINE and RESOURCE;
[RETAIL.md](docs/RETAIL.md#todo--what-is-pending-in-the-game) indexes all of them in one table.

- **Everything listed round-trips already.** A `TODO` marks an unread meaning, never an unread byte
  — do not "fix" one by guessing, and do not derive a value the game might disagree with.
- A source `// TODO: observe in game` comment states the same question at the code it constrains,
  and some are also pinned as `todo` tests that report without failing.
- Closed questions are called out as closed where they would otherwise look open (cylinder joint
  animation is impossible, not missing; `tlrtube.3db` is blocked on a crash, not on an experiment).

## Code style

- Prettier: single quotes, no semicolons, 100-char print width. **Code only — never `.md`.** Its
  reflow rewrites line breaks that carry meaning in the documents under `docs/`: the property tables,
  the hand-set wrapping, the status markers. Markdown is edited by hand. `.prettierignore` enforces
  it; do not narrow it.
- `verbatimModuleSyntax` — use `import type` for type-only imports.
- All imports use `.js` extensions (NodeNext resolution, even for `.ts` sources).
- `noUncheckedIndexedAccess` — array indexing returns `T | undefined`.
- Internal package imports use the `#/*` alias (`./src/*` in development, `./dist/*` at runtime).
  **`../` never appears in an import** — `./` only for a sibling or a child, `#/` for anything else,
  including a nested module reaching its own parent (`ini/binary/read.ts` imports `#/ini/types.js`).
- Prefer type-enforced invariants over redundant fields: model distinctions as discriminated unions
  so a wrong consumer breaks at compile time.
