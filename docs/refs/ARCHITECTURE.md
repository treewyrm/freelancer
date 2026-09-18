# Architecture

Operating rules for working in this repository: commands, the three-layer model every format
follows, the invariants that hold across all of them, directory structure, documentation
conventions, and code style.

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
