# THN — scene scripts

`.thn` files drive cutscenes and the animated base and room views. It is a serialization format —
objects, arrays and properties — stored as a compiled Lua chunk, not an INI file, and in retail not
text.

## The engine

`.thn` is short for THORN, the scene-scripting library in `EXE/thorn.dll`. The DLL embeds a stock
interpreter — `$Lua: Lua 3.2 Copyright (C) 1994-1999 TeCGraf, PUC-Rio $` — driven from
`Src\THORN\LuaScriptParser.cpp`, whose error strings (`LUA unable to parse file`, `LUA unable to read
file`, `%s is not a Lua binary file`) are still in the binary.

Two consequences:

- **The engine loads scripts with `dofile`.** Lua's loader sniffs the signature and falls back to
  compiling source text, so the game reads a plain-text `.thn` as happily as a compiled one — a
  writer never has to emit bytecode. Observed in the running game: a plain-text script loads from
  the packed retail install.
- **Lua 3.2 has no boolean type.** Truth values are bare identifiers — see [`Y` and
  `N`](#y-and-n-are-the-booleans).

## A THN is data, not code

Disassembling every retail script yields fifteen distinct opcodes, and every one either pushes a
value or builds a table. There is no `CALL`, no jump or branch, no local variable, no upvalue, no
`GETTABLE`, and — measured from the constant pool, which admits exactly two tags — not one nested
function prototype.

No control flow to interpret and no engine API to model. A THN is a literal, so reading it is an
evaluator of a few hundred lines rather than an interpreter.

### Three top-level variables, always

| Variable   | Type              |
| ---------- | ----------------- |
| `duration` | number            |
| `entities` | array of records  |
| `events`   | array of records  |

That is the whole document model.

### `+` is the only operator, and only over flags

Every `ADD` instruction takes globals — or the result of a previous `ADD` — as both operands. Never
a literal.

```lua
flags = POSITION + ORIENTATION + ENTITY_RELATIVE
```

A translator needs `+` only as set union over identifiers, never as arithmetic.

## The value domain

Five kinds of value occur, four of which map onto JSON directly:

| THN                 | JSON                                                            |
| ------------------- | --------------------------------------------------------------- |
| number              | number — but see [the text caveat](#numbers-are-stored-as-text) |
| string              | string                                                          |
| array table         | array                                                           |
| hash table          | object                                                          |
| **bare identifier** | **no direct equivalent**                                        |

`type = SCENE` is a global *read*, not the string `"SCENE"`, and the two compile to different
opcodes (`GETGLOBAL` vs `PUSHCONSTANT`). Emitting `type = "SCENE"` into a plain-text script hands
the engine a string where it expects a number, so the model keeps identifiers distinguishable from
strings — a tagged scalar, not a bare string.

`thorn.dll` holds the full vocabulary — entity types, event types, flags, target kinds, axes, light
and fog kinds, property-key names. All of it, with what each name is worth and where that came from,
is in [THORN.md](../refs/THORN.md).

### `Y` and `N` are the booleans

Lua 3.2 predates Lua's boolean type, so THORN registers two one-character globals. They are
identifiers like any other and fall out of the tagged-scalar treatment. A translator must not fold
them into JSON `true`/`false`: writing `on = true` into a plain-text script means the global `true`,
which THORN does not define.

### Numbers are stored as text

The constant pool stores numbers as decimal ASCII, not IEEE doubles — `1.333333`, `9e-006`,
`-0.9999900000000001` appear literally. Integers small enough to ride in an operand
(`PUSHNUMBER`/`NEG`, up to 16 bits) never reach the pool.

Byte-exact round-tripping is therefore a formatting problem rather than a precision one: re-emitting
`-0.9999900000000001` as `-0.99999` changes the file even though the value is unchanged. Keep the
literal, not the parsed value.

## Container layout

A compiled `.thn` is a header, a code block and a constant pool, with big-endian integer fields
throughout.

| Region           | Notes                                                                                                                                                                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Header, 21 bytes | Bytes 0–15 identical in every file: `1b 4c 75 61 32` (`ESC` `Lua`, version `0x32`) then ten bytes ending `01 00 00`. A big-endian `uint32` at offset 15 tracks the code block length. Bytes 19–20 are not decoded; byte 19 varies with table nesting, byte 20 is always zero. |
| Code             | Begins at offset **21** in every file, runs to `ENDCODE`.                                                                                                                                                                                       |
| —                | Exactly **4 bytes** between `ENDCODE` and the constant count, in every file. Not decoded.                                                                                                                                                       |
| Constant count   | Big-endian `uint32`.                                                                                                                                                                                                                           |
| Constant pool    | Runs to EOF.                                                                                                                                                                                                                                   |

Pool entries are tag-discriminated, and only two tags occur:

| Tag  | Layout                                                         |
| ---- | -------------------------------------------------------------- |
| `01` | `uint8` length, then that many bytes of decimal ASCII (no NUL) |
| `02` | big-endian `uint32` length *including* the NUL, then the bytes |

A third tag would be a nested function prototype. There is not one.

## How INI reaches a script

Not through `act_AddRTC`. That property names an `.ini` — an RTC file, which then names the script:

```
[Trigger] act_AddRTC = missions\\m13\\M013_s072aa_St01_01_nrml.ini
                            ↓
                       [CharacterEncounter] action = scripts\story\s072aa_offer_Quintaine_pl_09_pad_01.thn
```

Every `act_AddRTC` / `act_RemoveRTC` / `cnd_RTCDone` value ends in `.ini`; not one ends in `.thn`.

`[Trigger] Act_CallThorn` is the one that does. Every occurrence is under `MISSIONS`, and it is the
only property that reaches a script in `MISSIONS/` or `RANDOMMISSIONS/`. Full list of nineteen in
[Corpus](#how-ini-reaches-a-script-1).

Paths are backslash-separated and authored case-insensitively, and retail mixes `\` and `\\` inside
the same property: `[Trigger] Act_CallThorn` carries `missions\\m12\\M12_Osiris.thn` and
`missions\m11\M11_Walker1.thn` one line apart. Collapse repeated separators, or a fiftieth of the
references stop resolving.

## Two export forms

Some scripts carry the resolved values where the rest carry the symbolic globals, and store arrays
as a hash keyed `1..n`:

```lua
-- the symbolic form                          -- the numeric form
type = SCENE                                 type = 9
up = Y_AXIS                                  up = 1
front = Z_AXIS                               front = 2
fogon = N                                    fogon = 0
pos = { 0, 0, 0 }                            pos = { [1] = 0, [2] = 0, [3] = 0 }
```

Two exporters, not two formats — the engine reads a number wherever it would read the global that
holds one, so the identifier arm stays distinct from the string arm without needing resolution. Both
forms read, round-trip, and are in live use, unsegregated by purpose and never normalised into each
other.

The correspondence between the two forms is what resolved every enum THORN defines — see
[THORN.md](../refs/THORN.md). The pairing was done structurally rather than by frequency: a numeric entity
carrying `cameraprops` is a camera whatever the counts say, because no other entity type carries
that block.

`{ [1] = x }` and `{ x }` are the same table to Lua but different instructions in the bytecode —
`SETMAP` against `SETLIST` — and the model records which was used, so a table keyed `1..n` is
written back keyed, not collapsed into an array literal.

## Scope

At `./thn`, a separate entry point from the INI ones. Three of the four directions exist:

| Direction        | Module          | State                                    |
| ---------------- | --------------- | ---------------------------------------- |
| bytecode → model | `thn/bytecode/` | every retail script                      |
| model → text     | `thn/text/`     | the whole write path                     |
| text → model     | `thn/text/`     | a Lua *literal* parser, not a Lua parser |
| model → bytecode | —               | **deferred**, see [TODO](#todo)          |

The typed layer is at `./thn/scene` — entities and events as records rather than tables, with the
vocabulary in [THORN.md](../refs/THORN.md). It is the one place the two export forms are folded together.

A bytecode writer isn't required — emitting text is a complete write path. It's deferred for
completeness, not ruled out: `bytecode/data.ts` already carries the name → byte direction of the
opcode table, and `thn.write`'s `format` parameter names only `'text'` so widening it later is
additive.

## API

### `./thn`

| Export            | Kind      |                                                                         |
| ----------------- | --------- | ----------------------------------------------------------------------- |
| `bytecode`        | namespace | Everything under `./thn/bytecode`.                                      |
| `Entry`           | interface | One `key = value` pair of a table's hash part, in insertion order.      |
| `Format`          | type      | `'bytecode' \| 'text'`.                                                 |
| `formatOf`        | function  | Detects the encoding of a buffer without parsing it.                    |
| `Global`          | interface | One top-level `name = value` assignment.                                |
| `Globals`         | type      | A whole script: an ordered sequence of assignments.                     |
| `IdentifierValue` | interface | A bare identifier — the one value with no JSON equivalent.              |
| `NumberValue`     | interface | A number, kept as the literal text it was written as.                   |
| `read`            | function  | Reads a scene script in whichever encoding it is in.                    |
| `StringValue`     | interface | A quoted string: a file path, an entity name, a subtitle.               |
| `TableValue`      | interface | A Lua table, which is both of JSON's containers at once.                |
| `text`            | namespace | Everything under `./thn/text`.                                          |
| `value`           | namespace | Value constructors, guards and accessors (below).                       |
| `Value`           | type      | One value of one assignment or one table slot.                          |
| `ValueType`       | type      | Which of the four things a value is.                                    |
| `write`           | function  | Writes a script as bytes. `format` accepts only `'text'`, deliberately. |

`value`: `number`, `string`, `identifier`, `table`, `list`, `from`, `isNumber`, `isString`,
`isIdentifier`, `isTable`, `toNumber`, `getEntry`, `getGlobal`, `equals`.

### `./thn/text`

| Export         | Kind      |                                                               |
| -------------- | --------- | ------------------------------------------------------------- |
| `read`         | function  | Parses a plain-text scene script. A Lua _literal_ parser.     |
| `write`        | function  | Renders a script as Lua source. This is the whole write path. |
| `WriteOptions` | interface | Formatting options for `write`.                               |

### `./thn/bytecode`

Read only; there is no bytecode writer, and the two undecoded header fields are why. The opcode
table is the only constant that gets out — `SIGNATURE`/`VERSION` back `isBytecode`,
`HEADER_BYTE_LENGTH`/`GAP_BYTE_LENGTH` are this reader's walk, `ConstantTag` types nothing a caller
receives, and `OPCODE_BYTES` is the absent writer's direction.

| Export       | Kind      |                                                                               |
| ------------ | --------- | ----------------------------------------------------------------------------- |
| `isBytecode` | function  | Whether a buffer is a compiled chunk rather than script text.                 |
| `Opcode`     | interface | `{ name, width: 0 \| 1 \| 2, count: boolean }`.                               |
| `OPCODES`    | const     | Every opcode, indexed by its byte.                                            |
| `read`       | function  | Reads a compiled Lua 3.2 chunk into a script. An evaluator, not a decompiler. |

### `./thn/scene`

The largest entry point, and almost all of it is the vocabulary: ten entity arms, fifteen event
arms, and the property blocks they carry. See [THORN.md](../refs/THORN.md) for where each name and
value comes from.

| Export                  | Kind      |                                                                                   |
| ----------------------- | --------- | --------------------------------------------------------------------------------- |
| `AttachEntity`          | interface | `ATTACH_ENTITY` event.                                                            |
| `AudioProps`            | interface | `audioprops` block.                                                               |
| `AxisName`              | type      | `X_AXIS` … `NEG_Z_AXIS`.                                                          |
| `AxisRotation`          | type      | Degrees about an axis. The animation form, never on an entity.                    |
| `Camera`                | interface | `CAMERA` entity.                                                                  |
| `CameraAnimProps`       | interface | `cameraprops` on a `START_CAMERA_PROP_ANIM` — different keys from the entity's.   |
| `CameraProps`           | interface | `cameraprops` on a `CAMERA` entity.                                               |
| `Compound`              | interface | `COMPOUND` entity.                                                                |
| `CompoundProps`         | interface | `compoundprops` block.                                                            |
| `ConnectHardpoints`     | interface | `CONNECT_HARDPOINTS` event.                                                       |
| `data`                  | namespace | The numeric tables behind every name (below).                                     |
| `Deformable`            | interface | `DEFORMABLE` entity.                                                              |
| `Entity`                | type      | One entity. Ten arms, which is every type retail uses.                            |
| `EntityCommon`          | interface | What every entity carries, whatever its type.                                     |
| `EntityOf`              | type      | Narrows to the entity of a given type, so a consumer can filter without a cast.   |
| `EntityTypeName`        | type      | The ten names.                                                                    |
| `Event`                 | type      | One event. Fifteen arms, which is every action retail uses.                       |
| `EventCommon`           | interface | What every event carries.                                                         |
| `EventOf`               | type      | Narrows to the event of a given action.                                           |
| `EventTypeName`         | type      | The fifteen names.                                                                |
| `FogModeName`           | type      | `F_NONE`, `F_EXP`, `F_EXP2`, `F_LINEAR`.                                          |
| `FogProps`              | interface | Fog, as a `fogprops` block or inline on a `SCENE`.                                |
| `Light`                 | interface | `LIGHT` entity.                                                                   |
| `LightProps`            | interface | `lightprops` block.                                                               |
| `LightTypeName`         | type      | `L_POINT`, `L_SPOT`, `L_DIRECT`.                                                  |
| `Marker`                | interface | A placeholder with no visual.                                                     |
| `Matrix3Rows`           | type      | A rotation matrix, as three `Vector3Tuple` rows.                                  |
| `Monitor`               | interface | The render target. The one entity type with no `spatialprops`.                    |
| `MotionPath`            | interface | `MOTION_PATH` entity.                                                             |
| `NullPath`              | interface | A `MOTION_PATH` with no path on it.                                               |
| `OrientationSplinePath` | interface | Position and orientation per keyframe. Every retail path that has one is this.    |
| `Oriented`              | interface | Where the action orients something.                                               |
| `OrientedPoint`         | interface | One keyframe of an oriented path.                                                 |
| `ParamCurve`            | interface | A parameter curve. Every retail `points` row is exactly four numbers.             |
| `PathFlagName`          | type      | `OPEN`, `CLOSED`.                                                                 |
| `PathProps`             | type      | A path an object is moved along, as a Catmull-Rom spline.                         |
| `PathTypeName`          | type      | The two spline class names.                                                       |
| `Placed`                | interface | An entity that renders, and therefore has a place to be.                          |
| `Psys`                  | interface | `PSYS` entity.                                                                    |
| `PsysProps`             | interface | `psysprops` block.                                                                |
| `QuaternionTuple`       | type      | A four-number tuple, as the file writes a quaternion.                             |
| `read`                  | function  | Turns an interim document into a scene. Both export forms read the same.          |
| `Scene`                 | interface | The scene descriptor. One per script, with one retail exception.                  |
| `Script`                | interface | A whole script: what the three globals mean.                                      |
| `SetCamera`             | interface | `SET_CAMERA` event.                                                               |
| `Sound`                 | interface | `SOUND` entity.                                                                   |
| `SpatialProps`          | interface | Position and orientation. `orient` places, `q_orient` and `axisrot` animate.      |
| `SplinePath`            | interface | Position only. Named by `thorn.dll`, used by no retail script.                    |
| `StartAudioPropAnim`    | interface | `START_AUDIO_PROP_ANIM` event.                                                    |
| `StartCameraPropAnim`   | interface | `START_CAMERA_PROP_ANIM` event.                                                   |
| `StartFlrHeightAnim`    | interface | `START_FLR_HEIGHT_ANIM` event.                                                    |
| `StartFogPropAnim`      | interface | `START_FOG_PROP_ANIM` event.                                                      |
| `StartIk`               | interface | Inverse kinematics — the third most common event in retail.                       |
| `StartLightPropAnim`    | interface | `START_LIGHT_PROP_ANIM` event.                                                    |
| `StartMotion`           | interface | `START_MOTION` event.                                                             |
| `StartPathAnimation`    | interface | `START_PATH_ANIMATION` event.                                                     |
| `StartPsys`             | interface | `START_PSYS` event.                                                               |
| `StartPsysPropAnim`     | interface | `START_PSYS_PROP_ANIM` event.                                                     |
| `StartSound`            | interface | `START_SOUND` event.                                                              |
| `StartSpatialPropAnim`  | interface | `START_SPATIAL_PROP_ANIM` event.                                                  |
| `Targeted`              | interface | Where the action addresses part of an entity rather than the whole of it.         |
| `TargetTypeName`        | type      | `ROOT`, `HARDPOINT`, `PART`.                                                      |
| `TruthName`             | type      | `N`, `Y`.                                                                         |
| `UnknownKeys`           | type      | Keys the vocabulary does not name, kept verbatim so a rewrite does not lose them. |
| `UserProps`             | type      | `userprops` — read by Freelancer, not by THORN.                                   |
| `Vector3Tuple`          | type      | A three-number tuple: a position, a colour or an axis, as the file writes it.     |
| `write`                 | function  | Turns a scene back into an interim document, always in symbolic form.             |

`data`: `ENTITY_TYPES`, `UNUSED_ENTITY_TYPES`, `EVENT_TYPES`, `UNUSED_EVENT_TYPES`,
`LEGACY_EVENT_TYPES`, `AXES`, `TARGET_TYPES`, `LIGHT_TYPES`, `FOG_MODES`, `TRUTH`, `RENDER_FLAGS`,
`SOUND_ENTITY_FLAGS`, `entityFlagsOf`, `ATTACH_FLAGS`, `SOUND_FLAGS`, `UNUSED_FLAGS`, `CURVE_TYPES`,
`PATH_TYPES`, `PATH_FLAGS`, `USER_PROPS`, `CATEGORIES`, `namesOf`.

## Corpus

All 1,506 retail `.thn` files are compiled Lua 3.2 bytecode, and every statement in this document
comes from disassembling all of them.

| | Count |
| --- | --- |
| Scripts | 1,506 |
| — symbolic form | 1,151 |
| — numeric form | 355 |
| Constants | 442,599 |
| — number (tag `01`) | 282,234 |
| — string (tag `02`) | 160,365 |
| Identifier reads | 155,259, over 55 distinct names |
| Tables | 547,086 |
| — keyed `1..n` | 76,447 |
| Entities | 41,250 |
| Events | 50,785 |

### The fifteen opcodes

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

`SETGLOBAL` fires exactly 4,518 times, 3 × 1,506 — `duration`, `entities` and `events` in all 1,506
files and nothing else. All 9,557 `ADD` instructions take globals as both operands.

The per-opcode counts reproduce the Lua 3.2 disassembly table exactly, and `bytecode.test.ts` pins
the two places a plausible near-miss would land: `SETMAP`'s operand being pairs minus one, and
`SETTABLEPOP` taking no operand despite ending in neither `W` nor `OP`.

No retail table fills both parts at once — an array part and a hash part never appear in the same
table, in any of 547,086.

### `Y` and `N`

| Key        | `Y`   | `N` |
| ---------- | ----- | --- |
| `on`       | 1,747 | 621 |
| `fogon`    | 76    | 28  |
| `fogtable` | 0     | 10  |

### How INI reaches a script

Nineteen properties carry a script path, across 3,000 references naming 1,292 distinct scripts, and
every one resolves to a file that exists:

| Property                                                    | References |
| ----------------------------------------------------------- | ---------- |
| `[Room_Info] scene` / `set_script` / `goodscart_script`     | 1,128      |
| `[GenericScripts] script`                                   | 617        |
| `[MRoom] fixture`                                           | 559        |
| `[CharacterPlacement] start_script`                         | 208        |
| `[CharacterEncounter]` × 6 (`action`, `offer`, …)           | 143        |
| `[GCS_Exclusions] script`                                   | 126        |
| `[Char] fidget`                                             | 83         |
| `[Trigger] Act_CallThorn`                                   | 70         |
| `[PlayerShipPlacement] landing_script` / `launching_script` | 58         |
| `[Trigger] Act_AddAmbient` / `Act_RemoveAmbient`            | 8          |

All 101 `act_AddRTC` / `act_RemoveRTC` / `cnd_RTCDone` values end in `.ini`. All 70 `Act_CallThorn`
occurrences are under `MISSIONS`, naming 60 of the 83 files there with nothing else naming any of
them. 61 of the 1,292 stop resolving if repeated path separators are not collapsed.

### Both export forms are in live use

| Form     | Referenced from INI    |
| -------- | ---------------------- |
| numeric  | 275 of 355 (77.5%)     |
| symbolic | 1,017 of 1,151 (88.4%) |

`[Room_Info] scene` names 129 symbolic scripts and 142 numeric ones; under `SCRIPTS/BASES` the
`bar_enter_01` scripts are 16 symbolic and 22 numeric. One difference is real and unexplained:
within `SCRIPTS/BASES`, numeric-form scripts are referenced at 75.8% against the symbolic form's
91.6%.

### 214 scripts are named by nothing

In both forms, and in every directory. 23 of the 83 under `MISSIONS/` read as superseded drafts:

```
missions/m01a/m01a_01.thn … m01a_09.thn, m01a_11.thn   (m01a_10 does not exist)
missions/m01a/m01a_rev2_07.thn                          ("rev2", beside a referenced m01a_07)
missions/m01b/m01b_01.thn … m01b_03.thn
missions/m02/m03_survivor1.thn                          (an m03 script filed under m02)
```

A numbered sequence with a hole in it, a file named `rev2`, and one misfiled by a directory. The 60
that are referenced carry descriptive names — `M12_Osiris.thn`, `M11_Walker1.thn`.

A reading, not a finding. The corpus cannot show a script is unreachable, only that nothing in
`DATA` names it, and the 191 unreferenced scripts outside `MISSIONS/` have no such tell.

### Round-trip

**bytecode → model → text → model** compares byte-for-byte over all 1,506 retail scripts, because
every scalar survives as its literal — asserted in `thn/corpus.test.ts` alongside every count in
this document. The text reader closes the loop the absent bytecode writer leaves open.

The typed layer's directions are in [RETAIL.md](../refs/RETAIL.md#round-trip-fidelity):
`typed → interim → typed` is an identity over all 1,506, while `interim → typed → interim`
normalises the numeric form into the symbolic one and is a fixed point rather than an identity.

## TODO

**What the 4-byte gap before the constant count holds, and header bytes 19–20.** Constant across
nothing and correlated with nesting depth respectively, so most likely `maxstacksize` and friends.
Irrelevant to reading, and the only thing standing between the deferred bytecode writer and
existing.

Not TODO-shaped: the layout of a Lua dump is pending a read of `ldump.c` and `lundump.c` at the same
`github.com/lua/lua` `v3.2` tag that supplied the opcode table. Start there rather than guessing
from the corpus.

---

[THORN.md](../refs/THORN.md) · [INI.md](INI.md) · [RETAIL.md](../refs/RETAIL.md)
