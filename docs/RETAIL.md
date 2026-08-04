# Retail data

The retail Freelancer install as a whole, as it looks to this library: where the corpus is, what is
in it, and what has actually been measured versus what is assumed. Per-format detail stays in
[INI.md](INI.md) and [SCHEMA.md](SCHEMA.md); the section-to-module assignment is in
[MODULES.md](MODULES.md).

## The corpus is the same install utf2json uses

`corpus.test.ts` suites look for a Freelancer `DATA` directory at **`$FREELANCER_DATA`**, falling
back to **`~/Downloads/Freelancer/DATA`**, and each suite skips itself with a reason when neither
exists — the same convention and the same install as
[utf2json's](../../utf2json/docs/RETAIL.md). **The rest of the test suite must never depend on
retail data being present.**

Two directories outside `DATA` matter here and do not in utf2json:

- **`EXE/`** — `freelancer.ini`, `dacom.ini`, `dacomsrv.ini`, the three plain-text INIs, and the
  only place `@include` appears.
- **`DLLS/`** — where `strid_name` and `ids_info` resource numbers resolve to strings. Reading PE
  resources is out of scope; the numbers stay numbers.

Retail is the authority these readers are measured against, so a claim about the format is worth
only the count behind it. Every number in these documents comes from a sweep of that install, and
`corpus.test.ts` now asserts them back through the readers — **they are regression tests, so a
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

Measured by `corpus.test.ts` against the install, except where the layer does not exist yet.

| Layer                                  | Result                           |
| -------------------------------------- | -------------------------------- |
| BINI → interim → BINI                  | **Byte-exact, 1,251 of 1,251**   |
| BINI → interim → text → interim → BINI | **Byte-exact, 1,251 of 1,251**   |
| text → interim → text                  | Fixed point over all 1,252 files |
| interim → typed → interim              | Pending the typed layer          |

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

| Quirk                               | Where                                                                                  | Detail                                                                               |
| ----------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| The one text data file              | `initialworld.ini`                                                                     | Also pads numbers with **U+00A0**, not spaces                                        |
| A section commented out by its name | `EXE/freelancer.ini`                                                                   | `[;Display]` — a section named `;Display`                                            |
| `=` inside a section name           | `INTERFACE/keymap.ini`                                                                 | `[keymap=1.1]`                                                                       |
| A space inside a section name       | `SOLAR`                                                                                | `[Exclusion Zones]`                                                                  |
| A space inside a property name      | `MISSIONS/M12/m12.ini`                                                                 | `[Trigger] system St02`                                                              |
| A purely numeric property name      | `UNIVERSE/SYSTEMS/IW01/iw01.ini`                                                       | `[Object] 260800`                                                                    |
| Stray zero-value properties         | `FX/fuse_br_battleship.ini`, `FX/fuse_ku_gunship.ini`, `INTERFACE/BASESIDE/navbar.ini` | `ONLY`, `age_fire`, and `mesh` / `behavior` / `event` ×14                            |
| Backslash paths, wrong case         | everywhere `file =` appears                                                            | `Universe\Systems\Li01\Bases\…` — needs separator translation and case-folded lookup |
| `@include`                          | `EXE/dacom.ini`                                                                        | Opens with `@include FL_Dev.ini`; unresolved whether the game honours it             |

The 1,506 `.thn` files are **not INI** — all of them are compiled Lua 3.2. See [THN.md](THN.md) so
a sweep does not try to parse one as INI, and does not write one off as code: they hold no
functions and no control flow, only `duration`, `entities` and `events`.

## TODO — what is pending in the game

Questions the corpus cannot answer, because the answer is a behaviour rather than a byte. Each
document carries the full argument; this is the index.

| Question                                                                                    | Where                       | Experiment                                    |
| ------------------------------------------------------------------------------------------- | --------------------------- | --------------------------------------------- |
| Whether the shipped game honours `@include` or whether it was a build-tool directive        | [INI.md](INI.md#todo)       | Add one to a text INI the game reads          |
| First-wins or last-wins for a repeated scalar property                                      | [SCHEMA.md](SCHEMA.md#todo) | Duplicate a scalar and observe                |
| Whether `[Sound]`'s two shapes are one section disambiguated by file, or two sharing a name | [SCHEMA.md](SCHEMA.md#todo) | Move a voice-bank `[Sound]` into `sounds.ini` |
| Whether trailing values past a field's known arity are read or ignored                      | [SCHEMA.md](SCHEMA.md#todo) | Extend a known field by one value             |

Closed: whether a plain-text `.thn` loads from the packed install — it does, observed in game
([THN.md](THN.md#the-engine)). Closed: whether the game accepts text where retail ships BINI — it
does, as a fallback for any file lacking the signature; BINI itself is parsed natively by a second
parser in the same class, not decompiled to text ([INI.md](INI.md#ini-and-bini)). Closed: how a
boolean payload encodes truth — byte 0, nonzero is true, found by disassembly
([INI.md](INI.md#booleans-do-not-occur)). Closed: whether retail's BINI dictionary order is
derivable — it is, and reproducing it round-trips all 1,251 files byte-exactly
([INI.md](INI.md#round-trip)).

---

[INI.md](INI.md) · [SCHEMA.md](SCHEMA.md) · [MODULES.md](MODULES.md) · [THN.md](THN.md)
