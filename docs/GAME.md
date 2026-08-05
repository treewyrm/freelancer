# The install

Where the files are, what order they load in, and how a path written for Windows finds them on
anything else. `src/game/`, exported as `./game`.

Every other entry point takes bytes you already have and gives back meaning. This is the layer above
that — the part that knows an install starts at `EXE/freelancer.ini`, that `resources.dll` comes
before the `[Resources]` list, that `[Data]` order is load-bearing, and that `missions\mBases.ini`
means `MISSIONS/mbases.ini`.

## Why this is in the library at all

Invariant 6 says the library models what the data means and never decides what an application should
do — anything needing a policy belongs to the consumer. A load order looks like a policy and is not:
it is **the game's**, it is written down in the game's own files, and it is falsifiable against
retail. `freelancer.ini` carries the argument itself, in a comment above `[Data]`:

> ;EMAURER must load solar archetypes before universe. Universe inspects solar OBJECT_TYPE values.

and a second one warning that the order is part of the network protocol, because archetype ids are
positional and client and server must agree. Getting it wrong is falsifiable, so it belongs here.

What stays with the consumer is everything `Game` does not have: **where the files are**, how much to
keep, and when to drop it.

Invariant 1 — no filesystem, no fetching — is honoured by injection. `src/game/` imports nothing from
`node:*`, and `tsdown`'s `platform: 'neutral'` is what keeps that true rather than aspirational.

## The one asynchronous module

`src/game/` is the only place in this library with a `Promise` in it. Every reader it calls is
synchronous and is handed bytes that have already arrived.

A browser cannot offer bytes any other way — the File System Access API, `fetch` and a directory
picker are all promise-shaped — and a synchronous contract would force a consumer to load an entire
8,368-file tree into memory before asking for one file, which is what loading on demand exists to
avoid.

## The filesystem contract

The whole of it:

```ts
interface Entry {
  name: string        // as stored, in its real case
  directory: boolean
}

interface FileSystem {
  read(path: string): Promise<Uint8Array>
  list(path: string): Promise<Iterable<Entry>>
}
```

Paths are relative to the **install root** — the directory holding `EXE` and `DATA` — and use `/`.
Nothing the consumer sees carries the backslashes the INI files are authored with; `path.ts`
translates first.

`list` is there for one reason, and it is the next section.

## Case

The game ran on Windows and compared filenames the way the OS did, so the data is authored as if case
did not exist. Retail's own tree makes the mismatch total rather than occasional — **directories are
uppercase, filenames lowercase** — so almost every path in `[Data]` disagrees with disk in both
halves:

| Authored | On disk |
| --- | --- |
| `missions\mBases.ini` | `MISSIONS/mbases.ini` |
| `Universe\universe.ini` | `UNIVERSE/universe.ini` |
| `fx\weapons\weapons_ale.ini` | `FX/WEAPONS/weapons_ale.ini` |
| `solar\StarArch.ini` | `SOLAR/stararch.ini` |

**Resolution is a folded index per directory, built lazily from `list`.** Probing candidate
spellings instead would be both slow and wrong: there is no rule that generates `MISSIONS/mbases.ini`
from `missions\mBases.ini` short of knowing what is there.

The index is safe because folding is injective across the corpus: **8,368 files in retail `DATA`, and
not one pair collides when the whole path is folded.** Where a tree does collide — only possible on a
case-sensitive volume — the first listed entry wins and the loss is recorded in `Resolver.collisions`
rather than thrown, because one ambiguous pair should not take a whole install down.

Folding is `fold` from `utility/string.ts`, ASCII-only, which is what `stricmp` does and therefore
what the game did. `toLowerCase` would fold characters windows-1252 can carry and silently merge two
distinct names.

The listing cache holds the **promise**, not the listing, so resolving two paths through the same
directory at once lists it once.

## The load sequence

`Game.open(fs)` does this, in order:

1. **Read `EXE/freelancer.ini`.** Plain text; `[;Display]` survives as a section whose name begins
   with a semicolon, which the INI reader already handles.
2. **`[Freelancer] data path`** is `..\data`, written relative to `EXE` because that is the game's
   working directory — so it resolves against **the config's own directory**, not the install root.
3. **`[Resources]`**, with `resources.dll` prepended. See below.
4. **`[Data]`**, walked in file order and never grouped.

### `[Resources]` — the DLL the file does not list

`[Resources]` names six DLLs. The id space has seven. **`resources.dll` is library 0 and is compiled
into the executable**, so a reader that takes the list at face value shifts every `ids_name` in the
game by `0x10000` — which resolves to the wrong text rather than to nothing, and is therefore the
kind of bug that ships.

```
0  resources.dll            (implicit)
1  InfoCards.dll
2  MiscText.dll
3  NameResources.dll
4  EquipResources.dll
5  OfferBribeResources.dll
6  MiscTextInfo2.dll
```

Retail yields **13,121 names and 5,307 infocards**; `ids_name` 196,609 is `New York`. Reading them is
optional (`{ strings: false }`) because seven PE images are the most expensive part of opening an
install and a tool that only wants geometry never asks.

### `[Data]` — 99 properties, 34 keys

The **property name selects the reader and the value is the path**. Three shapes a naive walk gets
wrong, all present in retail:

- **`bases` carries no value.** The file says why: *"bases has no filename but the key specifies the
  load order"*. It marks where base loading falls relative to everything else. Reading it as a path
  reads the empty string.
- **`fonts_dir = fonts\files\` is a directory**, not a file — and in retail it **does not exist**.
  `DATA/FONTS` holds `fonts.ini` and `rich_fonts.ini` and nothing else. It is the one dangling
  reference in `[Data]`, and `Game` reports it rather than hiding it.
- **Repeats are ordered and additive**, not last-wins:

  | Key | Files | | Key | Files |
  | --- | --- | --- | --- | --- |
  | `voices` | 18 | | `goods` | 5 |
  | `fuses` | 16 | | `loadouts` | 4 |
  | `effects` | 12 | | `markets` | 3 |
  | `sounds` | 7 | | `ships` | 2 |
  | `equipment` | 7 | | | |

`explosions` and `debris` both name `fx\explosions.ini` — **one file, two keys**, so a reader that
deduplicated by path would load it once and mislabel it.

### What `[Data]` does not say

`[Data]` is not the whole load list. The story missions, the NPC and faction tables, the random
mission generator's data, the pathfinding tables and most of the interface are opened by names
compiled into `content.dll` and `Freelancer.exe`. A tool that walks `[Data]` alone reads about half
the data and reports the rest as unreferenced.

`hardcoded.ts` carries them, measured rather than recalled: a string sweep over `EXE/*.exe`,
`EXE/*.dll` and `DLLS/BIN/content.dll` in both ASCII and UTF-16, filtered to INI-shaped paths and
checked against the tree. It finds 79 distinct strings, of which **58 resolve and are absent from
`[Data]`**:

| Group | Count | Named by |
| --- | --- | --- |
| Story missions `MISSIONS/M01a…M13` | 15 | `content.dll` |
| Mission and base tables (`mbases`, `news`, `npcships`, `specific_npc`, …) | 13 | `content.dll` |
| `RANDOMMISSIONS/*.ini` | 7 | `content.dll` |
| Pilots (`pilots_population`, `pilots_story`) | 2 | `content.dll` |
| `SCRIPTS/GCS/*` | 2 | `content.dll` |
| Pathfinding + `commodities_per_faction` | 4 | `content.dll` |
| Interface (`keylist`, `optlist`, `rollover`, textures, navbar, …) | 10 | `Freelancer.exe` |
| Root singletons (`cameras`, `mouse`, `soundcfg`, `lightanim`, `missioncreatedsolars`) | 5 | `Freelancer.exe` |

Six more are named by a binary and resolve to nothing. They are recorded so the next sweep does not
chase them: `missions\m01a\rtc_success.ini`, `cockpits\cockpit.ini`, `effects.ini`,
`state_graph.ini` are dead, and `PerfOptions.ini` and `UserKeyMap.ini` are written to the player's
save folder rather than read from the data tree.

Three kinds of string are deliberately excluded. `common.dll`'s `bodyparts.ini` and `costumes.ini`
are bare basenames whose real paths come from `[Data]`. `flserver.exe`'s `freelancer.ini` /
`DACOMsrv.ini` and `dalib.dll`'s `DACOM.INI` live in `EXE`, not under the data directory. And five
strings carry a literal `../data/` prefix — the same files spelled from a different working
directory.

**`Game.open` walks them when `hardcoded` is on**, after `[Data]` and through the same `#load` path,
so each lands in `documents` under the `key` its row assigns and goes through the same reader switch.
`entries` marks them `hardcoded: true`. This is what `hardcoded.ts` always meant by assigning a key;
until `./ai` needed it, nothing walked the list.

It is **off by default**, which is a decision worth stating rather than a default that happened:
turning it on changes what `documents` and `entries` contain, and existing consumers pin counts on
both. The cost is 58 files, small next to the seven PE images `strings` reads. A tool that wants the
AI, the missions or the interface has no other way to reach them.

### Why reading the list beats walking the tree

`FX/fuse_li_battleship.ini` is on disk and **absent from `[Data] fuses`**. The game never loads it.
A tool that globs `FX/fuse*.ini` counts 17 files and 209 fuse scripts; the game runs 16 and 192. That
gap is the argument for this module in one line.

## Assets

`Assets` is the flat CRC namespace every UTF reference resolves in.

A `.cmp` names its material by a CRC and does **not** name the file that material is in. Neither does
a material name the file holding its textures, nor a mesh reference the file holding its mesh. All of
it resolves against whatever the game has loaded, by `getResourceId` of the name — **one flat,
global, case-folded namespace, not a per-file scope.** A viewer that resolves a model's materials
against that model's own file gets the right answer for most retail models and the wrong one for the
rest.

**Alchemy is the exception and hashes case-sensitively.** Node names go in under
`getResourceId(name, true)`; folding them the way everything else folds strands roughly half the node
instance references. That difference is one boolean at one call site, which is exactly why it is
here rather than in four `Map`s in a consumer.

Loading is on demand, which is what the game does. What to load, when, and what to evict is the
consumer's policy, so there is no budget and no eviction — only `clear()`.

## The reader switch

`[Data]` keys route to domain modules. `./fx` is the only one built, so `effects`, `effect_shapes`
and `fuses` are interpreted and the other 31 keys store their interim `Document` and nothing more.

That is deliberate: **every key lands in `Game.documents` whether a module claims it or not**, so
this is useful before the other twelve modules exist, and a module arriving later fills an arm that
already names itself. Every key is listed in the switch rather than left to the default, so what is
unwritten is visible in the code instead of implied.

Documents are kept for claimed keys too. The typed layer is a fixed point, not a replacement, and a
tool that must not perturb bytes edits the interim form.

## Usage

```ts
import { Game } from '@treewyrm/freelancer/game'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = '/games/Freelancer'

const game = await Game.open({
  async read(path) {
    return readFileSync(join(root, path))
  },
  async list(path) {
    return readdirSync(join(root, path), { withFileTypes: true }).map((entry) => ({
      name: entry.name,
      directory: entry.isDirectory(),
    }))
  },
})

game.settings.data                          // 'data'
game.library.names.get(196609)              // 'New York'
game.documents.get('universe')              // [Document]
game.effects.visuals.length                 // 1218

await game.load('ships\\liberty\\li_elite\\li_elite.cmp')
game.assets.material('li_elite_body')       // resolved in the global namespace
```

Opening a retail install, resource DLLs included, takes about 700 ms.

## TODO

| Question | Reading taken | Experiment |
| --- | --- | --- |
| Whether `fonts_dir` is dead or the game creates `FONTS/files` at runtime | Report it unresolved; do not treat it as a fault | Watch file opens under `FONTS` with `[Error] log = $Text, 'f'` enabled |
| Whether a `[Data]` key the engine does not know is ignored or is an error | Store the document, report nothing | Add an invented key to `[Data]` and see whether the game starts |
| Whether `FX/fuse_li_battleship.ini` is unreachable or reached another way | Unreachable; the game loads 192 of the 209 scripts | Add it to `[Data] fuses` and see whether a Liberty battleship's death changes |

---

[INI.md](INI.md) · [RESOURCE.md](RESOURCE.md) · [FX.md](FX.md) · [SCHEMA.md](SCHEMA.md) · [RETAIL.md](RETAIL.md)
