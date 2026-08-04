# THN — scene scripts

`.thn` files drive Freelancer's cutscenes and the animated base/room views. They are named here
because they are reached from INI data, and documented at this length because **the natural
assumption about them is wrong in both directions**: a `.thn` is not an INI file and in retail it is
not text, but neither is it a program. It is a serialization format — objects, arrays and
properties — that happens to be stored as a compiled Lua chunk.

All **1,506** of them in retail are compiled Lua 3.2 bytecode. Every statement below comes from
disassembling all 1,506.

## The engine

`.thn` is short for **THORN**, the scene-scripting library in `EXE/thorn.dll`. The DLL embeds a
stock interpreter — `$Lua: Lua 3.2 Copyright (C) 1994-1999 TeCGraf, PUC-Rio $` — and drives it from
`Src\THORN\LuaScriptParser.cpp`, whose error strings (`LUA unable to parse file`, `LUA unable to
read file`, `%s is not a Lua binary file`) are still in the binary. This confirms the version that
the file signature only implied.

Two consequences follow, and both matter:

- **The engine loads scripts with `dofile`.** Lua's loader sniffs the signature and falls back to
  compiling source text, so **the game reads a plain-text `.thn` as happily as a compiled one.** A
  writer never has to emit bytecode. This is **observed in the running game**, not merely inferred
  from stock Lua behaviour: a plain-text script loads from the packed retail install, so the
  surrounding resource loading imposes nothing extra.
- **Lua 3.2 has no boolean type.** Truth values are expressed as bare identifiers — see
  [`Y` and `N`](#y-and-n-are-the-booleans) below.

## A THN is data, not code

Disassembling every retail script yields **fifteen distinct opcodes**, and every one of them either
pushes a value or builds a table:

| Opcode                 | Count               | What it does                          |
| ---------------------- | ------------------- | ------------------------------------- |
| `PUSHCONSTANT` / `…W`  | 1,095,764 / 387,606 | push pool constant (string or number) |
| `PUSHNUMBER` / `…W`    | 867,512 / 29,367    | push inline integer (`u8` / `u16`)    |
| `PUSHNUMBERNEG` / `…W` | 23,382 / 3,828      | push inline negated integer           |
| `CREATEARRAY` / `…W`   | 547,021 / 65        | begin a table                         |
| `SETLIST`              | 291,402             | populate array part                   |
| `SETMAP`               | 256,266             | populate hash part                    |
| `GETGLOBAL` / `…W`     | 95,680 / 59,579     | read an engine-defined identifier     |
| `SETGLOBAL` / `…W`     | 4,261 / 257         | assign a top-level variable           |
| `ADD`                  | 9,557               | `+`                                   |
| `ENDCODE`              | 1,506               | end of chunk                          |

**What is absent is the point.** In 1,506 files there is no `CALL`, no jump or branch, no local
variable, no upvalue, no `GETTABLE`, and — measured directly from the constant pool, which admits
exactly two tags — **not one nested function prototype**. There is no control flow to interpret and
no engine API to model. A THN is a literal.

### Three top-level variables, always

`SETGLOBAL` fires exactly 4,518 times, which is 3 × 1,506. Every script assigns the same three
names and nothing else:

| Variable   | Files |
| ---------- | ----- |
| `duration` | 1,506 |
| `entities` | 1,506 |
| `events`   | 1,506 |

So the whole format is `duration` (a number) plus two arrays of records. That is the document model.

### `+` is the only operator, and only over flags

All 9,557 `ADD` instructions take globals — or the result of a previous `ADD` — as both operands.
Not once is a literal added to anything. It is the flag-composition idiom and nothing else:

```lua
flags = POSITION + ORIENTATION + ENTITY_RELATIVE
```

A translator therefore needs `+` only as _set union over identifiers_, never as arithmetic.

## The value domain

Five kinds of value occur, and **four of the five map onto JSON directly**:

| THN                 | JSON                                                            |
| ------------------- | --------------------------------------------------------------- |
| number              | number — but see [the text caveat](#numbers-are-stored-as-text) |
| string              | string                                                          |
| array table         | array                                                           |
| hash table          | object                                                          |
| **bare identifier** | **no direct equivalent**                                        |

The bare identifier is the whole difficulty. `type = SCENE` is a global _read_, not the string
`"SCENE"`, and the two compile to different opcodes (`GETGLOBAL` vs `PUSHCONSTANT`). Emitting
`type = "SCENE"` into a plain-text script would hand the engine a string where it expects a number,
so **the JSON form must keep identifiers distinguishable from strings** — a tagged scalar, not a
bare string. This is the one place the mapping is not free.

**155,259 identifier reads resolve to 55 distinct names.** `thorn.dll` holds the full vocabulary as
a contiguous string table, which is wider than what retail exercises:

- **Entity types** — `SCENE`, `MARKER`, `CAMERA`, `LIGHT`, `MONITOR`, `SOUND`, `PSYS`, `COMPOUND`,
  `DEFORMABLE`, `MOTION_PATH`, `SUB_SCENE`, `DELETED`, `UNKNOWN_ENTITY`
- **Event types** — `START_MOTION`, `ATTACH_ENTITY`, `START_SPATIAL_PROP_ANIM`, `START_IK`,
  `START_SOUND`, `START_PSYS`, `START_PATH_ANIMATION`, `SET_CAMERA`, `CONNECT_HARDPOINTS`,
  `START_LIGHT_PROP_ANIM`, `START_AUDIO_PROP_ANIM`, `START_FOG_PROP_ANIM`,
  `START_CAMERA_PROP_ANIM`, `START_PSYS_PROP_ANIM`, `START_FLR_HEIGHT_ANIM`,
  `START_REVERB_PROP_ANIM`, `START_SUB_SCENE`, `SUBTITLE`, `USER_EVENT`, `UNDEFINED_EVENT`
- **Flags** — `POSITION`, `ORIENTATION`, `LOOK_AT`, `ENTITY_RELATIVE`, `ORIENTATION_RELATIVE`,
  `PARENT_CHILD`, `PATH_POSITION`, `LIT_DYNAMIC`, `LIT_AMBIENT`, `HIDDEN`, `SPATIAL`, `REFERENCE`,
  `LOOP`, `STREAM`, `USE_SCRIPT_DURATION`, `FOG_PROPS_REMOVED`
- **Target kinds** — `ROOT`, `PART`, `HARDPOINT`
- **Axes** — `X_AXIS`, `Y_AXIS`, `Z_AXIS` and their `NEG_` counterparts
- **Light and fog kinds** — `L_DIRECT`, `L_POINT`, `L_SPOT`, `F_NONE`, `F_LINEAR`, `F_EXP`, `F_EXP2`

The DLL also carries the property-key vocabulary (`spatialprops`, `cameraprops`, `lightprops`,
`pathprops`, `userprops`, `orient`, `q_orient`, `up`, `front`, `fovh`, `nearplane`, `farplane`,
`target_part`, `target_type`, `start_percent`, `event_flags`, …).

**All of it, with what each name is worth and where that came from, is in [THORN.md](THORN.md)** —
including the names the DLL carries that no script uses, which is most of the interesting part.

### `Y` and `N` are the booleans

Lua 3.2 predates Lua's boolean type, so THORN registers two one-character globals. `N` and `Y` sit
adjacent to each other in `thorn.dll`, a little past the enum block rather than inside it. Retail
uses them on three keys:

| Key        | `Y`   | `N` |
| ---------- | ----- | --- |
| `on`       | 1,747 | 621 |
| `fogon`    | 76    | 28  |
| `fogtable` | 0     | 10  |

They are identifiers like any other, so they fall out of the tagged-scalar treatment above. **A
translator must not fold them into JSON `true`/`false` on the way out**, because writing `on = true`
into a plain-text script means the global `true`, which THORN does not define.

### Numbers are stored as text

The constant pool stores numbers as **decimal ASCII**, not as IEEE doubles — `1.333333`, `9e-006`,
`-0.9999900000000001` appear literally. Integers small enough to ride in an operand
(`PUSHNUMBER`/`NEG`, up to 16 bits) never reach the pool at all.

This makes byte-exact round-tripping a formatting problem rather than a precision one: re-emitting
`-0.9999900000000001` as `-0.99999` changes the file even though the value is unchanged. **Keep the
literal, not the parsed value.**

## Container layout

A compiled `.thn` is a header, a code block and a constant pool, with **big-endian integer fields
throughout** — unusual, and the single easiest thing to get wrong.

| Region           | Notes                                                                                                                                                                                                                                                                        |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Header, 21 bytes | Bytes 0–15 identical in all 1,506: `1b 4c 75 61 32` (`ESC` `Lua`, version `0x32`) then ten bytes ending `01 00 00`. A big-endian `uint32` at offset 15 tracks the code block length. Bytes 19–20 are not decoded; byte 19 varies with table nesting, byte 20 is always zero. |
| Code             | Begins at offset **21** in every file, runs to `ENDCODE`.                                                                                                                                                                                                                    |
| —                | Exactly **4 bytes** between `ENDCODE` and the constant count, in every file. Not decoded.                                                                                                                                                                                    |
| Constant count   | Big-endian `uint32`.                                                                                                                                                                                                                                                         |
| Constant pool    | Runs to EOF.                                                                                                                                                                                                                                                                 |

Pool entries are tag-discriminated, and **only two tags occur in 442,599 constants**:

| Tag  | Layout                                                         | Count   |
| ---- | -------------------------------------------------------------- | ------- |
| `01` | `uint8` length, then that many bytes of decimal ASCII (no NUL) | 282,234 |
| `02` | big-endian `uint32` length _including_ the NUL, then the bytes | 160,365 |

A third tag would be a nested function prototype. There is not one.

## How INI reaches them

**Not through `act_AddRTC`, which is what an earlier version of this section claimed.** That property
names an **`.ini`**, not a `.thn` — an RTC file, which then names the script:

```
[Trigger] act_AddRTC = missions\\m13\\M013_s072aa_St01_01_nrml.ini
                            ↓
                       [CharacterEncounter] action = scripts\story\s072aa_offer_Quintaine_pl_09_pad_01.thn
```

All **101** `act_AddRTC` / `act_RemoveRTC` / `cnd_RTCDone` values end in `.ini`; not one ends in
`.thn`. The RTC triggers are a hop away and never carry a script path themselves.

**`[Trigger] Act_CallThorn` is the one that does**, and it is a mission-scripting property in the
literal sense: all 70 of its occurrences are under `MISSIONS`, and it is the **only** property that
reaches a script in `MISSIONS/` or `RANDOMMISSIONS/` — 60 of those 83 files, with nothing else naming
any of them. It is also the only property in retail whose name contains `Thorn`.

Nineteen properties carry a script path in total, across **3,000 references naming 1,292 distinct
scripts**, and every one resolves to a file that exists — there are no dangling script references in
retail:

| Property                                                    | References |
| ----------------------------------------------------------- | ---------- |
| `[Room_Info] scene` / `set_script` / `goodscart_script`     | 1,128      |
| `[GenericScripts] script`                                   | 617        |
| `[MRoom] fixture`                                           | 559        |
| `[CharacterPlacement] start_script`                         | 208        |
| `[GCS_Exclusions] script`                                   | 126        |
| `[Char] fidget`                                             | 83         |
| `[Trigger] Act_CallThorn`                                   | 70         |
| `[CharacterEncounter]` × 6 (`action`, `offer`, …)           | 143        |
| `[PlayerShipPlacement] landing_script` / `launching_script` | 58         |
| `[Trigger] Act_AddAmbient` / `Act_RemoveAmbient`            | 8          |

Two things a resolver has to handle. Paths are backslash-separated and authored case-insensitively,
as everywhere else in INI — but **retail also mixes `\` and `\\` inside the same property**:
`[Trigger] Act_CallThorn` carries `missions\\m12\\M12_Osiris.thn` and `missions\m11\M11_Walker1.thn`
one line apart. Collapse repeated separators or 61 of the 1,292 stop resolving.

### Both export forms are in live use

Cross-checking the [355 numeric-form scripts](#355-scripts-use-numbers-where-the-rest-use-identifiers)
against every reference above settles that they are not dead residue:

| Form     | Referenced from INI    |
| -------- | ---------------------- |
| numeric  | 275 of 355 (77.5%)     |
| symbolic | 1,017 of 1,151 (88.4%) |

And they are not segregated by purpose. `[Room_Info] scene` names 129 symbolic scripts and 142
numeric ones; under `SCRIPTS/BASES` the `bar_enter_01` scripts are 16 symbolic and 22 numeric. The
same room property, for the same kind of scene, in either form — **two authoring tools, not two
categories**, which is the reading that matters for a reader: neither form may be treated as
secondary.

One difference is real and unexplained: within `SCRIPTS/BASES`, numeric-form scripts are referenced
at 75.8% against the symbolic form's 91.6%.

### 214 scripts are named by nothing

In both forms, and in every directory. The mission ones are the legible case — 23 of the 83 under
`MISSIONS/`, and they read as superseded drafts rather than as a gap in this sweep:

```
missions/m01a/m01a_01.thn … m01a_09.thn, m01a_11.thn   (m01a_10 does not exist)
missions/m01a/m01a_rev2_07.thn                          ("rev2", beside a referenced m01a_07)
missions/m01b/m01b_01.thn … m01b_03.thn
missions/m02/m03_survivor1.thn                          (an m03 script filed under m02)
```

A numbered sequence with a hole in it, a file named `rev2`, and one misfiled by a directory. Against
that, the 60 that _are_ referenced carry descriptive names — `M12_Osiris.thn`, `M11_Walker1.thn`.

**This is a reading, not a finding.** The corpus cannot show that a script is unreachable, only that
nothing in `DATA` names it, and the 191 unreferenced scripts outside `MISSIONS/` have no such tell.
Deleting one on the strength of this would be acting on a hunch.

## Scope

**Implemented, at `./thn`** — a separate entry point from the INI ones, because a THN shares nothing
with INI but the fact that INI points at it. Three of the four directions exist:

| Direction        | Module          | State                                    |
| ---------------- | --------------- | ---------------------------------------- |
| bytecode → model | `thn/bytecode/` | all 1,506 retail scripts                 |
| model → text     | `thn/text/`     | the whole write path                     |
| text → model     | `thn/text/`     | a Lua _literal_ parser, not a Lua parser |
| model → bytecode | —               | **deferred**, see [TODO](#todo)          |

**The typed layer above it is implemented too, at `./thn/scene`** — entities and events as records
rather than tables, with the vocabulary and the evidence for it in [THORN.md](THORN.md). It is the
one place the two export forms below are folded together, which only became possible once the
identifiers' numeric values were measured.

The earlier reading of this document put a bytecode decompiler and an engine-API model in the way;
the disassembly says neither is needed. Reading is an evaluator of a few hundred lines rather than an
interpreter, because there is no control flow to interpret, and the model is the value domain
directly — `duration`/`entities`/`events` over numbers, strings, identifiers and tables, which is
JSON except for the identifiers.

Two claims about the write path have to stay apart, because running them together is what made the
last version of this section wrong:

- **A bytecode writer is not _required_.** The engine loads scripts with `dofile`, Lua's loader
  compiles source text when the signature is absent, and a plain-text script loads from the packed
  retail install — observed in game. Emitting text is a complete write path, not a fallback.
- **A bytecode writer is still _wanted_,** for completeness rather than for need. It is deferred, not
  ruled out: `bytecode/data.ts` already carries the name → byte direction of the opcode table, and
  `thn.write`'s `format` parameter names only `'text'` so that widening it later is additive. What it
  waits on is in [TODO](#todo).

### Round-tripping

Stronger than this document expected. It said compiled → text → compiled was unavailable without a
bytecode writer, which is true — but a **text reader** closes the loop from the other side:

> **bytecode → model → text → model** compares exactly, over all 1,506 retail scripts.

It compares exactly rather than approximately because every scalar survives as its literal, and it is
asserted in `thn/corpus.test.ts` alongside every count in this document.

One consequence for the writer. `{ [1] = x }` and `{ x }` are the same table to Lua but different
instructions in the bytecode — `SETMAP` against `SETLIST` — and the model records which was used, so
**a table keyed `1..n` is written back keyed, not collapsed into an array literal**. 76,447 retail
tables are in that form. Collapsing them would be the one thing a round-trip could lose, and it would
read as a formatting nicety rather than as data loss, which is what makes it worth stating.

Two further facts fell out of the corpus while implementing, neither of which was measured before:

- **No retail table fills both parts at once.** An array part and a hash part never appear in the
  same table, in any of 547,086 of them.
- **355 scripts are written in a different form entirely** — see below.

### 355 scripts use numbers where the rest use identifiers

Under `SCRIPTS/STORY` and its neighbours, 355 of the 1,506 carry the _resolved values_ where the
other 1,151 carry the symbolic globals, and store arrays as a hash keyed `1..n`:

```lua
-- the symbolic form, 1,151 files            -- the numeric form, 355 files
type = SCENE                                 type = 9
up = Y_AXIS                                  up = 1
front = Z_AXIS                               front = 2
fogon = N                                    fogon = 0
pos = { 0, 0, 0 }                            pos = { [1] = 0, [2] = 0, [3] = 0 }
```

They are two exporters, not two formats — the engine reads a number wherever it would read the global
that holds one, which is precisely why the identifier arm has to stay distinct from the string arm
and need not be resolved to anything. Both forms read, both round-trip, and neither is normalised
into the other.

**This closed one of the open questions below.** These files hold the identifiers' numeric values by
correspondence: `up = Y_AXIS` against `up = 1` in the same structural position says `Y_AXIS = 1`, and
`fogon = N` against `fogon = 0` says `N = 0`. Followed through, that resolves every enum THORN
defines — see [THORN.md](THORN.md), which carries the tables, the evidence for each value, and the
two places the correspondence is weak enough to say so.

The pairing was done **structurally rather than by frequency**, which is what makes it evidence
rather than a fit: a numeric entity carrying `cameraprops` is a camera whatever the counts say,
because no other entity type carries that block.

## TODO

What is pending _observation in the running game_ rather than pending code — with one entry that may
not belong in this section at all, flagged as such.

- **What does the 4-byte gap before the constant count hold, and bytes 19–20 of the header?**
  Constant across nothing and correlated with nesting depth respectively, so most likely
  `maxstacksize` and friends. Irrelevant to reading, and the only thing standing between the deferred
  bytecode writer and existing — [Scope](#scope) now wants one, where the previous version of this
  document said it never would.

  **This one is probably not TODO-shaped.** The section's premise is that a question is pending
  observation in the running game, but the layout of a Lua dump is pending a read of `ldump.c` and
  `lundump.c` at the same `github.com/lua/lua` `v3.2` tag that supplied the opcode table. Start
  there. If the fields fall out of the source, they leave this section as answers rather than being
  guessed at from the corpus.

**Closed:** what the identifiers' numeric values are. This was the lead recorded above, and it has
been followed: the correspondence resolves **all 41,250 retail entities and all 50,785 events** with
no leftover, cross-checked against `thorn.dll`'s string-table order and against the two Direct3D
enums THORN passes straight through. The tables are in [THORN.md](THORN.md), and the typed layer at
`./thn/scene` is built on them.

**Closed:** whether a plain-text `.thn` loads from the packed retail install. It does — observed in
game, so the write path in [Scope](#scope) is settled, not provisional.

**Closed:** whether the Lua 3.2 opcode numbering used here is right. The per-opcode counts over all
1,506 scripts reproduce the table above exactly, and `bytecode.test.ts` pins the two places a
plausible near-miss would land: `SETMAP`'s operand being pairs minus one, and `SETTABLEPOP` taking no
operand despite ending in neither `W` nor `OP`.

---

[THORN.md](THORN.md) · [INI.md](INI.md) · [SCHEMA.md](SCHEMA.md) · [MODULES.md](MODULES.md) · [RETAIL.md](RETAIL.md)
