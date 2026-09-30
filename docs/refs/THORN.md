# THORN — the scene vocabulary

[THN.md](../modules/THN.md) describes the container. This document is the layer above: what the identifiers
mean, what the keys are, and which the engine reads. It is the reference the typed layer at
[`./thn/scene`](../modules/THN.md#thnscene) is built from.

## Provenance

Every row carries a provenance mark, because the sources disagree.

| Mark       | Source                                        | What it can establish                                                               |
| ---------- | --------------------------------------------- | ------------------------------------------------------------------------------------- |
| **dll**    | `EXE/thorn.dll`'s string table                | that a name *exists* — nothing about its value or use                                 |
| **binary** | `thorn.dll`'s **global-registration routine** | what the Lua global that name reads *holds*                                           |
| **code**   | `thorn.dll`'s parser, event classes and engine | what the engine *does* with a value — which transform it writes, when, in what order |
| **corpus** | the 1,506 retail scripts                      | that a name is *used*, how, and — against the numeric export form — what it *equals* |
| **guide**  | the author's *Freelancer THN Scripting Guide* | what a thing is *for*; explicitly part guesswork                                      |

dll and binary are the same file and not the same claim: the string table proves a name was compiled
in, the registration routine proves what THORN pushes when a script reads it. A name can be
registered twice, in which case only the last write survives. **code** is the same file again, read
further: the routines that consume a value, cited by address. It outranks the guide wherever the two
describe the same thing.

A value is recorded where the corpus measures it or the registration routine sets it, and the two are
noted separately where both apply. Where the guide and a measurement disagree, the measurement wins.

### The registration routine

`thorn.dll`'s init routine registers every THORN global in one pass: six array-driven loops and
twenty-seven individual calls, all push the number, push the name, set the global.

| Loop at | Names         | Values           | Count | Registers           |
| ------- | ------------- | ---------------- | ----- | ------------------- |
| `4d13`  | `.data:3e020` | `.data:3e058`    | 14    | entity types        |
| `4d49`  | `.data:3e090` | `.data:3e0e0`    | 20    | event types         |
| `4d77`  | `.data:3e130` | *the loop index* | 6     | axes                |
| `4fd0`  | `.data:3e238` | `.data:3e248`    | 4     | fog modes           |
| `5000`  | `.data:3e258` | `.data:3e264`    | 3     | light types         |
| `4dad`… | inline        | inline           | 27    | flags, and the rest |

File offsets are also RVAs here — `thorn.dll`'s sections are laid out one-to-one — against image base
`0x06f20000`.

The name arrays are **not** in value order, and nothing may be derived from position — see
[Reading the arrays positionally](#reading-the-arrays-positionally).

## Entity types

`entities` is a list of records, each with a `type`.

| `type`           | Value | Provenance | Distinguishing block              |
| ---------------- | ----- | ---------- | --------------------------------- |
| `UNKNOWN_ENTITY` | 0     | binary     | *unused in retail*                |
| `COMPOUND`       | 1     | corpus     | `userprops.category`              |
| `DEFORMABLE`     | 2     | corpus     | `compoundprops.floor_height`      |
| `CAMERA`         | 3     | corpus     | `cameraprops`                     |
| `MONITOR`        | 4     | corpus     | *none* — no `spatialprops` either |
| `LIGHT`          | 5     | corpus     | `lightprops`                      |
| `SOUND`          | 6     | corpus     | `audioprops`                      |
| `MARKER`         | 7     | corpus     | *none* — `spatialprops` only      |
| `HARDPOINT`      | 8     | binary     | *unreachable*                     |
| `SCENE`          | 9     | corpus     | `up`/`front`/`ambient`            |
| `SUB_SCENE`      | 10    | binary     | *unused in retail*                |
| `MOTION_PATH`    | 11    | corpus     | `pathprops`                       |
| `DELETED`        | 12    | binary     | *unused in retail*                |
| `PSYS`           | 13    | corpus     | `psysprops`                       |

The entity loop sets `HARDPOINT` = 8 and a later call in the same routine sets it to 1. The last
write wins, so the Lua global holds 1 — exactly the `target_type` the corpus measures. No script can
write `type = HARDPOINT` and get 8; 8 is the C++ enum value and has no name a script can reach. The
typed layer accepts only the ten measured types.

## Event types

`events` is a list of `{ time, action, targets, properties }`.

| `action`                  | Value | Provenance | Targets           |
| ------------------------- | ----- | ---------- | ----------------- |
| `UNDEFINED_EVENT`         | 0     | binary     | *unused*          |
| `USER_EVENT`              | 1     | binary     | *unused*          |
| `SET_CAMERA`              | 2     | corpus     | monitor, camera   |
| `START_SOUND`             | 3     | corpus     | sound             |
| `START_LIGHT_PROP_ANIM`   | 4     | corpus     | light             |
| `START_CAMERA_PROP_ANIM`  | 5     | corpus     | camera            |
| `START_PATH_ANIMATION`    | 6     | corpus     | object, path      |
| `START_SPATIAL_PROP_ANIM` | 7     | corpus     | object            |
| `ATTACH_ENTITY`           | 8     | corpus     | object, parent    |
| `CONNECT_HARDPOINTS`      | 9     | corpus     | object, target    |
| `START_MOTION`            | 10    | corpus     | object            |
| `START_IK`                | 11    | corpus     | object, target    |
| `START_SUB_SCENE`         | 12    | binary     | *unused*          |
| `START_PSYS`              | 13    | corpus     | effect            |
| `START_PSYS_PROP_ANIM`    | 14    | corpus     | effect            |
| `START_AUDIO_PROP_ANIM`   | 15    | corpus     | sound             |
| `START_FOG_PROP_ANIM`     | 16    | corpus     | scene             |
| `START_REVERB_PROP_ANIM`  | 17    | binary     | *unused*          |
| `START_FLR_HEIGHT_ANIM`   | 18    | corpus     | character, marker |
| `SUBTITLE`                | 19    | binary     | *unused*          |

`thorn.dll` also carries an older event vocabulary (**dll**), unused by any retail script:
`SET_MONITOR`, `CONNECT_ENTITY`, `START_PATH_MOTION`, `USER`, `UNDEFINED`, and
`START_{FOG,AUDIO,PSYS,SPATIAL,CAMERA,LIGHT}_PROPERTY_ANIM` — the same names with `PROPERTY` spelled
out where the current ones say `PROP`.

## The other enums

All corpus-measured and all confirmed value-for-value by the registration routine. `ROOT` = 0,
`PART` = 2 and `HARDPOINT` = 1 are set by three consecutive calls at `4f03`, `4f17` and `4f2c`; the
axes come out of the loop at `4d77` from the loop index; the light and fog enums out of the loops at
`5000` and `4fd0`.

| Axis         | Value |     | Target      | Value |     | Light `type` | Value |     | `fogmode`  | Value |
| ------------ | ----- | --- | ----------- | ----- | --- | ------------ | ----- | --- | ---------- | ----- |
| `X_AXIS`     | 0     |     | `ROOT`      | 0     |     | `L_POINT`    | 1     |     | `F_NONE`   | 0     |
| `Y_AXIS`     | 1     |     | `HARDPOINT` | 1     |     | `L_SPOT`     | 2     |     | `F_EXP`    | 1     |
| `Z_AXIS`     | 2     |     | `PART`      | 2     |     | `L_DIRECT`   | 3     |     | `F_EXP2`   | 2     |
| `NEG_X_AXIS` | 3     |     |             |       |     |              |       |     | `F_LINEAR` | 3     |
| `NEG_Y_AXIS` | 4     |     |             |       |     |              |       |     |            |       |
| `NEG_Z_AXIS` | 5     |     |             |       |     |              |       |     |            |       |

Two of the enums are Direct3D's. `L_POINT`/`L_SPOT`/`L_DIRECT` are 1/2/3, which is `D3DLIGHTTYPE`;
`F_NONE`/`F_EXP`/`F_EXP2`/`F_LINEAR` are 0/1/2/3, which is `D3DFOGMODE`. THORN passes them through.

`Y` = 1 and `N` = 0 are the last two globals the routine registers, at `5028` and `503d`. They remain
identifiers and must not be written back as `true`/`false` — see
[THN.md](../modules/THN.md#y-and-n-are-the-booleans).

### Flags

Flags are a bitfield, and the same bit means different things in different places — THORN's globals
are not one namespace. Bit 2 is `SPATIAL` on a sound and `LIT_AMBIENT` on anything that renders; bit
8 is `LOOP` on a `START_SOUND` and `LOOK_AT` on an `ATTACH_ENTITY`.

**Entity `flags`** (corpus, every bit also binary):

| Name                | Bit | Appears on                               |
| ------------------- | --- | ---------------------------------------- |
| `REFERENCE`         | 1   | markers, cameras, lights, sounds         |
| `SPATIAL`           | 2   | sounds **only**                          |
| `LIT_AMBIENT`       | 2   | compounds, deformables, particle systems |
| `LIT_DYNAMIC`       | 4   | compounds, deformables, particle systems |
| `STREAM`            | 4   | *unused in retail*                       |
| `LOOP`              | 8   | *see `START_SOUND` below*                |
| `HIDDEN`            | 16  | any                                      |
| `FOG_PROPS_REMOVED` | 32  | *unused in retail*                       |

The `SPATIAL` / `LIT_AMBIENT` collision is decidable because the two never appear on the same entity
type, so decoding a numeric entity flag is the one place the typed layer consults the entity's
`type`.

**`ATTACH_ENTITY` and `START_PATH_ANIMATION` `flags`** (values corpus, every bit also binary;
meanings code, for `ATTACH_ENTITY` — [What `ATTACH_ENTITY` does](#what-attach_entity-does) has the
composition, `P` the parent frame and `rel` the child's frame relative to it at the attach's start):

| Name                   | Bit | What it does on an `ATTACH_ENTITY`                                                                                   |
| ---------------------- | --- | -------------------------------------------------------------------------------------------------------------------- |
| `USE_SCRIPT_DURATION`  | 1   | the event **never ends**. Set by the parser itself when `duration` is nil, unless a `flags` key replaces it           |
| `POSITION`             | 2   | writes the child's position every update: `P.t + offset`                                                             |
| `PATH_POSITION`        | 2   | *unused in retail*; the same bit                                                                                     |
| `ORIENTATION`          | 4   | writes the child's orientation every update: `P.R`                                                                   |
| `LOOK_AT`              | 8   | aims the child's `front` axis at `P.t + offset`, `up` toward the scene's up — **only when `ORIENTATION` is clear**   |
| —                      | 16  | read by no attach routine                                                                                            |
| `ENTITY_RELATIVE`      | 32  | `offset` is in the parent's axes, `P.R · offset`, for `POSITION` and `LOOK_AT`                                       |
| `PARENT_CHILD`         | 64  | rigid: `child = P · rel`, `POSITION`/`ORIENTATION` choosing which half is written; `offset` and the other bits unread |
| `ORIENTATION_RELATIVE` | 128 | with `ORIENTATION`: `P.R · rel.R` in place of `P.R`, keeping the child's starting rotation relative to the parent    |

`PARENT_CHILD` = 64 contradicts the order `thorn.dll`'s flag printer emits, which would put
`ORIENTATION_RELATIVE` at 64. The printer's order is not the enum; the registration routine is.

The guide's three readings — "follow the parent's position", "inherit the parent's orientation",
"orient towards the parent" — are right as far as they go. What it missed: `offset` is in scene axes
unless `ENTITY_RELATIVE`, `LOOK_AT` yields to `ORIENTATION`, and `PARENT_CHILD` replaces the whole
rule.

**`START_PATH_ANIMATION` reads the same bits differently** (code): `POSITION` places the object at
the path's point plus `offset` in the *path's* frame, `ORIENTATION` takes the path's own orientation
or, with `LOOK_AT`, aims along it; `LOOK_AT` without `ORIENTATION` and `ENTITY_RELATIVE` are unread.

**`START_SOUND` `flags`**: `LOOP` = 8.

**Registered but never used by any retail script** (binary): `STREAM` = 4, `FOG_PROPS_REMOVED` = 32,
`PATH_POSITION` = 2, `USE_SCRIPT_DURATION` = 1. `PATH_POSITION` collides with `POSITION` and `STREAM`
with `LIT_DYNAMIC` — the namespaces really are separate — and bit 16 stays unclaimed in the attach
namespace. `USE_SCRIPT_DURATION` is written by no script and still in effect: it is the bit the
parser sets on any event without a `duration` (code).

## The registry is closed

THORN registers 73 globals. Retail reads 55 of them. Nothing retail reads is unregistered: every
identifier in all 1,506 scripts resolves against the routine, so the vocabulary here is the whole
vocabulary and a script using a name outside it is reading `nil`.

The eighteen registered-but-unused names, in registration order: `UNKNOWN_ENTITY`, `SUB_SCENE`,
`DELETED`, `UNDEFINED_EVENT`, `USER_EVENT`, `START_SUB_SCENE`, `START_REVERB_PROP_ANIM`, `SUBTITLE`,
`FOG_PROPS_REMOVED`, `STREAM`, `USE_SCRIPT_DURATION`, `PATH_POSITION`, `ADD_PATH`, `LOOKAT_ENTITY`,
`STOP`, `STOP_IK`, `START`, `PROPERTY_ANIM`.

Six appear nowhere else here because nothing in the corpus constrains what they are for — only what
they hold (binary):

| Name            | Value | Reading                                                                     |
| --------------- | ----- | --------------------------------------------------------------------------- |
| `PROPERTY_ANIM` | 0     | registered beside the flag sets; no key in retail takes it                  |
| `ADD_PATH`      | 6     | shares the attach-flag namespace's spare region                             |
| `LOOKAT_ENTITY` | 8     | collides with `LOOK_AT`, so plainly a different namespace                   |
| `STOP`          | 21    | as an `action`, **dropped**: the parser makes no event for it (code)        |
| `STOP_IK`       | 22    | likewise dropped                                                            |
| `START`         | 23    | as an `action`, **an alias** the parser rewrites (code) — see below         |

21 through 23 sits just past the event enum's 0–19, and the parser treats them as actions: before its
per-action switch it rewrites `START` to `START_SOUND` when the event's target is a `SOUND` entity and
to `START_MOTION` otherwise, and anything left outside 1–19 — `STOP`, `STOP_IK`, 0, 20 — is released
without an event. No script exercises any of the three. Whether `STOP` and `STOP_IK` mean something
outside the `action` slot is still open — see [TODO](#todo).

The same pass rewrites one retail action: a `START_PATH_ANIMATION` whose second target is not a
`MOTION_PATH` — an entity of type 1 to 8 — is parsed as an `ATTACH_ENTITY`. Every retail path
animation targets a `MOTION_PATH`, so the rewrite never fires on retail data.

## Properties

`—` in a value column means the key exists in `thorn.dll` and no retail script sets it.

### Common to every entity

| Key             | Type    | Provenance         | Notes                                                     |
| --------------- | ------- | ------------------ | --------------------------------------------------------- |
| `entity_name`   | string  | dll, corpus, guide | must be unique within the script                          |
| `template_name` | string  | dll, corpus, guide | archetype nickname, resolved through `userprops.category` |
| `type`          | enum    | dll, corpus, guide | see above                                                 |
| `flags`         | flags   | dll, corpus, guide |                                                           |
| `lt_grp`        | integer | dll, corpus, guide | lighting group                                            |
| `srt_grp`       | integer | dll, corpus, guide | sort group, back to front; negative for backdrops         |
| `usr_flg`       | integer | dll, corpus, guide | only 0, 1 and 2 occur                                     |
| `template_id`   | integer | corpus             | **always 0, and in no game binary** — exporter residue    |
| `archetype`     | —       | dll                |                                                           |

`template_id` is set by the numeric-form exporter, is `0` in all 284 occurrences, and the string does
not appear in `thorn.dll`, `common.dll` or `Freelancer.exe`. Nothing reads it.

### `spatialprops` — every entity but `MONITOR`

| Key           | Type          | Provenance         | Notes                                                                        |
| ------------- | ------------- | ------------------ | ---------------------------------------------------------------------------- |
| `pos`         | float[3]      | dll, corpus, guide |                                                                              |
| `orient`      | float[3][3]   | dll, corpus, guide | rotation matrix; the placement form                                          |
| `q_orient`    | float[4]      | dll, corpus, guide | quaternion; **only ever in a `START_SPATIAL_PROP_ANIM`**, never on an entity |
| `axisrot`     | {float, axis} | dll, corpus, guide | likewise animation-only                                                      |
| `orientation` | —             | dll                |                                                                              |

Entities carry `pos` and `orient` and nothing else; animations carry `pos`, `q_orient` or `axisrot`.

### The typed blocks

| Block           | On                       | Keys (**corpus**)                                                                                         | Named but unused (**dll**) |
| --------------- | ------------------------ | --------------------------------------------------------------------------------------------------------- | -------------------------- |
| `cameraprops`   | `CAMERA`                 | `fovh`, `hvaspect`, `nearplane`, `farplane`                                                               |                            |
| `cameraprops`   | `START_CAMERA_PROP_ANIM` | `fovh`, `aspect`, `near`, `far`                                                                           |                            |
| `lightprops`    | `LIGHT`                  | `on`, `color`, `diffuse`, `specular`, `ambient`, `direction`, `range`, `cutoff`, `type`, `theta`, `atten` | `infinite`                 |
| `audioprops`    | `SOUND`                  | `attenuation`, `pan`, `dmin`, `dmax`, `ain`, `aout`, `atout`, `rmix`                                      |                            |
| `psysprops`     | `PSYS`                   | `sparam`                                                                                                  |                            |
| `pathprops`     | `MOTION_PATH`            | `path_type`, `path_data`                                                                                  | `control_pts`              |
| `compoundprops` | `DEFORMABLE`             | `floor_height`                                                                                            |                            |
| `fogprops`      | `START_FOG_PROP_ANIM`    | `fogon`, `fogmode`, `fogcolor`, `fogstart`, `fogend`, `fogdensity`, `fogtable`                            |                            |
| `reverbprops`   | —                        |                                                                                                           | `decay`, `vol`, `env`      |
| `param_curve`   | most animations          | `CLSID`, `points`                                                                                         |                            |

- The animating camera block is a different block. An entity says `hvaspect`, `nearplane`,
  `farplane`; a `START_CAMERA_PROP_ANIM` says `aspect`, `near`, `far`. Both spellings are in
  `thorn.dll`; only `fovh` is shared.
- `SCENE` carries the fog keys inline, not in a `fogprops` block. The block form is the event's.

### `pathprops`

`path_type` names the spline class; `path_data` is a string, not a table. `thorn.dll` writes the pair
as `path_type = "%s"` and `path_data = "%s"`, and the string it fills the second from is built out of
four format strings sitting together in the binary:

```
{%f,%f,%f},
OPEN
CLOSED
{%f,%f,%f,%f},
CV_CROrientationSplinePath
```

So `path_data` is a flag token then a run of braced tuples — and the trailing `, ` after the last
tuple belongs to the tuple, not between tuples, which is why every retail string ends with a
separator that looks stray. `%f` is six decimals.

| `path_type`                  | After the flag                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------- |
| `CV_CROrientationSplinePath` | `{x,y,z}` and `{x,y,z,w}` alternating — one position and one orientation per keyframe |
| `CV_CRSplinePath`            | `{x,y,z}` per keyframe, no orientations — **dll** only                                |
| `NULL`                       | no `path_data` at all                                                                 |

The flag is `OPEN` or `CLOSED`: whether the Catmull-Rom spline runs end to end or closes into a loop.
Both are in `thorn.dll`.

`NULL` is not a class the binary names anywhere. It is what the exporter writes for a `MOTION_PATH`
with no path on it, and those entities carry nothing else.

This is the one block whose keys are not independent — `path_type` decides how `path_data` reads — so
the typed layer models `pathprops` as a discriminated union, and `pathprops` with no `path_type` is
an error rather than an empty block.

### `param_curve`

`CLSID` names a component `thorn.dll` registers, and `points` is a list of 4-tuples.

Eleven curve types are registered; retail uses two. The other nine are dll only: `BumpInPCurve`,
`BumpOutPCurve`, `RampDownPCurve`, `RampUpPCurve`, `StepPCurve`, `SmoothPCurve`, `ThornLPCurve`,
`LinearPCurve`, `ThornParamCurve`.

`pcurve_period` is milliseconds, and negative means "match the event duration".

### Event properties

| Key                                                                                      | Type                 | On                                                                              | Provenance         |
| ---------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------- | ------------------ |
| `duration`                                                                               | float                | every event but `SET_CAMERA`                                                    | dll, corpus, guide |
| `flags`                                                                                  | flags                | `ATTACH_ENTITY`, `START_PATH_ANIMATION`, `START_SOUND`                          | dll, corpus, guide |
| `target_type` / `target_part`                                                            | enum / string        | `ATTACH_ENTITY`, `START_SPATIAL_PROP_ANIM`, `START_IK`, `START_FLR_HEIGHT_ANIM` | dll, corpus, guide |
| `offset`, `up`, `front`                                                                  | float[3], axis, axis | `ATTACH_ENTITY`, `START_PATH_ANIMATION`, `START_IK`                             | dll, corpus, guide |
| `hardpoint`, `parent_hardpoint`                                                          | string               | `CONNECT_HARDPOINTS`                                                            | dll, corpus, guide |
| `animation`                                                                              | string               | `START_MOTION`                                                                  | dll, corpus, guide |
| `time_scale`, `weight`, `heading`                                                        | float                | `START_MOTION`                                                                  | dll, corpus, guide |
| `trans_time`, `trans_scale`, `locked_bone`                                               | float, float, string | `START_MOTION`                                                                  | dll, corpus        |
| `start_time`                                                                             | float                | `START_MOTION`, `START_SOUND`                                                   | dll, corpus        |
| `event_flags`                                                                            | integer              | `START_MOTION`, `START_IK`                                                      | dll, corpus, guide |
| `end_effector`, `count_to_root`, `damping`, `point_at`, `move_to`, `transition_duration` |                      | `START_IK`                                                                      | dll, corpus        |
| `start_percent`, `stop_percent`                                                          | float                | `START_PATH_ANIMATION`                                                          | dll, corpus, guide |
| `floor_height`                                                                           | float                | `START_FLR_HEIGHT_ANIM`                                                         | dll, corpus, guide |
| `strid`, `user_event_string`                                                             | —                    | `SUBTITLE`, `USER_EVENT`                                                        | dll                |
| `percent1`, `percent2`, `loop`, `ik_id`                                                  | —                    |                                                                                 | dll                |

`time` and `duration` are seconds in the script and **integer milliseconds** in the engine: the parser
multiplies by 1000 and truncates (code, `0x6f25400`). A missing `duration` sets flag bit 1,
`USE_SCRIPT_DURATION`, which on an attach, a connect or a prop anim means the event never ends.

## What `ATTACH_ENTITY` does

All code, read out of `thorn.dll`'s `ATTACH` event class (vtable `0x6f5b30c`), the engine that runs
it, and the host routines it calls in `Freelancer.exe`. Addresses are VAs at the image bases,
`0x06f20000` for `thorn.dll` and `0x00400000` for the decrypted `Freelancer.exe`.

**Notation.** A frame is `F = [R | t]`, applied as `F(v) = R·v + t`; `A · B` applies `B` first;
`inverse([R | t]) = [Rᵀ | −Rᵀ·t]`. This is `x86math.dll`'s own convention — rotation row-major,
translation after it — which THORN calls for every product. An entity's frame is in **scene space**,
the frame the whole scene is placed with; for a scene nobody places it is world space, and a host
frame handed back (a hardpoint's) is taken out of world space by `inverse(S)`. The game never places
THORN's scene frame — it keeps its own in the host — so in practice scene space is world space.

**The parent frame `P`**, computed afresh at every update (`0x6f47c30`):

| `target_type` | Parent entity                | `P` |
| ------------- | ---------------------------- | --- |
| `ROOT`        | any                          | the parent's own frame; a `target_part` beside it is ignored |
| `HARDPOINT`   | `COMPOUND` or `DEFORMABLE`   | the hardpoint's frame: its `[R \| t]` relative to the part that owns it, composed onto that part's world (`Freelancer.exe` `0x451b90`, `0x452730`). The name is matched **ignoring case** — `HpEngine02` and `hpengine02` are one hardpoint — and the last duplicate wins; a name not found leaves the parent's own frame |
| `PART`        | `COMPOUND` or `DEFORMABLE`   | on a `DEFORMABLE`, the named bone's frame, ignoring case; on a `COMPOUND`, only `"root"` or `""` resolve — to the root's frame — and any other name leaves the parent's own frame |
| `HARDPOINT`, `PART` | anything else          | the parent's own frame |

**At the attach's start** it records `rel = inverse(P) · child`, the child's frame relative to the
parent at that instant — whatever the flags, though only `PARENT_CHILD` and `ORIENTATION_RELATIVE`
read it — and writes nothing.

**At every update**, with `o = offset`, or `P.R · offset` under `ENTITY_RELATIVE`:

```
if PARENT_CHILD:
    POSITION     → child.t = (P · rel).t
    ORIENTATION  → child.R = (P · rel).R
else:
    POSITION     → child.t = P.t + o
    ORIENTATION  → child.R = P.R, or (P · rel).R = P.R · rel.R under ORIENTATION_RELATIVE
    else LOOK_AT → child.R = lookAt(P.t + o − child.t, front, up)   unless that vector is zero
```

Position is written before orientation. The common cases: `POSITION|ORIENTATION` is
`child = [P.R | P.t + offset]`; with `ENTITY_RELATIVE` it is `child = P · [I | offset]`, the offset
riding in the parent's axes; `POSITION` alone moves the child and leaves its orientation alone.

**`offset`, `up`, `front`** (defaults `(0, 0, 0)`, `Y_AXIS`, `NEG_Z_AXIS`; an `offset` with a nil
component is taken as zero):

| Key      | Read by                           | Frame |
| -------- | --------------------------------- | ----- |
| `offset` | `POSITION`, `LOOK_AT`             | scene axes, or the parent's under `ENTITY_RELATIVE`; not read under `PARENT_CHILD` |
| `up`     | `LOOK_AT` only                    | the child's local axis that leans toward the scene's up |
| `front`  | `LOOK_AT` only                    | the child's local axis that points at the target |

So the near-universal `up = Y_AXIS, front = NEG_Z_AXIS` is no extra rotation — not because it is
the identity, but because nothing but `LOOK_AT` builds a rotation from them.

**`lookAt(d, front, up)`** (`0x6f2e440`) is the rotation `R` with `R·front = f` and `R·up = u`,
right-handed, where `f = normalize(d)` and `u = normalize(U − (U·f)·f)` for `U` the scene entity's
`up` axis. Within `|U·f| > 0.99` of the pole it switches reference: `u = s × f` with
`s = −σ(front)·σ(up) · normalize(W − (W·f)·f)`, `W = U × F`, `F` the scene's `front` axis and `σ` the
sign of an axis name. Every retail scene says `up = Y_AXIS, front = Z_AXIS`, so `U = Y` and `W = X`.
The rule was fitted to the routine run under emulation, exactly, for all 24 `front`/`up` pairs and all
24 scene axis pairs.

**Timing.**

- Before its `time` an attach does nothing.
- From `time` to `time + duration` it rewrites the child at every update. Updates happen at every
  event's start and end instant as well as at the end of each engine step, so a large step misses
  none of them.
- At the end it writes once more, at exactly `time + duration`, and stops. **Nothing is undone**:
  the child keeps its last transform, and does not snap back or detach.
- Within one instant the engine orders its active events so that every event acting on an entity
  runs after the events of that entity's parent, however long the chain. On a single entity they run
  by action number, then start order. Chains therefore resolve with no frame of lag. When two attaches
  on one child are active together, the later-started one's writes win.

**The clock** advances by a millisecond delta; there is no evaluate-at-time. A forward step visits
every start and end inside it in order, so one step from 0 to *T* reaches the same state as any
sequence of smaller steps. A backward step drops every running event and replays from 0 without
restoring any entity, so a scrubbing evaluator reproduces THORN by replaying from 0 to *T* with those
breakpoints.

### The neighbours

- **`CONNECT_HARDPOINTS`** is computed by the host, not THORN. At its start THORN hands the event —
  both targets, `hardpoint`, `parent_hardpoint` — to the first target's compound control, and at its
  end asks for a disconnect (`0x6f48389`, `0x6f48413`). The host (`Freelancer.exe` `0x44fdd0`) finds
  the part owning each named hardpoint, ignoring case, and links the object's part under the
  target's so that `childPart = parentPart · H_parent_hp · inverse(H_child_hp)` — the two hardpoints
  coincide — until the event ends. Against an attach at a `HARDPOINT`: the attach puts the child's
  *origin* at the parent's hardpoint, the connect puts the child's *hardpoint* there.
- **`START_PSYS`** asks the effect to start at `time` and to stop when `duration` elapses; the
  duration does nothing else. Stopping **kills** the effect at once (`Freelancer.exe` `0x5574a0`):
  particles do not live out, so `duration` is the effect's visible life.
- **A `PSYS` entity is placed like any other**: an attach's writes go to the host as a world
  position, then a world orientation. The host caches both and hands the effect `[R | p]` at its next
  advance, as the placement override on its `DefaultId` root (`0x45403c`), so an effect trails its
  attach by one engine step. It never reads `psysprops.sparam` and starts every effect at its default
  `sparam`, so a `sparam` set before `START_PSYS` is lost.
- **`START_PSYS_PROP_ANIM`** takes the last `sparam` set on the entity as its start value and moves
  it to `psysprops.sparam` over `duration`, as `from + (to − from)·u`, `u` being elapsed over
  duration — linear and unclamped — or the event's `param_curve`. A zero duration is an instant set.
  A second target that is itself a `PSYS` supplies `to` from its own current `sparam` instead.

## `userprops` is not THORN's

The one block THORN passes through untouched: the keys below are in `common.dll` and
`Freelancer.exe`, none in `thorn.dll` — so `userprops` is Freelancer's extension point, and a
THORN-only reading of a script cannot interpret it.

| Key                        | Values                                                                                                | Read by                        |
| -------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------ |
| `category`                 | `Audio`, `Character`, `Prop`, `Equipment`, `Spaceship`, `Asteroid`, `Room`, `Equipment Cart`, `Solar` | `common.dll`, `Freelancer.exe` |
| `actor` / `Actor`          | costume nickname                                                                                      | `common.dll`, `Freelancer.exe` |
| `speaker` / `Speaker`      | `Offer_Character_A`, `Player_Character_P`                                                             | `Freelancer.exe`               |
| `nofog` / `NoFog`          | `Y`, `y` — as *strings*                                                                               | `common.dll`, `Freelancer.exe` |
| `running_lights`           | `true`, `True` — as strings                                                                           | `common.dll`, `Freelancer.exe` |
| `main_object`              | the literal string `main_object`                                                                      | `Freelancer.exe`               |
| `loadout` / `Loadout`      | loadout nickname                                                                                      | `common.dll`, `Freelancer.exe` |
| `TextStart` / `TextString` | numbers **as strings**, IDS resource ids                                                              | `Freelancer.exe`               |
| `Priority`                 | `Steps_4`, `Room_Prop_1`, `Equip_1`, … 27 distinct                                                    | **nothing**                    |
| `No_Fog`                   | `Y`                                                                                                   | **nothing**                    |

`Priority` appears in no game binary in any casing — authoring metadata that ships in the data and
does nothing. `No_Fog` is the same in miniature: `nofog` is read, `No_Fog` is not. The names as the
binaries hold them are lowercase while scripts author them in mixed case, so the lookup is presumably
case-folding; `No_Fog` matches nothing under either casing.

`TextStart` and `TextString` hold IDS ids as decimal strings (`259608.00000`). Text on screen is a
`userprops` entry read by the game, not a THORN event.

## The typed layer

`./thn/scene` turns an interim `Globals` into these structures and back.

- **It folds the two export forms.** The interim layer keeps `type = SCENE` and `type = 9` apart
  because they are different bytecode; the typed layer reads both as `'SCENE'`. Writing back always
  emits the symbolic form, so `interim → typed → interim` normalises and only
  `typed → interim → typed` is an identity.
- **It refuses what it has not measured.** An unknown entity type, event action, enum value or flag
  bit is an error naming the value, not a silent pass-through.

## Notes

### Reading the arrays positionally

The name arrays parallel to the value arrays are not in value order, and for events they are badly
out of it. Element 1 of the event name array is `START_MOTION`, whose value is 10. Taking the array
positionally puts `START_SUB_SCENE` at 1 and `USER_EVENT` at 12; the value array has them the other
way round. Only the tail, 13 through 19, happens to be in order.

The parallel value array is what carries the enum. The entity result is a fact about that one table
rather than a general rule: both enums are registered the same way, and only one has its names stored
in value order.

### Names the guide has that the binary does not

The guide predates any of this being measurable.

| Guide                                           | Actual                                            | Evidence                                                     |
| ----------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------ |
| `SET_SUBTITLE`                                  | `SUBTITLE` = 19                                   | `SET_SUBTITLE` is in no binary; `SUBTITLE` is registered     |
| `CONNECT_HARDPOINT`                             | `CONNECT_HARDPOINTS`                              | plural in both the DLL and every use                         |
| `START_CAMERA_PROP_ANIM` animates `cameraprops` | it animates a *different* `cameraprops`           | `aspect`/`near`/`far`, not `hvaspect`/`nearplane`/`farplane` |
| fog modes listed `F_LINEAR` first               | `F_NONE`, `F_EXP`, `F_EXP2`, `F_LINEAR` = 0,1,2,3 | `D3DFOGMODE`, and the corpus                                 |
| ten param-curve types                           | eleven                                            | `ThornParamCurve` is registered too                          |
| `color` under `lightprops` marked "Unused"      | set in every light                                | corpus — though "set" is not "read"                          |

Two the guide gets right against expectation: `hvaspect` really is spelled that way on an entity, and
`usr_flg = 1` really does look like a static background layer.

> **Author's note.** There is also a `usr_flg` value which I think disables depth write. Not used in
> retail data; found by messing around with values.

## Corpus

Measured over the 1,506 retail scripts. All 41,250 entities and all 50,785 events resolve — no
leftover number in either enum, no identifier that is not registered.

Values were obtained from [the numeric export form](../modules/THN.md#two-export-forms) and confirmed twice
over: the registration routine reproduces all twenty-five measured values exactly and was decoded
after the corpus measurement rather than fitted to it, and two of the enums turn out to be
Direct3D's.

### Entity type usage

| `type`        | Value | Total  | Symbolic | Numeric |
| ------------- | ----- | ------ | -------- | ------- |
| `MARKER`      | 7     | 11,404 | 8,652    | 2,752   |
| `CAMERA`      | 3     | 10,590 | 7,138    | 3,452   |
| `SOUND`       | 6     | 4,845  | 4,317    | 528     |
| `COMPOUND`    | 1     | 3,823  | 2,571    | 1,252   |
| `LIGHT`       | 5     | 3,671  | 1,930    | 1,741   |
| `DEFORMABLE`  | 2     | 1,887  | 1,771    | 116     |
| `PSYS`        | 13    | 1,515  | 1,280    | 235     |
| `SCENE`       | 9     | 1,505  | 1,150    | 355     |
| `MONITOR`     | 4     | 1,071  | 980      | 91      |
| `MOTION_PATH` | 11    | 939    | 733      | 206     |

Exactly one script has no `SCENE` entity —
`SCRIPTS/BASES/st_03b_cityscape_hardpoint_01.thn` — and none has two.

### Event action usage

| `action`                  | Value | Total  | Symbolic | Numeric |
| ------------------------- | ----- | ------ | -------- | ------- |
| `START_MOTION`            | 10    | 13,543 | 13,154   | 389     |
| `ATTACH_ENTITY`           | 8     | 7,027  | 6,305    | 722     |
| `START_SPATIAL_PROP_ANIM` | 7     | 6,548  | 5,895    | 653     |
| `START_SOUND`             | 3     | 6,160  | 5,570    | 590     |
| `START_IK`                | 11    | 4,825  | 4,760    | 65      |
| `SET_CAMERA`              | 2     | 3,270  | 3,141    | 129     |
| `START_AUDIO_PROP_ANIM`   | 15    | 2,970  | 2,841    | 129     |
| `START_PSYS`              | 13    | 2,276  | 1,816    | 460     |
| `START_PATH_ANIMATION`    | 6     | 1,794  | 1,262    | 532     |
| `START_LIGHT_PROP_ANIM`   | 4     | 1,070  | 1,000    | 70      |
| `START_PSYS_PROP_ANIM`    | 14    | 718    | 613      | 105     |
| `START_FOG_PROP_ANIM`     | 16    | 263    | 105      | 158     |
| `START_CAMERA_PROP_ANIM`  | 5     | 112    | 99       | 13      |
| `CONNECT_HARDPOINTS`      | 9     | 112    | 109      | 3       |
| `START_FLR_HEIGHT_ANIM`   | 18    | 97     | 95       | 2       |

### How the enums were pinned

- **`target_type`** was settled by what `target_part` holds beside it, not by frequency: numeric `1`
  carries an `Hp…` name 519 times, numeric `2` carries a part name, numeric `0` carries `""`.
- **`Y` and `N`**: `on = Y` against `on = 1` (1,747 / 1,190) and `on = N` against `on = 0`
  (621 / 573), with `fogon` and `fogtable` agreeing.
- **Entity flags**: cameras, numeric `16`/`1`/`17` against symbolic `HIDDEN`/`REFERENCE`/
  `REFERENCE+HIDDEN` in matching proportions; sounds, numeric `2`/`1`/`3` against
  `SPATIAL`/`REFERENCE`/`REFERENCE+SPATIAL`. The `SPATIAL`/`LIT_AMBIENT` collision never occurs on
  the same entity type in 41,250 entities.
- **`PARENT_CHILD` = 64** rested on one direct match — an attach with the same targets, `target_part`
  and `offset` appearing as numeric `70` in one script and as `POSITION+ORIENTATION+PARENT_CHILD` in
  another — corroborated by frequency, numeric `70` × 76 against symbolic × 70. The registration
  routine then set it outright.
- **`LOOP` = 8**, from numeric `8` × 234 against symbolic `LOOP` × 512.

### Property usage

| Key                              | Uses         |
| -------------------------------- | ------------ |
| `animation` (`START_MOTION`)     | 13,543       |
| `trans_time`                     | 8,615        |
| `event_flags`                    | 5,533        |
| `start_percent` / `stop_percent` | 1,794        |
| `start_time`                     | 1,257        |
| `hardpoint` / `parent_hardpoint` | 112          |
| `floor_height` (event)           | 97           |
| `trans_scale`                    | 57           |
| `locked_bone`                    | 56           |
| `template_id`                    | 284, all `0` |
| `axisrot`                        | 181          |

`lt_grp` takes 19 distinct values, 0 in 36,561 of them. `usr_flg = 1` occurs on 233 entities, 231 of
which also carry a negative `srt_grp`.

`event_flags` takes five values across 5,533 uses — `128` × 4,071, `2` × 1,424, `130` × 22, `1` × 12,
`3` × 4 — so it is a bitfield with bits 1, 2 and 128 in use.

### `pathprops`

`path_type` is `CV_CROrientationSplinePath` in 936 of the 939 uses that set it; 3 say `NULL`.

Measured over the 936: every one alternates strictly and has an even number of tuples, so a keyframe
is always a pair — 3,151 keyframes in all, 2 to 25 per path, and 457 paths have the minimum of two.
No tuple is any width but 3 or 4, nothing but commas and spaces sits between them, and every
component carries six decimals. The corpus suite pins all 936 strings re-emitting byte for byte,
including the five components written `-0.000000`, whose sign `Number.prototype.toFixed` drops.

### `param_curve`

4,845 curves holding 13,297 rows, every one exactly four numbers. Retail uses two of the eleven
registered types: `FreeFormPCurve` (4,802) and `CatmullRomPCurve` (43).

`pcurve_period` takes 94 distinct values; `-1000` × 3,410 and `-1` × 973 are nine tenths of all uses.

### `userprops` usage

| Key                        | Uses                         |
| -------------------------- | ---------------------------- |
| `category`                 | 10,496                       |
| `Priority`                 | 3,426 — **read by nothing**  |
| `actor` / `Actor`          | 1,840                        |
| `speaker` / `Speaker`      | 633                          |
| `nofog` / `NoFog`          | 313                          |
| `running_lights`           | 127                          |
| `main_object`              | 67                           |
| `loadout` / `Loadout`      | 52                           |
| `TextStart` / `TextString` | 46, on `SCENE` in 23 scripts |
| `No_Fog`                   | 22 — **read by nothing**     |

## TODO

Pending observation in the running game.

- **What `event_flags` means.** Bits 1, 2 and 128, with 128 dominant on both `START_MOTION` and
  `START_IK`. The corpus never varies anything else while varying this. The attach, connect and
  `PSYS` events never read it (code: none of their routines touches the event's `+0x34`). *Experiment*: flip a bit on a
  `START_MOTION` in a scene that plays and watch the animation. Not the same question as the flag
  *values*, which the registration routine settles — this is what the engine does with them.
- **What `STOP` = 21 and `STOP_IK` = 22 are for, outside the `action` slot.** As actions they are
  settled — dropped by the parser, and `START` = 23 is an alias for `START_SOUND` or `START_MOTION`
  (code; see [The registry is closed](#the-registry-is-closed)). Their names are referenced only by
  the registration routine (`4f77`, `4f8f`, `4fa4`). *Experiment*: none left in the script; only a
  host that reads the globals could use them.
- **Whether `PROPERTY_ANIM`, `ADD_PATH` and `LOOKAT_ENTITY` do anything.** Same shape, same
  experiment.

---

[THN.md](../modules/THN.md) · [INI.md](../modules/INI.md) · [RETAIL.md](RETAIL.md)
