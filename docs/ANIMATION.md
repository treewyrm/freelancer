# Animation

Freelancer's keyframe animation, called **scripts**. Rigid compound models (`.cmp`) embed theirs in
the same UTF tree as the model; deformable models keep theirs in a standalone `.anm`. Both use
exactly the same structures, so one module reads and writes either.

A script is a named bundle of **maps**, each binding one animated object to one **channel** of
keyframes. Interpolation between keyframes is always linear. Export names are in
[API.md](API.md#animation).

## Architecture

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
`getScript` is case-insensitive like every other name lookup here.

**The trailing number on `Object map 0` / `Joint map 4` is decorative.** Freelancer matches on the
name prefix alone, and retail `.anm` files have gaps in the sequence; the writer renumbers maps
sequentially within each kind rather than preserving the original numbers.

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
| `revolute`  | `value` — angle in radians, between the joint's `min` and `max`                                        |
| `prismatic` | `value` — offset along the joint axis                                                                  |
| `sphere`    | `rotation`                                                                                             |
| `loose`     | `position`, `rotation`, or both                                                                        |
| `cylinder`  | unimplementable — see [below](#why-cylinder-joints-cannot-be-animated)                                 |

`Root height` is an elevation added on top of the object map position. Only deformable models use it,
and in retail it appears exactly once per object map.

---

## Channels

### `Header`

Twelve bytes, always.

| Offset | Type      | Field    | Description                                               |
| ------ | --------- | -------- | ---------------------------------------------------------- |
| `0x00` | `uint32`  | count    | Number of keyframes                                       |
| `0x04` | `float32` | interval | Keyframe spacing in seconds; negative means per-key times |
| `0x08` | `uint32`  | type     | Keyframe contents bitfield                                |

When `interval` is negative, every keyframe in `Frames` is prefixed with its own `float32` time marker
in seconds. When it is zero or positive the markers are omitted and keyframe *n* occurs at
`n * interval`. Retail uses both: `.cmp` door and radar animations mostly carry explicit times, while
resampled `.anm` tracks run at a fixed 1/30 s.

### `ChannelType`

A byte-wide bitfield describing what each keyframe holds. **At most one position bit and at most one
quaternion bit may be set, and `Angle` never combines with anything else** — `validateChannelType`
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

`ZeroPosition` and `IdentityQuaternion` declare that a channel drives a property without storing any
data for it. The reader materialises the constant so consumers never special-case them; the writer
emits nothing, because the type says so.

### `Frames`

Keyframes are packed back to back with no padding, each field in this order:

```
[ time marker ][ angle ][ position ][ quaternion ]
    4 bytes      4 bytes   12 bytes    16 / 6 / 0 bytes
   if interval<0  if 0x01    if 0x02    per quaternion flag
```

`keyframeByteLength(type, interval)` returns the stride.

### Quantized quaternions

Both compressed forms store three `int16` fractions of `0x7fff` and drop the sign of W. That loss is
free: `q` and `-q` are the same rotation, so the encoders fold negative-W quaternions into the
positive hemisphere first.

**`VectorQuaternion` (`0x40`)** stores the quaternion vector part verbatim and restores W from unit
length:

```
w = sqrt(1 - (x² + y² + z²))
```

The stored length is `sin(θ/2)`, so precision is finest near identity and the representable range tops
out at a half turn.

**`AngleQuaternion` (`0x80`)** stores the unit rotation axis scaled by `θ/π`, which spreads the whole
positive hemisphere linearly over the unit range — zero is identity, one is a half turn:

```
s = sin(π · |v| / 2)         // = sin(θ/2), the quaternion vector magnitude
q = ( v · s / |v|, sqrt(1 - s²) )
```

> **Divergence from MAXLancer.** [MAXLancer](https://github.com/treewyrm/MAXLancer/blob/master/scripts/Animation.ms)
> decodes `0x40` with a half-angle function and labels `0x80` a "harmonic mean". This library follows
> [Librelancer](https://github.com/Librelancer/Librelancer/tree/main/src/LibreLancer/Utf/Anm)
> instead, which treats `0x40` as a plain W restore and `0x80` as the angle-scaled axis above.

### Why the low bits are what they are

The whole low nibble comes straight from Conquest: Frontier Wars, where the type describes a joint's
**state vector**:

| Bit    | CFW name               | Floats | Joint it serves     |
| ------ | ---------------------- | ------ | ------------------- |
| `0x01` | `PersistDT_FLOAT`      | 1      | revolute, prismatic |
| `0x02` | `PersistDT_VECTOR`     | 3      | translational       |
| `0x04` | `PersistDT_QUATERNION` | 4      | spherical           |
| `0x08` | `PersistDT_EVENT`      | —      | event stream        |

`JointInfo::get_num_state_floats` returns exactly those counts, and `0x06` — the combination that does
occur in retail Freelancer — is the 7 floats a **loose** joint needs, a vector plus a quaternion. The
channel header itself is unchanged too: `PersistChannelHeader` is `frames`, `capture_rate`, `type`,
and its comment states the rule this library calls a negative interval — *"if the capture rate is less
than 0.0 then the data is not periodic … each frame consists of a time value"*.

The upper nibble (`0x10`–`0x80`) has no CFW counterpart. Those four are Freelancer's own additions,
all of them compression: two implied-constant forms and two quaternion quantizations.

### The event bit (`0x08`)

`PersistDT_EVENT` is an **event stream** rather than joint data. CFW defines it in
`Libs/Include/PersistChannel.h` alongside the other three and pairs it with an `Event map` directory —
a third map stem beside `Object map` and `Joint map` (`Libs/Include/persistanim.h`). Freelancer
authored none, so its payload layout is unknown here and `validateChannelType` rejects it.

MAXLancer repurposes the bit to write a pair of floats for cylinder joints. That is MAXLancer's own
convention and not what the bit means.

### Why cylinder joints cannot be animated

A cylinder takes **2 floats** — `get_num_state_floats` returns 2 for `JT_CYLINDRICAL` — and no
combination of the bits above comes to 2. The format has nowhere to put them. **It is not a decoder
this library is missing.**

CFW never animated one either. Its exporter has no cylinder branch anywhere: `GetChannelType`
(`Libs/Src/Tools/Exporters/Common/CMP.CPP`) dispatches loose, spherical, translational and event
straight off the type bits and then falls back to searching the prismatic and revolute lists by name —
there is no `cyl_list` in the exporter at all — and `IsConstantChannel`'s `frame_size` switch has
cases for every joint kind except cylindrical, which lands in *"Error: unknown channel type"*.

Worth noting for anyone tempted to add it: a cylinder channel would have to be `PersistDT_FLOAT`
carrying two floats, so its stride could not be derived from the channel type alone — it would need
the joint type, reached through the map's parent and child names. That is exactly what
`GetChannelType` does to tell a prismatic channel from a revolute one, where it happens not to matter
because both are one float.

---

## Corpus

| | Count |
| --- | --- |
| Scripts across the retail `DATA` tree | 3,117 |
| Channels | 143,679 |
| `Joint map` stems | 142,669 |
| `Object map` stems | 1,010 |
| Third map stems | **0** |
| Channels setting `0x08` | **0** |

The stride always divides the `Frames` file exactly — there are no trailing bytes anywhere.

**Ten channel type combinations occur**, and `corpus.test.ts` asserts that set exactly:

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

Every one of the 143,679 channels re-serializes byte for byte, with one documented exception: **55
keyframes across 20 `.anm` channels** store an angle-scaled axis slightly longer than one unit —
outside the range the encoding can represent. Re-encoding clamps them, so they come back one `int16`
LSB off; the resulting rotation differs by at most 0.004°. The corpus test allows exactly these and
asserts the decoded quaternions still match.

---

## TODO

### Does Freelancer's loader accept an event channel?

`0x08` is `PersistDT_EVENT`, inherited from CFW along with the rest of the low nibble and paired there
with an `Event map` directory. Freelancer authored none, so its payload layout is unknown here.

What retail cannot say is whether the *engine* still decodes it. The code descends from the same
source, and an unused branch is cheaper to leave in than to remove. Authoring a script that sets
`0x08` and loading the model answers it three ways: the game refuses the file, or it loads and ignores
the channel, or it loads and something fires. Only the third is worth chasing, and it would give the
payload layout the corpus cannot.

Note that MAXLancer repurposes the bit to write a pair of floats for cylinder joints. Anything
observed has to be checked against a file this library wrote, not one MAXLancer did, or the two
conventions get confused.

Cylinder joints themselves are **not** on this list — see
[Why cylinder joints cannot be animated](#why-cylinder-joints-cannot-be-animated). That question is
closed, not pending.
