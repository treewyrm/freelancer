# Retail data

The retail Freelancer install as a whole, as it looks to this library: where the corpus is, what is
in it, and what has actually been measured versus what is assumed. Per-format detail stays in
[INI.md](INI.md) and [SCHEMA.md](SCHEMA.md); the section-to-module assignment is in
[MODULES.md](MODULES.md).

## The corpus is the same install utf2json uses

The `corpus.test.ts` suites look for a Freelancer `DATA` directory at **`$FREELANCER_DATA`**, falling
back to **`~/Downloads/Freelancer/DATA`**, and each suite skips itself with a reason when neither
exists — the same convention and the same install as
[utf2json's](../../utf2json/docs/RETAIL.md). **The rest of the test suite must never depend on
retail data being present.**

Two directories outside `DATA` matter here and do not in utf2json:

- **`EXE/`** — `freelancer.ini`, `dacom.ini`, `dacomsrv.ini`, the three plain-text INIs, and the
  only place `@include` appears.
- **`EXE/`** again — the seven **resource DLLs** every `ids_name` and `ids_info` resolves into,
  read and written by `./resource`. See [RESOURCE.md](RESOURCE.md).
- **`DLLS/`** — holds only `BIN/content.dll`, which carries a version block and nothing else. The
  resource numbers do **not** resolve here, a natural guess and a wrong one.

Retail is the authority these readers are measured against, so a claim about the format is worth
only the count behind it. Every number in these documents comes from a sweep of that install, and
the `corpus.test.ts` suites now assert them back through the readers — **they are regression tests, so a
number that stops matching means the reader drifted, not that the number needs updating.**

## What is in it

|                                      | Count                  |
| ------------------------------------ | ---------------------- |
| `.ini` files under `DATA`            | 1,252                  |
| — BINI (signature `BINI`)            | 1,251                  |
| — plain text                         | 1 (`initialworld.ini`) |
| `.ini` files under `EXE`             | 3, all plain text      |
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

Distribution by directory:

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
| `(section, property)` pairs with varying arity                      | 108                                       | Tuples need optional tails; lists need no fixed width — [SCHEMA.md](SCHEMA.md#arity-varies-on-the-same-field)               |
| Section names spelled more than one way                             | 6                                         | Every lookup folds case — [INI.md](INI.md#case)                                                                             |
| Property names spelled more than one way                            | 32                                        | Same                                                                                                                        |
| Sections that always carry a `nickname`                             | 108 of 256                                | The archetype/positional split — [SCHEMA.md](SCHEMA.md#identity-and-nicknames)                                              |
| Sections that never do                                              | 136                                       | Same                                                                                                                        |
| Sections that sometimes do                                          | 3 (`Sound`, `Voice`, `TrueType`)          | Each is a real split, not an inconsistency                                                                                  |
| Most values in one property                                         | 25 (format allows 255)                    |                                                                                                                             |
| Most properties in one section                                      | 3,126                                     |                                                                                                                             |
| Longest property name                                               | 49 characters                             |                                                                                                                             |

## Round-trip fidelity

Measured by the `corpus.test.ts` suites against the install, except where the layer does not exist yet.

| Layer                                   | Result                                                                               |
| --------------------------------------- | ------------------------------------------------------------------------------------ |
| BINI → interim → BINI                   | **Byte-exact, 1,251 of 1,251**                                                       |
| BINI → interim → text → interim → BINI  | **Byte-exact, 1,251 of 1,251**                                                       |
| text → interim → text                   | Fixed point over all 1,252 files                                                     |
| THN bytecode → interim → text → interim | **Exact** over all 1,506 scripts                                                     |
| THN typed → interim → typed             | **Identity** over all 1,506                                                          |
| THN interim → typed → interim           | Fixed point; 3 of 1,506 are exact and 72 more differ only in how numbers are spelled |
| DLL → resources → DLL                   | **Exact** over all 37 DLLs in `EXE`                                                  |
| resources → `.rsrc` section             | **Byte-identical to retail**, 5 libraries of 7 exactly, 2 as a strict prefix         |
| INI interim → typed → interim           | Pending the typed layer                                                              |

The obstacle known in advance — **dictionary emission order** — turned out not to be one. The order
is derivable (names in first-use order, then values in first-use order, one shared dedup table), and
re-emitting the corpus under that rule reproduces every file. Measured ahead of the writer, so the
suite confirmed a known result rather than discovering one. See [INI.md](INI.md#round-trip).

Two things carry the trip out through text and back. Float rendering searches for the shortest
decimal that reads back as the same `float32` and always keeps a `.`, so one of the 14,209 integral
floats does not return as an integer. And a whole number too large for `int32` stays a _string_
rather than becoming a float: `initialworld.ini` writes `locked_gate = 2926089285`, which is
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

The 1,506 `.thn` files are **not INI** — all of them are compiled Lua 3.2, and they are read by
`./thn` rather than by anything here. See [THN.md](THN.md) so a sweep does not try to parse one as
INI, and does not write one off as code: they hold no functions and no control flow, only `duration`,
`entities` and `events`. Two of their own quirks belong on this list:

| Quirk                          | Where                               | Detail                                                                                                    |
| ------------------------------ | ----------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Two export forms               | 355 scripts, mostly `SCRIPTS/STORY` | Numbers where the other 1,151 use identifiers — `type = 9` for `type = SCENE`, `up = 1` for `up = Y_AXIS` |
| Arrays stored as a `1..n` hash | the same 355                        | 76,447 tables; the same table to Lua, a different instruction in the bytecode, and preserved as written   |

Both forms are in live use — 275 of the 355 are named by INI data, from the same properties that
name the symbolic ones. See [THN.md](THN.md#both-export-forms-are-in-live-use).

## TODO — what is pending in the game

Questions the corpus cannot answer, because the answer is a behaviour rather than a byte. Each
document carries the full argument; this is the index.

| Question                                                                                    | Where                           | Experiment                                                                           |
| ------------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------ |
| Whether the shipped game honours `@include` or whether it was a build-tool directive        | [INI.md](INI.md#todo)           | Add one to a text INI the game reads                                                 |
| First-wins or last-wins for a repeated scalar property                                      | [SCHEMA.md](SCHEMA.md#todo)     | Duplicate a scalar and observe                                                       |
| Whether `[Sound]`'s two shapes are one section disambiguated by file, or two sharing a name | [SCHEMA.md](SCHEMA.md#todo)     | Move a voice-bank `[Sound]` into `sounds.ini`                                        |
| Whether trailing values past a field's known arity are read or ignored                      | [SCHEMA.md](SCHEMA.md#todo)     | Extend a known field by one value                                                    |
| What the 4-byte gap and header bytes 19–20 of a compiled `.thn` hold                        | [THN.md](THN.md#todo)           | **Read Lua 3.2's `ldump.c`/`lundump.c` first** — probably not a game question at all |
| What the five unplaced event values are — 0, 1, 12, 17, 19                                  | [THORN.md](THORN.md#todo)       | Write a script using one of the names symbolically and see whether the event fires   |
| What `event_flags` means; bits 1, 2 and 128 occur and 128 dominates                         | [THORN.md](THORN.md#todo)       | Flip a bit on a `START_MOTION` in a scene that plays                                 |
| Which bit is `PATH_POSITION` and which is `USE_SCRIPT_DURATION`                             | [THORN.md](THORN.md#todo)       | Bit 16 is unclaimed in the attach namespace; suggestive, not evidence                |
| Whether a rewritten `resources.dll` loads with no entry point                               | [RESOURCE.md](RESOURCE.md#todo) | Replace it with a rewritten one and start the game                                   |
| Whether an eighth resource library is honoured                                              | [RESOURCE.md](RESOURCE.md#todo) | Add a `DLL =` line and reference an id at `0x70000`                                  |
| Whether the resource language must be `0x409`                                               | [RESOURCE.md](RESOURCE.md#todo) | Write a library at `LANG_NEUTRAL` and see whether its strings resolve                |
| Whether the resource code page field is read at all                                         | [RESOURCE.md](RESOURCE.md#todo) | Change it and observe; expected to be invisible                                      |

Closed: what numeric values THORN's identifiers have — the numeric-form scripts resolve all 41,250
retail entities and 50,785 events by structural correspondence, cross-checked against `thorn.dll`'s
string-table order and against `D3DLIGHTTYPE` and `D3DFOGMODE` ([THORN.md](THORN.md)). Closed:
whether a plain-text `.thn` loads from the packed install — it does, observed in game
([THN.md](THN.md#the-engine)). Closed: whether the Lua 3.2 opcode numbering is right — the per-opcode
counts over all 1,506 scripts reproduce the disassembly table exactly ([THN.md](THN.md#todo)). Closed: whether the game accepts text where retail ships BINI — it
does, as a fallback for any file lacking the signature; BINI itself is parsed natively by a second
parser in the same class, not decompiled to text ([INI.md](INI.md#ini-and-bini)). Closed: how a
boolean payload encodes truth — byte 0, nonzero is true, found by disassembly
([INI.md](INI.md#booleans-do-not-occur)). Closed: whether retail's BINI dictionary order is
derivable — it is, and reproducing it round-trips all 1,251 files byte-exactly
([INI.md](INI.md#round-trip)).

---

[INI.md](INI.md) · [SCHEMA.md](SCHEMA.md) · [MODULES.md](MODULES.md) · [THN.md](THN.md) ·
[RESOURCE.md](RESOURCE.md)
