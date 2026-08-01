# Alchemy

Parser and serializer for the Alchemy particle effect system binary format. Alchemy describes visual effects as a two-part library: a **node library** defining reusable parameter blocks, and an **effect library** composing those nodes into hierarchical effect trees.

## Architecture

```
EffectLibrary          NodeLibrary
  └─ Effect[]            └─ Node[]
       └─ NodeInstance[]      └─ Property[]
            (references Node by CRC)
```

An **effect** is a tree of `NodeInstance` records. Each instance references a `Node` in the node library by its name CRC. The node library stores the actual typed parameters (`Property[]`) for each node.

Both libraries live in a `.ale` UTF container, each in a directory of its own name — `AlchemyNodeLibrary/AlchemyNodeLibrary` and `ALEffectLib/ALEffectLib`. All 596 retail `.ale` files hold exactly those two and nothing else.

## Retail corpus

`corpus.test.ts` reads every `.ale` in the game: 5575 nodes, 1213 effects, 6648 instances. Nothing throws, and every instance CRC resolves against the library in its own file. Two things do not survive a byte-exact round trip, both authoring residue that carries no meaning:

| What                                     | Files affected | Detail                                        |
| ---------------------------------------- | -------------- | --------------------------------------------- |
| Empty-string encoding                    | 2 of 596       | [String encoding](#string-encoding)           |
| Order of the flat `Pair` records         | 146 of 596     | [Pair ordering](#pair-ordering-is-not-preserved) |

Everything else is byte for byte, and writing is a fixed point in every file: re-reading the output reproduces the model exactly and writing it again is identical.

Evaluating the corpus is a separate check from reading it, and a stricter one: every animated property in the game — 26617 curves, and every float, colour and transform beside them — is sampled across a grid of sparam and time values, and every component of every result must be a finite number. Getting there took three fixes, all of them in evaluation rather than in the readers; see [Degenerate data](#degenerate-data).

---

## `misc.ts` — Primitives

Defines the foundational types and I/O helpers used throughout the module.

### Types

| Type       | Description                                        |
| ---------- | -------------------------------------------------- |
| `Read<T>`  | `(view: BufferView) => T` — deserializer signature |
| `Write<T>` | `(value: T) => BufferView` — serializer signature  |
| `Vector`   | `{ x, y, z: number }` — 3-component float vector   |

### Primitives

| Function                         | Description                                          |
| -------------------------------- | ---------------------------------------------------- |
| `readInteger` / `writeInteger`   | Signed 32-bit integer                                |
| `readFloat` / `writeFloat`       | 32-bit IEEE float                                    |
| `readString` / `writeString`     | Length-prefixed, NUL-terminated, word-aligned string |
| `readArray` / `writeArray`       | Generic array helpers                                |
| `readBlending` / `writeBlending` | Source/target `BlendingMode` pair                    |

### String encoding

Strings are stored as a `uint16` length (including the NUL byte), followed by the UTF-8 bytes padded to even length.

The empty string has two encodings in retail, and they are indistinguishable once decoded:

| Bytes                     | Meaning                                          |
| ------------------------- | ------------------------------------------------ |
| `01 00` `00` `00`         | Length 1, a lone NUL, plus the alignment pad byte |
| `00 00`                   | Length 0, no payload at all                       |

`readString` accepts either. `writeString` emits the first, which is what all but two files in the retail corpus use, so `FX/WEAPONS/flashgrenade.ale` and `FX/MISC/rtc_vanceimpact.ale` come back two bytes longer than they went in. Both hold a `BasicApp_TexName` (respectively a `ParticleApp_DeathName`) that was authored blank; every other byte of those files round-trips.

### `BlendingMode` enum

Standard GPU blend factor values: `None`, `Zero`, `One`, `SourceColor`, `InverseSourceColor`, `SourceAlpha`, `InverseSourceAlpha`, `DestinationAlpha`, `InverseDestinationAlpha`, `DestinationColor`, `InverseDestinationColor`, `SourceAlphaSAT`.

---

## `property.ts` — Node Properties

Defines the typed property system used to parameterize alchemy nodes.

### `PropertyType` enum

```
None        = 0x000   Boolean     = 0x001
Integer     = 0x002   Float       = 0x003
String      = 0x103   Blending    = 0x104
Transform   = 0x105
AnimatedFloat = 0x200  AnimatedColor = 0x201  AnimatedCurve = 0x202
```

### `Property` type

A discriminated union keyed by `PropertyType`, with an additional `name: PropertyName` field. The name is stored in the binary as a CRC-32 hash; known names are resolved to their string form via a lookup table.

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

### Binary layout

Each property is prefixed by a `uint16` type field and an `int32` CRC. Boolean values have no payload — the value is packed into bit 15 (`0x8000`) of the type field. Unknown property names are preserved as hex strings (e.g. `"0xdeadbeef"`).

A property list is terminated by a `uint16` of zero.

### Known property names

Properties are grouped by node role:

| Prefix                                                                            | Role                               |
| --------------------------------------------------------------------------------- | ---------------------------------- |
| `Node_`                                                                           | Common (name, lifespan, transform) |
| `Emitter_`                                                                        | Shared emitter parameters          |
| `CubeEmitter_`, `SphereEmitter_`, `ConeEmitter_`                                  | Emitter geometry                   |
| `BasicApp_`                                                                       | Basic particle appearance          |
| `OrientedApp_`, `ParticleApp_`, `MeshApp_`, `RectApp_`, `BeamApp_`                | Appearance variants                |
| `RadialField_`, `GravityField_`, `CollideField_`, `TurbulenceField_`, `AirField_` | Force fields                       |

---

## `node.ts` — Node Library

### `Node` interface

```ts
interface Node {
  type: NodeType // e.g. "FxCubeEmitter"
  properties: Property[]
}
```

> **Note:** Every node must have a `Node_Name` string property. `NodeInstance` records in an effect reference nodes by the CRC of this name — a node without `Node_Name` cannot be addressed by any effect.

Every one of the 5575 nodes in the retail corpus carries the property, and names are unique within a library. Exactly one — an `FxConeEmitter` in `FX/EXPLOSIONS/gf_explosion_br_large01.ale` — has it set to the empty string, which hashes to zero; no instance in the game references it. So a name is always present, but not necessarily non-empty.

### Name hashing is case-sensitive

Alchemy is the one place in the format where Freelancer hashes with the character case left alone, which is why `getNodeByCRC` passes `caseSensitive` to `getResourceId`. It is not a stylistic detail: 2660 of the 5429 distinct node names in retail are mixed case, and folding them the way every other CRC lookup in this library does strands 2691 of the 5505 instance references. With case preserved, all 5505 resolve against the library in their own file. Property names are hashed the same way.

### `NodeLibrary` interface

```ts
interface NodeLibrary {
  version: number // float32
  nodes: Node[]
}
```

Binary layout: `float32` version, `uint32` count, then each node as a type string followed by properties terminated by `uint16(0)`.

### Known node types

| Category   | Types                                                                                                                                                                   |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base       | `FxNode`                                                                                                                                                                |
| Emitters   | `FxCubeEmitter`, `FxSphereEmitter`, `FxConeEmitter`                                                                                                                     |
| Appearance | `FxBasicAppearance`, `FLDustAppearance`, `FxOrientedAppearance`, `FxParticleAppearance`, `FxMeshAppearance`, `FxRectAppearance`, `FxPerpAppearance`, `FLBeamAppearance` |
| Fields     | `FxRadialField`, `FxCollideField`, `FxTurbulenceField`, `FxAirField`, `FxGravityField`, `FLDustField`, `FLBeamField`                                                    |

Retail uses seventeen of these; `FxNode` and `FxOrientedAppearance` are declared but never appear.

### Unnamed property hashes

Five property CRCs in retail match no name in the published Alchemy list, and all five sit on the two node types Digital Anvil added themselves. Their types are recovered from the stream, so they read and write correctly — only the labels are missing.

| Hash         | Type            | Node type          | Observed values     |
| ------------ | --------------- | ------------------ | ------------------- |
| `0x1C65B7B9` | `Boolean`       | `FLBeamAppearance` | always `false`      |
| `0x03503B61` | `Boolean`       | `FLBeamAppearance` | always `true`       |
| `0x0ABE0402` | `Boolean`       | `FLBeamAppearance` | always `false`      |
| `0x0BA0B3BB` | `Transform`     | `FLBeamAppearance` | —                   |
| `0xE63AA248` | `AnimatedCurve` | `FLDustField`      | —                   |

Note that `BeamApp_LineAppearance`, which the name list does carry, never appears in retail — so it is not one of these under a different spelling.

### Helper functions

| Function                               | Description                                           |
| -------------------------------------- | ----------------------------------------------------- |
| `readNodeLibrary` / `writeNodeLibrary` | Deserialize / serialize a `NodeLibrary`               |
| `getNodeName(node)`                    | Returns value of `Node_Name` property, or `undefined` |
| `setNodeName(node, value)`             | Sets or adds the `Node_Name` property                 |
| `getNodeByName(nodes, name)`           | Finds node by name string                             |
| `getNodeByCRC(nodes, crc)`             | Finds node by CRC of its name                         |

---

## `animation.ts` — Animation Types

Defines the keyframe animation structures used by animated property types.

### `EaseType` enum

Controls interpolation between keyframes.

| Value     | Behavior                               |
| --------- | -------------------------------------- |
| `Step`    | No interpolation — hold previous value |
| `Linear`  | Linear interpolation                   |
| `QuadIn`  | Ease in (quadratic)                    |
| `QuadOut` | Ease out (quadratic)                   |
| `Smooth`  | Smooth step                            |
| `Auto`    | QuadIn if `a < b`, QuadOut otherwise   |

**This list may be incomplete.** Nine keyframes in three retail files hold a byte outside it, and they are not all the same kind of thing — see [Easing outside the enum](#easing-outside-the-enum). Every outer easing byte in the corpus is one of the six; only inner ones stray.

### `WrapFlags` enum

Bitfield controlling out-of-range behavior for looped animations. Independent before/after flags:

| Flag                               | Effect                        |
| ---------------------------------- | ----------------------------- |
| `BeforeRepeat` / `AfterRepeat`     | Wrap via `fract`              |
| `BeforeMirror` / `AfterMirror`     | Wrap via `pingPong`           |
| `BeforeClamp` / `AfterClamp`       | Clamp to range                |
| `BeforeContinue` / `AfterContinue` | Extrapolate with accumulation |

### Keyframe types

- **`FloatKeyframe`** — `{ key: number, value: number }`
- **`VectorKeyframe`** — `{ key: number, x, y, z: number }`

### Animation containers

| Type               | Structure                                               |
| ------------------ | ------------------------------------------------------- |
| `EaseAnimation<T>` | `{ easing: EaseType, keyframes: T[] }`                  |
| `LoopAnimation<T>` | `{ default: number, flags: WrapFlags, keyframes: T[] }` |

### Composite animated types

| Type            | Description                                                                                                                                                 |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AnimatedFloat` | Nested two-level ease animation: outer keyframes index into inner `EaseAnimation<FloatKeyframe>`                                                            |
| `AnimatedColor` | Same structure but inner keyframes are `VectorKeyframe` (RGB)                                                                                               |
| `AnimatedCurve` | Outer ease animation; inner keyframes are `LoopAnimation<VectorKeyframe>` evaluated as Hermite splines. `x` = position, `y` = out-tangent, `z` = in-tangent |

### `Transform` / `TransformPoint`

```ts
interface Transform {
  flags: TransformFlags
  position?: TransformPoint // x, y, z as AnimatedCurve
  rotation?: TransformPoint
  scale?: TransformPoint
}
```

Data is only present when `TransformFlags.Enable` (bit 31) is set. `TransformFlags.Default` combines several unknown flags as the standard enabled state.

### Serialization

Each structure has a `read*` / `write*` pair: `readFloatKeyframe`, `readVectorKeyframe`, `readEaseAnimation`, `readLoopAnimation`, `readAnimatedFloat`, `readAnimatedColor`, `readAnimatedCurve`, `readTransformPoint`, `readTransform`, and their writers. `isTransformEnabled(flags)` tests the enable bit.

---

## `evaluation.ts` — Animation Evaluation

| Function                            | Description                                                                                                                                                                      |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ease(type, a, b, t)`               | Scalar interpolation by easing type                                                                                                                                              |
| `easeVector(type, a, b, t)`         | Per-component interpolation of a `Vector3`                                                                                                                                       |
| `limit(flags, start, end, key)`     | Applies `WrapFlags` to remap a key, returns `{ key, count }`                                                                                                                     |
| `floatWhen(animation, key)`         | Evaluates a single `EaseAnimation<FloatKeyframe>`                                                                                                                                |
| `vectorWhen(animation, key)`        | Evaluates a single `EaseAnimation<VectorKeyframe>`                                                                                                                               |
| `hermiteAt(animation, key)`         | Evaluates a `LoopAnimation<VectorKeyframe>` as a Hermite spline                                                                                                                  |
| `floatAt(animation, p, t)`          | Evaluates `AnimatedFloat` at sparam `p` and time `t`                                                                                                                             |
| `colorAt(animation, p, t)`          | Evaluates `AnimatedColor` at `p` and `t`, returns `Vector3`                                                                                                                      |
| `curveAt(animation, p, t)`          | Evaluates `AnimatedCurve` via Hermite spline at `p` and `t`                                                                                                                      |
| `transformPointAt(point, p, t)`     | Evaluates one `TransformPoint` into a `Vector3`                                                                                                                                  |
| `transformAt(transform, p, t)`      | Evaluates a `Transform` at `p` and `t`; returns `TransformAt` — `{ flags, position, rotation, scale }` as `Vector3` each; missing components default to zero-vector (scale defaults to `{1,1,1}`) |

Keyframe lookup itself comes from the math module: `at(keyframes, key)` in [`math/animation.ts`](../src/math/animation.ts) returns `{ start, end, span }`, where `span` is the normalized position between the two keyframes.

The two-axis evaluation (`p`, `t`) allows properties to vary both over a particle's lifespan (`t`) and over an external control value `p` (referred to in-game as **sparam**). `sparam` is supplied by the game engine to blend between animation states — for example, transitioning an engine thruster effect between idle and full throttle.

### Degenerate data

Reading and writing were settled against retail long before evaluation was, and the data the readers accept is far looser than the evaluator originally assumed. Three shapes occur often enough to matter, and none of them may produce `NaN` or throw — the game loads all of these files:

| Shape                          | Occurrences                                  | Result                              |
| ------------------------------ | -------------------------------------------- | ----------------------------------- |
| Looped list spanning no range  | 11831 of 27662 lists                          | The single value                    |
| Easing byte outside `EaseType` | 9 keyframes in 3 files                        | Linear — **provisional**, see below |
| Empty keyframe list            | 14127 looped lists, 7 eased lists             | `default`, or zero                  |

The 27662 looped lists behind the 26617 `AnimatedCurve` properties break down as 14127 empty, 11791 holding a single keyframe, and 1744 holding more — 40 of which put every keyframe on the same key. A list of one keyframe, or of several sharing a key, **spans no range**, and `limit` remapped the sampling key through it: a division by zero that put `NaN` into 10831 of the 26617 curve properties and 1155 of the 1289 enabled transforms. Wrap flags that clamp masked it, which is the only reason the rest came out finite. `limit` now returns the point itself before remapping.

An **empty looped list** falls back to its `default` field. An eased list has no such field, so an empty one contributes **zero**. Seven retail properties hold one: three where it is the only list (`BasicApp_Rotate` on the rain appearances, so the property is zero throughout), and four in `no_engine.app` where it sits at outer key 0 beside a populated list at key 1, which then ramps up out of zero as sparam rises.

One case is left as it stands and marked `TODO` in the source. `limit` folds a key landing exactly on the end of a curve **carrying no wrap flags** back to the start, so the last keyframe of such a curve is never sampled. That is right for a curve meant to loop and wrong for one meant to hold, and nothing in the data says which was intended — it wants observing in game. `evaluation.test.ts` states the expectation as a `todo` test, which reports without failing the suite.

### Easing outside the enum

Nine inner keyframe lists in the whole corpus carry an easing byte the [`EaseType`](#easetype-enum) enum does not define. It is tempting to write all nine off as debris; the data does not support that. **Easing only does anything to a list of more than one keyframe** — with a single keyframe there is nothing to interpolate between and the byte is never read. That line splits the nine cleanly:

| File                              | Node                 | Property            | Value           | Keyframes | Observable |
| --------------------------------- | -------------------- | ------------------- | --------------- | --------- | ---------- |
| `FX/WEAPONS/gf_bolt01.ale`        | `gf_bolt01.app`      | `BasicApp_Color`    | 120 (`0b01111000`) | 1      | no         |
| `FX/WEAPONS/gf_bolt01.ale`        | `gf_bolt01.app`      | `BasicApp_Alpha`    | 120             | 1         | no         |
| `FX/WEAPONS/gf_bolt01.ale`        | `gf_bolt01.app`      | `RectApp_Scale`     | 120             | 1         | no         |
| `FX/WEAPONS/gf_bolt01.ale`        | `gf_bolt01.app`      | `RectApp_Length`    | 8 (`0b00001000`) | 1        | no         |
| `FX/WEAPONS/gf_bolt01.ale`        | `gf_bolt01.app`      | `RectApp_Width`     | 136 (`0b10001000`) | 1      | no         |
| `FX/WEAPONS/gf_bolt01.ale`        | `gf_bolt01.app`      | `BasicApp_TexFrame` | 8               | 1         | no         |
| `FX/WEAPONS/gf_bolt01.ale`        | `gf_bolt01_Cone.emt` | `Emitter_LODCurve`  | 248 (`0b11111000`) | 1      | no         |
| `FX/SPACE/dust.ale`               | `gf_red_dustapp.app` | `BasicApp_Alpha`    | **6**           | **4**     | **yes**    |
| `FX/SPACE/motionblur_dust.ale`    | `motionblur_dust.app`| `BasicApp_Alpha`    | **6**           | **4**     | **yes**    |

**The seven in `gf_bolt01.ale` are junk.** Every one has bit 3 set and its low three bits clear (`0x08`, `0x78`, `0x88`, `0xF8`) — a shape no six-value enum produces. Every one sits on a list of a single keyframe, so nothing reads it. They are confined to one file, and that file is registered in `FX/WEAPONS/weapons_ale.ini` but named by no `[Effect]` entry in `FX/effects.ini`, unlike weapon effects the game actually plays (`br_capgun_01_proj` appears in both). An unplayed effect is exactly where an authoring tool leaves uninitialized bytes behind.

**The two `6`s are a different matter, and are unresolved.** A 6 is one past `Auto`, precisely where a seventh enum member would sit. It appears in two separate files, on the same property in both, on four-keyframe lists that really are interpolated — and both are the alpha envelope of the motion dust, an `EFT_MOTION_DUST` effect the player sees continuously while flying. Deliberate authoring fits that better than a stray byte does.

What settles it as deliberate is that **easing 6 and `FLDustAppearance` imply one another across the entire corpus**. `FLDustAppearance` is one of the four node types Digital Anvil added on top of stock Alchemy (with `FLDustField`, `FLBeamAppearance` and `FLBeamField`). It has exactly two instances in the game, and both use easing 6; no other node type uses 6 anywhere in 5575 nodes. Every other dust effect — `icedust`, `leedsdust`, `snowdust`, `asteroiddust`, `golddust`, the `attractdust` family and the rest — is the same effect built from stock `FxBasicAppearance` with easing **4** on the same four-keyframe alpha shape.

The comparison is almost controlled. Set `dust.ale` beside `icedust.ale`:

| | `dust` / `motionblur_dust` | `icedust` / `leedsdust` / … |
| --- | --- | --- |
| Appearance node | `FLDustAppearance` | `FxBasicAppearance` |
| Alpha easing | **6** | 4 (`Smooth`) |
| Emitter | `FxSphereEmitter`, frequency 5000, `InitLifeSpan` 10, radius 60 | identical |
| Field | `FLDustField`, radius 60.1 | identical |
| Effect type in `effects.ini` | `EFT_MOTION_DUST` | `EFT_MISC_DUST` |

Same emitter, same field, same particle lifespan, same curve shape. The appearance node type and the easing byte are the only things that differ — and `FLDustAppearance` declares no property `FxBasicAppearance` lacks, so whatever it does differently lives in Freelancer's code, not in the data.

**A conjecture worth testing** (treewyrm's): motion dust is invisible when the camera holds still and appears as the ship moves, so the easing may be keyed to motion rather than to particle age — and the four keyframes, a ramp up and a ramp down, may be two sequences squashed into one list. Nothing in the file confirms or refutes this. One thing does bear on it: the alpha property has a **single** outer list, at `p = 0`, so whatever varies is not arriving through sparam on this property.

Because the writer is a byte-for-byte fixed point on both files, the decisive experiment is a one-byte edit:

1. Read `dust.ale`, set the inner easing on `gf_red_dustapp.app`'s `BasicApp_Alpha` to 4, write it back, and fly. If motion-keyed visibility survives, the behaviour belongs to `FLDustAppearance` and 6 is just what its authoring plugin wrote.
2. If it changes, easing 6 is doing the work, and the difference in how it changes says what the curve's input is.
3. The reverse — putting 6 on `icedust.ale`'s `FxBasicAppearance` — tests whether the stock appearance node understands the value at all.

Every other byte in the file is unchanged by the round trip, so anything observed is attributable to that one byte.

Both curves are a fade in, a hold, and a fade out, with the outer easing set to `Smooth`:

| List                            | Keyframes (`key` → `value`)                                 |
| ------------------------------- | ------------------------------------------------------------ |
| `dust.ale` alpha                | 0 → 0, 0.25 → 0.35, 0.5 → 0.35, 1 → 0                        |
| `motionblur_dust.ale` alpha     | 0 → 0, 0.2693 → 0.5382, 0.5193 → 0.5382, 1 → 0               |

`ease` currently treats 6 as `Linear`. That is a placeholder chosen so evaluation cannot return `undefined`, **not** a reading of the data — the raw byte is preserved on read and written back unchanged, and both files round-trip byte for byte, so nothing is lost by leaving the question open. `evaluation.test.ts` carries a `todo` test named *names easing type 6* that reports on every run until it is settled.

If 6 turns out to name a curve none of the six defined types produce, it belongs in `EaseType` and in `ease`. If it turns out to be a flag Freelancer's dust code reads for something other than interpolation, then `EaseType` is the wrong shape for this byte and the enum should say so.

---

## `effect.ts` — Effect Library

### `NodeInstance` interface

```ts
interface NodeInstance {
  crc: number // CRC of the referenced node name, case-sensitive
  flags: number // display flags
  sort: number // serialization order
  id?: number // on-disk entry identifier
  children: NodeInstance[]
  targets: NodeInstance[]
}
```

Instances form a tree via `children`. Cross-tree links (e.g. appearance→emitter bindings) are stored as `targets`, which are serialized as separate flat `Pair` records.

### Entry identifiers are not derivable

`id` holds the `childId` the entry was read with. It exists because retail identifiers are sparse, unordered handles the authoring tool left behind rather than a numbering the tree implies: of the 1213 effects in the corpus, 593 use a set other than `1..n` and 603 do not even list them in ascending order. `br_mine01_blast50` stores its five entries as `3, 6, 7, 1, 2`.

Regenerating them from a traversal, as the writer originally did, changed the bytes of 567 of the 596 files for no reason. They are now preserved on read and reused on write; an instance built by hand and given no `id` is numbered around whatever ids are already taken.

### Pair ordering is not preserved

The order of the flat `Pair` records is the one thing that does not survive a round trip. The writer emits them in traversal order, which reorders them in 146 of the 596 files; the links themselves are always identical, so re-reading the output reproduces the model exactly and writing it again is a fixed point.

Retail order follows no rule this corpus can recover. Sorting by source id, by target id, by entry order and by traversal order were each checked against the 727 effects carrying more than one pair, and the best explained 548 of them — some files store their pairs ascending by source, others descending. It is authoring residue.

### `Effect` interface

```ts
interface Effect {
  name: string
  unknown1?: number // float32, version > 1 only
  unknown2?: number
  unknown3?: number
  unknown4?: number
  children: NodeInstance[]
}
```

Retail ships two library versions: 1.1 in 501 files and 1 in 95. Only 1.1 carries the four floats. `unknown4` is never negative anywhere in the corpus and ranges up to 56, while the other three are unconstrained in sign — consistent with a centre and radius bounding the effect, though nothing confirms it. On a version 1 library they are absent and read back as zero.

### `EffectLibrary` interface

```ts
interface EffectLibrary {
  version: number // float32, controls Effect serialization variant
  effects: Effect[]
}
```

### Binary layout

Each effect is serialized as:

1. Name string
2. Four `float32` unknowns (version > 1 only)
3. `int32` entry count + flat `Entry[]` array
4. `int32` pair count + flat `Pair[]` array

The flat `Entry` structure `{ flags, crc, parentId, childId }` is reassembled into the tree using `assemble` / `flatten` from `hierarchy.ts`. `parentId >= WorldId (0x8000)` means the instance is a root child; `0x8000` is the only value retail ever uses there.

### Constants

| Constant    | Value            | Description                                 |
| ----------- | ---------------- | ------------------------------------------- |
| `WorldId`   | `0x8000`         | Parent ID indicating a root-level instance  |
| `DefaultId` | `0xee223b51\|0`  | CRC of the root container instance          |

`DefaultId` is not a node reference — no name in any library hashes to it. It marks the single container every effect hangs its instances from, and the corpus pins its shape exactly: it occurs 1143 times, always at root, always with `flags` 1 (the only instance in the game that has them), never as either end of a link, and its direct children always have `flags` 0. 1143 of the 1213 effects have exactly one; the remaining 70 have none.

It is written `0xee223b51 | 0` because instance CRCs are read with `readInt32`. As an unsigned literal it never compared equal to anything, which made the exported constant useless.

### Functions

| Function                                   | Description                                |
| ------------------------------------------ | ------------------------------------------ |
| `readEffectLibrary` / `writeEffectLibrary` | Deserialize / serialize an `EffectLibrary` |

---

## `index.ts` — Public API

Re-exports the public surface of the module:

```ts
// Types
;(PropertyType, PropertyName, Property)
;(NodeType, Node, NodeLibrary)
;(NodeInstance, Effect, EffectLibrary)
;(AnimatedFloat, AnimatedColor, AnimatedCurve, Transform)

// Node library
;(readNodeLibrary, writeNodeLibrary)
;(getNodeByCRC, getNodeByName, getNodeName, setNodeName)

// Effect library
;(readEffectLibrary, writeEffectLibrary)
;(DefaultId, WorldId)

// Animation
;(EaseType, WrapFlags)
;(floatAt, colorAt, curveAt, transformAt)
```

---

## TODO

Open questions this module cannot settle from the data. Each one is an experiment in the running game, not a gap in the reader: everything below reads and writes correctly and round-trips byte for byte, so a one-byte edit is a controlled test. Items that a `todo` test reports on every run are marked.

### `TransformFlags` — what the low bits do

`Node_Transform` carries a `uint32` of flags before its nine curves. Only bit 31 is understood: it gates whether any data follows. The rest are named `Unknown1..5` and combined as `Default`.

**Retail never varies them.** A sweep over all 5,590 transform properties in the corpus turns up exactly **two** words:

| Word         | Bits set           | Count | Payload   |
| ------------ | ------------------ | ----- | --------- |
| `0x00050304` | 2, 8, 9, 16, 18    | 4,301 | none      |
| `0x80050304` | the same, plus 31  | 1,289 | nine curves |

They fall on `Node_Transform` (5,575 — one per node), the unnamed `0x0BA0B3BB` on `FLBeamAppearance` (11, never enabled) and `MeshApp_ParticleTransform` (4, one enabled).

Two things follow. **The low bits cannot be selecting which channels are present**: the payload is nine curves whenever bit 31 is set, and the whole library round-trips byte for byte, which a size-varying field could not do. **They are not selecting which channels are *used* either**, at least not in any way the data records — the word is constant while the set of channels that actually carry keyframes varies seven ways beneath it:

| Populated channels | Enabled transforms |
| ------------------ | ------------------ |
| rotation only      | 595                |
| position, rotation | 471                |
| position only      | 207                |
| scale only         | 7                  |
| all three          | 4                  |
| rotation, scale    | 3                  |
| position, scale    | 2                  |

So what is left for the bits is *how* the curves are applied — space (node-local against emitter or world), rotation order or units, whether the transform tracks the emitter after spawn — none of which the file distinguishes, because every file makes the same choice.

That leaves flipping them. `FX/EXPLOSIONS/gf_explosion_debris_trail01.ale` is the best subject: three `FxConeEmitter` nodes with position, rotation and scale all animated, on an effect that plays whenever anything blows up. `FX/MISC/gf_contrail01.ale` (rotation and scale) and `FX/MISC/gravity_well.ale` (scale alone) isolate fewer channels.

1. Clear one low bit at a time on `Node_Transform` and fly. A bit that changes nothing on a node using all three channels is not a channel or space selector.
2. If the effect stops rendering or the node snaps to the origin, the bit is a required enable of some kind, and the pairing tells which channel or which space.
3. Setting a bit retail never sets (anything outside `0x80050304`) tests whether the engine masks the word or validates it.

Until then `Default` stays a single opaque constant rather than five separately meaningful names, and `transformAt` ignores the low bits entirely.

### Easing type 6

Two `FLDustAppearance` alpha envelopes use an easing byte the `EaseType` enum does not define, and easing 6 and `FLDustAppearance` imply one another across the whole corpus. `ease` treats it as `Linear` — a placeholder, not a reading. The controlled one-byte experiment on `dust.ale` is written out in [Easing outside the enum](#easing-outside-the-enum). `evaluation.test.ts` carries the `todo` test *names easing type 6*.

### A key landing on the end of a wrap-free curve

`limit` folds such a key back to the start, so the last keyframe of a curve carrying no wrap flags is never sampled — right for a curve meant to loop, wrong for one meant to hold, and the data does not say which. Marked `TODO` in `evaluation.ts` and carried as a `todo` test.

### The four `Effect` floats

Version 1.1 libraries carry `unknown1..4` per effect. `unknown4` is never negative and ranges to 56 while the other three are unconstrained in sign — consistent with a centre and radius bounding the effect, unconfirmed. An in-game test is to inflate `unknown4` on a small effect and see whether it survives being culled at a distance or off the edge of the screen where it previously vanished.

### The five unnamed property hashes

Four on `FLBeamAppearance`, one on `FLDustField` — types recovered from the stream, labels missing. Three are booleans that never vary, so only editing them says anything: flip each on a beam effect and watch what changes.
