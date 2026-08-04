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
  `LOOP`, `STREAM`, `ROOT`, `PART`, `HARDPOINT`, `USE_SCRIPT_DURATION`, `FOG_PROPS_REMOVED`
- **Axes** — `X_AXIS`, `Y_AXIS`, `Z_AXIS` and their `NEG_` counterparts
- **Light and fog kinds** — `L_DIRECT`, `L_POINT`, `L_SPOT`, `F_NONE`, `F_LINEAR`, `F_EXP`, `F_EXP2`

The DLL also carries the property-key vocabulary (`spatialprops`, `cameraprops`, `lightprops`,
`pathprops`, `userprops`, `orient`, `q_orient`, `up`, `front`, `fovh`, `nearplane`, `farplane`,
`target_part`, `target_type`, `start_percent`, `event_flags`, …), which is where a schema for the
records should be taken from rather than inferred from the corpus.

### `Y` and `N` are the booleans

Lua 3.2 predates Lua's boolean type, so THORN registers two one-character globals — `N` and `Y` sit
adjacent in the same string table as the enums. Retail uses them on three keys:

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

Three properties, 101 references across retail, all in mission scripting:

| Property                  | Count |
| ------------------------- | ----- |
| `[Trigger] act_AddRTC`    | 68    |
| `[Trigger] act_RemoveRTC` | 31    |
| `[Trigger] cnd_RTCDone`   | 2     |

`SCRIPTS/` also holds `[RTCSlider]`, `[GenericScripts]` and `[GCS_Exclusions]`, which name scripts
by path. All of these are ordinary string values as far as this library is concerned — the typed
layer resolves them to a path and stops there.

## Scope

**Out of scope for the INI modules, and a separate entry point (`./thn`) if it is ever in scope** —
a THN shares nothing with INI but the fact that INI points at it.

What it is no longer is intractable. The earlier reading of this document put a bytecode
decompiler and an engine-API model in the way; the disassembly says neither is needed:

1. **Read** — decode the pool, run the fifteen opcodes on a value stack. There is no control flow,
   so this is an evaluator of a few hundred lines, not an interpreter.
2. **Translate** — emit `duration`/`entities`/`events` as JSON, with identifiers tagged so they
   survive the trip.
3. **Write** — emit plain-text Lua. The game reads it. **No bytecode writer is required**, which
   removes the only genuinely hard piece of the write path.

Round-tripping is testable against the corpus immediately, and unusually strictly: compiled →
JSON → plain text → compiled is not available, but compiled → JSON → compiled-shaped value tree
compares exactly, since every scalar is preserved as its literal.

## TODO

What is pending _observation in the running game_ rather than pending code.

- **What are the numeric values of the identifiers?** They are only needed to _interpret_ a script,
  not to round-trip one — a translator that keeps identifiers symbolic never learns them. If a
  consumer ever needs them, they are in `thorn.dll`'s registration table, not in the corpus.
- **What does the 4-byte gap before the constant count hold, and bytes 19–20 of the header?**
  Constant across nothing and correlated with nesting depth respectively, so most likely
  `maxstacksize` and friends. Irrelevant to reading; relevant only if a bytecode _writer_ is ever
  wanted, which step 3 above says it is not.

**Closed:** whether a plain-text `.thn` loads from the packed retail install. It does — observed in
game, so the write path in [Scope](#scope) is settled, not provisional.

---

[INI.md](INI.md) · [SCHEMA.md](SCHEMA.md) · [MODULES.md](MODULES.md) · [RETAIL.md](RETAIL.md)
