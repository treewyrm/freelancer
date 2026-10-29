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
| `HIDDEN`            | 16  | any — **read by nothing**                |
| `FOG_PROPS_REMOVED` | 32  | *unused in retail*                       |

The `SPATIAL` / `LIT_AMBIENT` collision is decidable because the two never appear on the same entity
type, so decoding a numeric entity flag is the one place the typed layer consults the entity's
`type`.

**What the bits do** (code). `REFERENCE` is the only entity flag `thorn.dll`'s runtime tests: a
reference keeps its class's built-in defaults instead of its property block, and the game binds it to
the live entity of the same type and name in another running scene of the room — or, failing that, a
marker or camera to the room's setpoint or camera of that name (`Freelancer.exe` `0x456790`).
`LIT_AMBIENT` gives a compound or character the `SCENE`'s `ambient` / 255, otherwise none; without
`LIT_DYNAMIC` it takes no lights at all (`0x44ae80`). `SPATIAL` makes a sound a 3D source, otherwise
2D. `HIDDEN` is read by nothing — not by `thorn.dll`, not by the game — and no event hides or shows
an entity.

**`ATTACH_ENTITY` and `START_PATH_ANIMATION` `flags`** (values corpus, every bit also binary;
meanings code, for `ATTACH_ENTITY` — [What `ATTACH_ENTITY` does](#what-attach_entity-does) has the
composition, `P` the parent frame and `rel` the child's frame relative to it at the attach's start):

| Name                   | Bit | What it does on an `ATTACH_ENTITY`                                                                                   |
| ---------------------- | --- | -------------------------------------------------------------------------------------------------------------------- |
| `USE_SCRIPT_DURATION`  | 1   | the event **never ends**. Set by the parser when the event has neither `flags` nor `duration`; a `flags` key replaces the word |
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
`start_percent` defaults to 0 and `stop_percent` to 1 (`0x6f450a0`). The path is an entity like any
other, placed from its `spatialprops`, and the animation re-reads its frame at every update
(`0x6f4529f`), so whatever moves a path carries everything riding it — retail attaches paths 105
times. `LOOK_AT` aims along the path's unit tangent toward increasing parameter, which does not turn
round when an animation runs `1 → 0`.

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

The same pass rewrites one retail action: a `START_PATH_ANIMATION` whose second target is an entity
of type 1 to 8 — `COMPOUND` through `MARKER`, not a `SCENE`, `MOTION_PATH` or `PSYS` — is parsed as an
`ATTACH_ENTITY`, its keys read by the attach case. Every retail path animation targets a
`MOTION_PATH`, so the rewrite never fires on retail data.

## Properties

`—` in a value column means the key exists in `thorn.dll` and no retail script sets it.

### Common to every entity

| Key             | Type    | Provenance         | Notes                                                     |
| --------------- | ------- | ------------------ | --------------------------------------------------------- |
| `entity_name`   | string  | dll, corpus, guide | must be unique within the script                          |
| `template_name` | string  | dll, corpus, guide | what the game loads: an archetype by `userprops.category` on a `COMPOUND`, a `costumes.ini` costume on a `DEFORMABLE`, a `[VisEffect]` on a `PSYS`, a `[Sound]` on a `SOUND` — each ignoring case |
| `type`          | enum    | dll, corpus, guide | see above                                                 |
| `flags`         | flags   | dll, corpus, guide |                                                           |
| `lt_grp`        | integer | dll, corpus, guide | lighting group                                            |
| `srt_grp`       | integer | dll, corpus, guide | sort group, back to front; negative for backdrops         |
| `usr_flg`       | integer | dll, corpus, guide | only 0, 1 and 2 occur                                     |
| `template_id`   | integer | corpus             | **always 0, and in no game binary** — exporter residue    |
| `archetype`     | —       | dll                |                                                           |

`template_id` is set by the numeric-form exporter, is `0` in all 284 occurrences, and the string does
not appear in `thorn.dll`, `common.dll` or `Freelancer.exe`. Nothing reads it.

**`lt_grp`, `srt_grp` and `usr_flg` are the game's, not THORN's** (code): `thorn.dll`'s runtime never
reads them, and `Freelancer.exe` copies them onto the draw object of a compound or character
(`0x451ef0`). `lt_grp` partitions lighting: a compound or character takes at most the four
best-scoring lights of its own group, scored once at its centre (`0x5572b0` → `0x5586f0`). `srt_grp`
is a signed byte, and the room draws its groups in ascending order (`0x44b570`), so negative groups
come first. `usr_flg` is a render type (`common.dll` `ThornGetRenderType`, `0x627c0b0`): 0 an
ordinary depth-tested draw, 1 a starsphere locked to the camera's position, 2 a backdrop drawn with
its own near 1 and far 200,000 — both without depth.

**`template_name`** (code): `"NULL"` reads as empty, and a `PSYS`, `COMPOUND` or `DEFORMABLE` without
one takes its `entity_name` (`0x6f28a60`). On a `COMPOUND`, `userprops.category` picks the table,
matched **exactly, case included** (`common.dll` `0x631c5e0`): `Spaceship` `[Ship]`, `Solar`
`[Solar]`, `Asteroid` `[Asteroid]`, `Equipment` any equipment section, `Room`, `Equipment Cart` and
`Prop` `petaldb.ini [ObjectTable]`; any other category loads nothing. A leading `$` indirects through
the current base's `[Base] terrain_*` (`0x446280`), and a `Spaceship` named `PlayerShip` is the
player's own ship. On a `SOUND`, `VoiceProfile_<msg>` is a line in the voice of the character
`userprops.speaker` names, `BackgroundAmbient` and `BackgroundMusic` are handles on the game's own
ambience and music, and `PlayerShipSound` is the player's engine; anything else is a `[Sound]`. On a
`PSYS`, `PlayerShipEngines` is the player ship's engines.

### `spatialprops` — every entity but `MONITOR`

| Key           | Type          | Provenance         | Notes                                                                        |
| ------------- | ------------- | ------------------ | ---------------------------------------------------------------------------- |
| `pos`         | float[3]      | dll, corpus, guide |                                                                              |
| `orient`      | float[3][3]   | dll, corpus, guide | rotation matrix; the placement form. **Its triples are the columns** — see below |
| `q_orient`    | float[4]      | dll, corpus, guide | quaternion; **only ever in a `START_SPATIAL_PROP_ANIM`**, never on an entity |
| `axisrot`     | {float, axis} | dll, corpus, guide | likewise animation-only                                                      |
| `orientation` | —             | dll                |                                                                              |

Entities carry `pos` and `orient` and nothing else; animations carry `pos`, `q_orient` or `axisrot`.

**`orient`'s three triples are the columns of the rotation** (code): the parser stores `orient[k]`
down column `k` of the row-major matrix (`0x6f29cff`–`0x6f2a00d`) and hands it to the entity
unchanged, and every product THORN takes is `R·v`. So each triple is one of the entity's local axes —
X, Y, Z — in scene space. That is the transpose of a joint's or a hardpoint's nine floats, which are
the rows ([RENDERER.md](RENDERER.md)): read the way a hardpoint is read, every entity turns backwards.
Corpus agrees — of the retail cameras that start a `LOOK_AT` attach at 0 on a parent nothing moves,
14 carry an `orient` matching, within 0.02, the rotation the attach computes when the triples are
columns, and none when they are rows.

**`./thn/scene` reads `orient` into a `Matrix3` transposed**, so it holds the rows as every other
`Matrix3` in the library does and goes into `Matrix4.fromRotationTranslation` unchanged; the writer
transposes it back.

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
- **The animating block's keys are positional, and three of them are mislabelled** (code). The
  entity's four values are stored as `{fovh, nearplane, farplane, hvaspect}` (`0x6f41510`); the
  animation reads its keys by index from the table `fovh, aspect, near, far` (`0x6f5e148`) into the
  same four slots. So **`aspect` animates the near plane, `near` the far plane, and `far` the
  aspect**. Corpus agrees: the animations that set `aspect` use 0.1–10, and the four that set all
  four keys have `near = 1000` and `far = 1.85`.
- `SCENE` carries the fog keys inline, not in a `fogprops` block. The block form is the event's.

**What the camera values mean** (code). `fovh` is **half the horizontal field of view, in degrees** —
`tan(fovh · π/180)` is the projection's horizontal half-extent (`Freelancer.exe` `0x556ce0`), so 25,
retail's commonest, is a 50° lens — and the vertical follows the viewport. `nearplane` and `farplane`
are world units. `hvaspect` never reaches the screen: the game's set-aspect is a stub returning −7
(`0x454190`), so `hvaspect`, and a camera animation's `far` that lands on it, do nothing. The 1.85
retail writes on 9,649 of 10,590 cameras is what the game's cinematic letterbox produces anyway
(`0x41a140`). A camera looks down its local −Z with +Y up (`0x5568b0`). A camera without
`cameraprops` takes 60, 0.1, 100,000 and 1.3333 (`thorn.dll` `0x6f29270`).

**Only a `MONITOR` is ever shown** (code). A `CAMERA` holds values; `SET_CAMERA(monitor, camera)`
copies the camera's frame and frustum onto the monitor at `time` and links them, so every later write
to the camera — an attach, a path, a spatial or camera animation — lands on the monitor in the same
update (`0x6f44ec0`, `0x6f414a6`). The event is done at its start, so its `duration` means nothing,
and a monitor follows the camera of the last `SET_CAMERA` that named it. Of the monitors of every
running script the game shows the one of highest priority — 1 for landing, launch and transition
scripts, 0 for the rest — a newcomer taking the view only when strictly higher (`0x45065c`).

**The light** (code). `thorn.dll` builds a `D3DLIGHT8` from the block (`0x6f27fe0`): `type` the D3D
type, `diffuse`, `specular` and `ambient` its three colours, `atten` Attenuation0–2, `range` Range,
`theta` the inner cone and `cutoff` the outer, both in **degrees** and converted to radians
(`0x6f28727`, `0x6f286e8`); Falloff is 1. `direction` is in the light's own axes — the game aims it
along `R · direction` (`Freelancer.exe` `0x556fd0`). Only when `type` is absent are the legacy keys
read (`0x6f29492` → `0x6f2eb20`): `infinite` directional, `cutoff < 0` point, else a spot, diffuse
`color / 255`. The game clamps Phi to π, gives a point light Theta = Phi = π, turns an all-zero
attenuation into Att0 = 0.1 (`0x411120`), and takes `type` only when the light is created.

**Fog** (code). `thorn.dll` pushes neither the `SCENE`'s inline fog nor its `ambient`; the game reads
both from the entity record. Fog is one global state, zeroed when a room is set up (`0x4546d0`) — a
scene without fog keys has none — and switched on only with the game's fog detail setting
(`0x454450`). **`fogtable` reads backwards**: the game hands it to D3D as the vertex-fog switch
(`0x4545d0`), so `fogtable = Y` is vertex fog and retail's only value, `N`, table fog. An object with
`userprops.nofog` is drawn unfogged.

**The sound** (code). The game applies two of the eight `audioprops` keys (`Freelancer.exe`
`0x457630`): `attenuation`, in decibels — the volume is `clamp(arch + clamp(L + attenuation, −96, 0),
−96, 0)`, `arch` the `[Sound]`'s own `attenuation` and `L` the level a `BackgroundAmbient` handle sets
— and `pan`, ×100 into DirectSound's pan, on 2D sounds only. `dmin`, `dmax`, `ain`, `aout`, `atout`
and `rmix` are stored and never read. A `SPATIAL` sound sits at the entity's position with the
`[Sound]`'s `range` as its distances. `START_SOUND` plays from `start_time + (now − time)`
milliseconds in, loops with `LOOP`, and is **cut dead** at `time + duration` (`0x4574d0`,
`0x4575e0`); `START_AUDIO_PROP_ANIM` lerps `attenuation` and `pan` in decibels.

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
| `CV_CROrientationSplinePath` | `{x,y,z}` and `{w,x,y,z}` alternating — one position and one orientation per keyframe |
| `CV_CRSplinePath`            | `{x,y,z}` per keyframe, no orientations — **dll** only                                |
| `NULL`                       | no `path_data` at all                                                                 |

The flag is `OPEN` or `CLOSED`: whether the Catmull-Rom spline runs end to end or closes into a loop.
Both are in `thorn.dll`, and only `CLOSED` is tested (`strncmp`, `0x6f35798`) — anything else is open.

**The quaternion is `{w, x, y, z}`** (code): the loader's identity default is written `{1,0,0,0}`
(`0x6f359a0`) and the path animation converts the tuple with `x86math.dll`'s quaternion-to-matrix
(`0x6f723c0`), whose first component is `w`. `q_orient` in a `START_SPATIAL_PROP_ANIM` is the same
order (`0x6f24050`). Corpus agrees: the largest-magnitude component is the first in 2,333 of 3,151
path keys, and identities are written `{1,0,0,0}`. `./thn/scene` reads both into a `Quat`'s named
fields and writes `w` first again.

**How the path is evaluated** (code, and run under emulation): uniform Catmull-Rom with tension ½,
16 samples per segment; the parameter is **normalised chord length over the whole path**, so travel
is at constant speed along the 16-sample polyline; an open path duplicates its end points rather
than reflecting them; orientations are a squad built on normalised lerp, not slerp. A path with
fewer than two keys fails to load and its animations do nothing.

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

**A `points` row is `(t, v, inSlope, outSlope)`** (code, `0x6f2f560`): `t` in `[0, 1]` — anything
outside is rejected — `v` the value, and the two slopes in value per unit `t`, read only by
`FreeFormPCurve`. Every curve starts with the end keys `(0, 0, 0, 0)` and `(1, 1, 0, 0)`, which a row
at exactly `t = 0` or `t = 1` replaces. `FreeFormPCurve` is a cubic Hermite through the keys, clamped
to the end values outside them — so retail's commonest curve, `[[0,0,0,0],[1,1,0,0]]` (2,522 uses),
is a **smoothstep**, not a straight line. `CatmullRomPCurve` is uniform Catmull-Rom on the values,
ignores the slopes, and returns **0** outside its first and last keys. The other Hermite types share
`FreeFormPCurve`'s evaluator and differ only in how they preset the slopes. `LinearPCurve` is
registered twice, as two different classes (`0x6f30780`, `0x6f309a2`).

The Hermite presets, per key pair with `m = Δv / max(Δt, 1e-4)` (`0x6f300c0`): `SmoothPCurve` both
slopes 0, `LinearPCurve`'s Hermite class both `m`, `RampUpPCurve` `(0, 2m)`, `RampDownPCurve`
`(2m, 0)`, `BumpOutPCurve` `(2m, 0)` rising and `(0, 2m)` falling, `BumpInPCurve` the reverse;
`StepPCurve` holds each key's value to the next. `ThornParamCurve` and `ThornLPCurve` are Catmull-Rom
and linear over the values, each clamped to its running maximum.

**`pcurve_period` is integer milliseconds** — `_ftol` of the script value, with no ×1000
(`0x6f25885`); default −1. **Any value ≤ 0** (`-1000`, `-1`, `0`) means the same thing: the curve is
read at elapsed / `duration`. **A positive value loops** it: the curve is read at
`(elapsed mod period) / period`, a sawtooth that never reaches `t = 1`. Some exported periods are
float bit patterns written as integers (`1065353250`), which leave the event near `curve(0)` for its
whole duration.

**The value an animation applies** (code, `0x6f48b50` and its per-class copies): 1 when `duration` is
0, otherwise elapsed / `duration` or the curve as above — **not clamped**. The light, camera, fog,
audio and `sparam` animations then write `from + (to − from) · u`, `from` being the value the property
had when the event started, read back from the host, and `to` the event's own — or, where the event
has a second target of the same kind, that entity's live value. Discrete fields — a light's `on` and
`type`, the fog's `fogon`, `fogtable` and `fogmode` — switch only at `u ≥ 1`, so a zero-duration
event sets them at `time` (`0x6f45890`, `0x6f48de0`). The spatial and floor-height animations do not
lerp from a start value — see [The neighbours](#the-neighbours).

### Event properties

| Key                                                                                      | Type                 | On                                                                              | Provenance         |
| ---------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------- | ------------------ |
| `duration`                                                                               | float                | every event but `SET_CAMERA`                                                    | dll, corpus, guide |
| `flags`                                                                                  | flags                | `ATTACH_ENTITY`, `START_PATH_ANIMATION`, `START_SOUND`                          | dll, corpus, guide |
| `target_type` / `target_part`                                                            | enum / string        | `ATTACH_ENTITY`, `START_SPATIAL_PROP_ANIM`, `START_IK`, `START_FLR_HEIGHT_ANIM` | dll, corpus, guide |
| `offset`                                                                                 | float[3]             | `ATTACH_ENTITY`, `START_PATH_ANIMATION` — not parsed on `START_IK`              | dll, corpus, guide |
| `up`, `front`                                                                            | axis                 | `ATTACH_ENTITY`, `START_PATH_ANIMATION`, `START_IK`                             | dll, corpus, guide |
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
| `percent1`, `percent2`                                                                   | float                | `START_PATH_ANIMATION` — aliases of `start_percent`, `stop_percent`             | dll, code          |
| `loop`                                                                                   | —                    | `START_MOTION` — ORs 2 into `flags`, which no motion reads                      | dll, code          |
| `ik_id`                                                                                  | —                    | `START_IK` — defaults to the event's own identity                               | dll, code          |

`time` and `duration` are seconds in the script and **integer milliseconds** in the engine: the parser
multiplies by 1000 and truncates (code, `0x6f25400`). A missing `duration` sets flag bit 1,
`USE_SCRIPT_DURATION` (`0x6f25760`), and a `flags` key then overwrites the whole word (`0x6f257c9`):
the bit stays set when the event has **neither `flags` nor `duration`**, or when `flags` names it. On
an attach, a connect or a prop anim the bit means the event never ends; otherwise it ends at
`time + duration`, a missing `duration` counting 0 — so `flags` without `duration` ends at its start,
after one update. `START_PSYS` does not test the bit and always ends at `time + duration`.

**An event the engine cannot place is dropped** (code): the factory refuses a `SET_CAMERA`, a path
animation, an attach, a connect or an IK with no second target (`0x6f3a1e8`), and any event whose
second target does not resolve to an entity (`0x6f39b50`).

**`start_time` has two units** (code): on `START_MOTION` it is a float in **seconds** into the
animation (`0x6f25c9a`); on `START_SOUND` it is `_ftol` of the value with no ×1000 — **integer
milliseconds** into the wave (`0x6f26085`). Retail agrees: every sound `start_time` is an integer from
9 to 30,000.

**`start_percent` and `stop_percent` are fractions**, not percentages: the path parameter is
`start + (stop − start) · u`, every retail value lies in `[0, 1]`, and 302 retail animations run
`1 → 0`, backwards along the path.

**`event_flags`** (code — `thorn.dll` passes it untouched, `engbase.dll` reads it, `0x66126e0`):

| Bit | On `START_MOTION` |
| --- | ----------------- |
| 1   | play **backwards** (`time_scale` negated) |
| 2   | **loop** every channel at its own length |
| 4   | bounce — no retail use |
| 128 | keep the animations already on a joint alive under this one once its blend-in completes, so they resume when it ends; without it a completed blend stops them |

On `START_IK`, 128 is the same keep-beneath bit. The host hands the aim `event_flags` with bits of its
own added (`Freelancer.exe` `0x4525a2`–`0x4525f4`): 0x40 for `point_at`, 0x80 — joint limits off —
for a `point_at` whose `count_to_root` is exactly 1, 0x20 for `move_to`, and 0x100, keep-beneath,
when the script's own 128 is set. So every one-joint `point_at` aim — 4,754 of retail's 4,825 — runs
without limits whatever its flags.

**The other motion keys** (code). `animation` is a script name looked up, ignoring case, in one
table built from every `bodyparts.ini [Animations]` file (`Freelancer.exe` `0x435100`); a compound's
comes from its own model. `time_scale` is the playback speed. `weight` is an **amplitude, not a mix
weight**, and `trans_time` the per-joint blend-in, **0 replacing** — see
[ANIMATION.md](../modules/ANIMATION.md#scripts-mix-per-joint-and-weight-is-an-amplitude).
`trans_scale` scales a compound's root translation and is parsed only on a `COMPOUND`; `heading`
(default −1, parsed only on anything else, `0x6f25dd2`) faces the character that many radians when
not negative. `locked_bone` keeps scripts started later off that bone until this one finishes. At
`time + duration` the script stops at once — no blend-out.

**`START_IK`** (code, `0x6f2595a`): the chain is `end_effector` and `count_to_root` (default 0)
parents above it, at most four joints; `point_at` and `move_to` select the goals; `damping` (default
1) damps the least-squares solve; `transition_duration` (default 1 s) is the blend; `up` and `front`
are the look-at axes, as an attach's are. **A start at 0 becomes 1 ms** (`0x6f25962`), so motions at
0 begin first.

## What `ATTACH_ENTITY` does

All code, read out of `thorn.dll`'s `ATTACH` event class (vtable `0x6f5b30c`), the engine that runs
it, and the host routines it calls in `Freelancer.exe`. Addresses are VAs at the image bases,
`0x06f20000` for `thorn.dll` and `0x00400000` for the decrypted `Freelancer.exe`.

**Notation.** A frame is `F = [R | t]`, applied as `F(v) = R·v + t`; `A · B` applies `B` first;
`inverse([R | t]) = [Rᵀ | −Rᵀ·t]`. This is `x86math.dll`'s own convention — rotation row-major,
translation after it — which THORN calls for every product. An entity's frame is in **scene space**,
the frame the whole scene is placed with; for a scene nobody places it is world space, and a host
frame handed back (a hardpoint's) is taken out of world space by `inverse(S)`. The game never places
THORN's scene frame — it keeps its own, `C`, in the host — so scene space is world space wherever `C`
is the identity, which is every route but one: the script a room character loops, its fidget, is
anchored on the character's setpoint, `C = setpoint · G⁻¹`, `G` being the first non-player
`DEFORMABLE`'s `[R | (x, floor_height, z)]` (`Freelancer.exe` `0x445340`, `common.dll` `0x627bd80`).
Compounds and characters are drawn at `C · T`; effects, lights and 3D sounds take THORN's frame
unchanged.

**The parent frame `P`**, computed afresh at every update (`0x6f47c30`):

| `target_type` | Parent entity                | `P` |
| ------------- | ---------------------------- | --- |
| `ROOT`        | any                          | the parent's own frame; a `target_part` beside it is ignored |
| `HARDPOINT`   | `COMPOUND` or `DEFORMABLE`   | the hardpoint's frame: its `[R \| t]` relative to the part that owns it, composed onto that part's frame (`Freelancer.exe` `0x451b90`, `0x452730`) — taken as the part's world, which is not yet read for a non-root part (see [TODO](#todo)). The name is matched **ignoring case** — `HpEngine02` and `hpengine02` are one hardpoint — and the last duplicate wins; a name not found leaves the parent's own frame |
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
`up` axis. Within `|U·f| > 0.99` of the pole it switches reference: `u = s × f` with `s =
−σ(front)·σ(up) · normalize(W − (W·f)·f)`, `W = U × F`, `F` the scene's `front` axis and `σ` the
sign of an axis name. Every retail scene says `up = Y_AXIS, front = Z_AXIS`, so `U = Y` and `W = X`.
A `SCENE` that sets neither reads the same: its default, 6, is taken as `Y_AXIS` and `Z_AXIS`
(`0x6f2e4e2`). The rule was fitted to the routine run under emulation, exactly, for all 24
`front`/`up` pairs and all 24 scene axis pairs.

**Timing.**

- Before its `time` an attach does nothing.
- From `time` to its end it rewrites the child at every update. Updates happen at every event's
  start and end instant as well as at the end of each engine step, so a large step misses none of
  them. The end is `time + duration`, or never under `USE_SCRIPT_DURATION` — see `duration` above. An
  attach with `flags` and no `duration` therefore writes once, at `time`, and is done.
- At the end it writes once more, at exactly `time + duration`, and stops. **Nothing is undone**:
  the child keeps its last transform, and does not snap back or detach.
- Within one instant the engine orders its active events so that every event acting on an entity
  runs after the events of that entity's parent, however long the chain. On a single entity they run
  by action number, then start order — the second only while at most 16 events act on that entity:
  the sort is `std::sort`, an insertion sort up to 16 (`0x6f40290`, stable) and a median-of-three
  quicksort above (`0x6f3ff50`), which can reorder equal action numbers. Retail passes 16 at two
  instants of one script, on motions and IK with no attach among them. Chains therefore resolve with
  no frame of lag. When two attaches on one child are active together, the later-started one's
  writes win.

**The clock** advances by a millisecond delta; there is no evaluate-at-time. A forward step visits
every start and end inside it in order, so one step from 0 to *T* reaches the same state as any
sequence of smaller steps, and a scrubbing evaluator reproduces THORN's **first play** by replaying
from 0 to *T*, from the entities' `spatialprops`, with those breakpoints. A backward step is not that:
it finishes every running event and replays from 0 **without restoring any entity** (`0x6f3984b`),
so a `rel`, a `LOOK_AT` or an entity no event drives starts from whatever the last play left. Past
the script's end a scene that does not loop finishes every running event (`0x6f39a63`) and stops.

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
  position, then a world orientation. The host caches both and hands the effect `[R | p]` at its
  next advance, as the placement override on its `CONTROL_ROOT_ID` root (`0x45403c`). Advances
  inside a step come before that instant's events, but every step ends by advancing each entity
  again by 0 ms (`0x6f39a27`–`0x6f39a31`), so the effect is handed the frame its attach wrote in the
  same step — only what it emitted during the step was placed from the previous one. Whether the
  effect's `dt = 0` transform pass re-places every node is not traced. The host never reads
  `psysprops.sparam` and starts every effect at its default `sparam`, so a `sparam` set before
  `START_PSYS` is lost.
- **`START_PSYS_PROP_ANIM`** takes the last `sparam` set on the entity as its start value and moves
  it to `psysprops.sparam` over `duration`, as `from + (to − from)·u`, `u` being elapsed over
  duration — linear and unclamped — or the event's `param_curve`. A zero duration is an instant set.
  A second target that is itself a `PSYS` supplies `to` from its own current `sparam` instead.
- **`START_SPATIAL_PROP_ANIM`** chases its target by the remaining fraction (`0x6f46a40`): each
  update re-reads the entity and moves it `(u − last) / (1 − last)` of the way still left — position
  by lerp, orientation by normalised lerp of quaternions — so alone on an entity the position comes
  out exactly `lerp(p0, pos, u)` and the orientation arrives at `u = 1`; once `u ≥ 1` has been seen
  it stays on the target. A second target (6,074 of 6,548 retail) replaces `pos` and `q_orient` with
  that entity's live frame, or its hardpoint or part frame under `target_type` and `target_part`,
  resolved as an attach's is. `axisrot` is incremental and in **degrees**: each update turns by
  `u · angle` less what it has already applied, about the scene's axis through the entity for
  `X_AXIS`…`Z_AXIS` and about the entity's own axis for the `NEG_` names — the negation picks the
  frame, not the direction (`0x6f4703e`, `0x6f46fdf`). Position, then orientation, then `axisrot`.
- **`START_FLR_HEIGHT_ANIM`** moves a character's floor the same way, the remaining fraction toward
  `floor_height` or toward a second target's `y` (`0x6f49890`).

## How the game plays a script

**THORN pushes nothing when it binds** (`0x6f392a0`). The game applies each entity's starting state
from its record: frame, camera `fovh`/near/far (never `hvaspect`), `audioprops`, and a character's
`compoundprops.floor_height` after its position (`Freelancer.exe` `0x44f05c`–`0x44f1d2`). The game
ticks THORN by whole milliseconds, carrying the remainder (`0x558ac7`). It ticks 0 on start, so
everything at `t = 0` happens before the first frame (`0x44f7c4`–`0x44f7da`). A finished,
non-looping script gets one more 100 ms tick, which finishes every running event (`0x44f914`).

## `userprops` is not THORN's

The one block THORN passes through untouched: the keys below are in `common.dll` and
`Freelancer.exe`, none in `thorn.dll` — so `userprops` is Freelancer's extension point, and a
THORN-only reading of a script cannot interpret it.

| Key                        | Values                                                                                                | Read by                        |
| -------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------ |
| `category`                 | `Audio`, `Character`, `Prop`, `Equipment`, `Spaceship`, `Asteroid`, `Room`, `Equipment Cart`, `Solar` | `common.dll`, `Freelancer.exe` |
| `actor` / `Actor`          | a cast name: `player`, a room role (`bartender`, …) or a story character — the costume is `template_name` | `common.dll`, `Freelancer.exe` |
| `speaker` / `Speaker`      | `Offer_Character_A`, `Player_Character_P`                                                             | `Freelancer.exe`               |
| `nofog` / `NoFog`          | `Y`, `y` — as *strings*                                                                               | `common.dll`, `Freelancer.exe` |
| `running_lights`           | `true`, `True` — as strings                                                                           | `common.dll`, `Freelancer.exe` |
| `main_object`              | the literal string `main_object`                                                                      | `Freelancer.exe`               |
| `loadout` / `Loadout`      | loadout nickname                                                                                      | `common.dll`, `Freelancer.exe` |
| `TextStart` / `TextString` | numbers **as strings**: seconds into the scene, and an IDS resource id                                | `Freelancer.exe`               |
| `Priority`                 | `Steps_4`, `Room_Prop_1`, `Equip_1`, … 27 distinct — `rtcslider.ini` settings                         | `Freelancer.exe`, `common.dll` |
| `No_Fog`                   | `Y`                                                                                                   | **nothing**                    |

**The keys are matched ignoring case** (code): `thorn.dll` keeps each entity's `userprops` in a map
whose comparator is `_memicmp` (`0x6f3c3b0`), and the game reads them through it. So `Actor` and
`actor`, `NoFog` and `nofog`, `Priority` and `priority` are one key each. `No_Fog` is a different key
and still matches nothing. `nofog` and `running_lights` are **tested for presence only** — any value
switches them on (`Freelancer.exe` `0x44ee06`, `0x44ee35`).

**`Priority` is read**, as `priority`: it names a setting in `DATA/SCRIPTS/rtcslider.ini`, and an
entity whose setting is off for the player's cutscene-detail slider is **never created**
(`0x44ee52`–`0x44ee72`). A `set = name, t` line is on when the slider is at least `t`, a
`set_less = name, t` line when it is below `t`, and a name the file does not list is on
(`common.dll` `0x627a920`). Retail uses it to give each story scene exactly one of a moving and a
static camera monitor, and to thin sounds, props and effects at low detail.

`TextString` holds an IDS id as a decimal string (`259608.00000`); `TextStart` is when it shows, in
seconds — `0.75000` in all 23 scripts. On a `SCENE` they are the base-arrival caption, shown
`TextStart` seconds in (`Freelancer.exe` `0x45b430`). Text on screen is a `userprops` entry read by
the game, not a THORN event.

`main_object` matters only under `[Trigger] Act_CallThorn`: the game binds the script's `MONITOR`
and the one entity carrying it, anchored on the live object, and creates nothing else from the script
(`Freelancer.exe` `0x51e4c0`). A `PSYS` without `Priority` is gated by the `script_particles`
setting instead (`0x44efd7`).

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

Three the guide gets right against expectation: `hvaspect` really is spelled that way on an entity,
`usr_flg = 1` really is a static background layer, and `color` under `lightprops` really is unused —
set on every retail light, it reaches the light only when `type` is absent (`0x6f29492`), which it
never is.

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
`3` × 4 — so it is a bitfield with bits 1, 2 and 128 in use; what each does is under
[Event properties](#event-properties).

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
| `Priority`                 | 3,426                        |
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

- **What `STOP` = 21 and `STOP_IK` = 22 are for, outside the `action` slot.** As actions they are
  settled — dropped by the parser, and `START` = 23 is an alias for `START_SOUND` or `START_MOTION`
  (code; see [The registry is closed](#the-registry-is-closed)). Their names are referenced only by
  the registration routine (`4f77`, `4f8f`, `4fa4`). *Experiment*: none left in the script; only a
  host that reads the globals could use them.
- **Whether `PROPERTY_ANIM`, `ADD_PATH` and `LOOKAT_ENTITY` do anything.** Same shape, same
  experiment.
- **Whether an attached effect is drawn on its attach's frame of the same step.** The 0 ms advance
  that closes every step hands the effect the new frame and runs its transform pass at `dt = 0`;
  whether that pass re-places every node is not traced in `alchemy.dll`. *Experiment*: attach an
  effect to a moving ship's hardpoint and compare the flame with the hull frame by frame.

Open in the binaries rather than the game:

- **Whether a non-root part's hardpoint frame is world.** `Engine +0x90`/`+0x98` forward to the
  instance's owner (`engbase.dll` `0x6621b40`, `0x6621ba0`), whose routines are not read.
- **A Hermite curve with a repeated `t`** — the evaluator guesses an index and walks (`0x6f30520`);
  five retail curves repeat one.
- **Which `LinearPCurve` DACOM returns** — the two differ only at `t ≥ 1` and outside `[0, 1]`.
- **`CONNECT_HARDPOINTS` onto a revolute or prismatic child hardpoint** — `engbase.dll` `0x6626745`.
- **A closed path's last quaternion**, never written (`0x6f21d89`); no retail path is closed.
- **The cutscene-detail slider's default** (`Freelancer.exe` `0x5b53b0`), which decides which
  `Priority` entities exist.

---

[THN.md](../modules/THN.md) · [INI.md](../modules/INI.md) · [RETAIL.md](RETAIL.md)
