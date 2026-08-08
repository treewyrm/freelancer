# THORN — the scene vocabulary

[THN.md](THN.md) describes the _container_: a compiled Lua 3.2 chunk holding `duration`, `entities`
and `events` over numbers, strings, identifiers and tables. That is everything needed to read a
script and write it back, and it is deliberately all the interim layer knows.

This document is the layer above: **what the identifiers mean, what the keys are, and which of them
the engine actually reads.** It is the reference the typed layer at [`./thn/scene`](#the-typed-layer)
is built from.

## Three sources, and why the distinction is kept

Every row in this document carries a **provenance** mark, because the three sources disagree and the
disagreements are the interesting part:

| Mark       | Source                                        | What it can establish                                                                |
| ---------- | --------------------------------------------- | ------------------------------------------------------------------------------------ |
| **dll**    | `EXE/thorn.dll`'s string table                | that a name _exists_ — nothing about its value or use                                |
| **corpus** | the 1,506 retail scripts                      | that a name is _used_, how, and — against the numeric export form — what it _equals_ |
| **guide**  | the author's _Freelancer THN Scripting Guide_ | what a thing is _for_; explicitly part guesswork                                     |

The rule that follows from it: **a value is recorded only where the corpus measures it.** A name that
`thorn.dll` carries but no script uses gets a row with an empty value column, not a plausible number.
Where the guide and a measurement disagree, the measurement wins and the guide's reading is kept as a
footnote rather than deleted, because it usually says what the field is _for_, which no measurement
does.

### How the numeric values were obtained

[355 of the 1,506 scripts are exported in a numeric form](THN.md#355-scripts-use-numbers-where-the-rest-use-identifiers)
— `type = 9` where the other 1,151 write `type = SCENE`. That pairing is what resolves the enums, and
it resolves them **structurally rather than by counting**: a numeric entity carrying `cameraprops` is
a camera whatever the corpus frequencies say, because no other entity type carries that block.

Two independent checks confirm the result rather than assuming it:

- **The string table is in enum order.** Reading `thorn.dll`'s entity-type block in _descending
  address_ order and numbering from zero reproduces all ten measured values exactly. Nothing was
  fitted — the order was read off the binary first.
- **Two of the enums are Direct3D's.** `L_POINT`/`L_SPOT`/`L_DIRECT` come out 1/2/3, which is
  `D3DLIGHTTYPE`; `F_NONE`/`F_EXP`/`F_EXP2`/`F_LINEAR` come out 0/1/2/3, which is `D3DFOGMODE`.
  THORN passes them straight through.

**All 41,250 entities and all 50,785 events in retail resolve** — there is no leftover number in
either enum.

## Entity types

`entities` is a list of records, each with a `type`. **corpus** for every value below; the ten are
every type retail uses.

| `type`        | Value | Total  | Symbolic | Numeric | Distinguishing block              |
| ------------- | ----- | ------ | -------- | ------- | --------------------------------- |
| `COMPOUND`    | 1     | 3,823  | 2,571    | 1,252   | `userprops.category`              |
| `DEFORMABLE`  | 2     | 1,887  | 1,771    | 116     | `compoundprops.floor_height`      |
| `CAMERA`      | 3     | 10,590 | 7,138    | 3,452   | `cameraprops`                     |
| `MONITOR`     | 4     | 1,071  | 980      | 91      | _none_ — no `spatialprops` either |
| `LIGHT`       | 5     | 3,671  | 1,930    | 1,741   | `lightprops`                      |
| `SOUND`       | 6     | 4,845  | 4,317    | 528     | `audioprops`                      |
| `MARKER`      | 7     | 11,404 | 8,652    | 2,752   | _none_ — `spatialprops` only      |
| `SCENE`       | 9     | 1,505  | 1,150    | 355     | `up`/`front`/`ambient`            |
| `MOTION_PATH` | 11    | 939    | 733      | 206     | `pathprops`                       |
| `PSYS`        | 13    | 1,515  | 1,280    | 235     | `psysprops`                       |

Four more names sit in the same string-table block and **no script uses any of them** (**dll**):
`UNKNOWN_ENTITY`, `HARDPOINT`, `SUB_SCENE`, `DELETED`. Their positions in the block force 0, 8, 10
and 12 — the ten measured values leave no freedom — but that is an inference about a **C++ enum**,
and one of the four proves it is not the same thing as the Lua global:

> **`HARDPOINT` is 8 in the entity block and 1 as a `target_type`, measured.** So the string block is
> the engine's enum-name table, not a dump of the globals THORN registers, and a name appearing in it
> does not fix what the Lua global of that name holds. The typed layer therefore accepts only the ten
> measured types and rejects the other four rather than acting on the interpolation.

There is exactly one script with **no** `SCENE` entity — `SCRIPTS/BASES/st_03b_cityscape_hardpoint_01.thn`
— and none with two, so "every scene has one scene descriptor" is very nearly, but not quite, an
invariant.

## Event types

`events` is a list of `{ time, action, targets, properties }`. **corpus** for every value below.

| `action`                  | Value | Total  | Symbolic | Numeric | Targets           |
| ------------------------- | ----- | ------ | -------- | ------- | ----------------- |
| `SET_CAMERA`              | 2     | 3,270  | 3,141    | 129     | monitor, camera   |
| `START_SOUND`             | 3     | 6,160  | 5,570    | 590     | sound             |
| `START_LIGHT_PROP_ANIM`   | 4     | 1,070  | 1,000    | 70      | light             |
| `START_CAMERA_PROP_ANIM`  | 5     | 112    | 99       | 13      | camera            |
| `START_PATH_ANIMATION`    | 6     | 1,794  | 1,262    | 532     | object, path      |
| `START_SPATIAL_PROP_ANIM` | 7     | 6,548  | 5,895    | 653     | object            |
| `ATTACH_ENTITY`           | 8     | 7,027  | 6,305    | 722     | object, parent    |
| `CONNECT_HARDPOINTS`      | 9     | 112    | 109      | 3       | object, target    |
| `START_MOTION`            | 10    | 13,543 | 13,154   | 389     | object            |
| `START_IK`                | 11    | 4,825  | 4,760    | 65      | object, target    |
| `START_PSYS`              | 13    | 2,276  | 1,816    | 460     | effect            |
| `START_PSYS_PROP_ANIM`    | 14    | 718    | 613      | 105     | effect            |
| `START_AUDIO_PROP_ANIM`   | 15    | 2,970  | 2,841    | 129     | sound             |
| `START_FOG_PROP_ANIM`     | 16    | 263    | 105      | 158     | scene             |
| `START_FLR_HEIGHT_ANIM`   | 18    | 97     | 95       | 2       | character, marker |

**Five names are unplaced** (**dll**), and the five free slots are 0, 1, 12, 17 and 19:
`UNDEFINED_EVENT`, `START_SUB_SCENE`, `USER_EVENT`, `START_REVERB_PROP_ANIM`, `SUBTITLE`.

**The interpolation that worked for entities fails here, and that is a finding rather than a
shortfall.** Descending string-table order predicts `SET_CAMERA` = 9 and `CONNECT_HARDPOINTS` = 10;
the corpus measures 2 and 9. Only the tail — 13 through 18 — agrees with the string order. So the
event block is _not_ in enum order, no free slot may be filled by position, and the entity result
above is a fact about that block rather than a general rule about the binary.

`thorn.dll` also carries an **older event vocabulary** (**dll**), unused by any retail script and
kept, presumably, so older scripts still parsed: `SET_MONITOR`, `CONNECT_ENTITY`, `START_PATH_MOTION`,
`USER`, `UNDEFINED`, and `START_{FOG,AUDIO,PSYS,SPATIAL,CAMERA,LIGHT}_PROPERTY_ANIM` — the same names
with `PROPERTY` spelled out where the current ones say `PROP`.

## The other enums

All **corpus**-measured, with the string-table order agreeing in each case.

| Axis         | Value |     | Target      | Value |     | Light `type` | Value |     | `fogmode`  | Value |
| ------------ | ----- | --- | ----------- | ----- | --- | ------------ | ----- | --- | ---------- | ----- |
| `X_AXIS`     | 0     |     | `ROOT`      | 0     |     | `L_POINT`    | 1     |     | `F_NONE`   | 0     |
| `Y_AXIS`     | 1     |     | `HARDPOINT` | 1     |     | `L_SPOT`     | 2     |     | `F_EXP`    | 1     |
| `Z_AXIS`     | 2     |     | `PART`      | 2     |     | `L_DIRECT`   | 3     |     | `F_EXP2`   | 2     |
| `NEG_X_AXIS` | 3     |     |             |       |     |              |       |     | `F_LINEAR` | 3     |
| `NEG_Y_AXIS` | 4     |
| `NEG_Z_AXIS` | 5     |

`target_type` is settled by what `target_part` holds beside it, not by frequency: numeric `1` carries
an `Hp…` name 519 times, numeric `2` carries a part name, numeric `0` carries `""`.

### `Y` and `N` are 1 and 0

Measured — `on = Y` against `on = 1` (1,747 / 1,190) and `on = N` against `on = 0` (621 / 573), with
`fogon` and `fogtable` agreeing. They remain identifiers and **must not be written back as `true`
and `false`**, which THORN does not define; see [THN.md](THN.md#y-and-n-are-the-booleans).

### Flags

Flags are a bitfield, and **the same bit means different things in different places** — THORN's
globals are not one namespace. Bit 2 is `SPATIAL` on a sound and `LIT_AMBIENT` on anything that
renders; bit 8 is `LOOP` on a `START_SOUND` and `LOOK_AT` on an `ATTACH_ENTITY`.

**Entity `flags`** (**corpus**):

| Name          | Bit | Appears on                               |
| ------------- | --- | ---------------------------------------- |
| `REFERENCE`   | 1   | markers, cameras, lights, sounds         |
| `SPATIAL`     | 2   | sounds **only**                          |
| `LIT_AMBIENT` | 2   | compounds, deformables, particle systems |
| `LIT_DYNAMIC` | 4   | compounds, deformables, particle systems |
| `HIDDEN`      | 16  | any                                      |

The `SPATIAL` / `LIT_AMBIENT` collision is decidable because the two never appear on the same entity
type in 41,250 entities, so **decoding a numeric entity flag is the one place the typed layer has to
consult the entity's `type`.** The clinching measurements are cameras — numeric `16`/`1`/`17` against
symbolic `HIDDEN`/`REFERENCE`/`REFERENCE+HIDDEN`, in matching proportions — and sounds, numeric
`2`/`1`/`3` against symbolic `SPATIAL`/`REFERENCE`/`REFERENCE+SPATIAL`.

**`ATTACH_ENTITY` and `START_PATH_ANIMATION` `flags`** (**corpus**):

| Name                   | Bit | Guide's description              |
| ---------------------- | --- | -------------------------------- |
| `POSITION`             | 2   | follow the parent's position     |
| `ORIENTATION`          | 4   | inherit the parent's orientation |
| `LOOK_AT`              | 8   | orient towards the parent        |
| `ENTITY_RELATIVE`      | 32  | —                                |
| `PARENT_CHILD`         | 64  | —                                |
| `ORIENTATION_RELATIVE` | 128 | —                                |

`PARENT_CHILD` = 64 is the weakest value here and worth stating as such. It rests on one
**direct** match — an attach with the same targets, `target_part` and `offset` appears as numeric
`70` in one script and as `POSITION+ORIENTATION+PARENT_CHILD` in another — corroborated by the
frequencies, numeric `70` × 76 against symbolic `POSITION+ORIENTATION+PARENT_CHILD` × 70. It also
**contradicts the order `thorn.dll`'s flag printer emits**, which would put `ORIENTATION_RELATIVE`
at 64. The corpus wins because it measures the value and the printer only suggests an order.

**`START_SOUND` `flags`** (**corpus**): `LOOP` = 8, from numeric `8` × 234 against symbolic `LOOP` × 512.

**Named but never used** (**dll**), so no bit is recorded for any of them: `STREAM`,
`FOG_PROPS_REMOVED`, `PATH_POSITION`, `USE_SCRIPT_DURATION`. Bit 16 is unclaimed in the attach
namespace and two names remain unplaced in it, which is suggestive and is not evidence.

## Properties

`—` in the value column means the key exists in `thorn.dll` and **no retail script sets it**.

### Common to every entity

| Key             | Type    | Uses   | Provenance         | Notes                                                     |
| --------------- | ------- | ------ | ------------------ | --------------------------------------------------------- |
| `entity_name`   | string  | all    | dll, corpus, guide | must be unique within the script                          |
| `template_name` | string  | all    | dll, corpus, guide | archetype nickname, resolved through `userprops.category` |
| `type`          | enum    | all    | dll, corpus, guide | see above                                                 |
| `flags`         | flags   | varies | dll, corpus, guide |                                                           |
| `lt_grp`        | integer | ~all   | dll, corpus, guide | lighting group; 19 distinct values, 0 in 36,561 of them   |
| `srt_grp`       | integer | ~all   | dll, corpus, guide | sort group, back to front; negative for backdrops         |
| `usr_flg`       | integer | ~all   | dll, corpus, guide | only 0, 1 and 2 occur                                     |
| `template_id`   | integer | 284    | corpus             | **always 0, and in no game binary** — exporter residue    |
| `archetype`     | —       | 0      | dll                |                                                           |

`template_id` is worth a note: it is set by the numeric-form exporter, is `0` in all 284 occurrences,
and the string does not appear in `thorn.dll`, `common.dll` or `Freelancer.exe`. Nothing reads it.

### `spatialprops` — every entity but `MONITOR`

| Key           | Type          | Provenance         | Notes                                                                        |
| ------------- | ------------- | ------------------ | ---------------------------------------------------------------------------- |
| `pos`         | float[3]      | dll, corpus, guide |                                                                              |
| `orient`      | float[3][3]   | dll, corpus, guide | rotation matrix; the placement form                                          |
| `q_orient`    | float[4]      | dll, corpus, guide | quaternion; **only ever in a `START_SPATIAL_PROP_ANIM`**, never on an entity |
| `axisrot`     | {float, axis} | dll, corpus, guide | likewise animation-only, 181 uses                                            |
| `orientation` | —             | dll                |                                                                              |

The guide's advice — `orient` to place, `q_orient` to animate — is exactly what the corpus does:
entities carry `pos` and `orient` and nothing else, animations carry `pos`, `q_orient` or `axisrot`.

### The typed blocks

| Block           | On                       | Keys (**corpus**)                                                                                         | Keys named but unused (**dll**) |
| --------------- | ------------------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `cameraprops`   | `CAMERA`                 | `fovh`, `hvaspect`, `nearplane`, `farplane`                                                               |                                 |
| `cameraprops`   | `START_CAMERA_PROP_ANIM` | `fovh`, `aspect`, `near`, `far`                                                                           |                                 |
| `lightprops`    | `LIGHT`                  | `on`, `color`, `diffuse`, `specular`, `ambient`, `direction`, `range`, `cutoff`, `type`, `theta`, `atten` | `infinite`                      |
| `audioprops`    | `SOUND`                  | `attenuation`, `pan`, `dmin`, `dmax`, `ain`, `aout`, `atout`, `rmix`                                      |                                 |
| `psysprops`     | `PSYS`                   | `sparam`                                                                                                  |                                 |
| `pathprops`     | `MOTION_PATH`            | `path_type`, `path_data`                                                                                  | `control_pts`                   |
| `compoundprops` | `DEFORMABLE`             | `floor_height`                                                                                            |                                 |
| `fogprops`      | `START_FOG_PROP_ANIM`    | `fogon`, `fogmode`, `fogcolor`, `fogstart`, `fogend`, `fogdensity`, `fogtable`                            |                                 |
| `reverbprops`   | —                        |                                                                                                           | `decay`, `vol`, `env`           |
| `param_curve`   | most animations          | `CLSID`, `points`                                                                                         |                                 |

Three things the guide does not have, all **corpus**:

- **The animating camera block is a different block.** An entity says `hvaspect`, `nearplane`,
  `farplane`; a `START_CAMERA_PROP_ANIM` says `aspect`, `near`, `far`. Both spellings are in
  `thorn.dll`. Only `fovh` is shared, and it is 84 of the 99 animated camera properties.
- **`SCENE` carries the fog keys inline, not in a `fogprops` block.** Seven entities do it. The block
  form is the event's.
- **`path_type` is `CV_CROrientationSplinePath`** in 936 of the 939 uses that set it; 3 say `NULL`.
  `thorn.dll` also carries `CV_CRSplinePath`, which nothing uses — so the guide's "only one path type
  is available" is right about the corpus and understates the binary by one. What `path_data` then
  holds is below.

### `pathprops`

`path_type` names the spline class; `path_data` is **a string, not a table**. `thorn.dll` writes the
pair as `path_type = "%s"` and `path_data = "%s"`, and the string it fills the second one from is
built out of four format strings that sit together in the binary:

```
{%f,%f,%f},
OPEN
CLOSED
{%f,%f,%f,%f},
CV_CROrientationSplinePath
```

So `path_data` is a flag token and then a run of braced tuples — and **the trailing `, ` after the
last tuple belongs to the tuple, not between tuples**, which is why every retail string ends with a
separator that looks stray. `%f` is six decimals, and all 936 of them are exactly that.

| `path_type`                  | After the flag                                                                        | Uses        |
| ---------------------------- | ------------------------------------------------------------------------------------- | ----------- |
| `CV_CROrientationSplinePath` | `{x,y,z}` and `{x,y,z,w}` alternating — one position and one orientation per keyframe | 936         |
| `CV_CRSplinePath`            | `{x,y,z}` per keyframe, no orientations                                               | 0 — **dll** |
| `NULL`                       | no `path_data` at all                                                                 | 3           |

The flag is `OPEN` or `CLOSED`: whether the Catmull-Rom spline runs end to end or closes into a loop.
Both are in `thorn.dll`, and every retail path is `OPEN`.

**Measured over the 936**: every one alternates strictly and has an even number of tuples, so a
keyframe is always a pair — 3,151 keyframes in all, 2 to 25 per path, and 457 paths (nearly half)
have the minimum of two. No tuple is any width but 3 or 4, nothing but commas and spaces sits between
them, and every component carries six decimals.

`NULL` is not a class the binary names anywhere. It is what the exporter writes where the class name
would go for a `MOTION_PATH` that has no path on it, and those three entities carry nothing else.

This is **the one block whose keys are not independent** — `path_type` decides how `path_data` reads
— so the typed layer models `pathprops` as a discriminated union rather than the usual bag of
optionals, and `pathprops` with no `path_type` is an error rather than an empty block. `path_data` is
parsed into points and formatted back; the corpus suite pins all 936 strings re-emitting byte for
byte, including the five components written `-0.000000`, whose sign `Number.prototype.toFixed` drops.

### `param_curve`

`CLSID` names a component `thorn.dll` registers, and `points` is a list of 4-tuples — 4,845 curves
holding 13,297 rows, every one of them exactly four numbers.

Retail uses **two** of the eleven registered curve types: `FreeFormPCurve` (4,802) and
`CatmullRomPCurve` (43). The other nine are **dll** only: `BumpInPCurve`, `BumpOutPCurve`,
`RampDownPCurve`, `RampUpPCurve`, `StepPCurve`, `SmoothPCurve`, `ThornLPCurve`, `LinearPCurve`,
`ThornParamCurve`. The guide lists ten of the eleven and misses `ThornParamCurve`.

`pcurve_period` is milliseconds, 94 distinct values, and negative means "match the event duration" —
`-1000` × 3,410 and `-1` × 973 are nine tenths of all uses, which is the guide's reading and is
consistent with any negative sentinel.

### Event properties

| Key                                                                                      | Type                 | Uses   | On                                                                              | Provenance         |
| ---------------------------------------------------------------------------------------- | -------------------- | ------ | ------------------------------------------------------------------------------- | ------------------ |
| `duration`                                                                               | float                | ~all   | every event but `SET_CAMERA`                                                    | dll, corpus, guide |
| `flags`                                                                                  | flags                |        | `ATTACH_ENTITY`, `START_PATH_ANIMATION`, `START_SOUND`                          | dll, corpus, guide |
| `target_type` / `target_part`                                                            | enum / string        |        | `ATTACH_ENTITY`, `START_SPATIAL_PROP_ANIM`, `START_IK`, `START_FLR_HEIGHT_ANIM` | dll, corpus, guide |
| `offset`, `up`, `front`                                                                  | float[3], axis, axis |        | `ATTACH_ENTITY`, `START_PATH_ANIMATION`, `START_IK`                             | dll, corpus, guide |
| `hardpoint`, `parent_hardpoint`                                                          | string               | 112    | `CONNECT_HARDPOINTS`                                                            | dll, corpus, guide |
| `animation`                                                                              | string               | 13,543 | `START_MOTION`                                                                  | dll, corpus, guide |
| `time_scale`, `weight`, `heading`                                                        | float                |        | `START_MOTION`                                                                  | dll, corpus, guide |
| `trans_time`                                                                             | float                | 8,615  | `START_MOTION`                                                                  | dll, corpus        |
| `start_time`                                                                             | float                | 1,257  | `START_MOTION`, `START_SOUND`                                                   | dll, corpus        |
| `trans_scale`                                                                            | float                | 57     | `START_MOTION`                                                                  | dll, corpus        |
| `locked_bone`                                                                            | string               | 56     | `START_MOTION`                                                                  | dll, corpus        |
| `event_flags`                                                                            | integer              | 5,533  | `START_MOTION`, `START_IK`                                                      | dll, corpus, guide |
| `end_effector`, `count_to_root`, `damping`, `point_at`, `move_to`, `transition_duration` |                      | 4,825  | `START_IK`                                                                      | dll, corpus        |
| `start_percent`, `stop_percent`                                                          | float                | 1,794  | `START_PATH_ANIMATION`                                                          | dll, corpus, guide |
| `floor_height`                                                                           | float                | 97     | `START_FLR_HEIGHT_ANIM`                                                         | dll, corpus, guide |
| `strid`, `user_event_string`                                                             | —                    | 0      | `SUBTITLE`, `USER_EVENT`                                                        | dll                |
| `percent1`, `percent2`, `loop`, `ik_id`                                                  | —                    | 0      |                                                                                 | dll                |

`event_flags` takes five values across 5,533 uses — `128` × 4,071, `2` × 1,424, `130` × 22, `1` × 12,
`3` × 4 — so it is a bitfield with bits 1, 2 and 128 in use. **The guide's reading ("2 is a loop, 3
is play once?") is marked as a guess there and no measurement here supports or refutes it**; what the
corpus adds is that the dominant value is 128, which the guide does not mention at all.

`START_IK` is the event the guide leaves blank, and it is the third most common in retail. Its whole
property set is in the table above.

## `userprops` is not THORN's

The one block THORN passes through untouched. Searching the binaries settles who reads what: the keys
below are in `common.dll` and `Freelancer.exe`, **and none of them is in `thorn.dll`.** So
`userprops` is Freelancer's extension point, and a THORN-only reading of a script cannot interpret it.

| Key                        | Uses   | Values                                                                                                | Read by                        |
| -------------------------- | ------ | ----------------------------------------------------------------------------------------------------- | ------------------------------ |
| `category`                 | 10,496 | `Audio`, `Character`, `Prop`, `Equipment`, `Spaceship`, `Asteroid`, `Room`, `Equipment Cart`, `Solar` | `common.dll`, `Freelancer.exe` |
| `actor` / `Actor`          | 1,840  | costume nickname                                                                                      | `common.dll`, `Freelancer.exe` |
| `speaker` / `Speaker`      | 633    | `Offer_Character_A`, `Player_Character_P`                                                             | `Freelancer.exe`               |
| `nofog` / `NoFog`          | 313    | `Y`, `y` — as _strings_                                                                               | `common.dll`, `Freelancer.exe` |
| `running_lights`           | 127    | `true`, `True` — as strings                                                                           | `common.dll`, `Freelancer.exe` |
| `main_object`              | 67     | the literal string `main_object`                                                                      | `Freelancer.exe`               |
| `loadout` / `Loadout`      | 52     | loadout nickname                                                                                      | `common.dll`, `Freelancer.exe` |
| `TextStart` / `TextString` | 46     | numbers **as strings**, IDS resource ids                                                              | `Freelancer.exe`               |
| `Priority`                 | 3,426  | `Steps_4`, `Room_Prop_1`, `Equip_1`, … 27 distinct                                                    | **nothing**                    |
| `No_Fog`                   | 22     | `Y`                                                                                                   | **nothing**                    |

The last two rows are the point of the table. **`Priority` is set 3,426 times and appears in no game
binary in any casing** — it is authoring metadata that ships in the data and does nothing. `No_Fog`
is the same mistake in miniature: `nofog` is read, `No_Fog` is not, and 22 entities spell it the way
that does nothing.

The names as the binaries hold them are lowercase (`category`, `nofog`, `actor`, `loadout`,
`running_lights`, `main_object`, `speaker`, `priority`) while the scripts author them in mixed case,
so the lookup is presumably case-folding as it is everywhere else in Freelancer. `No_Fog` matches
nothing under either casing, which is why it is called dead rather than miscased.

`TextStart` and `TextString` are on `SCENE` in 23 scripts and hold IDS ids as decimal strings
(`259608.00000`). That is the mechanism the guide looks for and does not find under
[`SET_SUBTITLE`](#names-the-guide-has-that-the-binary-does-not) — text on screen is a `userprops`
entry read by the game, not a THORN event.

## Names the guide has that the binary does not

Corrections, not criticisms — the guide predates any of this being measurable.

| Guide                                           | Actual                                            | Evidence                                                     |
| ----------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------ |
| `SET_SUBTITLE`                                  | `SUBTITLE`                                        | `SET_SUBTITLE` is in no binary; `SUBTITLE` is in `thorn.dll` |
| `CONNECT_HARDPOINT`                             | `CONNECT_HARDPOINTS`                              | plural in both the DLL and all 112 uses                      |
| `START_CAMERA_PROP_ANIM` animates `cameraprops` | it animates a _different_ `cameraprops`           | `aspect`/`near`/`far`, not `hvaspect`/`nearplane`/`farplane` |
| fog modes listed `F_LINEAR` first               | `F_NONE`, `F_EXP`, `F_EXP2`, `F_LINEAR` = 0,1,2,3 | `D3DFOGMODE`, and the corpus                                 |
| ten param-curve types                           | eleven                                            | `ThornParamCurve` is registered too                          |
| `color` under `lightprops` marked "Unused"      | set in all 3,671 lights                           | corpus — though "set" is not "read"                          |

And two the guide gets right against expectation, worth recording because they look like errors:
`hvaspect` really is spelled that way on an entity, and `usr_flg = 1` really does look like a static
background layer — 231 of the 233 entities that set it also carry a negative `srt_grp`, which is the
draw-first ordering the guide describes.

Author notice: there's also usr_flg value which I think disables depth write, not used in retail data, found by messing around with values.

## The typed layer

`./thn/scene` turns an interim `Document` into these structures and back. Two consequences of the
above shape it:

- **It folds the two export forms.** The interim layer keeps `type = SCENE` and `type = 9` apart
  because they are different bytecode; the typed layer reads both as `'SCENE'`, which is only
  possible because the enums above are now measured rather than assumed. Writing back always emits
  the symbolic form — so `interim → typed → interim` normalises, and only `typed → interim → typed`
  is an identity. A typed layer over INI would carry the same fixed-point caveat, arriving there for
  a different reason.
- **It refuses what it has not measured.** An unknown entity type, event action, enum value or flag
  bit is an error naming the value, not a silent pass-through — because every alternative is a guess,
  and all 41,250 entities and 50,785 retail events resolve without one.

## TODO

Pending _observation in the running game_, in the sense [THN.md](THN.md#todo) sets out.

- **What are the five unplaced event values — 0, 1, 12, 17, 19?** `UNDEFINED_EVENT`,
  `START_SUB_SCENE`, `USER_EVENT`, `START_REVERB_PROP_ANIM` and `SUBTITLE` are the names left, and
  the corpus cannot pair them because no script uses one. **Position in the string table is not
  available as evidence here** — it is disproved for this block, as shown above. The experiment is to
  write a script using one symbolically, load it, and see whether the event fires.
- **What does `event_flags` mean?** Bits 1, 2 and 128, with 128 dominant on both `START_MOTION` and
  `START_IK`. The guide's guess is recorded above and is not measurable from the corpus, because the
  corpus never varies anything else while varying this. The experiment is to flip a bit on a
  `START_MOTION` in a scene that plays and watch the animation.
- **Which bit is `PATH_POSITION` and which is `USE_SCRIPT_DURATION`?** Bit 16 is unclaimed in the
  attach namespace and these are the two names left in it. Suggestive, not evidence, and **not to be
  filled in on that basis**.

**Closed:** the numeric values of the identifiers, which [THN.md](THN.md#todo) carried as open and
then as "a lead worth following". Followed — the entity and event tables above are complete over
retail, cross-checked against the string table and against Direct3D's two enums.

---

[THN.md](THN.md) · [INI.md](INI.md) · [RETAIL.md](RETAIL.md)
