# Animation

Keyframe animation, called **scripts**. Rigid compound models (`.cmp`) embed theirs in the same UTF
tree as the model; deformable models keep theirs in a standalone `.anm`. Both use the same
structures, so one module reads and writes either.

A script is a named bundle of **maps**, each binding one animated object to one **channel** of
keyframes. Interpolation between keyframes is always linear — scalars and positions on a line,
rotations by normalized lerp.

What the game does with a script is read out of retail `EXE/engbase.dll` (image base `0x6610000`),
which holds the loader (`Anim.cpp`), the channel codec (`channel_arch.cpp`), one player per map
(`AnimComponent.cpp`) and the joints the players drive (`engine.cpp`). Addresses below are into it
unless another binary is named; `x86math.dll` supplies the quaternion arithmetic.

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

The prefix match is `strncmp` (`0x66116ff`) and `Root height` an inline `strcmp` (`0x66114a4`):
both **case-sensitive**, so `joint map 0` or `root height` is not read by the game, and not by this
reader either. A third stem, `Event map`, is tested for and skipped outright (`0x66115fd`); any other
directory under a script is ignored.

## Object maps and joint maps

|              | Object map                                        | Joint map                                   |
| ------------ | ------------------------------------------------- | ------------------------------------------- |
| Applies to   | An object — the model root                        | A child object, via the joint to its parent |
| Name entries | `Parent name` — the animated object               | `Parent name` + `Child name` — the target   |
| Animates     | Position and rotation, relative to the start pose | Whatever the joint exposes                  |

Applying an object map to a subpart, or a joint map to the root, does nothing. (Not read in the
engine: the object player writes through the target instance's owner, whose handling of a jointed
child was not followed.)

**The engine binds a map only when its channel carries exactly what the target takes** (`0x661ae66`).
It expands every channel to plain floats at load, then compares the keyframe size with the joint's
state: one float for revolute and prismatic, three for translational, four for sphere, seven for
loose — and seven for an object map (`0x661af0d`). A mismatch is logged as *failed to map JOINT* and
the map does nothing. Which keyframe field a joint map consumes therefore follows the joint type:

| Joint           | Keyframe field used                                                         |
| --------------- | --------------------------------------------------------------------------- |
| `fixed`         | none — fixed joints cannot be animated                                      |
| `revolute`      | `value` — angle in radians, clamped to the joint's `min` and `max` †        |
| `prismatic`     | `value` — offset along the joint axis, clamped to the same range †          |
| `sphere`        | `orientation` ‡                                                             |
| `translational` | `position` ‡ — see [COMPOUND.md](COMPOUND.md#translational-joints)          |
| `loose`         | `position` **and** `orientation` ‡ — a channel carrying only one is refused |
| `cylinder`      | unimplementable — see [below](#why-cylinder-joints-cannot-be-animated)      |

† The engine clamps when it sets the value. See [The range is enforced](#the-range-is-enforced).

‡ A delta on top of the joint's rest, not a replacement. See [Sphere and loose channels are
displacements](#a-sphere-or-loose-channel-is-a-displacement-of-the-joints-rest).

A loose joint's channel with nothing to say about one field says so with `ZeroPosition` or
`IdentityQuaternion`, which is what those two bits are for: they pad the channel to the seven floats
the engine will bind, at no storage cost. Retail respects the rule as far as names can tell: every
rotation-only `.anm` channel names a bone that is a sphere joint in at least one skeleton, and no
channel with a position lands on a bone that is only ever a sphere.

## Channels

### `Header`

Twelve bytes, always — the engine refuses a channel whose `Header` is any other length (`0x661d97b`),
and one whose `Frames` is not exactly `count` keyframes long (`0x661da30`). `readChannel` throws on
both.

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

A bitfield describing what each keyframe holds, stored as a `uint32` of which nine bits mean
something. At most one position bit and at most one quaternion bit may be set, and `Angle` never
combines with anything else — `validateChannelType` enforces it, and so does the engine: a
compressed bit beside `Angle` or `Event`, two position bits, or two quaternion bits is a fatal
error at load (`0x661db70`), and an `Angle` beside a vector or quaternion has no player to bind to
(`0x6615950`, *Unknown data type!*).

| Flag                 | Value   | Bytes per keyframe | Description                                                         |
| -------------------- | ------- | ------------------ | ------------------------------------------------------------------- |
| `Angle`              | `0x01`  | 4                  | Single float: revolute angle in radians or prismatic offset         |
| `Position`           | `0x02`  | 12                 | Position vector, 3× `float32`                                       |
| `Quaternion`         | `0x04`  | 16                 | Rotation quaternion, 4× `float32` stored **W, X, Y, Z**             |
| `Event`              | `0x08`  | 4                  | Event stream; never loaded — see [below](#the-event-bit-0x08)       |
| `ZeroPosition`       | `0x10`  | 0                  | Position is animated but always zero; nothing is stored             |
| `IdentityQuaternion` | `0x20`  | 0                  | Rotation is animated but always identity; nothing is stored         |
| `VectorQuaternion`   | `0x40`  | 6                  | Rotation quantized to the quaternion vector part, 3× `int16`        |
| `AngleQuaternion`    | `0x80`  | 6                  | Rotation quantized to the axis scaled by angle, 3× `int16`          |
| `ShortQuaternion`    | `0x100` | 8                  | Rotation quantized whole, 4× `int16` **W, X, Y, Z**; no retail user |

`ZeroPosition` and `IdentityQuaternion` declare that a channel drives a property without storing data
for it. The reader materialises the constant so consumers never special-case them; the writer emits
nothing. The engine does the same at load (`0x661db70`): every compressed or implied field is
expanded into full floats and the type rewritten to its low-nibble equivalent before anything binds
the channel, so what a player sees is only ever `0x01`, `0x02`, `0x04`, `0x06` or `0x08`.

The bitfield is the codec's. A `Channel` is one of two shapes, and keeps what a keyframe holds apart
from how it is stored:

```ts
type Channel = AngleChannel | MotionChannel

interface AngleChannel {
  type: 'angle' // ChannelType.Angle
  interval: number
  keyframes: { key: number; value: number }[]
}

interface MotionChannel {
  type: 'motion'
  interval: number
  position?: 'vector' | 'zero' // Position, ZeroPosition
  orientation?: 'quaternion' | 'identity' | 'vector' | 'angle' | 'short' // the five quaternion bits
  keyframes: { key: number; position?: Vector3; orientation?: Quat }[]
}
```

A keyframe carries a field exactly when its channel carries the matching encoding, and the writer
throws on one that does not — a field with no encoding would be dropped, and an encoding with no
field would be invented. `getChannelType` gives back the bitfield a channel is stored with.

The low nibble comes from Conquest: Frontier Wars — see [Where the low bits come
from](#where-the-low-bits-come-from). The five bits above it are Freelancer's own, all compression.

### `Frames`

Keyframes are packed back to back with no padding, each field in this order:

```
[ time marker ][ angle ][ position ][ quaternion ]
    4 bytes      4 bytes   12 bytes    16 / 6 / 8 / 0 bytes
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

Both decoders are the engine's, instruction for instruction: `0x40` at `0x661def2`, including `w = 0`
once `x² + y² + z²` reaches one, and `0x80` at `0x661df9d`, including the identity for a zero vector.
The scale is `1/32767` (`0x662955c`). [Librelancer](https://github.com/Librelancer/Librelancer/tree/main/src/LibreLancer/Utf/Anm)
agrees; [MAXLancer](https://github.com/treewyrm/MAXLancer/blob/master/scripts/Animation.ms) decodes
`0x40` with a half-angle function and labels `0x80` a "harmonic mean".

**`ShortQuaternion` (`0x100`)** stores all four components as `int16` fractions, W first, and keeps
the sign of W. The engine (`0x661e067`) renormalizes with one Newton step rather than a square root,
and `readShortQuaternion` does the same:

```
k = (3 - |q|²) / 2
q = q · k
```

No retail asset sets the bit. It is the one encoding the engine reads that Freelancer's tools never
wrote.

### The event bit (`0x08`)

`PersistDT_EVENT` is an event stream rather than joint data. CFW defines it in
`Libs/Include/PersistChannel.h` alongside the other three and pairs it with an `Event map` directory
— a third map stem beside `Object map` and `Joint map` (`Libs/Include/persistanim.h`).

Freelancer's engine still carries the machinery and never reaches it. The channel codec knows the
layout: the bit **replaces** the stride with 4 rather than adding to it (`0x661d9b4`), each keyframe
is a time marker when the interval is negative and then a `uint32` offset, and the offset points
into data stored after the keyframe table (`0x661e3d0`), which is why `Frames` is the one file whose
length the codec does not check. A player exists for it and two query methods walk it by time
(`0x661e310`, `0x661e400`). But the script loader skips every `Event map` directory before it opens
one (`0x66115fd`), so no event channel is ever loaded — and none was authored. What the payload
holds is unread; `validateChannelType` rejects the bit.

MAXLancer repurposes the bit to write a pair of floats for cylinder joints. That is MAXLancer's
convention, not what the bit means, and the game ignores it twice: the stride is fixed at 4, and
the map would have to be an `Event map` to be read at all.

## Why cylinder joints cannot be animated

A cylinder takes 2 floats — `get_num_state_floats` returns 2 for `JT_CYLINDRICAL` — and no
combination of the channel type bits comes to 2. The engine keeps a two-float state for one — travel
along the axis, then the angle about it (`0x6622781`, built into a transform at `0x66257f0`) — so code
could pose it. Animation cannot, three times over:

- the binding check wants 8 bytes of keyframe, and no valid type expands to 8 (`0x661ae66`);
- there are players for one float, a vector, a quaternion, both, and events — none for two
  (`0x6615950`);
- the blend step's case for a cylinder is empty (`0x661d438`), so a value would never be written.

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
sphere   L(q)    = T(position)            · R(q) · R(orientation) · T(-offset)
loose    L(p, q) = T(position + p)        · R(q) · R(orientation)
```

The driven factor sits to the left of the rest rotation, as [RENDERER.md §5.2](../refs/RENDERER.md#52-composing-a-joint)
gives for every other joint, and the loose channel's own position is added to the rest origin in the
parent's frame.

The engine settles it: the joint transforms are built exactly so (`0x6625980` for sphere,
`0x6625af0` for loose), with the driven rotation multiplied on the left of the rest
(`3DMathEngine +0x20`, a plain row-major `A · B`) and the loose position added to the rest origin.
`getJointMatrix` in [COMPOUND.md](COMPOUND.md) is that code.

The opposite reading was attractive: `0x06` is CFW's seven-float loose-joint *state vector*, and an
object map carries the identical channel type. The `.anm` files had already refuted it
([Corpus](#loose-and-sphere-channels-compose)) — read as a replacement, every head bone collapses
onto its parent's origin. Librelancer composes the same way in `BoneInstance.Update`:
`Origin + Translation` under `Quaternion.Concatenate(OriginalRotation, Rotation)`.

A field the channel omits contributes nothing and the rest's own value stands — which is what
`ZeroPosition` and `IdentityQuaternion` already say by storing no bytes.

### `Root height` elevates the character, not the skeleton

A float beside the object maps, on 1,008 of the 1,010 object maps in the tree — every one in an
`.anm`, neither of the two in a `.cmp`.

It is not an offset applied to the root object map's position; nothing in the skeleton moves by it.
The engine loads it beside the maps (`0x66114a4`) and hands it back through `IAnimation2`
(`0x6615240`) without applying it anywhere itself. Librelancer applies it to the world object —
`Translate.Y = FloorHeight + RootHeight`, with the floor height set by the THN event
`START_FLR_HEIGHT_ANIM` — so it states how far off the floor of a room the character stands. A
renderer with no room has nothing to apply it against.

### A revolute angle is an angle, and one bit cannot say so

`Angle` (`0x01`) carries a revolute joint's angle in radians **or** a prismatic joint's offset in
metres, and nothing in the channel distinguishes them. The two are told apart only by the joint the
map lands on, which is what CFW's `GetChannelType` did by searching the revolute and prismatic lists
by name.

Every one of retail's 414 revolute channels stores its angle wrapped into (-π, π]. A keyframe pair
stepping across the seam — `+3.1329` to `-3.0720` — means a further 4.49° in the same direction, and
interpolating it on a line instead of on a circle runs 355.5° backwards.

**The engine takes the short way round, always.** The float player (`0x661b8a0`) checks the joint it
drives, and for a `Rev` joint moves the far keyframe by one turn whenever the pair is more than half
a turn apart, before interpolating:

```
d = b - a
if d < -π:  b += 2π
elif d > π: b -= 2π          // strict: exactly ±π stays as stored
value = a + (b - a) · t
```

It tests nothing about the channel: storage that leaves the band is wrapped all the same. So a sweep
authored past half a turn between two keyframes plays the other way in game — Discovery's
`SHIPS/RHEINLAND/RH_MINER/rh_miner.cmp` runs a propeller 0 → -179.8° → **-360°**, and the second
step, -180.2°, is played as +179.8°. Prismatic joints get a plain lerp, and never wrap.

`sampleChannel(channel, time, true)` applies the same rule; the flag is the caller's, because
`ChannelType.Angle` carries both kinds and only the joint the map lands on separates them. The
reader still hands back what the file stores.

### Rotations interpolate by normalized lerp

Between two keyframes the engine does not slerp. `3DMathEngine +0x58` (`x86math.dll` `0x6f724d0`)
flips the second quaternion onto the near hemisphere when the dot product is negative, interpolates
the four components linearly, and renormalizes — `Quat.nlerp`, which `sampleChannel` uses. The
result agrees with a slerp at both keyframes and at the midpoint, and runs ahead of it and then
behind between them, visibly only across wide steps.

### Channels loop independently, at their own lengths

`getScriptDuration` is the longest of a script's maps, and it is not the length everything in the
script runs to. Each channel cycles on its own: `SOLAR/MISC/rift_pylon.cmp`'s `Sc_anim active` gives
its eight channels 2, 4, 8 and 16 seconds, and `rh_miner.cmp`'s `sc_rotate drill` pairs a
0.75-second drill with a 10-second arm, which on a shared clock spins once then stands still for
nine seconds.

That is how the engine is built: every map gets its own player with its own clock (`0x661b420`),
advanced by `dt · speed` and wrapped at that player's channel duration. The play flags it knows are
`0x2` loop, `0x4` bounce, and neither — play once and hold on the end; a negative speed plays
backwards. `getChannelTime(channel, time, mode)` maps a script's elapsed time onto one channel the
same way, with `'loop'` wrapping the end itself back to the start as the engine does.

The shape is a minority — 14 of the 186 multi-map scripts in retail `.cmp` mix channel lengths, 24 of
Discovery's 451 — so a consumer that runs everything to the script's duration is right about most
scripts and visibly wrong about the rest.

### Object maps are relative, and carry motion forward

An object map does not place its object; it moves it from where it stood. When a script starts from
the beginning, the object player captures the object's position and orientation as its **base**
(`0x661c9d3`), and every frame writes back `base ∘ sample` — `base.R · p + base.t` and
`base.q ⊗ q` (`0x661bb10`). The first keyframe is applied on top of the start pose, not subtracted
from it. Started part-way in, the base is instead solved so the object does not jump (`0x661c741`).

On a looping object map, each wrap makes the pose at the channel's last keyframe the new base
(`0x661b5b3`). A walk cycle therefore walks on instead of snapping back to where it began: after `n`
whole cycles the object stands at `S(D)ⁿ ∘ S(t mod D)`. Only object maps do this; joint maps have no
base.

`sampleObjectMap(map, time, mode)` returns that relative transform, to compose onto the object's
start pose. A bounce is returned without accumulation — what the engine converges to at small frame
steps; the engine itself realigns to the object's current pose at each turn, so its result drifts
with frame length.

### The range is enforced

A driven joint's `min`/`max` bound what the joint declares, not what its channel contains, and retail
exceeds it ([Corpus](#channels-outside-their-joints-range)). This reader does not clamp — a value is
what the file records — but the engine clamps whenever a revolute or prismatic value is set
(`0x66226e0`): below `min` becomes `min`, above `max` becomes `max`, in that order, and NaN passes.
No other joint type is clamped: a sphere's three limit pairs and a cylinder's two are stored and
never applied. `getJointMatrix` clamps the same two types.

So `br_03_warwick_cityscape.cmp`'s traffic stops at the end of its rail for the 423 units its
channel runs past it.

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
| `AngleChannel`          | interface | A channel driving one float: a revolute angle or a prismatic offset.            |
| `AngleKeyframe`         | interface | `{ key, value }` — one keyframe of an `AngleChannel`.                           |
| `AnimationLibrary`      | type      | Animation scripts of a model.                                                   |
| `AnimationMap`          | type      | `ObjectMap \| JointMap`.                                                        |
| `AnimationScript`       | interface | Named animation, a collection of maps applied to a model at the same time.      |
| `Channel`               | type      | `AngleChannel \| MotionChannel` — keyframe track of one animated property set.  |
| `ChannelSample`         | interface | Channel value sampled between keyframes: `value`, `position`, `orientation`.    |
| `ChannelType`           | enum      | Channel keyframe contents, a bitfield stored in the channel `Header` file.      |
| `getChannelDuration`    | function  | Channel duration in seconds.                                                    |
| `getChannelTime`        | function  | Maps a script's elapsed time onto one channel's clock: loop, once or bounce.    |
| `getChannelType`        | function  | The type bitfield a channel is stored with.                                     |
| `getJointMap`           | function  | Finds joint map animating the named child object.                               |
| `getLibraryDuration`    | function  | Library duration in seconds, the longest of its scripts.                        |
| `getMapDuration`        | function  | Map duration in seconds.                                                        |
| `getObjectMap`          | function  | Finds object map animating the named object.                                    |
| `getScript`             | function  | Finds script by name.                                                           |
| `getScriptDuration`     | function  | Script duration in seconds, the longest of its maps.                            |
| `JointMap`              | interface | Animates a child object relative to its parent, driving the joint between them. |
| `keyframeByteLength`    | function  | Calculates keyframe byte length for the channel type.                           |
| `MotionChannel`         | interface | A channel driving position, orientation or both, with how each is stored.       |
| `MotionKeyframe`        | interface | `{ key, position?, orientation? }` — one keyframe of a `MotionChannel`.         |
| `ObjectMap`             | interface | Animates an object relative to its start pose; names it `object`.               |
| `OrientationEncoding`   | type      | `'quaternion' \| 'identity' \| 'vector' \| 'angle' \| 'short'`.                 |
| `PlaybackMode`          | type      | `'loop' \| 'once' \| 'pingPong'` — the engine's play flags.                     |
| `POSITION_MASK`         | const     | Bits describing keyframe position.                                              |
| `PositionEncoding`      | type      | `'vector' \| 'zero'`.                                                           |
| `QUATERNION_MASK`       | const     | Bits describing keyframe rotation.                                              |
| `readAngleQuaternion`   | function  | Reads quaternion from a quantized rotation axis scaled by angle.                |
| `readAnimationLibrary`  | function  | Reads animation library from file root directory.                               |
| `readChannel`           | function  | Reads animation channel from map directory.                                     |
| `readJointMap`          | function  | Reads joint map from directory.                                                 |
| `readObjectMap`         | function  | Reads object map from directory.                                                |
| `readQuaternion`        | function  | Reads quaternion stored as four floats in W, X, Y, Z order.                     |
| `readScript`            | function  | Reads animation script from directory.                                          |
| `readShortQuaternion`   | function  | Reads quaternion stored as four int16 in W, X, Y, Z order, renormalized.        |
| `readVectorQuaternion`  | function  | Reads quaternion from its quantized vector part, restoring W from unit length.  |
| `sampleChannel`         | function  | Samples channel at time as the engine does; wraps revolute angles on request.   |
| `sampleObjectMap`       | function  | Object map pose relative to the start pose, carried forward across loops.       |
| `validateChannelType`   | function  | Validates channel type bitfield.                                                |
| `writeAngleQuaternion`  | function  | Writes quaternion as a quantized rotation axis scaled by angle.                 |
| `writeAnimationLibrary` | function  | Writes animation library into directory.                                        |
| `writeAnimationMap`     | function  | Writes animation map into directory.                                            |
| `writeChannel`          | function  | Writes animation channel into directory.                                        |
| `writeQuaternion`       | function  | Writes quaternion as four floats in W, X, Y, Z order.                           |
| `writeScript`           | function  | Writes animation script into directory.                                         |
| `writeShortQuaternion`  | function  | Writes quaternion as four int16 in W, X, Y, Z order.                            |
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
median 3.33.

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

All 414 retail revolute channels store angles inside (-π, π]; 150 of them step over π somewhere, in
212 keyframe pairs. Wrapped the engine's way, every one of those pairs still ends inside its joint's
range, so the clamp never meets a wrapped revolute. Prismatic data steps over π in 370 of 543, where
π metres means nothing and the engine does not wrap.

`SOLAR/MISC/gyro_05x.cmp` in Discovery is the clean demonstration: five keyframes describing one
revolution whose linear sum is exactly zero and whose wrapped sum is exactly 2π.

### Channels outside their joint's range

278 keyframes in 22 prismatic channels sit more than 1e-4 outside their own joint's declared range,
the worst by 423.25 units against `[0, 3302.125]`: `BASES/BRETONIA/br_03_warwick_cityscape.cmp`,
whose `Sc_loop` runs the city traffic past the end of its rail. The engine clamps them all. Counted
strictly, as the clamp compares, it is 295 keyframes in 38 channels; the other 17 are a float's last
bit, five of them on revolute doors whose open angle is stored a hair past `max`. No revolute channel
exceeds its range by more.

### Where the engine reads less than the format allows

- Every one of the 1,010 object maps carries both position and rotation, which the engine requires
  to bind one.
- Every time-marked channel starts at zero. The engine's lookup interpolates from index −1 before a
  first marker later than zero; retail never asks it to.

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
