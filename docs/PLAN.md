# PLAN

Merge of `utf2json` and `ini2json` into a single library. **The merge is done** — steps 1–8 below
are complete and marked; what remains is the cross-reference layer and the three open questions at
the end.

## Goal

**An isomorphic infrastructure library providing a clean API and types representing Freelancer's
data, for applications to be built on top of.**

Not a converter. The product is the type surface and the knowledge in `docs/` — what the bytes
mean — not any particular output format.

## Name

`@treewyrm/freelancer`. Subpath exports carry the module names: `@treewyrm/freelancer/rigid`,
`/texture`, `/ini`, `/thn`. README disclaims affiliation (nominative use).

## Why merge

The original seam was container format (UTF vs INI); neither library is organized that way any
more — both are one directory per game subsystem, three layers deep. `.sur` and `.thn` did not
cross a boundary, they revealed there wasn't one.

- `BufferView`, hash, string and encoding helpers are already duplicated, flagged as debt in
  `ini2json/src/utility/bufferview.ts`.
- `getObjectId` (INI nickname hash) lives in `utf2json` because `AUDIO.md` needed it — a
  cross-format fact with no home.
- Cross-references are the third layer's native subject: archetype → `.cmp`, material → texture
  library, fx INI → `.ale` node, THN scene → both.
- ~15k LOC total. Single package with subpath exports, not a workspace monorepo.
- Both at `0.1.0` and unpublished. This is the cheapest it will ever be.

**What is lost:** the package boundary was a wall preventing accidental coupling. It is replaced by
a dependency-direction rule, below.

## Layers

| Layer | Form | Rule |
|---|---|---|
| Binary | `BufferView` / `ChunkView` over bytes | No choices made. |
| Interim | **Classes** — identity and mutation are the point | Methods are *structural*, never semantic. |
| Meaning | **Plain data** — interfaces, no methods, no identity | Interprets choices the game already made. |

- Interim classes are **public** — an editor builds a tree by hand and writes it out.
  `Directory`/`File` are the model.
- A method belongs to interim only if it does not need to know what the game *does* with the bytes.
  `Directory.getFile()` yes; `MaterialLibrary.resolveTexture()` no.
- Third-layer types are **plain data, not JSON-safe**. Plain data buys structural equality, cheap
  construction, and every serializer. JSON-safety buys only `JSON.stringify`, and costs typed
  arrays, `NaN`/`Infinity`, and `Map`/`Set`. The realistic transport is `structuredClone` to a
  worker with transferable buffers, which handles all three.
- JSON-safety **falls out per module** where it is free (all of `ini`, `thn`, and most of
  `material`, `compound`, `animation`) and is stated in that module's document. It is not a global
  invariant and `texture`/`vmesh` do not contort to meet it.
- Bulk binary (DDS surfaces, mip chains, vertex/index buffers) is an **opaque payload**: referenced
  from the described data by an identifier, carried beside it. glTF's `.gltf` + `.bin` split. The
  identifier is required — without it the write direction cannot reconstruct.

## Invariants

1. **No filesystem, no fetching.** The library resolves *references* — this hash, into this
   structure you handed me. The consumer supplies the loader. This is what keeps it isomorphic.
2. **Dependency direction.** Format modules never import each other or the cross-reference layer;
   the cross-reference layer imports downward only. This replaces the wall the package boundary
   provided.
3. **Lossless read-modify-write.** Anything the library does not model survives a round trip
   untouched. Free at the UTF level (unparsed stays a `File`); must be stated and tested per module
   above it. "The reader is correct" and "an editor won't damage a mod" are different guarantees.
4. **Absence is a missing key**, never `null`. `MATERIAL.md`'s absent-stays-absent invariant
   depends on it and types will not catch a violation.
5. **Helpers are opt-in.** Math, evaluation, and conversion never force themselves into the type
   design. `Vector3` is an interface plus a companion const of free functions — plain, JSON-safe,
   and still gets `Vector3.lerp`. That pattern is the rule for anything added later.
6. **Scope.** *The library models what the game's data means. It never decides what an application
   should do with it.* If a behaviour can be falsified against retail assets or by observation in
   game, it belongs here. If it needs a policy — resolution order, default, budget, cache, output
   convention — it belongs to the consumer.

Invariant 6 is the only guardrail left once "converter" stops constraining scope. The failure mode
is specific: the first consumer is our own renderer, and a library shaped by one application while
claiming to be general. This is what keeps `RENDERER.md` a document instead of a `renderer/` module.

## Structure

```
src/
  hash.ts      getResourceId, getObjectId, findByHash/filterByHash/setByHash  → `.`
  crc32.ts id32.ts                                                            internal
  utility/     BufferView, ChunkView, Dictionary, Tree, string, encoding, timestamp
  math/        Vector3, Vector4, Quat, Matrix3, Transform, scalar
  utf/         Directory, File                     (from utf2json core)
  ini/         text, binary                        (from ini2json)
  thn/         text, bytecode, scene               (from ini2json)
  resource/    PE resource DLLs                    (from ini2json)
  alchemy/ animation/ compound/ deformable/ material/ rigid/ surface/ texture/ vmesh/
```

**Flat, not grouped by container.** `utf/rigid` would reinstate the seam this merge deletes, and it
does not survive the modules: `surface` is not UTF, `thn` is not INI, `resource` is neither, so the
grouping holds for 8 of 12 with the exceptions stranded at a different depth. The export path
should state the subsystem, not the container — a consumer of `/rigid` does not care that a `.cmp`
is a UTF tree.

> **Nest when the child is a variant or a layer of the parent. Keep flat when the child merely
> depends on the parent.**

`ini/{text,binary}` and `thn/{text,bytecode,scene}` are encodings and layers of their parent — they
stay nested. `rigid` is a *consumer* of `utf`, the same way it consumes `vmesh` and `compound`;
nesting by dependency would equally justify `vmesh/rigid`.

`Directory`/`File` move from the root into `utf/`, which becomes an ordinary subpath — UTF is one
container among several now, not the library.

### The `.` export

> **`.` holds identity and naming — how things are named, and how a name resolves to a reference.
> Nothing at `.` reads or interprets a format.**

That is hashing, and only hashing. It is **domain knowledge, not utility** — the CRC table comes
from `dacom.dll`, the byte-swap is FL's convention, the case-folding rule is FL's behaviour — so it
does not belong in `utility/`, where `ini2json` currently keeps it. It is also the primitive the
cross-reference layer is built from, not a leaf helper.

The definition is what stops `.` rotting into a grab-bag: when the cross-reference layer lands it
takes its own subpath, because resolving an archetype to a model interprets formats.

Co-locating also puts three silently-confusable facts adjacent for the first time —
`getResourceId` for asset/material/mesh names, `getObjectId` for INI nicknames, and Alchemy's
case-sensitive variant. Picking wrong yields a number, just the wrong one.

`docs/` merges both sets; one `RETAIL.md`, one corpus harness, one `TODO` index.

## Steps

1. ✅ Scaffold repo, `package.json` exports, tsdown, tsconfig, Prettier — copied from `utf2json`.
2. ✅ Reconcile `utility/`: one `BufferView` (utf2json's, the superset, plus `bytes`,
   `findTerminator` and `from` on a raw buffer), one `string`. Hashing lifted out of `utility/` to
   `src/hash.ts` at `.`, holding both `getResourceId` and `getObjectId`; `crc32`/`id32` internal.
3. ✅ `utf2json/src/*` moved in **with its history** — the repo was initialised from it, so blame
   survives. `directory.ts`/`file.ts`/`types.ts` landed in `utf/`.
4. ✅ `ini2json/src/{ini,thn,resource}` moved in, its history merged as an unrelated root, all of
   it repointed to the shared `utility/` and to `#/hash.js`.
5. ✅ `docs/` merged; one `RETAIL.md` carrying both corpora, both round-trip tables and one `TODO`
   index of 23 questions.
6. ✅ One corpus harness. The two `load` functions meant different things — `glob` is now the
   pattern sweep, `load` the extension sweep parsed as trees, `raw` the same sweep as bytes.
7. ✅ Third-layer types swept for invariant 4. **No data field anywhere uses `null` for absence.**
   The only two `null`s in non-test source are control-flow sentinels, not fields:
   `readProperty` returns `Property | null` at an Alchemy block terminator, and `reduceTree` passes
   `parent: T | null` for the root. Neither is a modelled absence, and both are reachable to change
   to `undefined` later. Invariant 3 is what the per-module corpus round-trips already assert; the
   table in [RETAIL.md](RETAIL.md#round-trip-fidelity) is that audit.
8. Archive both source repos with a pointer. *(Left to do by hand — nothing here deletes them.)*

Deferred, as planned: the cross-reference layer (archetype → model, material → texture library). It
is the reason to merge, but it should be designed against a settled tree rather than during the
move.

### What the merge actually retired

- Two `BufferView` implementations, one of which carried a comment saying it was a deliberate
  subset "until utf2json is published".
- Two copies of the `id32` table, each with a comment saying the two had to agree.
- `getObjectId` living in a UTF library because `AUDIO.md` needed it, and again in an INI library
  because that is what INI nicknames are.
- A recommendation to take a dependency on a package that was never published.

## Open

- Whether any retail float is `NaN`/`Infinity` — cheap corpus sweep, decides whether invariant 4's
  sibling (numeric fidelity) needs stating.
- Whether the cross-reference layer is a module (`src/resolve/`) or a per-module concern.
- Whether opaque-payload identifiers are indices, names, or content hashes.
