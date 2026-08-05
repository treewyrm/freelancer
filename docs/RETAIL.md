# Retail data

The retail Freelancer install as a whole rather than any one module: where the corpus is, what is in
it, how faithfully each module reproduces it, which files are not Freelancer's at all, and what has
actually been measured versus what is assumed. Per-format detail stays in the module documents.

## The corpus

`src/corpus.ts` looks for a Freelancer `DATA` directory at **`$FREELANCER_DATA`**, falling back to
**`~/Downloads/Freelancer/DATA`**, and every `corpus.test.ts` suite skips itself with a reason when
neither exists. **The rest of the test suite never depends on retail data being present.**

Three sweeps, because the formats want different handles:

- `list(...extensions)` / `raw(...extensions)` — everything under `DATA` matching an extension,
  case-insensitively. `load(...extensions)` is the same sweep with each file parsed as a UTF tree.
- `glob(from, pattern)` — a glob under any root, which is what the text formats need: both INI
  encodings come back from one pattern, the scene scripts are spread across `SCRIPTS`, `MISSIONS`
  and `RANDOMMISSIONS`, and `EXE` is outside the `DATA` tree entirely.
- `executables` — the `EXE` directory, for the sweeps that reach it.

Two directories outside `DATA` matter:

- **`EXE/`** — `freelancer.ini`, `dacom.ini`, `dacomsrv.ini`, the three plain-text INIs and the only
  place `@include` appears; `newplayer.fl` and `mpnewcharacter.fl`, the two starting-state saves,
  read and written by `./ini/save`; and the seven **resource DLLs** every `ids_name` and `ids_info`
  resolves into, read and written by `./resource`. See [RESOURCE.md](RESOURCE.md).
- **`DLLS/`** — holds only `BIN/content.dll`, which carries a version block and nothing else. The
  resource numbers do **not** resolve here, a natural guess and a wrong one.

Retail is the authority every reader here is measured against, so a claim about a format is worth
only the count behind it. Every number in these documents comes from a sweep of that install and the
suites assert them back through the readers — **they are regression tests, so a number that stops
matching means the reader drifted, not that the number needs updating.**

## What is in it

|                                      | Count                  |
| ------------------------------------ | ---------------------- |
| `.ini` files under `DATA`            | 1,252                  |
| — BINI (signature `BINI`)            | 1,251                  |
| — plain text                         | 1 (`initialworld.ini`) |
| `.ini` files under `EXE`             | 3, all plain text      |
| `.fl` files under `EXE`              | 2, one of them masked  |
| BINI version values seen             | `1`, in all 1,251      |
| Sections                             | 70,250                 |
| Distinct section names (case-folded) | 256                    |
| Properties                           | 511,556                |
| Values                               | 876,034                |
| — of type boolean (`0x0`)            | **0**                  |
| `.thn` files under `DATA`            | 1,506, all compiled    |
| — in the symbolic form               | 1,151                  |
| — in the numeric form                | 355                    |
| Scene script constants               | 442,599                |
| — number (tag `01`)                  | 282,234                |
| — string (tag `02`)                  | 160,365                |
| Identifier reads                     | 155,259, over 55 names |
| Scene entities                       | 41,250                 |
| Scene events                         | 50,785                 |
| Resource DLLs under `EXE`            | 37, all readable       |
| — libraries Freelancer loads         | 7                      |
| Resources in those seven             | 6,653                  |
| — `RT_STRING` blocks                 | 1,334                  |
| — `RT_HTML` infocards                | 5,307                  |
| — `RT_VERSION` blocks                | 7                      |
| String slots (16 per block)          | 21,344                 |
| — filled                             | 13,121                 |
| — holes (zero-length)                | 8,223                  |

Distribution of the INI data by directory:

| Directory               | `.ini` files |
| ----------------------- | ------------ |
| `UNIVERSE`              | 706          |
| `SOLAR`                 | 239          |
| `MISSIONS`              | 155          |
| `FX`                    | 34           |
| `COCKPITS`              | 33           |
| `AUDIO`                 | 26           |
| `EQUIPMENT`             | 17           |
| `INTERFACE`             | 15           |
| `RANDOMMISSIONS`        | 7            |
| `SHIPS`                 | 5            |
| `SCRIPTS`, `CHARACTERS` | 3 each       |
| `FONTS`                 | 2            |
| root                    | 7            |

Asset counts live with the module that measured them — 7,525 materials, 4,447 DirectDrawSurfaces,
596 effect files, 204 deformable models, and so on. They appear in the round-trip table below and in
full in each module document.

## Measured facts and what they pin

Each of these decided a design position. The position is in the linked document; the number is here.

| Measurement                                                         | Value                                     | Pins                                                                                                                        |
| ------------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Boolean-typed values in retail                                      | 0 of 876,034                              | Writer never emits type `0x0`; a flag is a zero-value property — [INI.md](INI.md#booleans-do-not-occur)                     |
| Value types in retail                                               | 388,571 int, 63,143 float, 424,320 string | The tag is authoring residue, and strings dominate — [SCHEMA.md](SCHEMA.md#the-value-type-tag-is-authoring-residue)         |
| Files re-emitted byte-exactly from the derived dictionary order     | 1,251 of 1,251                            | Dictionary order is derivable; nothing needs preserving out-of-band — [INI.md](INI.md#round-trip)                           |
| Largest BINI dictionary                                             | 64,492 bytes (`AUDIO/story_sounds.ini`)   | The uint16 ceiling is ~1 KiB away, so names-first is load-bearing — [INI.md](INI.md#the-uint16uint32-hazard)                |
| Largest name offset / largest string offset                         | 4,650 / 64,446                            | The pressure is entirely on the value region — same                                                                         |
| Bytes above `0x7F` in any BINI dictionary                           | 0                                         | The dictionary is ASCII; only the text path needs windows-1252 — [INI.md](INI.md#bini-form)                                 |
| Zero-value properties                                               | 1,063                                     | The document model must allow arity 0                                                                                       |
| Files repeating a section name                                      | 156                                       | Sections are an ordered list, never a map — [INI.md](INI.md#the-document-model)                                             |
| Most-repeated property                                              | `[Loadout] equip` ×16,074                 | Repeated properties are ordered lists                                                                                       |
| `(section, property)` pairs with more than one value-type signature | 266                                       | The type tag is authoring residue; the typed layer coerces — [SCHEMA.md](SCHEMA.md#the-value-type-tag-is-authoring-residue) |
| `(section, property)` pairs with varying arity                      | 108 (104 among valued occurrences, 4 more by also being written bare) | Tuples need optional tails; lists need no fixed width — [SCHEMA.md](SCHEMA.md#arity-varies-on-the-same-field)               |
| `(section, property)` pairs that repeat inside one section          | 202 — 34 in under 5% of their sections, 19 in under 1%, 48 in exactly one | A singular field must choose an occurrence; the tail is authoring accident. Read **last-wins** — [SCHEMA.md](SCHEMA.md#todo) |
| Pairs written both bare and with a value                            | 4, of which **one is a flag**: `[CollisionGroup] separable`, bare ×456 and `= true` ×28, never `= false` | A zero-value property and `= true` are one fact; presence is the read — [INI.md](INI.md#how-the-game-reads-a-value)          |
| `[Exclusion Zones] exclusion` openers, and members before the first | 634 over 169 sections, and **0**          | A property can own the properties after it — [SCHEMA.md](SCHEMA.md#identity-and-nicknames)                                   |
| `[Zone] faction` properties preceding their section's `encounter`   | 497 over 300 sections, all in `intro.ini` | So a leading group member is kept and reported, never refused — [DICTIONARY.md](DICTIONARY.md#todo)                          |
| `[Zone] faction_weight` properties preceding every `encounter`      | all 5,611, in every file                  | It is zone-level, not a member of the `encounter` run                                                                        |
| Section names spelled more than one way                             | 6                                         | Every lookup folds case — [INI.md](INI.md#case)                                                                             |
| Property names spelled more than one way                            | 32                                        | Same                                                                                                                        |
| Sections that always carry a `nickname`                             | 108 of 256                                | The archetype/positional split — [SCHEMA.md](SCHEMA.md#identity-and-nicknames)                                              |
| Sections that never do                                              | 136                                       | Same                                                                                                                        |
| Sections that sometimes do                                          | 3 (`Sound`, `Voice`, `TrueType`)          | Each is a real split, not an inconsistency                                                                                  |
| Most values in one property                                         | 25 (format allows 255)                    |                                                                                                                             |
| Most properties in one section                                      | 3,126                                     |                                                                                                                             |
| Longest property name                                               | 49 characters                             |                                                                                                                             |
| Files in `DATA` colliding when the whole path is case-folded        | 0 of 8,368                                | A folded index resolves unambiguously; no spelling probe needed — [GAME.md](GAME.md#case)                                   |
| `[Data]` properties / distinct keys                                 | 99 / 34                                   | The property name selects the reader; order is load-bearing — [GAME.md](GAME.md#data--99-properties-34-keys)                |
| `[Data]` keys carrying no value                                     | 1 (`bases`)                               | A key can mark a position in the load order rather than name a file — same                                                  |
| `[Data]` entries that do not resolve                                | 1 (`fonts_dir = fonts\files\`)            | The one dangling reference in the load list; reported, not a fault — same                                                    |
| Resource DLLs / the one `[Resources]` omits                         | 7 / `resources.dll` at index 0            | Missing it shifts every `ids_name` by 0x10000 — [RESOURCE.md](RESOURCE.md)                                                   |
| Names / infocards across the seven libraries                        | 13,121 / 5,307                            | Same                                                                                                                        |
| INI paths compiled into the binaries and absent from `[Data]`       | 58 (of 79 strings swept)                  | `[Data]` is not the whole load list — [GAME.md](GAME.md#what-data-does-not-say)                                             |
| `[VisEffect]` resolving by case-sensitive vs folded hash            | 1,210 vs 1,150 of 1,218                   | `effect_crc` is `getResourceId(name, true)`; folded is a strict subset — [FX.md](FX.md)                                     |
| `[VisEffect]` texture references, and unresolved among them         | 3,818 / 0                                 | The folded path index against real data                                                                                     |
| Fuse scripts on disk vs loaded                                      | 209 / 192                                 | Walk the load list, not the tree — [GAME.md](GAME.md#why-reading-the-list-beats-walking-the-tree)                           |
| Fuse actions, and those appearing before any `[fuse]`               | 1,960 / 0                                 | The grouping is total; a run always has an owner — [FX.md](FX.md#a-fuse-is-a-script-not-a-record)                           |
| Fuse actions carrying `at_t`, and those carrying two values         | 1,921 / 17                                | `at_t` is optional and keeps its arity — same                                                                               |

## Round-trip fidelity

What each module reproduces when a retail file is read and written back. **Writing is a fixed point
everywhere** — what is written reads back identical and writes again to the same bytes — which is
the weaker guarantee that still holds where byte-exactness does not.

The UTF asset modules:

| Module | Byte-exact | What cannot round-trip |
| --- | --- | --- |
| Material | all 7,525 materials | file order inside a material: the writer emits the authored order (6,569 files), not the case-insensitive sorted order a second tool used (956) |
| Deformable | all 204 models | nothing of its own — see the constraint residue below |
| Texture | 4,447 DirectDrawSurfaces, both cubemaps, 12 animated textures, 629 of 2,400 Targa chains | 1,668 colour-mapped chains (palette not carried), 102 16-bit (expansion to 24 does not invert), 1 declaring attribute bits — all come back larger with the same pixels |
| Alchemy | 596 effect files, less the two cases opposite | `Pair` record order (146 files); the empty string has two retail encodings and the writer emits one (2 files) — both authoring residue, links and values identical either way |
| Animation | — | 55 keyframes whose source data is out of encoding range |
| Compound | — | every constraint record leaves stack residue past the terminator of its two 64-byte name fields — all 9,096 deformable and all 5,316 rigid records. `writeConstraints` zero-fills |

The text formats and the resource DLLs:

| Layer                                   | Result                                                                               |
| --------------------------------------- | ------------------------------------------------------------------------------------ |
| BINI → interim → BINI                   | **Byte-exact, 1,251 of 1,251**                                                       |
| BINI → interim → text → interim → BINI  | **Byte-exact, 1,251 of 1,251**                                                       |
| text → interim → text                   | Fixed point over all 1,252 files                                                     |
| save body → unmasked → save body        | **Byte-exact**; the mask is its own inverse over the exact bytes                     |
| save → interim → save                   | Fixed point over both `.fl` files                                                    |
| THN bytecode → interim → text → interim | **Exact** over all 1,506 scripts                                                     |
| THN typed → interim → typed             | **Identity** over all 1,506                                                          |
| THN interim → typed → interim           | Fixed point; 3 of 1,506 are exact and 72 more differ only in how numbers are spelled |
| DLL → resources → DLL                   | **Exact** over all 37 DLLs in `EXE`                                                  |
| resources → `.rsrc` section             | **Byte-identical to retail**, 5 libraries of 7 exactly, 2 as a strict prefix         |
| INI interim → typed → interim           | Pending the typed layer                                                              |

Details and the reasoning behind each gap live in [MATERIAL.md](MATERIAL.md),
[DEFORMABLE.md](DEFORMABLE.md), [TEXTURE.md](TEXTURE.md), [ALCHEMY.md](ALCHEMY.md),
[ANIMATION.md](ANIMATION.md), [COMPOUND.md](COMPOUND.md), [INI.md](INI.md), [THN.md](THN.md) and
[RESOURCE.md](RESOURCE.md).

On the INI side the obstacle known in advance — **dictionary emission order** — turned out not to be
one. The order is derivable (names in first-use order, then values in first-use order, one shared
dedup table), and re-emitting the corpus under that rule reproduces every file. Two things carry the
trip out through text and back: float rendering searches for the shortest decimal that reads back as
the same `float32` and always keeps a `.`, so one of the 14,209 integral floats does not return as
an integer; and a whole number too large for `int32` stays a _string_ rather than becoming a float,
because `initialworld.ini` writes `locked_gate = 2926089285`, which is
`getObjectId('St01_to_St02_hole')` read unsigned, and as a float32 it would come back 2,926,089,248
and resolve to nothing.

## Quirks a sweep will hit

Collected so a reader recognizes them instead of treating them as bugs.

| Quirk                               | Where                                                                                  | Detail                                                                                               |
| ----------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| The one text data file              | `initialworld.ini`                                                                     | Also pads numbers with **U+00A0**, not spaces                                                        |
| A section commented out by its name | `EXE/freelancer.ini`                                                                   | `[;Display]` — a section named `;Display`                                                            |
| `=` inside a section name           | `INTERFACE/keymap.ini`                                                                 | `[keymap=1.1]`                                                                                       |
| A space inside a section name       | `SOLAR`                                                                                | `[Exclusion Zones]`                                                                                  |
| A space inside a property name      | `MISSIONS/M12/m12.ini`                                                                 | `[Trigger] system St02`                                                                              |
| A purely numeric property name      | `UNIVERSE/SYSTEMS/IW01/iw01.ini`                                                       | `[Object] 260800`                                                                                    |
| Stray zero-value properties         | `FX/fuse_br_battleship.ini`, `FX/fuse_ku_gunship.ini`, `INTERFACE/BASESIDE/navbar.ini` | `ONLY`, `age_fire`, and `mesh` / `behavior` / `event` ×14                                            |
| Backslash paths, wrong case         | everywhere `file =` appears                                                            | `Universe\Systems\Li01\Bases\…` — needs separator translation and case-folded lookup                 |
| Doubled backslashes                 | `[Trigger] Act_CallThorn`, `act_AddRTC`                                                | `missions\\m12\\M12_Osiris.thn` beside `missions\m11\M11_Walker1.thn` — collapse repeated separators |
| `@include`                          | `EXE/dacom.ini`                                                                        | Opens with `@include FL_Dev.ini`; unresolved whether the game honours it                             |
| One extension, two encodings        | `EXE/newplayer.fl`, `EXE/mpnewcharacter.fl`                                            | Only the first is masked; the second is plain text INI full of `%%NAME%%` placeholders               |
| U+00A0 padding again                | `EXE/newplayer.fl`                                                                     | 12 bytes of it, on four `locked_gate` lines — the same authoring habit as `initialworld.ini`         |
| A file present but never loaded     | `FX/fuse_li_battleship.ini`                                                            | Absent from `[Data] fuses`, so 209 fuse scripts on disk are 192 in the game — [GAME.md](GAME.md)      |
| A `[Data]` entry pointing at nothing | `fonts_dir = fonts\files\`                                                             | `DATA/FONTS` holds only `fonts.ini` and `rich_fonts.ini`; the one dangling reference in the load list |
| Dead `[VisEffect]` references       | `FX/SHIELDS/shields_ale.ini`                                                           | `gf_{br,ku,li,rh}_shield0{2,3}` name a `…shield01.ale` defining only `…shield01` — 8 of 1,218         |
| A property name that is punctuation | `FX/effects_explosion.ini`                                                             | `[Effect] :` = a row of `=` signs — a separator line written without a comment marker                |
| Uppercase directories, lowercase files | the whole `DATA` tree                                                                | Why `missions\mBases.ini` needs `MISSIONS/mbases.ini`; 8,368 files, 0 folded collisions              |

The 1,506 `.thn` files are **not INI** — all of them are compiled Lua 3.2, and they are read by
`./thn`. See [THN.md](THN.md) so a sweep does not try to parse one as INI, and does not write one
off as code: they hold no functions and no control flow, only `duration`, `entities` and `events`.
Two of their own quirks belong on this list:

| Quirk                          | Where                               | Detail                                                                                                    |
| ------------------------------ | ----------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Two export forms               | 355 scripts, mostly `SCRIPTS/STORY` | Numbers where the other 1,151 use identifiers — `type = 9` for `type = SCENE`, `up = 1` for `up = Y_AXIS` |
| Arrays stored as a `1..n` hash | the same 355                        | 76,447 tables; the same table to Lua, a different instruction in the bytecode, and preserved as written   |

Both forms are in live use — 275 of the 355 are named by INI data, from the same properties that
name the symbolic ones. See [THN.md](THN.md#both-export-forms-are-in-live-use).

## openFLAME leftovers

Five retail files carry trees from **openFLAME**, the engine behind Digital Anvil's earlier
*Conquest: Frontier Wars*. They share the UTF container with Freelancer and nothing else: the game
cannot load them, no `.ini` names them, and no module here interprets their content. They are listed
so a sweep of retail data recognizes them instead of mistaking them for an unread Freelancer
structure — **find them, skip them, do not implement them.**

| File | Root nodes | Content |
| --- | --- | --- |
| `EQUIPMENT/MODELS/HARDWARE/no_cargo_extender.3db` | `openFLAME 3D N-mesh`, `Rigid body` | Pre-VMesh geometry, plus a nested `Material library` and `Texture library` |
| `EQUIPMENT/MODELS/HARDWARE/no_invulnerability.3db` | same | same |
| `EQUIPMENT/MODELS/HARDWARE/no_key.3db` | same | same |
| `EQUIPMENT/MODELS/HARDWARE/no_power_boost.3db` | same | same |
| `SOLAR/BLACKHOLE/bh_flute4.pte` | `Particle Event`, `Rigid body` | `particle1.Def`, an `Animation library`, a paletted `Texture library`, `Scale`, `PointExtent` |

The four `.3db` files are openFLAME end to end — their root holds `Exporter Version` and the two
trees, and no Freelancer geometry at all. `bh_flute4.pte` is the only `.pte` in the data.

### The vocabulary is the marker, not the extension

openFLAME geometry is `Vertices` / `Edges` / `Normals` / `Face groups` (a space, where Freelancer
writes `Face_groups`) over `Object vertex list`, `Face vertex chain` and `Face D-coefficient`. Its
materials key on `Material identifier` and nest `Ambient` / `Diffuse` / `Specular` / `Transparency`
directories each with a `Map` subdirectory, where a Freelancer material holds only flat property
files. Its textures are `Palette 8 bit` with `Image indices` and `Palette RGB 888`. `Rigid body`
wraps `Mass properties` and either an `Extent tree` or, in the `.pte`, an `Extent data` /
`Bounding volume` pair.

**None of these names occurs in a Freelancer-authored asset**, which is what makes the test cheap.

### Every reader already yields nothing, deliberately

`readVMeshLibrary` reads an openFLAME root as an empty library. `readTextures` and `readMaterials`
come back empty because both libraries are nested inside the openFLAME tree rather than sitting at
the file root where those readers look. Reaching an entry directly is covered too — `readTexture`
returns `undefined` on a paletted entry rather than guessing. Nothing throws.

The two paletted texture forms nest oppositely, so neither reader can assume the other: the `.3db`
files put `MIP0..n` **under** `Palette 8 bit`, while the `.pte` puts a `Palette 8 bit` under **each**
`MIP0..n` and adds `U wrap mode` / `V wrap mode`.

See [TEXTURE.md](TEXTURE.md) for the paletted layout, [MATERIAL.md](MATERIAL.md) for the nested
library, and [COMPOUND.md](COMPOUND.md) for the shared joint lineage — the one place the two engines
genuinely overlap, since Freelancer's joint records are Conquest structures unchanged.

### `FX/MISC/tlrtube.3db` is not one of them

It was grouped with these for a long time on the strength of being pre-VMesh. Its vocabulary is
Freelancer's own, it carries no openFLAME marker, and what it is residue of is `FxMeshAppearance` —
an unfinished Freelancer feature that crashes the game when a particle spawns for that appearance.
It stays unread because there is no working in-game behaviour to validate a reader against, not
because another engine authored it. The full argument is in [RIGID.md](RIGID.md).

## TODO — what is pending in the game

Questions the corpus cannot answer, because the answer is a behaviour rather than a byte. Each
module document carries its own `TODO` section with the full argument and the experiment; this is
the index. **Everything listed reads, writes and round-trips today** — the reader picks the reading
that cannot go visibly wrong, and the open question is which reading is right.

| Question | Where | Experiment |
| --- | --- | --- |
| `TransformFlags` bits 2, 8, 9, 16, 18 — constant across all 5,590 retail transforms, so not a channel selector; what they select is unknown | [ALCHEMY.md](ALCHEMY.md#todo) | Clear one bit at a time on `gf_explosion_debris_trail01.ale` and fly |
| Easing type 6, used only by `FLDustAppearance` and by both of its instances | [ALCHEMY.md](ALCHEMY.md#todo) | One-byte edit to `dust.ale`, set it to 4 and fly; `todo` test |
| A key landing on the end of a curve carrying no wrap flags — fold or hold | [ALCHEMY.md](ALCHEMY.md#todo) | Source `TODO`; `todo` test |
| The four version-1.1 `Effect` floats — a bounding sphere, unconfirmed | [ALCHEMY.md](ALCHEMY.md#todo) | Inflate `unknown4` and watch culling |
| Texture flag bits 4 and 6 — the wrap mode field the DLL proves is there | [MATERIAL.md](MATERIAL.md#todo) | Clear bit 4 on a detail material's `Bt_flags` |
| What `MAFlags` selects — only `2` and `0` occur, across 82 entries | [RIGID.md](RIGID.md#todo) | Flip it on the Bizmark banner |
| Whether `MAKeys` or `MADeltas` drives the UV transform | [RIGID.md](RIGID.md#todo) | Zero one file, then the other |
| Whether Freelancer honours the Targa top-left origin bit | [TEXTURE.md](TEXTURE.md#todo) | Look at the nine chains that set it |
| `DDSCAPS_ALPHA` on a cubemap — format-driven or always | [TEXTURE.md](TEXTURE.md#todo) | Write an opaque cubemap and load it |
| Whether anything reads `Edge_angles` | [DEFORMABLE.md](DEFORMABLE.md#todo) | Delete them from one of the two files |
| Whether the engine still decodes a `0x08` event channel | [ANIMATION.md](ANIMATION.md#todo) | Author one and load the model |
| Whether the shipped game honours `@include` or whether it was a build-tool directive | [INI.md](INI.md#todo) | Add one to a text INI the game reads |
| First-wins or last-wins for a repeated scalar property — read as **last-wins**, visible on five fields in three `[start_effect]` sections | [SCHEMA.md](SCHEMA.md#todo) | Duplicate a scalar and observe |
| Whether a zero-value property is true by presence — derived from the missing-parameter error, not observed | [INI.md](INI.md#todo) | Author `separable = false` and see whether the group detaches |
| Whether `[Zone] faction` binds to the `encounter` preceding it, given `intro.ini` writes 497 that do not | [DICTIONARY.md](DICTIONARY.md#todo) | Two encounters, disjoint faction weights, observe who spawns |
| Whether `[Sound]`'s two shapes are one section disambiguated by file, or two sharing a name — read as **two**, since `[Group]` and `[Pilot]` split with a null intersection | [SCHEMA.md](SCHEMA.md#todo) | Move a voice-bank `[Sound]` into `sounds.ini` |
| Whether `[BaseGood] MarketGood`'s eight positions mean what the wiki says, and what the optional eighth does | [DICTIONARY.md](DICTIONARY.md#todo) | Add an eighth value to a seven-value row and watch the market |
| Whether `[LOD]`, `[Layer]`, `[CollisionGroup]`, `[Skeleton]` and `mbases.ini`'s runs are owned by position the way `[fuse]`'s are | [DICTIONARY.md](DICTIONARY.md#todo) | Move a `[LOD]` above its `[Gun]` and see which weapon it applies to |
| Whether `[Zone] toughness` and `sort` are read at all, as the wiki says they are not | [DICTIONARY.md](DICTIONARY.md#todo) | Change `toughness` on a zone with no `encounter` difficulty |
| Whether a `[Trigger]`'s `Act_*` order is the firing order | [DICTIONARY.md](DICTIONARY.md#todo) | Give one trigger two ordered actions with observable effects |
| Whether `inherit` merges a `[Pilot]` field by field or wholesale | [AI.md](AI.md#todo) | Give a pilot an `inherit` and a single `gun_id`, and see where its `job_id` comes from |
| What `[MetaBehavior] MB_GotoGuide`'s eight positions are — not decoded, six sections with one sample each | [AI.md](AI.md#todo) | Change one position at a time in `m10.ini` and watch the escorted ship |
| Whether `fire_style = single` does what the wiki says, given retail is `multiple` ×98 | [AI.md](AI.md#todo) | Set a gun block to `single` and count the weapons firing |
| Whether the pilot fields that are `0` in every retail occurrence do anything | [AI.md](AI.md#todo) | Set each to a large value and watch an evading fighter |
| Whether `[JobBlock] attack_preference`'s third position is a bitfield or a single symbolic name | [AI.md](AI.md#todo) | Combine two flag names in one row |
| Whether trailing values past a field's known arity are read or ignored | [SCHEMA.md](SCHEMA.md#todo) | Extend a known field by one value |
| What the 4-byte gap and header bytes 19–20 of a compiled `.thn` hold | [THN.md](THN.md#todo) | **Read Lua 3.2's `ldump.c`/`lundump.c` first** — probably not a game question at all |
| What the five unplaced event values are — 0, 1, 12, 17, 19 | [THORN.md](THORN.md#todo) | Write a script using one of the names symbolically and see whether the event fires |
| What `event_flags` means; bits 1, 2 and 128 occur and 128 dominates | [THORN.md](THORN.md#todo) | Flip a bit on a `START_MOTION` in a scene that plays |
| Which bit is `PATH_POSITION` and which is `USE_SCRIPT_DURATION` | [THORN.md](THORN.md#todo) | Bit 16 is unclaimed in the attach namespace; suggestive, not evidence |
| Whether a rewritten `resources.dll` loads with no entry point | [RESOURCE.md](RESOURCE.md#todo) | Replace it with a rewritten one and start the game |
| Whether an eighth resource library is honoured | [RESOURCE.md](RESOURCE.md#todo) | Add a `DLL =` line and reference an id at `0x70000` |
| What a two-value `at_t` means — read as a min/max the game picks a moment from, on three lines of corroboration | [FX.md](FX.md#todo) | Give two `destroy_hp_attachment` actions the same wide window and watch whether they come off together |
| What `lifetime` bounds, given 61 timed actions fire after their fuse's, one by 100× | [FX.md](FX.md#todo) | Set `lifetime` below an action's `at_t` and see whether it still fires |
| Whether the eight dead shield `[VisEffect]` references are ignored or fall back to the `01` effect | [FX.md](FX.md#todo) | Fit a ship with `gf_br_shield02` and see whether anything draws |
| Whether trailing values past a beam field's known arity are read | [FX.md](FX.md#todo) | Extend `tip_color` by a fourth value |
| Whether `fonts_dir` is dead or the game creates `FONTS/files` at runtime | [GAME.md](GAME.md#todo) | Watch file opens under `FONTS` with `[Error] log = $Text, 'f'` |
| Whether a `[Data]` key the engine does not know is ignored or is an error | [GAME.md](GAME.md#todo) | Add an invented key to `[Data]` and see whether the game starts |
| Whether `FX/fuse_li_battleship.ini` is unreachable or reached another way | [GAME.md](GAME.md#todo) | Add it to `[Data] fuses` and see whether a Liberty battleship's death changes |
| Whether the resource language must be `0x409` | [RESOURCE.md](RESOURCE.md#todo) | Write a library at `LANG_NEUTRAL` and see whether its strings resolve |
| Whether the resource code page field is read at all | [RESOURCE.md](RESOURCE.md#todo) | Change it and observe; expected to be invisible |

Some questions that look like they belong here do not.

**Cylinder joint animation is impossible**, not unimplemented — a cylinder needs 2 floats and no
combination of the channel type bits comes to 2 ([ANIMATION.md](ANIMATION.md)). **`FX/MISC/tlrtube.3db`'s
animated UV set is blocked, not pending** — validating a reader for it needs `FxMeshAppearance` to
stop crashing first ([RIGID.md](RIGID.md#todo)).

Closed: what numeric values THORN's identifiers have — the numeric-form scripts resolve all 41,250
retail entities and 50,785 events by structural correspondence, cross-checked against `thorn.dll`'s
string-table order and against `D3DLIGHTTYPE` and `D3DFOGMODE` ([THORN.md](THORN.md)). Closed:
whether a plain-text `.thn` loads from the packed install — it does, observed in game
([THN.md](THN.md#the-engine)). Closed: whether the Lua 3.2 opcode numbering is right — the
per-opcode counts over all 1,506 scripts reproduce the disassembly table exactly
([THN.md](THN.md#todo)). Closed: whether the game accepts text where retail ships BINI — it does, as
a fallback for any file lacking the signature; BINI itself is parsed natively by a second parser in
the same class, not decompiled to text ([INI.md](INI.md#ini-and-bini)). Closed: how a boolean
payload encodes truth — byte 0, nonzero is true, found by disassembly
([INI.md](INI.md#booleans-do-not-occur)). Closed: whether retail's BINI dictionary order is
derivable — it is, and reproducing it round-trips all 1,251 files byte-exactly
([INI.md](INI.md#round-trip)).

---

[UTF.md](UTF.md) · [VMESH.md](VMESH.md) · [COMPOUND.md](COMPOUND.md) · [RIGID.md](RIGID.md) ·
[ANIMATION.md](ANIMATION.md) · [SURFACE.md](SURFACE.md) · [ALCHEMY.md](ALCHEMY.md) ·
[TEXTURE.md](TEXTURE.md) · [MATERIAL.md](MATERIAL.md) · [DEFORMABLE.md](DEFORMABLE.md) ·
[INI.md](INI.md) · [SCHEMA.md](SCHEMA.md) · [MODULES.md](MODULES.md) · [THN.md](THN.md) ·
[THORN.md](THORN.md) · [RESOURCE.md](RESOURCE.md) · [AUDIO.md](AUDIO.md) ·
[RENDERER.md](RENDERER.md)
