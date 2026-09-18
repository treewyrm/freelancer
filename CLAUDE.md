# CLAUDE.md

**Isomorphic infrastructure library providing typed access to Freelancer's data** (Digital Anvil,
2003). The product is the type surface and the knowledge in `docs/` — what the bytes mean, not an
output format. Published as an ES module with many subpath exports, covering the binary **UTF**
containers, **INI** (text and compiled **BINI**), **THN** Lua 3.2 scene scripts, and the
**resource DLLs** every `ids_name`/`ids_info` resolves into.

**Status: format layer only.** Every module below reads and writes, and nothing above that: no
entry point interprets what a section *means* (`[Solar]`, `[Ship]`, `[Nebula]` are section names and
nothing more), and nothing walks `freelancer.ini` or the game's load order. Every count in `docs/` is
measured from the retail install and pinned back by the corpus suites; see
[RETAIL.md](docs/refs/RETAIL.md).

**Read [ARCHITECTURE.md](docs/refs/ARCHITECTURE.md) first** — commands, the three-layer model, the
six invariants, directory structure, documentation conventions and code style all live there rather
than here.

## Entry points

**494 exports across 22 entry points.** Each doc's `## API` section is resolved from `src/` with
the TypeScript checker and checked by `src/api.test.ts` — a drifted table fails the suite, not just
a reader.

| Export path      | Exports | Doc                                          |
| ----------------- | ------- | --------------------------------------------- |
| `.`               | 12      | [UTF.md](docs/modules/UTF.md#hashing)        |
| `./utility`       | 30      | [UTF.md](docs/modules/UTF.md#utilities)      |
| `./math`          | 31      | [MATH.md](docs/modules/MATH.md)              |
| `./utf`           | 4       | [UTF.md](docs/modules/UTF.md)                |
| `./alchemy`       | 51      | [ALCHEMY.md](docs/modules/ALCHEMY.md)        |
| `./animation`     | 36      | [ANIMATION.md](docs/modules/ANIMATION.md)    |
| `./vmesh`         | 32      | [VMESH.md](docs/modules/VMESH.md)            |
| `./compound`      | 14      | [COMPOUND.md](docs/modules/COMPOUND.md)      |
| `./rigid`         | 24      | [RIGID.md](docs/modules/RIGID.md)            |
| `./surface`       | 32      | [SURFACE.md](docs/modules/SURFACE.md)        |
| `./texture`       | 40      | [TEXTURE.md](docs/modules/TEXTURE.md)        |
| `./material`      | 13      | [MATERIAL.md](docs/modules/MATERIAL.md)      |
| `./deformable`    | 22      | [DEFORMABLE.md](docs/modules/DEFORMABLE.md)  |
| `./ini`           | 12      | [INI.md](docs/modules/INI.md)                |
| `./ini/text`      | 4       | [INI.md](docs/modules/INI.md)                |
| `./ini/binary`    | 8       | [INI.md](docs/modules/INI.md)                |
| `./ini/save`      | 4       | [INI.md](docs/modules/INI.md)                |
| `./thn`           | 16      | [THN.md](docs/modules/THN.md)                |
| `./thn/text`      | 3       | [THN.md](docs/modules/THN.md)                |
| `./thn/bytecode`  | 4       | [THN.md](docs/modules/THN.md)                |
| `./thn/scene`     | 67      | [THN.md](docs/modules/THN.md)                |
| `./resource`      | 35      | [RESOURCE.md](docs/modules/RESOURCE.md)      |

`./thn/scene` is deliberately not re-exported from `./thn`, so a consumer that wants the interim
model does not pull the vocabulary in with it. This table is the whole surface — a new entry point
is a new format, not a new subject.

## Reference docs

Not tied to one module's source: vocabularies, corpora, and consumer-facing mappings.

| Doc                                          | Covers                                                          |
| --------------------------------------------- | ------------------------------------------------------------------ |
| [THORN.md](docs/refs/THORN.md)               | The `./thn/scene` vocabulary: entities, events, properties         |
| [ENGINE.md](docs/refs/ENGINE.md)             | INI vocabularies the executables hardcode (`type`, `shape`, …)     |
| [SECTIONS.md](docs/refs/SECTIONS.md)         | Every section/property the engine reads, with its declared shape   |
| [RDL.md](docs/refs/RDL.md)                   | The markup every `ids_info` resolves to                            |
| [AUDIO.md](docs/refs/AUDIO.md)               | `DATA/AUDIO` voice banks                                            |
| [COSTUME.md](docs/refs/COSTUME.md)           | How the four `.dfm` files of a character join                      |
| [RENDERER.md](docs/refs/RENDERER.md)         | Mapping these structures onto a WebGL2 renderer                    |
| [RETAIL.md](docs/refs/RETAIL.md)             | The corpus, measurements, quirks, and every open question          |
| [ARCHITECTURE.md](docs/refs/ARCHITECTURE.md) | Commands, invariants, layering, directory structure, code style    |
