# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this
repository.

TypeScript library for reading and writing two of Freelancer's data formats: **INI** — plain text and
**BINI**, the compiled binary form — and **THN**, the Lua 3.2 scene scripts INI points at. Companion
to `@treewyrm/utf2json`, which covers the UTF containers this data points at. Published as an ES
module package with multiple entry points.

**The two formats share nothing but that edge.** INI reaches a THN through `[Trigger] act_AddRTC` and
its two neighbours, and nowhere else do they meet — different document model, different encodings,
different vocabulary. `src/` is split accordingly, and the root entry point re-exports them as
namespaces rather than flattening, because both define `Value`, `read` and `write` with different
meanings.

**Status: for INI, the encoding and interim layers are implemented and pinned by the corpus, and the
typed layer and domain modules are designed and unwritten. For THN, the encodings and the interim
layer are implemented — bytecode in, text both ways — and the typed layer is likewise unwritten.**
Every count in `docs/` was measured from the retail install rather than recalled, and the corpus
suites assert those numbers back, so a figure that stops matching means the reader drifted rather
than that the figure needs updating. Do not treat a number in these documents as decoration — each
one pins a design decision, and the decisions are listed with their evidence in
[RETAIL.md](docs/RETAIL.md).

## Commands

```sh
npm run build   # compile TypeScript → dist/ via tsdown
npm test        # Node.js built-in test runner over src/**/*.test.ts (uses tsx, no build step)

node --import tsx --test src/thn/text/text.test.ts   # a single test file
```

`src/ini/corpus.test.ts` and `src/thn/corpus.test.ts` validate the readers against retail game assets
and skip themselves with a reason when none are installed — the same `$FREELANCER_DATA` convention
and the **same install** as utf2json, swept for `**/*.ini` and `**/*.thn` respectively by the shared
`src/corpus.ts`. See [RETAIL.md](docs/RETAIL.md). **The rest of the suite must never depend on retail
data being present.**

## Three layers, twice

```
   INI text  ─┐                                              bytecode ─┐
              ├─▶  Section / Property / Value  ◀──▶  typed             ├─▶  Value / Global  ◀──▶  typed
   BINI bytes ─┘         (the interim model)                 text     ─┘    (the interim model)
```

Each layer converts to its neighbours in both directions and is usable on its own. The encoding layer
owns byte-exactness; the typed layer owns meaning and is only a fixed point, because coercion
discards the int/float distinction BINI records. A tool that must not perturb bytes edits the interim
document. **Both typed layers are unwritten**, and for THN the encoding layer is asymmetric — there
is no bytecode writer, which is deferred rather than ruled out.

## Entry points

| Export path          | Source                      | Description                                                                                                                                                            |
| -------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.` (default)        | `src/index.ts`              | `ini` and `thn` as namespaces, and nothing else                                                                                                                        |
| `./ini`              | `src/ini/index.ts`          | The interim model, value coercion, document lookups, and `read`/`write` by signature                                                                                   |
| `./ini/text`         | `src/ini/text/index.ts`     | Text INI parser and serializer                                                                                                                                         |
| `./ini/binary`       | `src/ini/binary/index.ts`   | BINI reader and writer                                                                                                                                                 |
| `./thn`              | `src/thn/index.ts`          | The scene script model, value helpers, and `read`/`write` by signature                                                                                                 |
| `./thn/text`         | `src/thn/text/index.ts`     | Lua source parser and serializer — the whole write path                                                                                                                |
| `./thn/bytecode`     | `src/thn/bytecode/index.ts` | Compiled Lua 3.2 reader, and the opcode table. **No writer**                                                                                                           |
| `./utility`          | `src/utility/index.ts`      | `BufferView`, windows-1252, `getObjectId`, number and name helpers                                                                                                     |
| _planned_ `./schema` | —                           | Typed-layer machinery: coercion, optionality, repeated fields, references                                                                                              |
| _planned_ domain     | —                           | `./universe`, `./base`, `./solar`, `./equipment`, `./ships`, `./missions`, `./ai`, `./randommissions`, `./fx`, `./audio`, `./interface`, `./characters`, `./constants` |

`./schema` and the domain modules are **INI only**. A typed layer for THN — entities and events as
records, with the vocabulary taken from `thorn.dll`'s string table — is the right next step there and
is not started.

The domain split is a partition of all 256 retail section names, computed rather than guessed;
[MODULES.md](docs/MODULES.md) carries the assignment and the recommended build order.

## Source layout

`src/ini/` and `src/thn/` are the two formats; `src/utility/` and `src/corpus.ts` are shared.

### `src/ini/`

- **`src/ini/types.ts`** — `Document`, `Section`, `Property`, `Value`. Plain data: no classes, no
  cursors, no parent links, so a document read from BINI, parsed from text or written by hand is
  the same thing and either writer accepts any of them.
  **`Value` is a discriminated union carrying the type the file recorded**, not a bare
  `boolean | number | string`. The tag is not derivable — 14,209 retail values are float-typed with
  an integral value — and dropping it costs byte-exactness back to BINI.
- **`src/ini/value.ts`** — constructors, guards and the four coercions. **The coercions follow
  `INI_Reader`, not JavaScript**: `toBoolean` on a string takes only `true`/`false` by name so
  `yes` is false; `toInteger` truncates a float toward zero; an unparseable string is `0`, never a
  throw. `toText` is the exception and deliberately does _not_ match the engine's `%g`, because
  this library's text output is an input to its own parser.
- **`src/ini/section.ts`** — lookups. Every one folds case, none string-compares, and each has a
  singular and a plural form because a repeated property is a list.
- **`src/ini/binary/`** — `data.ts` holds the layout constants, `dictionary.ts` the shared intern
  table, then `read.ts`/`write.ts`. **The dictionary is one table for names and values**, filled
  names-first in two passes; that rule is what makes the round-trip byte-exact and splitting it
  produces a working, different file.
- **`src/ini/text/`** — `read.ts`/`write.ts`. Forgiving by design, because the shipped data is.

### `src/thn/`

- **`src/thn/types.ts`** — `Document`, `Global`, `Entry`, `Value`. Plain data on the same terms, and
  `JSON.stringify`-able as it stands. **`Value` has four arms and no boolean one**: number, string,
  identifier, table. The identifier arm is the whole reason the model exists — `type = SCENE` is a
  global _read_, not the string `"SCENE"`, and quoting it hands the engine a string where it wants a
  number. `Y` and `N` are identifiers like any other, and the missing boolean arm is what makes
  folding them into `true`/`false` a compile error.
- **`src/thn/value.ts`** — constructors, type-predicate guards, `toNumber`, and the two lookups.
  **A number carries its literal, not a parsed value**: the pool stores decimal ASCII, and
  `-0.9999900000000001` reformatted is `-0.99999`, the same quantity and a different file.
  `toNumber` parses with `Number`, **not** `utility/number`'s `atof`, which narrows to float32 for
  INI's sake — a Lua number is a double. The lookups are the only case-**sensitive** ones in the
  package, because these are Lua table keys and not INI names.
- **`src/thn/bytecode/`** — `data.ts` holds the Lua 3.2 opcode table and the constant tags, then
  `read.ts`. Big-endian throughout, which is the one thing every other binary format here is not.
  **`data.ts` is written for both directions** even though there is no writer, so a later one does
  not start by re-deriving it. Two semantics the Lua header does not state: `SETMAP`'s operand is
  pairs minus one, and `SETLIST`'s flush offset is ignorable. One the header _does_ state and a
  name-based rule gets wrong: `SETTABLEPOP` takes no operand.
- **`src/thn/text/`** — `read.ts`/`write.ts`. A Lua **literal** parser, not a Lua parser: anything
  outside the literal grammar is a `SyntaxError` naming the line, because half-reading a `local` or
  an `if` yields something this library cannot write back. The writer is faithful over tidy in one
  place — a table keyed `1..n` is written back keyed, not collapsed.
- **`src/utility/`** — shared. `bufferview.ts` (a deliberate subset of utf2json's, to be replaced by
  an import once that package is published; its `littleEndian` constructor parameter is what lets
  THN read big-endian without a second implementation), `encoding.ts` (windows-1252, needed for
  `initialworld.ini`'s U+00A0 padding), `number.ts` (C `atoi`/`atof`, shortest-round-trip float32
  formatting, and the text token classifier), `string.ts`, `hash.ts` (`getObjectId`).

## Documents

**Read the relevant document before writing a reader or writer** — the design positions there are
argued from retail measurements, and re-deriving one from first principles will usually get it
wrong in the same way the circulated format tables do.

- **[INI.md](docs/INI.md)** — both encodings and the document model they share. The BINI binary
  layout, the text form's quirks, case folding, round-trip targets. **Booleans are defined by the
  format and occur zero times in 876,034 retail values** — a flag is a property with no values, and
  the writer must never emit a type-`0x0` value; its truth is **payload byte 0**, in a payload that
  is still 4 bytes because the value stride is unconditionally 5. **`INI_Reader` in `common.dll`
  holds two parsers behind a flag and parses BINI natively** (found by disassembly) — text is
  accepted anywhere BINI is, because an unsigned file falls through to the text parser, but the two
  paths differ in their coercion details, so a parser-behaviour claim must name its encoding.
- **[SCHEMA.md](docs/SCHEMA.md)** — interim → typed. **The value type tag is authoring residue**:
  266 fields carry more than one type signature across retail, so the typed layer coerces to its
  declared type and never switches on the tag. Every property is independently optional, repeated
  properties are ordered lists, and unknown properties are preserved rather than dropped.
- **[MODULES.md](docs/MODULES.md)** — every section name, its retail count, and which module owns
  it. Sections shared across domains (`Loadout`, `CollisionGroup`, `Simple`, `MVoiceProp`) get one
  owner and are imported, the way `compound/` works in utf2json.
- **[RETAIL.md](docs/RETAIL.md)** — the corpus, the full measurement table with what each number
  pins, the quirks index, and the `TODO` index.
- **[THN.md](docs/THN.md)** — `.thn` is **not INI**: all 1,506 retail files are compiled Lua 3.2,
  read by THORN (`EXE/thorn.dll`). Reached from `[Trigger] act_AddRTC` and friends, and its own entry
  point at `./thn`. **A THN is a serialization format, not a program** — disassembling all 1,506
  yields fifteen opcodes, all of them value-pushing or table-building, and no function prototype
  anywhere; the whole file is `duration`, `entities`, `events`. It maps onto JSON except for bare
  identifiers (`SCENE`, `Y_AXIS`, and the booleans `Y`/`N`), which must stay distinguishable from
  strings. **The game reads a plain-text `.thn`, so the write path needs no bytecode emitter** — but
  needing none and wanting none are different claims, and a bytecode writer is deferred rather than
  ruled out. **bytecode → model → text → model round-trips exactly over all 1,506.** 355 of the
  scripts are written in a second form that carries resolved numbers where the rest carry symbolic
  globals; both read, neither is normalised into the other, and the pairing is the lead on what the
  identifiers' numeric values are.

### Open questions live in a `TODO` section

As in utf2json, a document's last section before its footer is **`## TODO`**, holding what is
pending _observation in the running game_ rather than pending code: the question, why the corpus
cannot settle it, the reading taken meanwhile, and the experiment that would decide it.
[RETAIL.md](docs/RETAIL.md#todo--what-is-pending-in-the-game) indexes all of them.

**A `TODO` marks an unread meaning, never an unread byte** — do not "fix" one by guessing, and do
not derive a value the game might disagree with.

## Relationship to utf2json

**This package is standalone, for now.** The plan was to depend on `@treewyrm/utf2json` rather than
duplicate anything, and that is still the right end state — but utf2json is not published, so an
`npm install` here would fail on it. Two pieces are therefore carried locally and deliberately kept
minimal so the two cannot drift in any way that matters:

- **`getObjectId`** (id32) hashes INI nicknames — the archetype references, and the names of the
  voice files in `DATA/AUDIO`. Same table, and `hash.test.ts` pins three values against utf2json's
  output. **`getResourceId`** (CRC32) is the _other_ hash and belongs to UTF resources; using it on
  a nickname silently fails to match, so it is not carried here at all.
- **`BufferView`** is a subset of utf2json's — BINI needs six primitives and a NUL scan. Replace it
  with the import when utf2json ships.

The reference edges that make the pair useful: `[VisEffect]` → `.ale` ([ALCHEMY.md](../utf2json/docs/ALCHEMY.md)),
`[Ship]`/`[Solar]` → `.cmp`/`.3db`/`.sur`, `[Body]`/`[Skeleton]` → `.dfm`/`.anm`
([DEFORMABLE.md](../utf2json/docs/DEFORMABLE.md)), `[Sound]` → the voice banks
([AUDIO.md](../utf2json/docs/AUDIO.md)).

`strid_name` and `ids_info` are numeric resource IDs into the game's DLLs. Resolving them means
reading PE resource tables and is **out of scope** — they stay numbers.

## Code style

Identical to utf2json, so a reader moving between the two repositories does not have to re-learn:

- Prettier: single quotes, no semicolons, 100-char print width.
- `verbatimModuleSyntax` — use `import type` for type-only imports.
- All imports use `.js` extensions (NodeNext resolution, even for `.ts` sources).
- `noUncheckedIndexedAccess` — array indexing returns `T | undefined`.
- Internal package imports use the `#/*` alias (`./src/*` in development, `./dist/*` at runtime).
- Prefer type-enforced invariants over redundant fields: model distinctions as discriminated unions
  so a wrong consumer breaks at compile time.
