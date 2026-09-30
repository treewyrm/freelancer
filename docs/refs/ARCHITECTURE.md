# Architecture

Operating rules for working in this repository: commands, the three-layer model every format
follows, the invariants that hold across all of them, directory structure, documentation
conventions, code style, and the naming and shape rules that keep the modules alike.

## Commands

```sh
npm run build   # compile TypeScript → dist/ via tsdown
npm test        # Node.js built-in test runner over src/**/*.test.ts (uses tsx, no build step)

node --import tsx --test src/utf/directory.test.ts   # a single test file
```

`corpus.test.ts` suites validate readers against retail game assets and skip themselves with a
reason when none are installed — see [RETAIL.md](RETAIL.md). **The rest of the suite must never
depend on retail data being present.**

## Three layers

Every format is read in the same three steps, and each step is usable on its own.

| Layer   | Form                                                                | Rule                                      |
| ------- | ------------------------------------------------------------------- | ----------------------------------------- |
| Binary  | `BufferView` over bytes                                             | No choices made.                          |
| Interim | **Classes and plain records** — identity and mutation are the point | Methods are *structural*, never semantic. |
| Meaning | **Plain data** — interfaces, no methods, no identity                | Interprets choices the game already made. |

```
   UTF bytes  ──▶  Directory / File             ◀──▶  rigid, vmesh, texture, material, …

   INI text    ─┐
                ├─▶  Section / Property / Value ◀──▶  (not modelled — see Scope)
   BINI bytes  ─┘

   bytecode  ─┐
              ├─▶  Value / Global               ◀──▶  entities and events (./thn/scene)
   Lua text  ─┘

   DLL image ───▶  Resource[]                   ◀──▶  names and infocards, by global id
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
- **The resource module's typed layer is a fixed point _and_ byte-exact** — nothing is coerced on
  the way through, so there is nothing for the round trip to lose.

## Invariants

1. **No filesystem, no fetching.** The library resolves *references* — this hash, into this
   structure you handed me. The consumer supplies the loader, and finding the file, applying the
   load order and caching the result are all theirs. `platform: 'neutral'` in `tsdown.config.ts`
   keeps this true rather than aspirational. **Every reader is synchronous** and is handed bytes
   that have already arrived.
2. **Dependency direction.** Format modules never import each other's meaning layer or the
   cross-reference layer; the cross-reference layer imports downward only.
3. **Lossless read-modify-write.** Anything the library does not model survives a round trip
   untouched. "The reader is correct" and "an editor won't damage a mod" are different guarantees.
4. **Absence is a missing key**, never `null`. [MATERIAL.md](../modules/MATERIAL.md)'s
   absent-stays-absent invariant depends on it and types will not catch a violation.
5. **Helpers are opt-in.** Math, evaluation and conversion never force themselves into the type
   design — `Vector3` is an interface plus a companion const of free functions, and that pattern is
   the rule for anything added later.
6. **Scope.** The library models what the game's data means; it never decides what an application
   does with it. A behaviour falsifiable against retail assets or by observation in game belongs
   here; a policy — resolution order, default, budget, cache, output convention — belongs to the
   consumer. This is what keeps [RENDERER.md](RENDERER.md) a document instead of a `renderer/`
   module. The line is drawn below meaning-of-a-section, not just below policy: what a `[Ship]`'s
   fields do, which files an install loads and in what order, how an archetype becomes a rendered
   object — all of that is the consumer's.

## Structure

**Flat, one directory per subsystem.** `utf/rigid` would reinstate a container seam this library
does not have — `surface` is not UTF, `thn` is not INI, `resource` is neither. Nest when the child
is a variant or layer of the parent (`ini/{text,binary}`, `thn/{text,bytecode,scene}`); keep flat
when the child merely depends on the parent (`rigid` consumes `utf` the same way it consumes
`vmesh`).

## Documentation conventions

- Every module doc carries the same section order: format and data structures first, **`## API`**
  next (the exports of its subpath(s), checked against the source by `src/api.test.ts`), then
  **`## Corpus`** last — the retail counts, distributions, round-trip results and quirks, so the
  body above it stays the format alone. A number that *is* the argument for a design decision stays
  where the decision is stated; its tabulation goes in the Corpus chapter.
  [RETAIL.md](RETAIL.md) indexes the corpus chapters across every module.
- **`## TODO`**, where present, is the true last section: what is pending *observation in the
  running game* rather than pending code — the question, why the corpus cannot settle it, the
  reading taken meanwhile, and the experiment that would decide it.
  [RETAIL.md](RETAIL.md#todo--what-is-pending-in-the-game) indexes all of them. A `TODO` marks an
  unread meaning, never an unread byte: do not "fix" one by guessing, and do not derive a value the
  game might disagree with. A source `// TODO: observe in game` comment states the same question at
  the code it constrains, and some are also pinned as `todo` tests that report without failing.
  Closed questions are called out as closed where they would otherwise look open.
- Every count in `docs/` is measured from the retail install, and the corpus suites assert those
  numbers back — a figure that stops matching means a reader drifted, not that the figure needs
  updating. See [RETAIL.md](RETAIL.md) for the evidence behind each one.

## Code style

- Prettier: single quotes, no semicolons, 100-char print width. **Code only — never `.md`.** Its
  reflow rewrites line breaks that carry meaning in `docs/`: property tables, hand-set wrapping,
  status markers. Markdown is edited by hand; `.prettierignore` enforces this and should not be
  narrowed.
- `verbatimModuleSyntax` — use `import type` for type-only imports.
- All imports use `.js` extensions (NodeNext resolution, even for `.ts` sources).
- `noUncheckedIndexedAccess` — array indexing returns `T | undefined`.
- Internal package imports use the `#/*` alias (`./src/*` in development, `./dist/*` at runtime).
  **`../` never appears in an import** — `./` only for a sibling or a child, `#/` for anything else,
  including a nested module reaching its own parent (`ini/binary/read.ts` imports `#/ini/types.js`).
- Prefer type-enforced invariants over redundant fields: model distinctions as discriminated unions
  so a wrong consumer breaks at compile time.

## Naming and shape

One rule per question, so that the same idea looks the same in every module. The API conventions
suite in `src/api.test.ts` checks the rules marked ✓ against every export; the rest are held by
review.

| #   | Rule | |
| --- | ---- | --- |
| C1  | **`type` names the kind.** On a union it is the discriminant, a string literal. Anything else gets its own name: `format` (pixel or vertex layout), `primitive` (topology), `version`, `storage`. A record outside any union keeps `type` where the format itself calls the field that — `Resource.type`, surface `Hull.type`, Alchemy `Node.type`. | |
| C2  | **One idiom per kind of enumeration.** Numeric wire codes are a TS `enum` with PascalCase members. A kind discriminant is a string-literal union — camelCase, or the file's verbatim vocabulary where there is one (THORN's `'SCENE'`). An open name vocabulary is a `KNOWN_…` const array plus `Known \| (string & {})`. A bitfield enum holds single bits only; a multi-bit field is a mask and shift constant pair and an accessor, never a member. | ✓ members |
| C3  | **Exported constants are `SCREAMING_SNAKE_CASE`.** A companion object (`Vector3`, an interface and a const of one name) is a type first and keeps the type's name. No public static class constants. | ✓ |
| C4  | **Acronyms stay upper case inside identifiers** — `CRC`, `UTF`, `DXT`, `MIPS` — except Freelancer's own `VMesh` and `VWire`. | |
| C5  | **A tagged value's discriminant is a string literal**, and the wire code behind it lives in the codec. Alchemy's `Property` and INI's `Value` are the same shape for that reason. | |
| C6  | **A tagged value's payload sits under `value`** in every arm, never spread beside `name` and `type`. | |
| C7  | **Absence is `undefined` or a missing key, never `null`**, and a reader never fills in a value it would then write back — a default the game applies is the consumer's, or an evaluator's. An optional piece reads as `undefined`; a required piece missing or malformed throws. An `is…`/`has…` probe agrees exactly with when its reader succeeds. | ✓ `null` |
| C8  | **Readers return arrays; writers accept `Iterable`.** Generators are for walks (`utility/tree`, `getMeshDraw`). A header-less list is `type XLibrary = X[]`, read by `readXLibrary`. | |
| C9  | **Verbs mean one thing.** `get` finds one or `undefined`; `filter` finds all; `set` replaces by key or appends; `add`/`append` always push; `insert` places by position; `ensure` gets or creates; `delete` removes everything matching a key; `remove` removes one by identity and says whether it was there. `read`/`write` are for codecs, never for mutating a live object — `File.setFloats` replaces a payload, `File.append` extends one. | |
| C10 | **Field vocabulary.** `orientation` is a frame (`Matrix3` or `Quat`), `rotation` an amount (an angle, Euler angles). `min`/`max` for bounds and limits; `start`/`count` for slices, an inclusive `end` only where the file stores one. `key` is a position on an animation axis, `time` absolute time, `duration` a span. Bounds are `./math`'s `BoundingBox` and `BoundingSphere` wherever they occur. | |
| C11 | **Every arm of an exported union is exported**, under a qualified name (`FixedJoint`), with an `…Of<T>` narrowing helper where the union is large (`EntityOf`, `JointOf`, `PropertyOf`, `ValueOf`). **Type names are unique across related entry points** — those whose data names or contains the other's, so that one file imports both; the foundations (`.`, `./utility`, `./math`, `./utf`) relate to everything. Isolated modules may share a name: surface's `Node` and Alchemy's never meet. Only types a public signature mentions are exported. | ✓ names |
| C12 | **`readonly` marks only the immutable tagged values** (INI and THN `Value`), which are replaced rather than edited. Records and their tuples are mutable. | |
| C13 | **A key extractor is `select`;** `predicate` is only for a function returning a boolean. | |
| C14 | **Codec shape.** `readX(source): T` and `writeX(value: T): BufferView \| File \| Directory`, with no out-parameters. Bare `read`/`write` only on a subpath that is a single document format (`ini/*`, `thn/*`, `resource`). | |

Related entry points for C11 are declared in the conventions suite; adding an entry point means
saying there what it relates to.
