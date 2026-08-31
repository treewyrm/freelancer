# Alchemy

The `.ale` particle effect format. Alchemy describes visual effects as two libraries: a **node
library** of reusable typed parameter blocks, and an **effect library** composing those nodes into
hierarchical effect trees. Export names are in [API.md](API.md#alchemy).

Both libraries live in a `.ale` UTF container, each in a directory of its own name —
`AlchemyNodeLibrary/AlchemyNodeLibrary` and `ALEffectLib/ALEffectLib` — and every retail `.ale` holds
exactly those two and nothing else.

## Architecture

```
EffectLibrary          NodeLibrary
  └─ Effect[]            └─ Node[]
       └─ NodeInstance[]      └─ Property[]
            (references Node by CRC)
```

An **effect** is a tree of `NodeInstance` records. Each instance references a `Node` in the node
library by its name CRC; the node library stores the actual typed parameters.

---

## Primitives

| Encoding | Layout                                                                        |
| -------- | ----------------------------------------------------------------------------- |
| Integer  | signed 32-bit                                                                 |
| Float    | 32-bit IEEE                                                                   |
| String   | `uint16` length **including the NUL**, then the bytes, padded to even length |
| Blending | a source/target `BlendingMode` pair                                           |

### The empty string has two encodings

Indistinguishable once decoded:

| Bytes             | Meaning                                           |
| ----------------- | ------------------------------------------------- |
| `01 00` `00` `00` | Length 1, a lone NUL, plus the alignment pad byte |
| `00 00`           | Length 0, no payload at all                       |

`readString` accepts either; `writeString` emits the first, which is what all but two retail files
use.

### `BlendingMode`

`D3DBLEND` verbatim: `Zero` is 1 against `D3DBLEND_ZERO` = 1, and every entry lines up from there.
`None` = 0 is **not** a D3D value — that enum starts at 1 — so zero stands for the property being
unset. The values are `None`, `Zero`, `One`, `SourceColor`, `InverseSourceColor`, `SourceAlpha`,
`InverseSourceAlpha`, `DestinationAlpha`, `InverseDestinationAlpha`, `DestinationColor`,
`InverseDestinationColor`, `SourceAlphaSAT`, `BothSourceAlpha`, `BothInverseSourceAlpha`.

The last two are the D3D8 modes that set the destination factor implicitly, and Direct3D accepts them
only as a *source*. One retail file writes one as a **target** — an authoring slip rather than a mode
— but the byte is real and round-trips, so it is named rather than left as a number matching nothing.

---

## Node properties

### `PropertyType`

```
None        = 0x000   Boolean     = 0x001
Integer     = 0x002   Float       = 0x003
String      = 0x103   Blending    = 0x104
Transform   = 0x105
AnimatedFloat = 0x200  AnimatedColor = 0x201  AnimatedCurve = 0x202
```

Each property is prefixed by a `uint16` type field and an `int32` name CRC. **Boolean values have no
payload — the value is packed into bit 15 (`0x8000`) of the type field.** A property list is
terminated by a `uint16` of zero.

Known names are resolved to their string form via a lookup table; unknown ones are preserved as hex
strings (e.g. `"0xdeadbeef"`), so an unrecognized property survives a round trip.

```ts
type Property = { name: PropertyName } & (
  | { type: PropertyType.Boolean; value: boolean }
  | { type: PropertyType.Integer; value: number }
  | { type: PropertyType.Float; value: number }
  | { type: PropertyType.String; value: string }
  | ({ type: PropertyType.Blending } & Blending)
  | ({ type: PropertyType.Transform } & Transform)
  | ({ type: PropertyType.AnimatedFloat } & AnimatedFloat)
  | ({ type: PropertyType.AnimatedColor } & AnimatedColor)
  | ({ type: PropertyType.AnimatedCurve } & AnimatedCurve)
)
```

Property names are grouped by node role:

| Prefix                                                                            | Role                               |
| --------------------------------------------------------------------------------- | ---------------------------------- |
| `Node_`                                                                           | Common (name, lifespan, transform) |
| `Emitter_`                                                                        | Shared emitter parameters          |
| `CubeEmitter_`, `SphereEmitter_`, `ConeEmitter_`                                  | Emitter geometry                   |
| `BasicApp_`                                                                       | Basic particle appearance          |
| `OrientedApp_`, `ParticleApp_`, `MeshApp_`, `RectApp_`, `BeamApp_`                | Appearance variants                |
| `RadialField_`, `GravityField_`, `CollideField_`, `TurbulenceField_`, `AirField_` | Force fields                       |

## Node library

```ts
interface Node {
  type: NodeType // e.g. "FxCubeEmitter"
  properties: Property[]
}

interface NodeLibrary {
  version: number // float32
  nodes: Node[]
}
```

Binary layout: `float32` version, `uint32` count, then each node as a type string followed by
properties terminated by `uint16(0)`.

> **Every node must have a `Node_Name` string property.** Instances reference nodes by the CRC of this
> name, so a node without it cannot be addressed by any effect. A name is always present, but not
> necessarily non-empty.

| Category   | Node types                                                                                                                                                            |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base       | `FxNode`                                                                                                                                                              |
| Emitters   | `FxCubeEmitter`, `FxSphereEmitter`, `FxConeEmitter`                                                                                                                   |
| Appearance | `FxBasicAppearance`, `FLDustAppearance`, `FxOrientedAppearance`, `FxParticleAppearance`, `FxMeshAppearance`, `FxRectAppearance`, `FxPerpAppearance`, `FLBeamAppearance` |
| Fields     | `FxRadialField`, `FxCollideField`, `FxTurbulenceField`, `FxAirField`, `FxGravityField`, `FLDustField`, `FLBeamField`                                                   |

### Name hashing is case-sensitive

**Alchemy is the one place in the format where Freelancer hashes with the character case left alone**,
which is why `getNodeByCRC` passes `caseSensitive` to `getResourceId`. It is not a stylistic detail:
folding case the way every other CRC lookup in this library does strands roughly half the instance
references in the game.

**Effect names too, and that is checkable from outside the container.** The eight `DATA/FX/*/*_ale.ini`
files carry a `[VisEffect]` entry per effect, holding the `.ale` path and an `effect_crc` — a signed
`int32` that is the *only* link into the file. There is no name field beside it and no fallback if it
matches nothing, so the entry's own `nickname` takes no part in the lookup. Node and property names
never leave the file, so their hashing could have been one loader's convention; `effect_crc` is Digital
Anvil's build tool writing the same hash into a table the game parses separately, which makes
case-sensitivity **a property of the format** rather than an implementation detail. Reading those INIs
is the consumer's, not this module's, but the measurement pins the rule from the other side — see
[Corpus](#hashing).

---

## Animation types

### `EaseType`

Controls interpolation between keyframes.

| Value     | Behaviour                              |
| --------- | -------------------------------------- |
| `Step`    | No interpolation — hold previous value |
| `Linear`  | Linear interpolation                   |
| `QuadIn`  | Ease in (quadratic)                    |
| `QuadOut` | Ease out (quadratic)                   |
| `Smooth`  | Smooth step                            |
| `Auto`    | QuadIn if `a < b`, QuadOut otherwise   |

**This list may be incomplete** — a few retail keyframes hold a byte outside it. See
[Easing outside the enum](#easing-outside-the-enum).

### `WrapFlags`

A bitfield controlling out-of-range behaviour for looped animations, with independent before and after
flags:

| Flag                               | Effect                        |
| ---------------------------------- | ----------------------------- |
| `BeforeRepeat` / `AfterRepeat`     | Wrap via `fract`              |
| `BeforeMirror` / `AfterMirror`     | Wrap via `pingPong`           |
| `BeforeClamp` / `AfterClamp`       | Clamp to range                |
| `BeforeContinue` / `AfterContinue` | Extrapolate with accumulation |

### Containers

- **`FloatKeyframe`** — `{ key, value }`; **`VectorKeyframe`** — `{ key, x, y, z }`
- **`EaseAnimation<T>`** — `{ easing: EaseType, keyframes: T[] }`
- **`LoopAnimation<T>`** — `{ default: number, flags: WrapFlags, keyframes: T[] }`

| Type            | Structure                                                                                                                                                                                                                        |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AnimatedFloat` | Nested two-level ease animation: outer keyframes index into inner `EaseAnimation<FloatKeyframe>`                                                                                                                                  |
| `AnimatedColor` | The same, with `VectorKeyframe` (RGB) inner keyframes                                                                                                                                                                            |
| `AnimatedCurve` | Outer ease animation; inner keyframes are `LoopAnimation<VectorKeyframe>` evaluated as Hermite splines. `x` = position, `y` = in-tangent, `z` = out-tangent — a span reads `z` off the keyframe it leaves and `y` off the one it arrives at |

### `Transform`

```ts
interface Transform {
  flags: TransformFlags
  position?: TransformPoint // x, y, z as AnimatedCurve
  rotation?: TransformPoint
  scale?: TransformPoint
}
```

**Data is only present when `TransformFlags.Enable` (bit 31) is set**, and the payload is then nine
curves. `TransformFlags.Default` combines several unknown low bits as the standard enabled state — see
[TODO](#transformflags--what-the-low-bits-do).

---

## Evaluation

Every animated property is a function of two axes: **`p`** (sparam), an external control value the
engine supplies to blend between animation states — an engine thruster between idle and full throttle,
say — and **`t`**, the normalized particle lifetime. The outer animation is keyed on `p`, the inner one
on `t`.

Keyframe lookup itself comes from the math module: `at(keyframes, key)` returns `{ start, end, span }`,
where `span` is the normalized position between the two keyframes.

### Degenerate data

Reading and writing were settled against retail long before evaluation was, and **the data the readers
accept is far looser than an evaluator naturally assumes**. Three shapes occur often enough to matter,
and none of them may produce `NaN` or throw — the game loads all of these files:

| Shape                          | Result                              |
| ------------------------------ | ----------------------------------- |
| Looped list spanning no range  | The single value                    |
| Easing byte outside `EaseType` | Linear — **provisional**, see below |
| Empty keyframe list            | `default`, or zero                  |

A list of one keyframe, or of several sharing a key, **spans no range**, and `limit` remapping the
sampling key through it is a division by zero. `limit` now returns the point itself before remapping.

An **empty looped list** falls back to its `default` field. An eased list has no such field, so an
empty one contributes **zero**.

One case is left as it stands and marked `TODO` in the source: `limit` folds a key landing exactly on
the end of a curve **carrying no wrap flags** back to the start, so the last keyframe of such a curve
is never sampled. That is right for a curve meant to loop and wrong for one meant to hold, and nothing
in the data says which was intended.

### Tangents scale with the interval

A `VectorKeyframe`'s tangents are stored **per unit of key**, and the standard Hermite basis is over a
**normalized** parameter, so it wants them per unit of span. **The two convert by the width of the
interval being crossed**, and `hermiteAt` scales by `delta = end.key - start.key`.

Retail key axes are almost never one unit wide, so dropping the conversion multiplies every tangent by
`1/delta` — on a typical 0.03-wide interval, an overshoot of thirty times. What keeps the mistake
invisible is that almost every retail keyframe is flat, and a flat Hermite is the same smooth step
under either reading.

The degenerate lists need no guard against the multiplication: `at` skips zero-length spans, and a
single keyframe comes back with `start === end`, so the interval is zero exactly where `span` is 0 or
1 — the endpoints, where `hermite` returns the keyframe value and never reads a tangent.

### Easing outside the enum

A handful of inner keyframe lists carry an easing byte the enum does not define. It is tempting to
write them all off as debris; the data does not support that. **Easing only does anything to a list of
more than one keyframe** — with a single keyframe there is nothing to interpolate between and the byte
is never read. That line splits them cleanly, and [Corpus](#easing-bytes-outside-easetype) has the
nine.

Seven are junk in one unplayed effect. **The other two are a different matter, and are unresolved**: a
6, one past `Auto`, precisely where a seventh enum member would sit, on the alpha envelope of the
motion dust in both files that use `FLDustAppearance`. `ease` currently treats 6 as `Linear` — a
placeholder chosen so evaluation cannot return `undefined`, **not** a reading of the data. The raw byte
is preserved on read and written back unchanged. See [TODO](#easing-type-6).

---

## Effect library

```ts
interface NodeInstance {
  crc: number      // CRC of the referenced node name, case-sensitive; meaningless when flags is set
  flags: number    // non-zero marks a container that references no node
  sort: number     // serialization order
  id?: number      // on-disk entry identifier
  children: NodeInstance[]
  targets: NodeInstance[]
}

interface Effect {
  name: string
  unknown1?: number // float32, version > 1 only
  unknown2?: number
  unknown3?: number
  unknown4?: number
  children: NodeInstance[]
}

interface EffectLibrary {
  version: number // float32, controls Effect serialization variant
  effects: Effect[]
}
```

Each effect is serialized as:

1. Name string
2. Four `float32` unknowns (version > 1 only)
3. `int32` entry count + flat `Entry[]` array
4. `int32` pair count + flat `Pair[]` array

The flat `Entry` structure `{ flags, crc, parentId, childId }` is reassembled into the tree using
`assemble`/`flatten` from `hierarchy.ts`. `parentId >= WorldId (0x8000)` means the instance is a root
child.

**Instances form a tree via `children`; cross-tree links** — an appearance bound to an emitter —
**are `targets`, serialized as the separate flat `Pair` records.** Walking only `children` finds the
nodes and none of the pairings.

### The `flags` field marks a container, not the CRC

An instance whose `flags` is non-zero references no node, and **its `crc` carries nothing — it may hold
any value at all.** Retail happens to write `0xee223b51` in every one of them, which is residue from
Digital Anvil's in-house authoring tool rather than a value the format defines. `DefaultId` names that
residue so it can be recognized; **it is not the mechanism, and a reader that tests it instead of the
flag is right about retail by coincidence.**

The corpus cannot separate the two rules, and that is worth stating rather than glossing — see
[Corpus](#the-container-instance). Because retail never writes any other flag value, whether the field
is a bitfield or an enum is untested: read non-zero as "no node reference" and infer nothing further.

The constant is written `0xee223b51 | 0` because instance CRCs are read with `readInt32`. As an
unsigned literal it never compared equal to anything.

### Entry identifiers are not derivable

`id` holds the `childId` the entry was read with. It exists because **retail identifiers are sparse,
unordered handles the authoring tool left behind rather than a numbering the tree implies** —
`br_mine01_blast50` stores its five entries as `3, 6, 7, 1, 2`. Regenerating them from a traversal, as
the writer originally did, changed the bytes of most files for no reason. They are preserved on read
and reused on write; an instance built by hand and given no `id` is numbered around whatever ids are
already taken.

### Pair ordering is not preserved

The order of the flat `Pair` records is the one thing that does not survive a round trip. The writer
emits them in traversal order; the links themselves are always identical, so re-reading the output
reproduces the model exactly and writing it again is a fixed point.

Retail order follows no rule the corpus can recover. Sorting by source id, by target id, by entry order
and by traversal order were each checked, and the best explained three quarters of the effects — some
files store their pairs ascending by source, others descending. **It is authoring residue.**

---

## Corpus

`corpus.test.ts` reads every `.ale` in the game.

| | Count |
| --- | --- |
| Files | 596 |
| Nodes | 5,575 |
| Effects | 1,213 |
| Node instances | 6,648 |
| — referencing a node | 5,505 |
| — containers (`flags` non-zero) | 1,143 |
| Properties carrying a blend pair | 2,658 |
| `AnimatedCurve` properties | 26,617 |
| Transform properties | 5,590 |

Nothing throws, and every instance CRC resolves against the library in its own file. Retail uses
seventeen of the node types; `FxNode` and `FxOrientedAppearance` are declared but never appear.

Instanced node types, and the split by category, are in
[RENDERER.md §9.2](RENDERER.md#92-what-actually-draws).

### Hashing

| Lookup                     | Resolves |
| -------------------------- | -------- |
| Case-sensitive (this library) | **all 5,505 instance references** |
| Case-folded                   | 2,814 — 2,691 stranded |

2,660 of the 5,429 distinct node names are mixed case, which is why folding costs so much. Property
names are hashed the same way.

From the other side, `effect_crc` in the eight `*_ale.ini` files is `getResourceId(name, true)` on all
**1,218** entries, 60 of which are mixed case and every one of those matching case-sensitive and none
case-folded. Folding resolves a strict subset of 1,150 and gains nothing.

Every one of the 5,575 nodes carries `Node_Name`, and names are unique within a library. Exactly one —
an `FxConeEmitter` in `FX/EXPLOSIONS/gf_explosion_br_large01.ale` — has it set to the empty string,
which hashes to zero; no instance references it.

### Blend pairs

Nine distinct pairs occur, and one of them is 2,489 of the 2,658: `SourceAlpha`/`One`, plain additive
blending. `SourceAlpha`/`InverseSourceAlpha` accounts for 161 more, and the remaining seven pairs for
one or two each. `FX/EXPLOSIONS/gf_small_damage.ale`'s `gf_small_damage_smoke2.app` writes
`BothSourceAlpha` (13) as a **target**.

### The container instance

Across the 6,648 instances, `flags` takes only the values 0 (5,505 times) and 1 (1,143 times), every
flagged instance carries `0xee223b51`, and no unflagged one does. **The two conditions coincide
perfectly**, so the flag is the mechanism on grounds outside the data.

The container occurs 1,143 times, always at root, never as either end of a link, and its direct
children always have `flags` 0; 1,143 of the 1,213 effects have exactly one and the remaining 70 have
none. No name in any library hashes to `0xee223b51`, so nothing is shadowed by it either way.

### Effect library versions

Retail ships two: **1.1 in 501 files and 1 in 95.** Only 1.1 carries the four `unknown` floats.
`unknown4` is never negative anywhere and ranges up to 56, while the other three are unconstrained in
sign — consistent with a centre and radius bounding the effect, though nothing confirms it. On a
version 1 library they are absent and read back as zero.

### Degenerate animation data

The **27,662 looped lists** behind the 26,617 `AnimatedCurve` properties break down as 14,127 empty,
11,791 holding a single keyframe, and 1,744 holding more — 40 of which put every keyframe on the same
key. Before `limit` was fixed, the division by zero put `NaN` into 10,831 of the 26,617 curve
properties and 1,155 of the 1,289 enabled transforms; wrap flags that clamp masked it, which is the
only reason the rest came out finite.

Seven retail properties hold an **empty eased list**: three where it is the only list
(`BasicApp_Rotate` on the rain appearances, so the property is zero throughout), and four in
`no_engine.app` where it sits at outer key 0 beside a populated list at key 1, which then ramps up out
of zero as sparam rises.

**Evaluating the corpus is a separate check from reading it, and a stricter one**: every animated
property in the game is sampled across a grid of sparam and time values, and every component of every
result must be a finite number. Getting there took three fixes, all of them in evaluation rather than
in the readers.

### Tangent intervals

Across the 596 files, **9,322 of 9,324 adjacent-keyframe intervals are something other than 1** — key
axes are not normalized to a lifetime, and one rotation curve in `FX/SPACE/gf_neutronstar.ale` is keyed
over 0–360.

What keeps a missing interval scale invisible is that **only 562 of 25,081 keyframes carry a non-zero
tangent at all.** The disagreement is confined to **142 lists across 54 files**, concentrated in
`Node_Transform` position and rotation (96 lists) and `Emitter_Frequency` (28).

### Easing bytes outside `EaseType`

Nine inner keyframe lists in the whole corpus:

| File                           | Node                  | Property            | Value              | Keyframes | Observable |
| ------------------------------ | --------------------- | ------------------- | ------------------ | --------- | ---------- |
| `FX/WEAPONS/gf_bolt01.ale`     | `gf_bolt01.app`       | `BasicApp_Color`    | 120 (`0b01111000`) | 1         | no         |
| `FX/WEAPONS/gf_bolt01.ale`     | `gf_bolt01.app`       | `BasicApp_Alpha`    | 120                | 1         | no         |
| `FX/WEAPONS/gf_bolt01.ale`     | `gf_bolt01.app`       | `RectApp_Scale`     | 120                | 1         | no         |
| `FX/WEAPONS/gf_bolt01.ale`     | `gf_bolt01.app`       | `RectApp_Length`    | 8 (`0b00001000`)   | 1         | no         |
| `FX/WEAPONS/gf_bolt01.ale`     | `gf_bolt01.app`       | `RectApp_Width`     | 136 (`0b10001000`) | 1         | no         |
| `FX/WEAPONS/gf_bolt01.ale`     | `gf_bolt01.app`       | `BasicApp_TexFrame` | 8                  | 1         | no         |
| `FX/WEAPONS/gf_bolt01.ale`     | `gf_bolt01_Cone.emt`  | `Emitter_LODCurve`  | 248 (`0b11111000`) | 1         | no         |
| `FX/SPACE/dust.ale`            | `gf_red_dustapp.app`  | `BasicApp_Alpha`    | **6**              | **4**     | **yes**    |
| `FX/SPACE/motionblur_dust.ale` | `motionblur_dust.app` | `BasicApp_Alpha`    | **6**              | **4**     | **yes**    |

**The seven in `gf_bolt01.ale` are junk.** Every one has bit 3 set and its low three bits clear
(`0x08`, `0x78`, `0x88`, `0xF8`) — a shape no six-value enum produces. Every one sits on a list of a
single keyframe, so nothing reads it. They are confined to one file, and that file is registered in
`FX/WEAPONS/weapons_ale.ini` but named by no `[Effect]` entry in `FX/effects.ini`, unlike weapon
effects the game actually plays. An unplayed effect is exactly where an authoring tool leaves
uninitialized bytes behind.

**Easing 6 and `FLDustAppearance` imply one another across the entire corpus.** `FLDustAppearance` is
one of the four node types Digital Anvil added on top of stock Alchemy (with `FLDustField`,
`FLBeamAppearance` and `FLBeamField`). It has exactly two instances in the game, and both use easing 6;
no other node type uses 6 anywhere in 5,575 nodes. Every other dust effect — `icedust`, `leedsdust`,
`snowdust`, `asteroiddust`, `golddust`, the `attractdust` family and the rest — is the same effect
built from stock `FxBasicAppearance` with easing **4** on the same four-keyframe alpha shape.

The comparison is almost controlled. Set `dust.ale` beside `icedust.ale`:

|                              | `dust` / `motionblur_dust`                                      | `icedust` / `leedsdust` / … |
| ---------------------------- | --------------------------------------------------------------- | --------------------------- |
| Appearance node              | `FLDustAppearance`                                              | `FxBasicAppearance`         |
| Alpha easing                 | **6**                                                           | 4 (`Smooth`)                |
| Emitter                      | `FxSphereEmitter`, frequency 5000, `InitLifeSpan` 10, radius 60 | identical                   |
| Field                        | `FLDustField`, radius 60.1                                      | identical                   |
| Effect type in `effects.ini` | `EFT_MOTION_DUST`                                               | `EFT_MISC_DUST`             |

Same emitter, same field, same particle lifespan, same curve shape. The appearance node type and the
easing byte are the only things that differ — and `FLDustAppearance` declares no property
`FxBasicAppearance` lacks, so whatever it does differently lives in Freelancer's code, not in the data.

Both curves are a fade in, a hold, and a fade out, with the outer easing set to `Smooth`:

| List                        | Keyframes (`key` → `value`)                    |
| --------------------------- | ---------------------------------------------- |
| `dust.ale` alpha            | 0 → 0, 0.25 → 0.35, 0.5 → 0.35, 1 → 0          |
| `motionblur_dust.ale` alpha | 0 → 0, 0.2693 → 0.5382, 0.5193 → 0.5382, 1 → 0 |

### `TransformFlags` never varies

A sweep over all 5,590 transform properties turns up exactly **two** words:

| Word         | Bits set        | Count | Payload     |
| ------------ | --------------- | ----- | ----------- |
| `0x00050304` | 2, 8, 9, 16, 18 | 4,301 | none        |
| `0x80050304` | the same, plus 31 | 1,289 | nine curves |

They fall on `Node_Transform` (5,575 — one per node), the unnamed `0x0BA0B3BB` on `FLBeamAppearance`
(11, never enabled) and `MeshApp_ParticleTransform` (4, one enabled).

Two things follow. **The low bits cannot be selecting which channels are present**: the payload is nine
curves whenever bit 31 is set, and the whole library round-trips byte for byte, which a size-varying
field could not do. **They are not selecting which channels are *used* either**, at least not in any
way the data records — the word is constant while the set of channels that actually carry keyframes
varies seven ways beneath it:

| Populated channels | Enabled transforms |
| ------------------ | ------------------ |
| rotation only      | 595                |
| position, rotation | 471                |
| position only      | 207                |
| scale only         | 7                  |
| all three          | 4                  |
| rotation, scale    | 3                  |
| position, scale    | 2                  |

### The five unnamed property hashes

Five property CRCs match no name in the published Alchemy list, and all five sit on the two node types
Digital Anvil added themselves. Their types are recovered from the stream, so they read and write
correctly — only the labels are missing.

| Hash         | Type            | Node type          | Observed values |
| ------------ | --------------- | ------------------ | --------------- |
| `0x1C65B7B9` | `Boolean`       | `FLBeamAppearance` | always `false`  |
| `0x03503B61` | `Boolean`       | `FLBeamAppearance` | always `true`   |
| `0x0ABE0402` | `Boolean`       | `FLBeamAppearance` | always `false`  |
| `0x0BA0B3BB` | `Transform`     | `FLBeamAppearance` | —               |
| `0xE63AA248` | `AnimatedCurve` | `FLDustField`      | —               |

`BeamApp_LineAppearance`, which the name list does carry, never appears in retail under its own hash —
`getResourceId('BeamApp_LineAppearance', true)` is `0xED1AC1D7`, which is none of the five. That rules
out a hash collision, not the property.

### Round-trip

Everything is byte for byte, and writing is a fixed point in every file — re-reading the output
reproduces the model exactly and writing it again is identical — with two exceptions, both authoring
residue that carries no meaning:

| What                             | Files affected | Detail                                                                                                                                  |
| -------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Empty-string encoding            | 2 of 596       | `FX/WEAPONS/flashgrenade.ale` and `FX/MISC/rtc_vanceimpact.ale` come back two bytes longer; both hold one string that was authored blank |
| Order of the flat `Pair` records | 146 of 596     | The links themselves are identical                                                                                                      |

---

## TODO

Open questions this module cannot settle from the data. Each is an experiment in the running game, not
a gap in the reader: everything below reads, writes and round-trips byte for byte, so a one-byte edit
is a controlled test. Items a `todo` test reports on every run are marked.

### `TransformFlags` — what the low bits do

Only bit 31 is understood: it gates whether any data follows. The rest are named `Unknown1..5` and
combined as `Default`. Retail never varies them — [two words across 5,590
transforms](#transformflags-never-varies) — so what is left for the bits is *how* the curves are
applied: space (node-local against emitter or world), rotation order or units, whether the transform
tracks the emitter after spawn. None of which the file distinguishes, because every file makes the same
choice.

That leaves flipping them. `FX/EXPLOSIONS/gf_explosion_debris_trail01.ale` is the best subject: three
`FxConeEmitter` nodes with position, rotation and scale all animated, on an effect that plays whenever
anything blows up. `FX/MISC/gf_contrail01.ale` (rotation and scale) and `FX/MISC/gravity_well.ale`
(scale alone) isolate fewer channels.

1. Clear one low bit at a time on `Node_Transform` and fly. A bit that changes nothing on a node using
   all three channels is not a channel or space selector.
2. If the effect stops rendering or the node snaps to the origin, the bit is a required enable of some
   kind, and the pairing tells which channel or which space.
3. Setting a bit retail never sets (anything outside `0x80050304`) tests whether the engine masks the
   word or validates it.

Until then `Default` stays a single opaque constant rather than five separately meaningful names, and
`transformAt` ignores the low bits entirely.

### Easing type 6

Two `FLDustAppearance` alpha envelopes use it, and easing 6 and `FLDustAppearance` imply one another
across the whole corpus. `ease` treats it as `Linear` — a placeholder, not a reading.

**The premise of the conjecture has since been observed, and the conclusion has not.**
`FLDustAppearance` really is keyed on camera motion: its sprites are transparent while the camera holds
still and gain opacity as the camera translates or rotates. So the alpha of these two nodes is driven
by something that is not particle age, exactly as conjectured — and the four keyframes, a ramp up and a
ramp down, may be two sequences squashed into one list. One thing further constrains it: the alpha
property has a **single** outer list, at `p = 0`, so whatever varies is not arriving through sparam on
this property.

What is still open is whether easing 6 is *how* that is expressed or merely what the authoring plugin
wrote on this node type. The decisive experiment is a one-byte edit:

1. Read `dust.ale`, set the inner easing on `gf_red_dustapp.app`'s `BasicApp_Alpha` to 4, write it
   back, and fly. If the motion-keyed visibility survives, the behaviour belongs to `FLDustAppearance`
   and 6 is just what its authoring plugin wrote.
2. If it changes, easing 6 is doing the work, and the difference in how it changes says what the
   curve's input is.
3. The reverse — putting 6 on `icedust.ale`'s `FxBasicAppearance` — tests whether the stock appearance
   node understands the value at all.

Every other byte in the file is unchanged by the round trip, so anything observed is attributable to
that one byte. If 6 turns out to name a curve none of the six defined types produce, it belongs in
`EaseType` and in `ease`. If it turns out to be a flag Freelancer's dust code reads for something other
than interpolation, then `EaseType` is the wrong shape for this byte and the enum should say so.
`evaluation.test.ts` carries the `todo` test *names easing type 6*.

### A key landing on the end of a wrap-free curve

`limit` folds such a key back to the start, so the last keyframe of a curve carrying no wrap flags is
never sampled — right for a curve meant to loop, wrong for one meant to hold, and the data does not say
which. Marked `TODO` in `evaluation.ts` and carried as a `todo` test.

### The four `Effect` floats

Version 1.1 libraries carry `unknown1..4` per effect, consistent with a centre and radius bounding the
effect but unconfirmed. An in-game test is to inflate `unknown4` on a small effect and see whether it
survives being culled at a distance or off the edge of the screen where it previously vanished.

### The five unnamed property hashes

Four on `FLBeamAppearance`, one on `FLDustField` — types recovered from the stream, labels missing.
Three are booleans that never vary, so only editing them says anything: flip each on a beam effect and
watch what changes.

One has a candidate. **`0x1C65B7B9` is most likely `BeamApp_LineAppearance`**, from an earlier edit
whose visual result matched a line appearance. The name does not hash to it, so if the reading holds
the published spelling differs from the one the exporter hashed and the label cannot be recovered from
the name list. Librelancer carries the same association, hand-entered rather than generated, which is
likely the same observation travelling rather than a second one. **Retest it before naming it.**
