# Retail data

The retail Freelancer install as it bears on the format layer this package is: where the corpus is,
what is in it, how faithfully each format module reproduces it, which files are not Freelancer's at all,
and what has actually been measured versus what is assumed. Per-format detail stays in the module
documents, each of which carries its own **Corpus** chapter; this one is the index across them.

**This package is the format layer and nothing above it** — nothing here interprets what a section name
means or which files an install loads, so no measurement below concerns either.

## The corpus

`src/corpus.ts` looks for a Freelancer `DATA` directory at **`$FREELANCER_DATA`**, falling back to
**`~/Downloads/Freelancer/DATA`**, and every `corpus.test.ts` suite skips itself with a reason when
neither exists. **The rest of the test suite never depends on retail data being present.**

Three sweeps, because the formats want different handles:

- `list(...extensions)` / `raw(...extensions)` — everything under `DATA` matching an extension,
  case-insensitively. `load(...extensions)` is the same sweep with each file parsed as a UTF tree.
- `glob(from, pattern)` — a glob under any root, which is what the text formats need: both INI encodings
  come back from one pattern, the scene scripts are spread across `SCRIPTS`, `MISSIONS` and
  `RANDOMMISSIONS`, and `EXE` is outside the `DATA` tree entirely.
- `executables` — the `EXE` directory, for the sweeps that reach it.

Two directories outside `DATA` matter:

- **`EXE/`** — `freelancer.ini`, `dacom.ini`, `dacomsrv.ini`, the three plain-text INIs and the only
  place `@include` appears; `newplayer.fl` and `mpnewcharacter.fl`, the two starting-state saves, read
  and written by `./ini/save`; and the seven **resource DLLs** every `ids_name` and `ids_info` resolves
  into. See [RESOURCE.md](RESOURCE.md).
- **`DLLS/`** — holds only `BIN/content.dll`, which carries a version block and nothing else. **The
  resource numbers do not resolve here**, a natural guess and a wrong one.

`DATA/FONTS/rich_fonts.ini` is a third file outside any module's remit: its `[TrueType]` section is the
table an infocard's font index means, and its `[Style]` section is the named styles a card is rendered
in. See [RDL.md](RDL.md).

Retail is the authority every reader here is measured against, so a claim about a format is worth only
the count behind it. Every number in these documents comes from a sweep of that install and the suites
assert them back through the readers — **they are regression tests, so a number that stops matching
means the reader drifted, not that the number needs updating.**

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
| Identifier reads                     | 155,259, over 55 names |
| Scene entities                       | 41,250                 |
| Scene events                         | 50,785                 |
| Resource DLLs under `EXE`            | 37, all readable       |
| — libraries Freelancer loads         | 7                      |
| Resources in those seven             | 6,653                  |
| — `RT_STRING` blocks                 | 1,334                  |
| — `RT_HTML` infocards                | 5,307                  |
| String slots (16 per block)          | 21,344, 13,121 filled  |

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

The asset side, in one place — each figure is the module document's, repeated here so a sweep knows
what it should find:

|                             | Count  | Document                            |
| --------------------------- | ------ | ----------------------------------- |
| `.cmp` / `.3db` models       | 1,852  | [RIGID.md](RIGID.md)                |
| Meshes                      | 2,178  | [VMESH.md](VMESH.md)                |
| Mesh groups                 | 22,416 | [VMESH.md](VMESH.md)                |
| Mesh references             | 8,792  | [VMESH.md](VMESH.md)                |
| Constraint records          | 14,412 | [COMPOUND.md](COMPOUND.md)          |
| Animation channels          | 143,679 | [ANIMATION.md](ANIMATION.md)       |
| `.sur` files / parts        | 798 / 1,365 | [SURFACE.md](SURFACE.md)       |
| Collision faces             | 177,824 | [SURFACE.md](SURFACE.md)           |
| Material libraries / materials | 1,429 / 7,525 | [MATERIAL.md](MATERIAL.md) |
| Texture libraries / textures | 1,417 / 6,869 | [TEXTURE.md](TEXTURE.md)     |
| Deformable models / bones   | 204 / 9,456 | [DEFORMABLE.md](DEFORMABLE.md) |
| `.ale` files / effects      | 596 / 1,213 | [ALCHEMY.md](ALCHEMY.md)       |
| Voice banks / waveforms     | 109 / 23,995 | [AUDIO.md](AUDIO.md)          |

## Round-trip fidelity

What each module reproduces when a retail file is read and written back. **Writing is a fixed point
everywhere** — what is written reads back identical and writes again to the same bytes — which is the
weaker guarantee that still holds where byte-exactness does not.

The UTF asset modules:

| Module     | Byte-exact                                                                                | What cannot round-trip                                                                                                                                                        |
| ---------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Material   | all 7,525 materials                                                                        | file order inside a material: the writer emits the authored order (6,569 files), not the case-insensitive sorted order a second tool used (956)                                |
| Deformable | all 204 models                                                                             | nothing of its own — see the constraint residue below                                                                                                                         |
| Texture    | 4,447 DirectDrawSurfaces, both cubemaps, 12 animated textures, 629 of 2,400 Targa chains  | 1,668 colour-mapped chains (palette not carried), 102 16-bit (expansion to 24 does not invert), 1 declaring attribute bits — all come back larger with the same pixels        |
| Alchemy    | 596 effect files, less the two cases opposite                                              | `Pair` record order (146 files); the empty string has two retail encodings and the writer emits one (2 files) — both authoring residue, links and values identical either way |
| Animation  | 143,679 channels, less the exception opposite                                              | 55 keyframes whose source data is out of encoding range                                                                                                                       |
| Compound   | —                                                                                          | every constraint record leaves stack residue past the terminator of its two 64-byte name fields — all 9,096 deformable and all 5,316 rigid records. `writeConstraints` zero-fills |
| Surface    | 574 of 781 files                                                                           | this writer emits ledges in tree order where IVP emits terminal ones first; a type-5 hull's `id` is a derived offset and is reassigned                                        |
| Audio      | every one of the 23,995 payloads                                                           | the container: `Directory` repacks it smaller and regenerates timestamps, so no bank matches retail byte for byte                                                              |

The text formats and the resource DLLs:

| Layer                                  | Result                                                                               |
| -------------------------------------- | ------------------------------------------------------------------------------------ |
| BINI → interim → BINI                  | **Byte-exact, 1,251 of 1,251**                                                       |
| BINI → interim → text → interim → BINI | **Byte-exact, 1,251 of 1,251**                                                       |
| text → interim → text                  | Fixed point over all 1,252 files                                                     |
| save body → unmasked → save body       | **Byte-exact**; the mask is its own inverse over the exact bytes                     |
| save → interim → save                  | Fixed point over both `.fl` files                                                    |
| THN bytecode → interim → text → interim | **Exact** over all 1,506 scripts                                                    |
| THN typed → interim → typed            | **Identity** over all 1,506                                                          |
| THN interim → typed → interim          | Fixed point; 3 of 1,506 are exact and 72 more differ only in how numbers are spelled |
| DLL → resources → DLL                  | **Exact** over all 37 DLLs in `EXE`                                                  |
| resources → `.rsrc` section            | **Byte-identical to retail**, 5 libraries of 7 exactly, 2 as a strict prefix         |

The INI figures are the interim model's, measured through both encodings. **There is no row above the
interim document because there is nothing above it here.**

On the INI side the obstacle known in advance — **dictionary emission order** — turned out not to be
one. The order is derivable, and re-emitting the corpus under that rule reproduces every file. The two
things that carry the trip out through text and back are in
[INI.md](INI.md#round-trip).

Details and the reasoning behind each gap live in each module's **Corpus** chapter.

## Measured facts and what they pin

Each of these decided a design position. The position is in the linked document; the number is here.

| Measurement                                                        | Value                                     | Pins                                                                                                                        |
| ------------------------------------------------------------------ | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Boolean-typed values in retail                                     | 0 of 876,034                              | Writer never emits type `0x0`; a boolean is the *string* `true` — [INI.md](INI.md#booleans-do-not-occur)                     |
| Files re-emitted byte-exactly from the derived dictionary order    | 1,251 of 1,251                            | Dictionary order is derivable; nothing needs preserving out-of-band — [INI.md](INI.md#round-trip)                            |
| Largest BINI dictionary                                            | 64,492 bytes (`AUDIO/story_sounds.ini`)   | The uint16 ceiling is ~1 KiB away, so names-first is load-bearing — [INI.md](INI.md#the-uint16uint32-hazard)                 |
| Bytes above `0x7F` in any BINI dictionary                          | 0                                         | The dictionary is ASCII; only the text path needs windows-1252 — [INI.md](INI.md#bini-form)                                  |
| Files repeating a section name                                     | 156                                       | Sections are an ordered list, never a map — [INI.md](INI.md#the-document-model)                                              |
| Most-repeated property                                             | `[Loadout] equip` ×16,074                 | Repeated properties are ordered lists — same                                                                                |
| Zero-value properties                                              | 1,063                                     | The document model must allow arity 0 — same                                                                                |
| Pairs written both bare and with a value                           | 4, one of them boolean                    | A bare property is a value left out and reads as `true`; a written value is honoured — [INI.md](INI.md#how-the-game-reads-a-value) |
| Section / property names spelled more than one way                 | 6 / 32                                    | Every lookup folds case — [INI.md](INI.md#case)                                                                             |
| String-typed values that parse as a number                         | 0 of 424,320                              | The tag is the token's shape, not the field's type — [INI.md](INI.md#the-tag-is-the-tokens-shape-not-the-fields-type)        |
| Resource DLLs / the one `[Resources]` omits                        | 7 / `resources.dll` at index 0            | Missing it shifts every `ids_name` by 0x10000 — [RESOURCE.md](RESOURCE.md#the-id-space)                                      |
| All-hole `RT_STRING` blocks, all in `OfferBribeResources.dll`      | 141 of 232                                | A rewrite carries a vacant block; nothing in a string map can reproduce one — [RESOURCE.md](RESOURCE.md#strings-and-cards)   |
| `JUST` elements preceding the text they align                      | 1,756 of 1,756                            | Alignment is state set *before* a paragraph, not a property of an open one — [RDL.md](RDL.md#just-precedes-the-text-it-aligns-and-persists) |
| Largest `TRA` mask in retail                                       | never `0xFFFFFFFF`; commonest is `1`      | Unmasked bits keep their value, so the merge has three terms — [RDL.md](RDL.md#tra-merges-and-unmasked-bits-keep-their-current-value) |
| Packed `TRA` triples written in decimal                            | 9,369 of 9,369                            | Signed decimal, so a high-bit mask reads as negative — [RDL.md](RDL.md#attribute-values-are-signed-decimal)                  |
| THORN globals registered / retail scripts read                     | 73 / 55, with **none read that is not registered** | The vocabulary is closed, so an unrecognized identifier reads `nil` — [THORN.md](THORN.md#the-registry-is-closed)   |
| THORN globals registered twice                                     | 1 — `HARDPOINT`, as 8 then 1              | Last write wins, so `type = HARDPOINT` cannot reach the entity value — [THORN.md](THORN.md#entity-types)                     |
| Object types named in `common.dll` / bits unclaimed                | 28 flags plus `NONE` / 2                  | `[Solar] type` and `[Ship] type` share one bitfield — [ENGINE.md](ENGINE.md#object-types)                                    |
| `[Solar] type` / `[Ship] type` values set                          | 321 over 14 spellings / 115 over 7        | One of the 14 is `waypoint` lowercase, which is how the fold is known — [ENGINE.md](ENGINE.md#object-types-1)                |
| `hp_type` values set / distinct names / registered                 | 1,350 / 61 / 63                           | Closed the same way THORN's is; nothing set is unregistered — [ENGINE.md](ENGINE.md#hardpoint-types-1)                       |
| `[Zone] shape` values set                                          | 5,761 over 4 of the 6 registered          | `RING` and `MESH` are never used — [ENGINE.md](ENGINE.md#zone-shapes-1)                                                      |
| `[Zone] property_flags` set / bits outside the 23 named            | 835 over 41 words / **0**                 | The one vocabulary with no table and no literal — [ENGINE.md](ENGINE.md#zone-property-flags-1)                               |
| Distinct property names in the data / matched by no binary         | 1,375 / **105**, 16,131 uses              | Keys the authoring pipeline emitted and the engine ignores — [ENGINE.md](ENGINE.md#the-105-keys-nothing-reads)               |
| Section names / section-property pairs in retail                   | 280 / 2,222, of which 110 unread          | The full enumeration — [SECTIONS.md](SECTIONS.md)                                                                           |
| Pairs added from the binaries that retail never writes             | 522 across 283 sections                   | `dispersion_angle` on `[Gun]` and the rest of the class chain — [SECTIONS.md](SECTIONS.md)                                   |
| Call-site segmentation corroborated, by boundary source            | 31% from exports / **94%** from call targets | Every address a direct `call` targets is a function start — [SECTIONS.md](SECTIONS.md#function-boundaries-come-from-call-targets-not-exports) |
| Matched sections read positionally rather than by name             | 15 of 35, 11 sharing one handler          | `[MsnShipSave]` accepts a sequence; no key is ever compared — [SECTIONS.md](SECTIONS.md#sections-the-engine-matches-that-retail-never-contains) |
| Matched sections that are **obsolete**                             | 10, nine from `RoomData.cpp`              | Header matched only to warn and skip; no property read by design — same                                                     |
| Property names with a declared value shape                         | 542 of 799                                | The accessor names the type and index — [SECTIONS.md](SECTIONS.md#declared-value-shapes)                                    |
| Names read differently in different sections                       | 11 genuine of 20 varying                  | The other 9 vary only by scan truncation — [SECTIONS.md](SECTIONS.md#the-same-name-is-not-always-read-the-same-way)          |
| Declared shape against recorded type                               | 315 exact / 176 coerced / **4 neither**   | Declared is what the engine wants, recorded is what the file holds — [ENGINE.md](ENGINE.md#declared-shapes-against-recorded-types) |
| Archetype classes recovered from the call graph                    | 29 exports, 28 distinct bodies            | No RTTI, but a virtual override calls its base — [SECTIONS.md](SECTIONS.md#what-each-archetype-class-reads)                  |
| Section-to-class binding confirmed by the dispatcher's constructor | 30 of 34, 2 absent, **2 corrected**       | `[Ship]` direct, `[Solar]` via its `EqObj` base — [SECTIONS.md](SECTIONS.md#which-class-consumes-which-section)              |
| `INI_Reader` matcher call sites / argument resolved                | 1,309 / 1,303 (99.5%)                     | Yields 799 keys and 208 sections — [ENGINE.md](ENGINE.md#call-site-resolution)                                              |
| `Freelancer.exe` `.text` entropy / standard prologues              | 7.98 / **0**, against 6.46 in the DLLs    | Retail's executable is SecuROM-wrapped; only `.rdata` is statically readable — [ENGINE.md](ENGINE.md#method-2--disassemble-the-call-sites) |
| Alchemy instance references resolved, case-sensitive vs folded     | 5,505 / 2,814                             | Alchemy is the one module that hashes case-sensitively — [ALCHEMY.md](ALCHEMY.md#hashing)                                    |
| Voice bank entries matching `getObjectId`, folded                  | 23,995 of 23,995; 0 unfolded, 0 by `getResourceId` | The bank hashes an INI nickname, not a UTF resource name — [AUDIO.md](AUDIO.md#the-hash-1)                          |
| `vertexEnd` inclusive in mesh groups                               | 22,416 of 22,416                          | Treating it as exclusive drops the last vertex of every group — [VMESH.md](VMESH.md#mesh-group)                              |
| Wireframe indices read as relative rather than absolute            | 718 of 718 groups disjoint; 717 collide the other way | `vertexStart` is a base offset, not the smallest index — [VMESH.md](VMESH.md#wireframe-indices-are-relative)      |
| Deformable `Index` matching directory position                     | 9,456 of 9,456                            | The bone table is ordered, so `Index` is derived on write — [DEFORMABLE.md](DEFORMABLE.md#bones-are-a-table-not-just-a-tree) |
| Collision face adjacency derived from the triangles alone          | 177,824 of 177,824                        | `opposites` is fully determined, and the winding with it — [SURFACE.md](SURFACE.md#what-the-derivations-reproduce)           |
| Pierce indices derived the same way                                | 151,761 of 177,824                        | The rest are ties broken in an order the compact ledge does not record — same                                               |
| Surface mass centre and radius derived from the hulls              | 1,365 of 1,365 parts                      | IVP's `insert_radius_in_compact_surface`, reproduced — same                                                                 |
| Surface deviation byte derived exactly                             | 1,349 of 1,365                            | The other 16 sit on a step and the truncation falls the other side — same                                                   |
| Rotation inertia derived exactly                                   | 2,067 of 4,095 components                 | Retail's figure predates the hull decimation, so the file is not what it was measured from — [SURFACE.md](SURFACE.md#todo)  |
| — the same, on parts whose hull encloses no volume                 | **84 of 84**, uniform across the axes     | The degenerate fallback is exactly right; 92 retail parts ship a uniform inertia and the game takes it — same               |
| — derived against MAXLancer's `0.2 × radius²`, per component       | 3,590 of 4,095 closer / retail's own mean ratio **0.137** | A constant wrong by 46% at the median ships in working mods, which bounds how much the residual gap matters — same |
| Leaf node sphere and box derived from the hull                     | 9,111 of 9,111 / 9,110 box triples        | Truncate-then-step-past, and the union of children's *quantized* boxes — [SURFACE.md](SURFACE.md#what-the-derivations-reproduce) |
| Alchemy `TransformFlags` words in retail                           | 2, across all 5,590 transforms            | The low bits cannot be a channel selector — [ALCHEMY.md](ALCHEMY.md#transformflags-never-varies)                             |
| Alchemy keyframe intervals that are not 1 wide                     | 9,322 of 9,324                            | Hermite tangents are per unit of key and must be scaled — [ALCHEMY.md](ALCHEMY.md#tangent-intervals)                         |

## Quirks a sweep will hit

Collected so a reader recognizes them instead of treating them as bugs. **Resolving a path once it is
read — case folding, separator translation, which file the load order actually reaches — is not covered
here**, because nothing in this package opens a file; the consumer supplies the loader.

| Quirk                               | Where                                                                                  | Detail                                                                                             |
| ----------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| The one text data file              | `initialworld.ini`                                                                     | Also pads numbers with **U+00A0**, not spaces                                                      |
| A section commented out by its name | `EXE/freelancer.ini`                                                                   | `[;Display]` — a section named `;Display`                                                          |
| `=` inside a section name           | `INTERFACE/keymap.ini`                                                                 | `[keymap=1.1]`                                                                                     |
| A space inside a section name       | `SOLAR`                                                                                | `[Exclusion Zones]`                                                                                |
| A space inside a property name      | `MISSIONS/M12/m12.ini`                                                                 | `[Trigger] system St02`                                                                            |
| A purely numeric property name      | `UNIVERSE/SYSTEMS/IW01/iw01.ini`                                                       | `[Object] 260800`                                                                                  |
| Stray zero-value properties         | `FX/fuse_br_battleship.ini`, `FX/fuse_ku_gunship.ini`, `INTERFACE/BASESIDE/navbar.ini` | `ONLY`, `age_fire`, and `mesh` / `behavior` / `event` ×14                                          |
| `@include`                          | `EXE/dacom.ini`                                                                        | Opens with `@include FL_Dev.ini`; unresolved whether the game honours it                           |
| One extension, two encodings        | `EXE/newplayer.fl`, `EXE/mpnewcharacter.fl`                                            | Only the first is masked; the second is plain text INI full of `%%NAME%%` placeholders             |
| U+00A0 padding again                | `EXE/newplayer.fl`                                                                     | 12 bytes of it, on four `locked_gate` lines — the same authoring habit as `initialworld.ini`       |
| A property name that is punctuation | `FX/effects_explosion.ini`                                                             | `[Effect] :` = a row of `=` signs — a separator line written without a comment marker              |
| An id compiled to an integer        | `UNIVERSE/SYSTEMS/LI0*`, `IW0*`, `INTRO`                                               | `[Zone] attack_ids = 18, 22`, where Bretonia writes `br01_2` — one `lane_id` reference, two tags   |
| A constraint naming an absent part  | `trade_turret01.cmp`                                                                   | `arrangeByConstraints` drops it and assembles the rest                                             |
| A material name with no terminator  | `SOLAR/SUNS/sun.sph`                                                                   | `M0` is exactly the four bytes `none`; the file grows by one byte on rewrite                       |
| A `.sur` with no signature          | 17 of 798                                                                              | An older layout the reader rejects rather than misreads — [SURFACE.md](SURFACE.md#files-that-predate-the-container) |
| A mesh reference resolving outside its own file | `INTERFACE/**`                                                             | 530 references into `INTERFACE/interface.generic.vms`, which the game loads unprompted             |

The 1,506 `.thn` files are **not INI** — all of them are compiled Lua 3.2. See [THN.md](THN.md) so a
sweep does not try to parse one as INI, and does not write one off as code: they hold no functions and
no control flow, only `duration`, `entities` and `events`. Two of their own quirks belong on this list:

| Quirk                          | Where                               | Detail                                                                                                    |
| ------------------------------ | ----------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Two export forms               | 355 scripts, mostly `SCRIPTS/STORY` | Numbers where the other 1,151 use identifiers — `type = 9` for `type = SCENE`, `up = 1` for `up = Y_AXIS` |
| Arrays stored as a `1..n` hash | the same 355                        | 76,447 tables; the same table to Lua, a different instruction in the bytecode, and preserved as written   |

**Both forms are in live use** — 275 of the 355 are named by INI data, from the same properties that name
the symbolic ones. See [THN.md](THN.md#both-export-forms-are-in-live-use).

## openFLAME leftovers

Five retail files carry trees from **openFLAME**, the engine behind Digital Anvil's earlier
*Conquest: Frontier Wars*. They share the UTF container with Freelancer and nothing else: the game
cannot load them, no `.ini` names them, and no module here interprets their content. They are listed so
a sweep recognizes them instead of mistaking them for an unread Freelancer structure — **find them, skip
them, do not implement them.**

| File                                              | Root nodes                          | Content                                                                                    |
| ------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------- |
| `EQUIPMENT/MODELS/HARDWARE/no_cargo_extender.3db` | `openFLAME 3D N-mesh`, `Rigid body` | Pre-VMesh geometry, plus a nested `Material library` and `Texture library`                 |
| `EQUIPMENT/MODELS/HARDWARE/no_invulnerability.3db` | same                                | same                                                                                       |
| `EQUIPMENT/MODELS/HARDWARE/no_key.3db`            | same                                | same                                                                                       |
| `EQUIPMENT/MODELS/HARDWARE/no_power_boost.3db`    | same                                | same                                                                                       |
| `SOLAR/BLACKHOLE/bh_flute4.pte`                   | `Particle Event`, `Rigid body`      | `particle1.Def`, an `Animation library`, a paletted `Texture library`, `Scale`, `PointExtent` |

The four `.3db` files are openFLAME end to end — their root holds `Exporter Version` and the two trees,
and no Freelancer geometry at all. `bh_flute4.pte` is the only `.pte` in the data.

### The vocabulary is the marker, not the extension

openFLAME geometry is `Vertices` / `Edges` / `Normals` / `Face groups` (a space, where Freelancer writes
`Face_groups`) over `Object vertex list`, `Face vertex chain` and `Face D-coefficient`. Its materials key
on `Material identifier` and nest `Ambient` / `Diffuse` / `Specular` / `Transparency` directories each
with a `Map` subdirectory, where a Freelancer material holds only flat property files. Its textures are
`Palette 8 bit` with `Image indices` and `Palette RGB 888`. `Rigid body` wraps `Mass properties` and
either an `Extent tree` or, in the `.pte`, an `Extent data` / `Bounding volume` pair.

**None of these names occurs in a Freelancer-authored asset**, which is what makes the test cheap.

### Every reader already yields nothing, deliberately

`readVMeshLibrary` reads an openFLAME root as an empty library. `readTextures` and `readMaterials` come
back empty because both libraries are nested inside the openFLAME tree rather than sitting at the file
root where those readers look. Reaching an entry directly is covered too — `readTexture` returns
`undefined` on a paletted entry rather than guessing. **Nothing throws.**

The two paletted texture forms nest oppositely, so neither reader can assume the other — see
[TEXTURE.md](TEXTURE.md#openflame-paletted-entries). [MATERIAL.md](MATERIAL.md) covers the nested
library, and [COMPOUND.md](COMPOUND.md#where-the-records-come-from) the shared joint lineage — the one
place the two engines genuinely overlap, since Freelancer's joint records are Conquest structures
unchanged.

### `FX/MISC/tlrtube.3db` is not one of them

It was grouped with these for a long time on the strength of being pre-VMesh. Its vocabulary is
Freelancer's own, it carries no openFLAME marker, and what it is residue of is `FxMeshAppearance` — an
unfinished Freelancer feature that crashes the game when a particle spawns for that appearance. It stays
unread because there is no working in-game behaviour to validate a reader against, not because another
engine authored it. The full argument is in
[RIGID.md](RIGID.md#fxmisctlrtube3db-is-not-an-openflame-leftover).

## TODO — what is pending in the game

Questions the corpus cannot answer, because the answer is a behaviour rather than a byte. Each module
document carries its own `TODO` section with the full argument and the experiment; this is the index for
the format layer. **Everything listed reads, writes and round-trips today** — the reader picks the
reading that cannot go visibly wrong, and the open question is which reading is right.

| Question                                                                                                                               | Where                                   | Experiment                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `TransformFlags` bits 2, 8, 9, 16, 18 — constant across all 5,590 retail transforms, so not a channel selector; what they select is unknown | [ALCHEMY.md](ALCHEMY.md#todo)           | Clear one bit at a time on `gf_explosion_debris_trail01.ale` and fly                              |
| Easing type 6, used only by `FLDustAppearance` and by both of its instances                                                             | [ALCHEMY.md](ALCHEMY.md#todo)           | One-byte edit to `dust.ale`, set it to 4 and fly; `todo` test                                    |
| A key landing on the end of a curve carrying no wrap flags — fold or hold                                                              | [ALCHEMY.md](ALCHEMY.md#todo)           | Source `TODO`; `todo` test                                                                        |
| The four version-1.1 `Effect` floats — a bounding sphere, unconfirmed                                                                  | [ALCHEMY.md](ALCHEMY.md#todo)           | Inflate `unknown4` and watch culling                                                             |
| The five unnamed property hashes                                                                                                       | [ALCHEMY.md](ALCHEMY.md#todo)           | Flip each boolean on a beam effect; retest the `BeamApp_LineAppearance` candidate                |
| Texture flag bits 4 and 6 — the wrap mode field the DLL proves is there                                                                | [MATERIAL.md](MATERIAL.md#todo)         | Clear bit 4 on a detail material's `Bt_flags`                                                    |
| What `MAFlags` selects — only `2` and `0` occur, across 82 entries                                                                     | [RIGID.md](RIGID.md#todo)               | Flip it on the Bizmark banner                                                                    |
| Whether `MAKeys` or `MADeltas` drives the UV transform                                                                                 | [RIGID.md](RIGID.md#todo)               | Zero one file, then the other                                                                    |
| Whether the nine top-left Targa chains render mirrored — the general question is closed                                                | [TEXTURE.md](TEXTURE.md#todo)           | Look at the nine chains that set it                                                              |
| `DDSCAPS_ALPHA` on a cubemap — format-driven or always                                                                                 | [TEXTURE.md](TEXTURE.md#todo)           | Write an opaque cubemap and load it                                                              |
| Whether anything reads `Edge_angles`                                                                                                   | [DEFORMABLE.md](DEFORMABLE.md#todo)     | Delete them from one of the two files                                                            |
| How the engine maps a four-entry `Fractions` set onto the distance bands                                                               | [DEFORMABLE.md](DEFORMABLE.md#todo)     | Watch a four-level character switch as the camera pulls back                                     |
| How close a `.sur`'s `rotationInertia` has to be                                                                                       | [SURFACE.md](SURFACE.md#todo)           | Rewrite a `pod_*` debris file with the derived value, then with `0.2 × radius²`, and shoot it    |
| Whether the engine still decodes a `0x08` event channel                                                                                | [ANIMATION.md](ANIMATION.md#todo)       | Author one and load the model                                                                    |
| Whether the shipped game honours `@include`                                                                                            | [INI.md](INI.md#todo)                   | Add one to a text INI the game reads                                                             |
| What the 4-byte gap and header bytes 19–20 of a compiled `.thn` hold                                                                   | [THN.md](THN.md#todo)                   | **Read Lua 3.2's `ldump.c`/`lundump.c` first** — probably not a game question at all             |
| What `event_flags` means; bits 1, 2 and 128 occur and 128 dominates                                                                    | [THORN.md](THORN.md#todo)               | Flip a bit on a `START_MOTION` in a scene that plays                                             |
| What `STOP` = 21, `STOP_IK` = 22 and `START` = 23 are for                                                                              | [THORN.md](THORN.md#todo)               | Registered, never used, fitting no table; issue one as an `action`                               |
| Whether `PROPERTY_ANIM`, `ADD_PATH` and `LOOKAT_ENTITY` do anything                                                                    | [THORN.md](THORN.md#todo)               | Same shape; a `nil` result would say they are vestigial                                          |
| Whether a rewritten `resources.dll` loads with no entry point                                                                          | [RESOURCE.md](RESOURCE.md#todo)         | Replace it with a rewritten one and start the game                                               |
| Whether the resource language must be `0x409`                                                                                          | [RESOURCE.md](RESOURCE.md#todo)         | Write a library at `LANG_NEUTRAL` and see whether its strings resolve                            |
| Whether the resource code page field is read at all                                                                                    | [RESOURCE.md](RESOURCE.md#todo)         | Change it and observe; expected to be invisible                                                  |
| Whether an infocard's alignment really persists across `PARA`                                                                          | [RDL.md](RDL.md#todo)                   | Retail always restates `left` — write a card that does not                                       |
| What the `TRA` mask bits above the colour do                                                                                           | [RDL.md](RDL.md#todo)                   | Set one with a mask that reaches it and look                                                     |
| Whether anything after `POP` is read                                                                                                   | [RDL.md](RDL.md#todo)                   | No card has anything there, so nothing separates "stops" from "ends"                             |
| What object-type values 0–3 and `HpAttachmentType` 0–3 are                                                                             | [ENGINE.md](ENGINE.md#todo)             | Both enums start at 4; no string reaches the low values                                          |
| Whether `RING` and `MESH` zone shapes work                                                                                             | [ENGINE.md](ENGINE.md#todo)             | Registered, never used by retail — author a zone with each                                       |
| Whether `MOON`, `BLACKHOLE` and `ASTEROID` do anything as a `[Solar] type`                                                             | [ENGINE.md](ENGINE.md#todo)             | Named, never set                                                                                 |
| Which of `attack_subtarget_order` and `attack_preference` takes which values                                                           | [ENGINE.md](ENGINE.md#todo)             | `content.dll` has no table; emission order puts one run beside both                              |
| Whether the 105 unread keys are really inert                                                                                           | [ENGINE.md](ENGINE.md#todo)             | Change `faction_weight` in a zone and watch population; 5,611 uses ride on it                    |
| What matches the 651 keys that have literals but no `is_value` call site                                                               | [ENGINE.md](ENGINE.md#todo)             | Probably `get_name_ptr` plus a local compare — a reading problem, not an in-game one              |

Two questions that look like they belong here do not. **Cylinder joint animation is impossible**, not
unimplemented — a cylinder needs 2 floats and no combination of the channel type bits comes to 2
([ANIMATION.md](ANIMATION.md#why-cylinder-joints-cannot-be-animated)). **`FX/MISC/tlrtube.3db`'s
animated UV set is blocked, not pending** — validating a reader for it needs `FxMeshAppearance` to stop
crashing first ([RIGID.md](RIGID.md#todo)).

---

[UTF.md](UTF.md) · [VMESH.md](VMESH.md) · [COMPOUND.md](COMPOUND.md) · [RIGID.md](RIGID.md) ·
[ANIMATION.md](ANIMATION.md) · [SURFACE.md](SURFACE.md) · [ALCHEMY.md](ALCHEMY.md) ·
[TEXTURE.md](TEXTURE.md) · [MATERIAL.md](MATERIAL.md) · [DEFORMABLE.md](DEFORMABLE.md) ·
[INI.md](INI.md) · [THN.md](THN.md) · [THORN.md](THORN.md) · [RESOURCE.md](RESOURCE.md) ·
[RDL.md](RDL.md) · [AUDIO.md](AUDIO.md) · [ENGINE.md](ENGINE.md) · [SECTIONS.md](SECTIONS.md) ·
[RENDERER.md](RENDERER.md) · [API.md](API.md)
