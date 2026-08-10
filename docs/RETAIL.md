# Retail data

The retail Freelancer install as it bears on the format layer this package is: where the corpus is,
what is in it, how faithfully each format module reproduces it, which files are not Freelancer's at
all, and what has actually been measured versus what is assumed. Per-format detail stays in the
module documents. **This package is the format layer and nothing above it** — nothing here
interprets what a section name means or which files an install loads, so no measurement below
concerns either.

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

`DATA/FONTS/rich_fonts.ini` is a third file outside any module's remit: its `[TrueType]` section is
the eight-entry table an infocard's font index means, and its `[Style]` section is the named styles a
card is rendered in. See [RDL.md](RDL.md).

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
| — RDL element names in them          | 7, and no others       |
| — `TRA` / `JUST` in them             | 3,123 / 1,756          |
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
| Boolean-typed values in retail                                      | 0 of 876,034                              | Writer never emits type `0x0`; a boolean is the *string* `true` — [INI.md](INI.md#booleans-do-not-occur)                    |
| Files re-emitted byte-exactly from the derived dictionary order     | 1,251 of 1,251                            | Dictionary order is derivable; nothing needs preserving out-of-band — [INI.md](INI.md#round-trip)                           |
| Largest BINI dictionary                                             | 64,492 bytes (`AUDIO/story_sounds.ini`)   | The uint16 ceiling is ~1 KiB away, so names-first is load-bearing — [INI.md](INI.md#the-uint16uint32-hazard)                |
| Largest name offset / largest string offset                         | 4,650 / 64,446                            | The pressure is entirely on the value region — same                                                                         |
| Bytes above `0x7F` in any BINI dictionary                           | 0                                         | The dictionary is ASCII; only the text path needs windows-1252 — [INI.md](INI.md#bini-form)                                 |
| Zero-value properties                                               | 1,063                                     | The document model must allow arity 0                                                                                       |
| Files repeating a section name                                      | 156                                       | Sections are an ordered list, never a map — [INI.md](INI.md#the-document-model)                                             |
| Most-repeated property                                              | `[Loadout] equip` ×16,074                 | Repeated properties are ordered lists                                                                                       |
| Pairs written both bare and with a value                            | 4, one of them boolean: `[CollisionGroup] separable`, bare ×456 and `= true` ×28, never `= false`, and `solararch.ini` writes it both ways | A bare property is a value left out and reads as `true`; a written value is honoured — [INI.md](INI.md#how-the-game-reads-a-value) |
| Section names spelled more than one way                             | 6                                         | Every lookup folds case — [INI.md](INI.md#case)                                                                             |
| Property names spelled more than one way                            | 32                                        | Same                                                                                                                        |
| Most values in one property                                         | 25 (format allows 255)                    |                                                                                                                             |
| Most properties in one section                                      | 3,126                                     |                                                                                                                             |
| Longest property name                                               | 49 characters                             |                                                                                                                             |
| Resource DLLs / the one `[Resources]` omits                         | 7 / `resources.dll` at index 0            | Missing it shifts every `ids_name` by 0x10000 — [RESOURCE.md](RESOURCE.md)                                                   |
| Names / infocards across the seven libraries                        | 13,121 / 5,307                            | Same                                                                                                                        |
| All-hole `RT_STRING` blocks, all in `offerbriberesources.dll`       | 141 of 232                                | A rewrite carries a vacant block; nothing in a string map can reproduce one — [RESOURCE.md](RESOURCE.md#rt_string--every-ids_name) |
| `JUST` elements preceding the text they align                       | 1,756 of 1,756                            | Alignment is state set *before* a paragraph, not a property of an open one — [RDL.md](RDL.md#just-precedes-the-text-it-aligns-and-persists) |
| Largest `TRA` mask in retail                                        | never `0xFFFFFFFF`; commonest is `1`      | Unmasked bits keep their value, so the merge has three terms — [RDL.md](RDL.md#tra-merges-and-unmasked-bits-keep-their-current-value) |
| Packed `TRA` triples written in decimal                             | 9,369 of 9,369                            | Signed decimal, so a high-bit mask reads as negative — [RDL.md](RDL.md#attribute-values-are-signed-decimal)                  |
| THORN globals `thorn.dll` registers / retail scripts read           | 73 / 55, with **none read that is not registered** | The vocabulary is closed, so an unrecognized identifier reads `nil` — [THORN.md](THORN.md#the-registry-is-closed)      |
| THORN globals registered twice                                      | 1 — `HARDPOINT`, as 8 then 1              | Last write wins, so `type = HARDPOINT` cannot reach the entity value — [THORN.md](THORN.md#entity-types)                     |
| Object types named in `common.dll` / bits unclaimed                 | 28 flags plus `NONE` / 2                  | `[Solar] type` and `[Ship] type` share one bitfield — [ENGINE.md](ENGINE.md#object-types)   |
| `[Solar] type` / `[Ship] type` values set                           | 321 over 14 spellings / 115 over 7        | One of the 14 is `waypoint` lowercase, which is how the fold is known — same                                                 |
| `hp_type` values set / distinct names / registered                  | 1,350 / 61 / 63                           | Closed the same way THORN's is; nothing set is unregistered — [ENGINE.md](ENGINE.md#hardpoint-types) |
| `[Zone] shape` values set                                           | 5,761 over 4 of the 6 registered          | `RING` and `MESH` are never used — [ENGINE.md](ENGINE.md#zone-shapes)                                  |

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

The INI figures above are the interim model's, measured through both encodings. There is no row
above the interim document because there is nothing above it here.

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

Collected so a reader recognizes them instead of treating them as bugs. **Resolving a path once it
is read — case folding, separator translation, which file the load order actually reaches — is not
covered here**, because nothing in this package opens a file; the consumer supplies the loader.

| Quirk                               | Where                                                                                  | Detail                                                                                               |
| ----------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| The one text data file              | `initialworld.ini`                                                                     | Also pads numbers with **U+00A0**, not spaces                                                        |
| A section commented out by its name | `EXE/freelancer.ini`                                                                   | `[;Display]` — a section named `;Display`                                                            |
| `=` inside a section name           | `INTERFACE/keymap.ini`                                                                 | `[keymap=1.1]`                                                                                       |
| A space inside a section name       | `SOLAR`                                                                                | `[Exclusion Zones]`                                                                                  |
| A space inside a property name      | `MISSIONS/M12/m12.ini`                                                                 | `[Trigger] system St02`                                                                              |
| A purely numeric property name      | `UNIVERSE/SYSTEMS/IW01/iw01.ini`                                                       | `[Object] 260800`                                                                                    |
| Stray zero-value properties         | `FX/fuse_br_battleship.ini`, `FX/fuse_ku_gunship.ini`, `INTERFACE/BASESIDE/navbar.ini` | `ONLY`, `age_fire`, and `mesh` / `behavior` / `event` ×14                                            |
| `@include`                          | `EXE/dacom.ini`                                                                        | Opens with `@include FL_Dev.ini`; unresolved whether the game honours it                             |
| One extension, two encodings        | `EXE/newplayer.fl`, `EXE/mpnewcharacter.fl`                                            | Only the first is masked; the second is plain text INI full of `%%NAME%%` placeholders               |
| U+00A0 padding again                | `EXE/newplayer.fl`                                                                     | 12 bytes of it, on four `locked_gate` lines — the same authoring habit as `initialworld.ini`         |
| A property name that is punctuation | `FX/effects_explosion.ini`                                                             | `[Effect] :` = a row of `=` signs — a separator line written without a comment marker                |
| An id compiled to an integer        | `UNIVERSE/SYSTEMS/LI0*`, `IW0*`, `INTRO`                                               | `[Zone] attack_ids = 18, 22`, where Bretonia writes `br01_2` — one `lane_id` reference, two tags     |

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
the index for the format layer. **Everything listed reads, writes and
round-trips today** — the reader picks the reading that cannot go visibly wrong, and the open
question is which reading is right.

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
| What the 4-byte gap and header bytes 19–20 of a compiled `.thn` hold | [THN.md](THN.md#todo) | **Read Lua 3.2's `ldump.c`/`lundump.c` first** — probably not a game question at all |
| What `event_flags` means; bits 1, 2 and 128 occur and 128 dominates | [THORN.md](THORN.md#todo) | Flip a bit on a `START_MOTION` in a scene that plays |
| What `STOP` = 21, `STOP_IK` = 22 and `START` = 23 are for | [THORN.md](THORN.md#todo) | Registered, never used, fitting no table; issue one as an `action` |
| Whether `PROPERTY_ANIM`, `ADD_PATH` and `LOOKAT_ENTITY` do anything | [THORN.md](THORN.md#todo) | Same shape; a `nil` result would say they are vestigial |
| Whether a rewritten `resources.dll` loads with no entry point | [RESOURCE.md](RESOURCE.md#todo) | Replace it with a rewritten one and start the game |
| Whether the resource language must be `0x409` | [RESOURCE.md](RESOURCE.md#todo) | Write a library at `LANG_NEUTRAL` and see whether its strings resolve |
| Whether the resource code page field is read at all | [RESOURCE.md](RESOURCE.md#todo) | Change it and observe; expected to be invisible |
| Whether an infocard's alignment really persists across `PARA` | [RDL.md](RDL.md#todo) | Retail always restates `left`, so both readings render identically — write a card that does not |
| What the `TRA` mask bits above the colour do | [RDL.md](RDL.md#todo) | Set one with a mask that reaches it and look |
| Whether anything after `POP` is read | [RDL.md](RDL.md#todo) | No card has anything there, so nothing separates "stops" from "ends" |
| What object-type values 0–3 and `HpAttachmentType` 0–3 are | [ENGINE.md](ENGINE.md#todo) | Both enums start at 4; no string reaches the low values |
| Whether `RING` and `MESH` zone shapes work | [ENGINE.md](ENGINE.md#todo) | Registered, never used by retail — author a zone with each |
| Whether `MOON`, `BLACKHOLE` and `ASTEROID` do anything as a `[Solar] type` | [ENGINE.md](ENGINE.md#todo) | Named, never set; `ASTEROID`'s bit sits far from the other solar bits |
| Which of `attack_subtarget_order` and `attack_preference` takes which values | [ENGINE.md](ENGINE.md#todo) | `content.dll` has no table; emission order puts one run beside both |

Some questions that look like they belong here do not.

**Cylinder joint animation is impossible**, not unimplemented — a cylinder needs 2 floats and no
combination of the channel type bits comes to 2 ([ANIMATION.md](ANIMATION.md)). **`FX/MISC/tlrtube.3db`'s
animated UV set is blocked, not pending** — validating a reader for it needs `FxMeshAppearance` to
stop crashing first ([RIGID.md](RIGID.md#todo)).

Closed: what numeric values THORN's identifiers have — the numeric-form scripts resolve all 41,250
retail entities and 50,785 events by structural correspondence, and **`thorn.dll`'s
global-registration routine then gave all 73 registered globals outright**, agreeing with every one
of the 25 corpus measurements ([THORN.md](THORN.md#the-registration-routine-binary)). That also
closed the five unplaced event values and the `PATH_POSITION`/`USE_SCRIPT_DURATION` bits, both of
which had been carried as needing an experiment and needed only a closer read. Closed:
whether a plain-text `.thn` loads from the packed install — it does, observed in game
([THN.md](THN.md#the-engine)). Closed: whether the Lua 3.2 opcode numbering is right — the
per-opcode counts over all 1,506 scripts reproduce the disassembly table exactly
([THN.md](THN.md#todo)). Closed: whether the game accepts text where retail ships BINI — it does, as
a fallback for any file lacking the signature; BINI itself is parsed natively by a second parser in
the same class, not decompiled to text ([INI.md](INI.md#ini-and-bini)). Closed: how a boolean
payload encodes truth — byte 0, nonzero is true, found by disassembly
([INI.md](INI.md#booleans-do-not-occur)). Closed: whether retail's BINI dictionary order is
derivable — it is, and reproducing it round-trips all 1,251 files byte-exactly
([INI.md](INI.md#round-trip)). Closed: whether more than seven resource libraries are honoured —
they are, measured against Discovery, which lists eight `DLL =` entries and runs nine bands up to
`0x80000`; the same install also shows a shared image base is harmless
([RESOURCE.md](RESOURCE.md#the-id-space)).

---

[UTF.md](UTF.md) · [VMESH.md](VMESH.md) · [COMPOUND.md](COMPOUND.md) · [RIGID.md](RIGID.md) ·
[ANIMATION.md](ANIMATION.md) · [SURFACE.md](SURFACE.md) · [ALCHEMY.md](ALCHEMY.md) ·
[TEXTURE.md](TEXTURE.md) · [MATERIAL.md](MATERIAL.md) · [DEFORMABLE.md](DEFORMABLE.md) ·
[INI.md](INI.md) · [THN.md](THN.md) · [THORN.md](THORN.md) · [RESOURCE.md](RESOURCE.md) ·
[RDL.md](RDL.md) · [AUDIO.md](AUDIO.md) · [ENGINE.md](ENGINE.md) · [RENDERER.md](RENDERER.md)
