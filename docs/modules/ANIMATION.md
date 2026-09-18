# Animation

Keyframe animation, called **scripts**. Rigid compound models (`.cmp`) embed theirs in the same UTF
tree as the model; deformable models keep theirs in a standalone `.anm`. Both use the same
structures, so one module reads and writes either.

A script is a named bundle of **maps**, each binding one animated object to one **channel** of
keyframes. Interpolation between keyframes is always linear.

## Layout

```
Animation (UTF directory)
  └─ Script (UTF directory)
       └─ <script name> (UTF directory per script)
            ├─ Root height (UTF file, float — deformable models only)
            ├─ Object map <n> (UTF directory)
            │    ├─ Parent name (UTF file, string — the animated object)
            │    └─ Channel
            └─ Joint map <n> (UTF directory)
                 ├─ Parent name (UTF file, string)
                 ├─ Child name (UTF file, string — the animated object)
                 └─ Channel
                      ├─ Header (UTF file — keyframe count, interval, type)
                      └─ Frames (UTF file — packed keyframe array)
```

Scripts are referenced by name from INI files (`animation = Sc_open dock`) and matched by CRC, so
`getScript` is case-insensitive.

The trailing number on `Object map 0` / `Joint map 4` is decorative. Freelancer matches on the name
prefix alone, and retail `.anm` files have gaps in the sequence; the writer renumbers maps
sequentially within each kind.

## Object maps and joint maps

|                | Object map                            | Joint map                                   |
| -------------- | ------------------------------------- | ------------------------------------------- |
| Applies to     | The root object only                  | A child object, via the joint to its parent |
| Name entries   | `Parent name` — the animated object   | `Parent name` + `Child name` — the target   |
| Animates       | Position and rotation in object space | Whatever the joint exposes                  |

Applying an object map to a subpart, or a joint map to the root, does nothing.

Which keyframe field a joint map consumes follows the joint type:

| Joint       | Keyframe field used                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------------ |
| `fixed`     | none — fixed joints cannot be animated                                                                 |
| `revolute`  | `value` — angle in radians, nominally between the joint's `min` and `max` †                            |
| `prismatic` | `value` — offset along the joint axis, nominally within the same range †                               |
| `sphere`    | `rotation` ‡                                                                                           |
| `loose`     | `position`, `rotation`, or both ‡                                                                      |
| `cylinder`  | unimplementable — see [below](#why-cylinder-joints-cannot-be-animated)                                 |

† Nominally — retail exceeds it. See [The range is nominal](#the-range-is-nominal).

‡ A delta on top of the joint's rest, not a replacement. See [Sphere and loose channels are
displacements](#a-sphere-or-loose-channel-is-a-displacement-of-the-joints-rest).

## Channels

### `Header`

Twelve bytes, always.

| Offset | Type      | Field    | Description                                               |
| ------ | --------- | -------- | ---------------------------------------------------------- |
| `0x00` | `uint32`  | count    | Number of keyframes                                       |
| `0x04` | `float32` | interval | Keyframe spacing in seconds; negative means per-key times |
| `0x08` | `uint32`  | type     | Keyframe contents bitfield                                |

When `interval` is negative, every keyframe in `Frames` is prefixed with its own `float32` time
marker in seconds. When it is zero or positive the markers are omitted and keyframe *n* occurs at
`n * interval`. Retail uses both: `.cmp` door and radar animations mostly carry explicit times,
resampled `.anm` tracks run at a fixed 1/30 s.

### `ChannelType`

A byte-wide bitfield describing what each keyframe holds. At most one position bit and at most one
quaternion bit may be set, and `Angle` never combines with anything else — `validateChannelType`
enforces it.

| Flag                 | Value  | Bytes per keyframe | Description                                                     |
| -------------------- | ------ | ------------------ | ---------------------------------------------------------------- |
| `Angle`              | `0x01` | 4                  | Single float: revolute angle in radians or prismatic offset     |
| `Position`           | `0x02` | 12                 | Position vector, 3× `float32`                                   |
| `Quaternion`         | `0x04` | 16                 | Rotation quaternion, 4× `float32` stored **W, X, Y, Z**         |
| `Event`              | `0x08` | —                  | Event stream; no retail asset sets it, rejected by this library |
| `ZeroPosition`       | `0x10` | 0                  | Position is animated but always zero; nothing is stored         |
| `IdentityQuaternion` | `0x20` | 0                  | Rotation is animated but always identity; nothing is stored     |
| `VectorQuaternion`   | `0x40` | 6                  | Rotation quantized to the quaternion vector part, 3× `int16`    |
| `AngleQuaternion`    | `0x80` | 6                  | Rotation quantized to the axis scaled by angle, 3× `int16`      |

`ZeroPosition` and `IdentityQuaternion` declare that a channel drives a property without storing data
for it. The reader materialises the constant so consumers never special-case them; the writer emits
nothing.

The low nibble comes from Conquest: Frontier Wars — see [Where the low bits come
from](#where-the-low-bits-come-from). The upper nibble is Freelancer's own, all compression.

### `Frames`

Keyframes are packed back to back with no padding, each field in this order:

```
[ time marker ][ angle ][ position ][ quaternion ]
    4 bytes      4 bytes   12 bytes    16 / 6 / 0 bytes
   if interval<0  if 0x01    if 0x02    per quaternion flag
```

`keyframeByteLength(type, interval)` returns the stride.

### Quantized quaternions

Both compressed forms store three `int16` fractions of `0x7fff` and drop the sign of W. `q` and `-q`
are the same rotation, so the encoders fold negative-W quaternions into the positive hemisphere
first.

**`VectorQuaternion` (`0x40`)** stores the quaternion vector part verbatim and restores W from unit
length:

```
w = sqrt(1 - (x² + y² + z²))
```

The stored length is `sin(θ/2)`, so precision is finest near identity and the representable range
tops out at a half turn.

**`AngleQuaternion` (`0x80`)** stores the unit rotation axis scaled by `θ/π`, spreading the whole
positive hemisphere linearly over the unit range — zero is identity, one is a half turn:

```
s = sin(π · |v| / 2)         // = sin(θ/2), the quaternion vector magnitude
q = ( v · s / |v|, sqrt(1 - s²) )
```

This follows [Librelancer](https://github.com/Librelancer/Librelancer/tree/main/src/LibreLancer/Utf/Anm),
not [MAXLancer](https://github.com/treewyrm/MAXLancer/blob/master/scripts/Animation.ms), which
decodes `0x40` with a half-angle function and labels `0x80` a "harmonic mean".

### The event bit (`0x08`)

`PersistDT_EVENT` is an event stream rather than joint data. CFW defines it in
`Libs/Include/PersistChannel.h` alongside the other three and pairs it with an `Event map` directory
— a third map stem beside `Object map` and `Joint map` (`Libs/Include/persistanim.h`). Freelancer
authored none, so its payload layout is unknown here and `validateChannelType` rejects it.

MAXLancer repurposes the bit to write a pair of floats for cylinder joints. That is MAXLancer's
convention, not what the bit means.

## Why cylinder joints cannot be animated

A cylinder takes 2 floats — `get_num_state_floats` returns 2 for `JT_CYLINDRICAL` — and no
combination of the channel type bits comes to 2. The format has nowhere to put them. This is not a
missing decoder.

CFW never animated one either. `GetChannelType`
(`Libs/Src/Tools/Exporters/Common/CMP.CPP`) dispatches loose, spherical, translational and event
straight off the type bits then falls back to searching the prismatic and revolute lists by name —
there is no `cyl_list` — and `IsConstantChannel`'s `frame_size` switch has cases for every joint
kind except cylindrical, which lands in *"Error: unknown channel type"*.

A cylinder channel would have to be `PersistDT_FLOAT` carrying two floats, so its stride could not be
derived from the channel type alone; it would need the joint type, reached through the map's parent
and child names.

## Notes

### A sphere or loose channel is a displacement of the joint's rest

The keyframe fields compose onto what the `Cons` record already says rather than standing in for it:

```
sphere   L(q)    = T(position)            · R(q) · R(rotation) · T(-offset)
loose    L(p, q) = T(position + p)        · R(q) · R(rotation)
```

The driven factor sits to the left of the rest rotation, as [RENDERER.md §5.2](../refs/RENDERER.md#52-composing-a-joint)
gives for every other joint, and the loose channel's own position is added to the rest origin in the
parent's frame.

The opposite reading is attractive: `0x06` is CFW's seven-float loose-joint *state vector*, and an
object map — which unambiguously replaces — carries the identical channel type. No retail `.cmp`
script drives a loose joint, so only the `.anm` files settle it, and they do
([Corpus](#loose-and-sphere-channels-compose)). Read as a replacement, every head bone collapses onto
its parent's origin and every rest rotation is discarded. Librelancer composes the same way in
`BoneInstance.Update`: `Origin + Translation` under
`Quaternion.Concatenate(OriginalRotation, Rotation)`.

A field the channel omits contributes nothing and the rest's own value stands — which is what
`ZeroPosition` and `IdentityQuaternion` already say by storing no bytes.

### `Root height` elevates the character, not the skeleton

A float beside the object maps, on 1,008 of the 1,010 object maps in the tree — every one in an
`.anm`, neither of the two in a `.cmp`.

It is not an offset applied to the root object map's position; nothing in the skeleton moves by it.
Librelancer applies it to the world object — `Translate.Y = FloorHeight + RootHeight`, with the floor
height set by the THN event `START_FLR_HEIGHT_ANIM` — so it states how far off the floor of a room
the character stands. A renderer with no room has nothing to apply it against.

### A revolute angle is an angle, and one bit cannot say so

`Angle` (`0x01`) carries a revolute joint's angle in radians **or** a prismatic joint's offset in
metres, and nothing in the channel distinguishes them. The two are told apart only by the joint the
map lands on, which is what CFW's `GetChannelType` did by searching the revolute and prismatic lists
by name.

Every one of retail's 414 revolute channels stores its angle wrapped into (-π, π]. A keyframe pair
stepping across the seam — `+3.1329` to `-3.0720` — means a further 4.49° in the same direction, and
interpolating it on a line instead of on a circle runs 355.5° backwards.

Wrapped storage is retail's habit rather than the format's rule. A channel is wrapped iff no value
leaves the band, which is a per-channel test worth making: 51 of Discovery's 532 revolute channels
store angles reaching ±2π, and `SHIPS/RHEINLAND/RH_MINER/rh_miner.cmp` runs a propeller
0 → -179.8° → **-360°**, a genuine sweep just past half a turn that a blanket shortest-arc reverses
into +179.7°.

The reader hands back what the file stores and `sampleChannel` lerps the scalar on a line. A consumer
holding the joint takes the short way round for a revolute channel whose values stay in the band.
This library already does that wherever the channel alone is enough: `Quat.slerp` folds the double
cover for a sphere joint, and `0x40`/`0x80` fold negative-W quaternions on the way in. The angle bit
is the one place the information is not there.

### Channels loop independently, at their own lengths

`getScriptDuration` is the longest of a script's maps, and it is not the length everything in the
script runs to. Each channel cycles on its own: `SOLAR/MISC/rift_pylon.cmp`'s `Sc_anim active` gives
its eight channels 2, 4, 8 and 16 seconds, and `rh_miner.cmp`'s `sc_rotate drill` pairs a
0.75-second drill with a 10-second arm, which on a shared clock spins once then stands still for
nine seconds.

The shape is a minority — 14 of the 186 multi-map scripts in retail `.cmp` mix channel lengths, 24 of
Discovery's 451 — so a consumer that runs everything to the script's duration is right about most
scripts and visibly wrong about the rest.

### The range is nominal

A driven joint's `min`/`max` bound what the joint declares, not what its channel contains, and retail
exceeds it ([Corpus](#channels-outside-their-joints-range)). This reader does not clamp — a value is
what the file records — and whether the engine clamps is a question for the game, listed in
[RETAIL.md](../refs/RETAIL.md#todo--what-is-pending-in-the-game).

### Where the low bits come from

The whole low nibble is CFW, where the type describes a joint's state vector:

| Bit    | CFW name               | Floats | Joint it serves     |
| ------ | ---------------------- | ------ | ------------------- |
| `0x01` | `PersistDT_FLOAT`      | 1      | revolute, prismatic |
| `0x02` | `PersistDT_VECTOR`     | 3      | translational       |
| `0x04` | `PersistDT_QUATERNION` | 4      | spherical           |
| `0x08` | `PersistDT_EVENT`      | —      | event stream        |

`JointInfo::get_num_state_floats` returns exactly those counts, and `0x06` — which does occur in
retail — is the 7 floats a loose joint needs. `PersistChannelHeader` is `frames`, `capture_rate`,
`type`, and its comment states the negative-interval rule: *"if the capture rate is less than 0.0
then the data is not periodic … each frame consists of a time value"*.

## API

### `./animation`

| Export                  | Kind      |                                                                                 |
| ----------------------- | --------- | ------------------------------------------------------------------------------- |
| `AnimationLibrary`      | type      | Animation scripts of a model.                                                   |
| `AnimationMap`          | type      | `ObjectMap \| JointMap`.                                                        |
| `Channel`               | interface | Keyframe track of a single animated property set.                               |
| `ChannelKeyframe`       | interface | Animation keyframe. Which properties are set is dictated by the channel type.   |
| `ChannelSample`         | interface | Channel value sampled between keyframes.                                        |
| `ChannelType`           | enum      | Channel keyframe contents, a bitfield stored in the channel `Header` file.      |
| `getChannelDuration`    | function  | Channel duration in seconds.                                                    |
| `getJointMap`           | function  | Finds joint map animating the named child object.                               |
| `getLibraryDuration`    | function  | Library duration in seconds, the longest of its scripts.                        |
| `getMapDuration`        | function  | Map duration in seconds.                                                        |
| `getObjectMap`          | function  | Finds object map animating the named object.                                    |
| `getScript`             | function  | Finds script by name.                                                           |
| `getScriptDuration`     | function  | Script duration in seconds, the longest of its maps.                            |
| `JointMap`              | interface | Animates a child object relative to its parent, driving the joint between them. |
| `keyframeByteLength`    | function  | Calculates keyframe byte length for the channel type.                           |
| `ObjectMap`             | interface | Animates the root object of a model in its own space.                           |
| `POSITION_MASK`         | const     | Bits describing keyframe position.                                              |
| `QUATERNION_MASK`       | const     | Bits describing keyframe rotation.                                              |
| `readAngleQuaternion`   | function  | Reads quaternion from a quantized rotation axis scaled by angle.                |
| `readAnimationLibrary`  | function  | Reads animation library from file root directory.                               |
| `readChannel`           | function  | Reads animation channel from map directory.                                     |
| `readJointMap`          | function  | Reads joint map from directory.                                                 |
| `readObjectMap`         | function  | Reads object map from directory.                                                |
| `readQuaternion`        | function  | Reads quaternion stored as four floats in W, X, Y, Z order.                     |
| `readScript`            | function  | Reads animation script from directory.                                          |
| `readVectorQuaternion`  | function  | Reads quaternion from its quantized vector part, restoring W from unit length.  |
| `sampleChannel`         | function  | Samples channel at time, interpolating linearly between neighbouring keyframes. |
| `Script`                | interface | Named animation, a collection of maps applied to a model at the same time.      |
| `validateChannelType`   | function  | Validates channel type bitfield.                                                |
| `writeAngleQuaternion`  | function  | Writes quaternion as a quantized rotation axis scaled by angle.                 |
| `writeAnimationLibrary` | function  | Writes animation library into directory.                                        |
| `writeAnimationMap`     | function  | Writes animation map into directory.                                            |
| `writeChannel`          | function  | Writes animation channel into directory.                                        |
| `writeQuaternion`       | function  | Writes quaternion as four floats in W, X, Y, Z order.                           |
| `writeScript`           | function  | Writes animation script into directory.                                         |
| `writeVectorQuaternion` | function  | Writes quaternion as its quantized vector part.                                 |

## Corpus

| | Count |
| --- | --- |
| Scripts across the retail `DATA` tree | 3,117 |
| Channels | 143,679 |
| `Joint map` stems | 142,669 |
| `Object map` stems | 1,010 |
| Third map stems | **0** |
| Channels setting `0x08` | **0** |

The stride always divides the `Frames` file exactly — no trailing bytes anywhere.

Script durations run from 0 — a single keyframe, a closed pose rather than a defect — to 400 seconds,
median 3.33. Measured by freelancer-testing's `npm run corpus`.

### What a `.cmp` script actually drives

The 323 scripts embedded in `.cmp` files hold 977 maps — 2 object maps and 975 joint maps — and the
974 that resolve to a part land on:

| Joint      | Maps | Channel type |
| ---------- | ---- | ------------ |
| prismatic  | 543  | `0x01`       |
| revolute   | 414  | `0x01`       |
| sphere     | 17   | `0x04`       |

No `.cmp` script drives a loose joint, and none targets a fixed one — a fact about what retail
authored, not what the format allows. Only three channel types occur: `0x01` ×958, `0x04` ×17, and
`0x06` ×2, both of which are the two object maps. The compressed forms are `.anm` alone.

The channel type alone doesn't identify the joint: a `0x04` fits a sphere or loose joint equally, and
only the joint it lands on separates them — which matters, since the two compose differently.

The eleven `.anm` files hold the rest: 2,794 scripts, 1,008 object maps, 141,694 joint maps. Their
channel types are `0x22` ×66,409, `0x42` ×39,452, `0x80` ×27,064, `0x40` ×5,288, `0x50` ×3,171,
`0x82` ×1,219, `0x90` ×79 and `0x04` ×20 — every compressed form, and not one `0x01`.

The one map resolving to nothing is `EQUIPMENT/MODELS/TURRET/trade_turret01.cmp`, whose `Sc_fire`
animates `Barrel01` in a model declaring only `Root` and `Gun01` — the same file whose `Cons` list
constrains a part it never declares. The stored name carries a trailing tab.

### Loose and sphere channels compose

Over all eleven `.anm` files, bound against the skeleton each covers:

- 1,955,761 position keyframes sit nearer zero than their joint's rest origin, against 1,854 nearer
  the rest — counted over the 105,747 joints whose rest origin is not the origin.
- 1,904,934 rotation keyframes sit nearer the identity than their joint's rest rotation, against
  4,713 nearer the rest — over the 77,581 joints whose rest rotation is not already the identity.

The `.anm` side is 109,056 loose joint maps against 31,318 sphere ones, so what a `.cmp` never
exercises is the majority of what a `.dfm` does.

### Wrapped revolute angles

All 414 retail revolute channels store angles inside (-π, π]; 150 of them step over π somewhere.
Prismatic data does the same in 370 of 543, where π metres means nothing and wrapping would be a bug.

`SOLAR/MISC/gyro_05x.cmp` in Discovery is the clean demonstration: five keyframes describing one
revolution whose linear sum is exactly zero and whose wrapped sum is exactly 2π.

### Channels outside their joint's range

278 keyframes in 22 prismatic channels sit outside their own joint's declared range, the worst by
423.25 units against `[0, 3302.125]`: `BASES/BRETONIA/br_03_warwick_cityscape.cmp`, whose `Sc_loop`
runs the city traffic past the end of its rail. No revolute channel exceeds its range, in any of the
414.

### `Root height`

On 1,008 object maps: all 455 of `bodygenericmale.anm`, 8 of `special.anm`'s 15, and no facial or
hand script.

### Channel type combinations

Ten occur, and `corpus.test.ts` asserts that set exactly:

| Type   | Composition                             | Where it appears                       |
| ------ | --------------------------------------- | -------------------------------------- |
| `0x01` | angle                                   | `.cmp` — revolute and prismatic joints |
| `0x04` | full quaternion                         | `.cmp`, `.anm`                         |
| `0x06` | position + full quaternion              | `.cmp` — loose joints and object maps  |
| `0x22` | position + identity rotation            | `.anm`                                 |
| `0x40` | vector-part quaternion                  | `.anm`                                 |
| `0x42` | position + vector-part quaternion       | `.anm`                                 |
| `0x50` | zero position + vector-part quaternion  | `.anm`                                 |
| `0x80` | angle-scaled-axis quaternion            | `.anm`                                 |
| `0x82` | position + angle-scaled-axis quaternion | `.anm`                                 |
| `0x90` | zero position + angle-scaled-axis       | `.anm`                                 |

Retail `VectorQuaternion` data never exceeds a stored length of 0.85.

### Round-trip

Every one of the 143,679 channels re-serializes byte for byte, with one exception: 55 keyframes
across 20 `.anm` channels store an angle-scaled axis slightly longer than one unit, outside the range
the encoding can represent. Re-encoding clamps them, so they come back one `int16` LSB off; the
resulting rotation differs by at most 0.004°. The corpus test allows exactly these and asserts the
decoded quaternions still match.
