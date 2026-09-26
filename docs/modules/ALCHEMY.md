# Alchemy

The `.ale` particle effect format. Two libraries: a **node library** of reusable typed parameter
blocks, and an **effect library** composing those nodes into hierarchical effect trees.

Both live in a `.ale` UTF container, each in a directory of its own name —
`AlchemyNodeLibrary/AlchemyNodeLibrary` and `ALEffectLib/ALEffectLib` — and every retail `.ale` holds
exactly those two.

```
EffectLibrary          
  └─ Effect[]          
       └─ NodeInstance[] (references Node by CRC)

NodeLibrary
  └─ Node[]
       └─ Property[]
```

An effect is a tree of `NodeInstance` records. Each instance references a `Node` in the node library
by its name CRC; the node library stores the typed parameters.

## Primitives

| Encoding | Layout                                                                        |
| -------- | ----------------------------------------------------------------------------- |
| Integer  | signed 32-bit                                                                 |
| Float    | 32-bit IEEE                                                                   |
| String   | `uint16` length **including the NUL**, then the bytes, padded to even length  |
| Blending | a source/target `BlendingMode` pair                                           |

The empty string has two encodings, indistinguishable once decoded:

| Bytes             | Meaning                                           |
| ----------------- | ------------------------------------------------- |
| `01 00` `00` `00` | Length 1, a lone NUL, plus the alignment pad byte |
| `00 00`           | Length 0, no payload at all                       |

`readString` accepts either; `writeString` emits the first, which is what all but two retail files
use.

### `BlendingMode`

`D3DBLEND` verbatim: `Zero` is 1 against `D3DBLEND_ZERO` = 1, and every entry lines up from there.
`None` = 0 is not a D3D value — that enum starts at 1 — so zero stands for the property being unset.
The values are `None`, `Zero`, `One`, `SourceColor`, `InverseSourceColor`, `SourceAlpha`,
`InverseSourceAlpha`, `DestinationAlpha`, `InverseDestinationAlpha`, `DestinationColor`,
`InverseDestinationColor`, `SourceAlphaSAT`, `BothSourceAlpha`, `BothInverseSourceAlpha`.

The last two are the D3D8 modes that set the destination factor implicitly, and Direct3D accepts them
only as a source. One retail file writes one as a target — an authoring slip — but the byte is real
and round-trips.

## Node properties

### `PropertyType`

| Value   | Name            |
| ------- | --------------- |
| `0x000` | `None`          |
| `0x001` | `Boolean`       |
| `0x002` | `Integer`       |
| `0x003` | `Float`         |
| `0x103` | `String`        |
| `0x104` | `Blending`      |
| `0x105` | `Transform`     |
| `0x200` | `AnimatedFloat` |
| `0x201` | `AnimatedColor` |
| `0x202` | `AnimatedCurve` |

Each property is prefixed by a `uint16` type field and an `int32` name CRC. Boolean values have no
payload — the value is packed into bit 15 (`0x8000`) of the type field. A property list is terminated
by a `uint16` of zero.

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

### Known names

The 68 names the lookup table carries, with the type each is written as. **A name's type is fixed** —
across all 596 retail files no name is ever written twice with different types, so the type field
adds nothing a known name does not already say. The library still reads the field rather than the
name, because an unnamed hash has nothing else to go on.

**The descriptions are readings; the library acts on none of them** — it reads and writes the value,
and what a renderer does with it is the consumer's. Every one is read out of retail `alchemy.dll`
unless it says otherwise, and the defaults are the ones the DLL's constructors fill in when a node
does not carry the property. Several overturn what had been read off the names or seen in game, and
those are marked **not** below.

Two keys run through them. An emitter's or field's curve is sampled at the node's own time; an
appearance's eased list at the particle's **age over its lifespan**, 0…1. The outer key of both is
`sparam`, which the host supplies.

Common — every node carries all three:

| Name             | Type        | Description                                                                                                                                                 |
| ---------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Node_Name`      | `String`    | The node's identity, unique within its library and what an instance references by CRC                                                                       |
| `Node_LifeSpan`  | `Float`     | Seconds the node *works* for, counted from the start of the effect — not the life of anything it produces. Default 3. `FLT_MAX` and `Infinity` both stand for "never" |
| `Node_Transform` | `Transform` | Position, rotation and scale as nine curves, rotation in **degrees**, composed `T · S · Rz · Rx · Ry` on column vectors — scale after rotation, so a non-uniform scale on a turned node shears. See [`Transform`](#transform) |

Emitters — the `Emitter_` block is identical on all three emitter types, and **an emitter fires along
its local +Y**:

| Name                       | Type            | Description                                                                                    |
| -------------------------- | --------------- | -------------------------------------------------------------------------------------------------- |
| `Emitter_Frequency`        | `AnimatedCurve` | Particles per second, **truncated every frame** with the fraction dropped, so the rate depends on the frame rate. Default 100 |
| `Emitter_EmitCount`        | `AnimatedCurve` | **A list of bursts**, not a rate: each keyframe of the first sparam list whose key falls in this frame adds its value, truncated, to the count. Never evaluated as a curve. Not inert, as it once read |
| `Emitter_InitialParticles` | `Integer`       | Added to the count on the emitter's first update                                               |
| `Emitter_MaxParticles`     | `AnimatedCurve` | Cap on the particles the **appearance** holds, not the emitter; births past it are dropped. Default 10,000, and the one optional emitter property |
| `Emitter_InitLifeSpan`     | `AnimatedCurve` | The particle's own lifetime, in seconds, handed to it at birth. Default 2                       |
| `Emitter_Pressure`         | `AnimatedCurve` | Initial speed along the spawn heading, through the emitter's matrix with its scale. Default 10  |
| `Emitter_VelocityApproach` | `AnimatedCurve` | Share of the **emitter's own motion** since its last emission lent to each birth, divided among that frame's births. Default 0. Not the parent object's velocity, as it once read |
| `Emitter_LODCurve`         | `AnimatedFloat` | Multiplies the count, keyed on an LOD value the host sets (1 unless it moves it); the fraction carries to the next frame |

Emitter geometry — the box or shell a particle appears in, and the cone it leaves along:

| Name                      | Type            | Description                                                                             |
| ------------------------- | --------------- | ------------------------------------------------------------------------------------------- |
| `CubeEmitter_Width`       | `AnimatedCurve` | **Half-extent** along local X — a particle appears within ±Width. Default 5              |
| `CubeEmitter_Height`      | `AnimatedCurve` | Half-extent along local Y, the axis particles leave along. Default 5                     |
| `CubeEmitter_Depth`       | `AnimatedCurve` | Half-extent along local Z. Default 5                                                     |
| `CubeEmitter_MinSpread`   | `AnimatedCurve` | Inner polar angle of the heading off +Y, in degrees — where a particle appears and which way it leaves are independent |
| `CubeEmitter_MaxSpread`   | `AnimatedCurve` | Outer polar angle; the heading is drawn linear in angle between the two. Never above 90 across all 377 |
| `SphereEmitter_MinRadius` | `AnimatedCurve` | Inner radius of the shell a particle appears in, drawn linear between the two            |
| `SphereEmitter_MaxRadius` | `AnimatedCurve` | Outer radius. The heading is radial from a point of the cube [−1, 1]³ normalized, so it leans toward the diagonals |
| `ConeEmitter_MinRadius`   | `AnimatedCurve` | Inner radius of the same shell — a cone emitter is a sphere emitter with a cone carved out of it. Default 0 |
| `ConeEmitter_MaxRadius`   | `AnimatedCurve` | Outer radius. Default 1                                                                 |
| `ConeEmitter_MinSpread`   | `AnimatedCurve` | Inner polar angle off +Y, in degrees                                                     |
| `ConeEmitter_MaxSpread`   | `AnimatedCurve` | Outer polar angle. Never above 90 across all 804, and a great many sit exactly on it     |

Appearances — the `BasicApp_` set is the textured sprite, carried by five of the seven appearance
types:

| Name                         | Type            | Description                                                                                         |
| ---------------------------- | --------------- | ------------------------------------------------------------------------------------------------------- |
| `Appearance_LODCurve`        | `AnimatedFloat` | Multiplies every extent, keyed on the host's LOD value; zero draws nothing                          |
| `BasicApp_Color`             | `AnimatedColor` | RGB over the particle's age, 0…1 per channel. Absent, it is 0.8 grey                                |
| `BasicApp_Alpha`             | `AnimatedFloat` | Opacity over the particle's age, packed into a byte **without a clamp, so past 1 it wraps**. Default 1 |
| `BasicApp_Size`              | `AnimatedFloat` | On a basic quad **the half-extent**, on its triangle the inradius; on a perp the **full** extent. Default 1 |
| `BasicApp_HToVAspect`        | `AnimatedFloat` | Multiplies the **horizontal** half-extent only, and on the quad only. Default 1                     |
| `BasicApp_Rotate`            | `AnimatedFloat` | Roll about the view axis over the particle's age, in **radians**, a positive angle clockwise on screen. Not read under `MotionBlur` |
| `BasicApp_TexName`           | `String`        | Names an entry in the texture library. 21 nodes name `""`, which draws flat colour rather than being an omission |
| `BasicApp_BlendInfo`         | `Blending`      | Source and destination blend factors. Default `SourceAlpha` / `One`                                 |
| `BasicApp_TexFrame`          | `AnimatedFloat` | A **0…1 position through the frame table** over the particle's age: frame `trunc(position × (count − 1))`, within the one atlas the appearance has bound |
| `BasicApp_CommonTexFrame`    | `AnimatedCurve` | The same position on the appearance's own clock, once per frame, so every particle shows the same frame; it picks the atlas bound too, so it animates across sibling entries |
| `BasicApp_UseCommonTexFrame` | `Boolean`       | Which of the two is read                                                                            |
| `BasicApp_FlipTexU`          | `Boolean`       | Swap the frame's `u0` and `u1`                                                                      |
| `BasicApp_FlipTexV`          | `Boolean`       | Swap its `v0` and `v1`                                                                              |
| `BasicApp_TriTexture`        | `Boolean`       | Only when `QuadTexture` is clear: which texture mapping the triangle takes, a right triangle of the frame instead of the centred one |
| `BasicApp_QuadTexture`       | `Boolean`       | **Picks the shape**: a quad when set, an equilateral triangle when clear. Tested alone, which is why all four combinations with `TriTexture` occur. On a beam it fans each segment round a centre vertex, and defaults to true |
| `BasicApp_MotionBlur`        | `Boolean`       | On a basic quad, **a stretch** from where the particle was a thirtieth of a second ago, as seen, to `Size` past it — no roll. On a rect, a thirtieth of a second of travel added to its length. **Not** a random roll, as it once read |
| `OrientedApp_Width`          | —               | Half-width in the appearance's own frame, × `RectApp_Scale` — the type is never used in retail      |
| `OrientedApp_Height`         | —               | Half-height, likewise                                                                               |
| `ParticleApp_LifeName`       | `String`        | An effect started per particle and carried at it for its life; this appearance draws nothing itself. **No name, or one no library defines, and no particle is born** |
| `ParticleApp_DeathName`      | `String`        | An effect started where a particle dies, unrotated. 16 of 18 name `""`                              |
| `ParticleApp_UseDynamicRotation` | `Boolean`   | Turns the life effect's +Y onto the particle's velocity. True on 1 of the 17 that carry it          |
| `ParticleApp_SmoothRotation` | `Boolean`       | Under the above, eases toward that turn by `speed × dt` of the way each frame instead of snapping. True on 1 of 17 |
| `MeshApp_MeshName`           | `String`        | Meant to name `FX\MISC\<name>.3db`: `TLRtube` and three `beryl_asteroid*`. The game's mesh factory never reads it, and **every** `FxMeshAppearance` crashes the game when it spawns |
| `MeshApp_MeshId`             | `Integer`       | Handed to the game beside the name and never read by it. `0` on all four                            |
| `MeshApp_UseParticleTransform` | `Boolean`     | Whether `ParticleTransform` places the mesh. True on all four                                       |
| `MeshApp_ParticleTransform`  | `Transform`     | The mesh's transform about the particle, sampled at its age over its life                           |
| `RectApp_Scale`              | `AnimatedFloat` | Multiplies length and width. Default 1                                                              |
| `RectApp_Length`             | `AnimatedFloat` | Full extent along the particle's velocity in space. Default 1. A beam never reads it               |
| `RectApp_Width`              | `AnimatedFloat` | Full extent across it. Default 1                                                                    |
| `RectApp_CenterOnPos`        | `Boolean`       | Set, the particle is the rectangle's centre; clear, its trailing edge, the rectangle reaching a full length ahead |
| `RectApp_ViewingAngleFade`   | `Boolean`       | Fades as the rect turns end-on, or the perp edge-on: alpha falls between 30° and 10° off that line, and within 10° nothing is drawn |
| `BeamApp_DisablePlaceHolder` | `Boolean`       | With no `FLBeamField` anchoring the beam, a head point is added where a particle of age zero would be, extrapolated from the two newest; this turns that off. True on 39 of the 128 that carry it |
| `BeamApp_DupeFirstParticle`  | `Boolean`       | What the head point carries. Set, it copies the newest particle's width and colour. Clear, positions shift one place against properties and the oldest position is not drawn. True on 1 of 128 |
| `BeamApp_LineAppearance`     | —               | Set by nothing under its own hash. Librelancer gives the name to `0x1C65B7B9`, which draws the beam as untextured wireframe |

`FLBeamAppearance` draws no sprite of its own: it chains its emitter's particles, newest first, into
two sheets crossed on the camera's right and up axes. That is why `RectApp_Width` on it is the
chain's width, × `Scale` × LOD, half either side of each particle.

Fields — each acts on the particles of the appearances that link it, before they age. `k` is
`min(4 × Approach × dt, 1)`, clamped at the top only:

| Name                        | Type            | Description                                                              |
| --------------------------- | --------------- | ---------------------------------------------------------------------------- |
| `RadialField_Radius`        | `AnimatedCurve` | The distance the attenuation is spread over. **Nothing is cut off at it**: beyond, a particle is pushed at the attenuation's last value |
| `RadialField_Magnitude`     | `AnimatedCurve` | Target velocity per unit of distance from the node, positive outward: `v → D × Magnitude × Attenuation` |
| `RadialField_Attenuation`   | `AnimatedFloat` | A curve over the distance divided by `Radius`, clamped at 1 — keyed on distance, not time. The one field property that is not a curve |
| `RadialField_Approach`      | `AnimatedCurve` | How fast a particle's velocity converges on that target, per second: `v += (target − v) × k` |
| `GravityField_Gravity`      | `AnimatedCurve` | Acceleration along the node's local −Y, **accumulated** — there is no approach                         |
| `AirField_Magnitude`        | `AnimatedCurve` | A target velocity along the node's local +Y                                                            |
| `AirField_Approach`         | `AnimatedCurve` | How fast a particle converges on it, as the radial field's                                             |
| `TurbulenceField_Magnitude` | `AnimatedCurve` | The largest speed of a target drawn **at random per particle per frame** — there is no noise field     |
| `TurbulenceField_Approach`  | `AnimatedCurve` | How fast a particle converges on that target                                                           |
| `CollideField_Reflectivity` | `AnimatedCurve` | Scales the mirrored velocity of a particle turned back by the node's local XZ plane. The plane is **unbounded** and catches only a five-unit skin behind it |
| `CollideField_Width`        | `AnimatedCurve` | **Never read** — not even sampled                                          |
| `CollideField_Height`       | `AnimatedCurve` | **Never read**                                                             |

`FLDustField` takes `SphereEmitter_MaxRadius` as its radius and **writes each particle's age** from
where it sits in that sphere, the back rim faded, and kills it outside — so a dust particle's curves
are keyed on its position, not its time. `FLBeamField` carries nothing and pushes nothing: its
position is the head of any beam linking it.

**`Approach` is not one mechanism.** On the three fields it is the convergence rate above, with a
factor of four the names do not suggest; on the emitter it is the share of its motion lent to each
birth.

The three types marked — are the names no retail file sets, so nothing is measured to state:
`FxOrientedAppearance` never appears at all, and
[`BeamApp_LineAppearance`](#the-five-unnamed-property-hashes) is set under a hash that is not its own.

**A prefix names the parameter group, not the node type that carries it** — `BasicApp_*` is set by
five appearance types, `RectApp_*` by three, and `FLDustField` (a field) sets `SphereEmitter_MaxRadius`
and `ParticleApp_UseDynamicRotation`. Nothing may be inferred about type from properties, or the
reverse.

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

Every node must have a `Node_Name` string property. Instances reference nodes by the CRC of this
name, so a node without it cannot be addressed. A name is always present, but not necessarily
non-empty.

| Category   | Node types                                                                                                                                                            |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base       | `FxNode`                                                                                                                                                              |
| Emitters   | `FxCubeEmitter`, `FxSphereEmitter`, `FxConeEmitter`                                                                                                                   |
| Appearance | `FxBasicAppearance`, `FLDustAppearance`, `FxOrientedAppearance`, `FxParticleAppearance`, `FxMeshAppearance`, `FxRectAppearance`, `FxPerpAppearance`, `FLBeamAppearance` |
| Fields     | `FxRadialField`, `FxCollideField`, `FxTurbulenceField`, `FxAirField`, `FxGravityField`, `FLDustField`, `FLBeamField`                                                   |

### Name hashing is case-sensitive

Alchemy is the one place in the format where Freelancer hashes with character case left alone, which
is why `getNodeByCRC` passes `caseSensitive` to `getResourceId`. Folding case the way every other CRC
lookup in this library does strands roughly half the instance references in the game.

Effect names too, and that is checkable from outside the container — see
[`effect_crc` pins the rule](#effect_crc-pins-the-rule) and [Corpus](#hashing).

## Animation types

### `EaseType`

The byte indexes a table of seven easing functions in retail `alchemy.dll` (`0x6257c20`, filled at
`0x6242880`), and the loader stores it raw. Each function is `a + (b − a) · f(t)`:

| Value | Name          | `f(t)`                                       | DLL         |
| ----- | ------------- | -------------------------------------------- | ----------- |
| 0     | `Step`        | 0 — hold the earlier value                   | `0x6242970` |
| 1     | `Linear`      | `t`                                          | `0x6242980` |
| 2     | `QuadIn`      | `t²`                                         | `0x62429a0` |
| 3     | `QuadOut`     | `1 − (1 − t)²`                               | `0x62429c0` |
| 4     | `Smooth`      | `t²(3 − 2t)`                                 | `0x62429f0` |
| 5     | `Auto`        | `QuadIn` if `a < b`, `QuadOut` otherwise     | `0x6242a20` |
| 6     | `AutoInverse` | `QuadOut` if `a < b`, `QuadIn` otherwise     | `0x6242a70` |

A byte past 6 indexes off the end of the table. See [Easing outside the enum](#easing-outside-the-enum).

### `WrapFlags`

What a looped curve does past each end. **It is two four-bit modes, not a bitfield**: the low nibble
governs keys before the first keyframe, the next nibble keys after the last, and `alchemy.dll`
switches on each (`0x6246b00`, `0x6246c2f`):

| Mode | Before              | After              | Past the end                                                    |
| ---- | ------------------- | ------------------ | --------------------------------------------------------------- |
| 0    | —                   | —                  | Hold that end's value                                           |
| 1    | `BeforeCycle`       | `AfterCycle`       | Wrap the key back through the range                             |
| 2    | `BeforeCycleOffset` | `AfterCycleOffset` | Wrap, and add the curve's total rise once per range overrun      |
| 3    | `BeforeOscillate`   | `AfterOscillate`   | Wrap, reflecting every other range                              |
| 4    | `BeforeLinear`      | `AfterLinear`      | Extend along that end's tangent — in-tangent before, out after  |

A nibble past 4 falls through into the in-range search with an out-of-range key, which is undefined;
`hermiteAt` holds. The word is 16 bits on disk and only its low byte is read.

The earlier reading — repeat, mirror, clamp and continue as independent bits — agrees with this one
only on `0x01` and `0x10`. See [Corpus](#wrap-words).

### Containers

- **`FloatKeyframe`** — `{ key, value }`
- **`VectorKeyframe`** — `{ key, x, y, z }`
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
  order: TransformOrder // [number, number, number]
  position?: TransformPoint // x, y, z as AnimatedCurve
  rotation?: TransformPoint
  scale?: TransformPoint
}
```

The header is **four bytes, not a flag word**. `alchemy.dll`'s reader (`0x62280a0`) takes the first
three as signed order bytes and packs them into one nibble word, `b0 << 8 | b1 << 4 | b2`; retail's
`04 03 05` is the DLL's own default `0x435`, exported as `DefaultTransformOrder`. Nothing evaluates
that word — only a copy, the reader and the writer touch it, and the transform builder applies
`T · S · Rz · Rx · Ry` regardless — so `transformAt` ignores it too. What the three values name is
the authoring tool's business; read as x = 3, y = 4, z = 5 they spell the builder's own order, y then
x then z, but nothing in the DLL says so.

Of the fourth byte the reader tests **only the sign bit**: set, nine curves follow; clear, none do and
the transform is the identity. The DLL's writer (`0x6227ef0`) derives it rather than storing it —
`0x80` and the curves when any channel differs from its default, `0x00` alone when none does — and so
does `writeTransform`: `0x80` when all three points are present, `0x00` otherwise. The other seven
bits are written as zero and never read, so they are not kept.

## Evaluation

Every animated property is a function of two axes: **`p`** (sparam), an external control value the
engine supplies to blend between animation states, and **`t`**, the inner key. The outer animation is
keyed on `p`, the inner on `t`. What `t` *is* — particle age over lifespan, effect time, a normalized
distance — is decided by the code sampling each property, not here.

Every rule below is ported from retail `alchemy.dll`, which evaluates in three places:

| Level                     | DLL class          | Evaluator   | Out of range               |
| ------------------------- | ------------------ | ----------- | -------------------------- |
| Sparam (outer)            | `AnimatedFloat` / `AnimatedColor` / `AnimatedCurve` | `0x6207740` / `0x6207ef0` / `0x6206f90` | Holds the first or last inner list |
| Eased list (inner)        | `FxRampSingle`, `FxRampColor` | `0x6242b10`, `0x62424b0` | Holds the first or last value |
| Looped list (inner)       | `FxAnimatedSingle` | `0x62469f0` | By [`WrapFlags`](#wrapflags) |

- **A key on or past the last keyframe returns that keyframe's value**, at both eased levels, before
  any easing runs — so a `Step` list reaches its last value exactly on its last key.
- **`sparamLevel` is that level alone**, and `floatAt`, `colorAt` and `curveAt` are each it plus
  their inner evaluator — so a caller evaluating the inner lists elsewhere, once `p` is fixed for a
  whole effect instance, resolves the level the same way.
- **The sparam level eases with its own inline code**, not the table, and has `Auto` and
  `AutoInverse` the other way round. Retail's outer lists use only `Smooth`, `Linear` and `QuadIn`,
  so the swap is never exercised.
- **Colour lists ease in bytes.** `FxRampColor` stores each key packed as `0x00RRGGBB` through
  `_ftol(c × 255)`, unclamped (`0x62098e0`), turns the easing into an integer weight
  `w = _ftol(f(t) × 255)`, and moves each channel by `(b − a) × w >> 8` (`0x6241cd0`). A span
  therefore never quite reaches its far key from inside, and `Auto` compares the two packed words.
  The sparam level above blends the results in float, and its `Auto` compares component sums.
- **A looped curve takes its tangents exactly as stored** — the loader never recomputes them
  (`0x6227a20`). On keys shared by several keyframes the last of them wins, and an out-tangent whose
  bits are all set steps rather than bends (`0x6246987`); no retail keyframe carries one.

Keyframe lookup for the eased levels comes from the math module: `at(keyframes, key)` returns
`{ start, end, span }`, where `span` is the normalized position between the two keyframes.

### Degenerate data

The data the readers accept is looser than an evaluator naturally assumes. Three shapes occur often
enough to matter, and none may produce `NaN` or throw — the game loads all of these files:

| Shape                          | Result                              |
| ------------------------------ | ----------------------------------- |
| Looped list spanning no range  | The single value, or the last of several on one key |
| Easing byte outside `EaseType` | Linear — undefined in the game, see below |
| Empty keyframe list            | `default`, or zero                  |

A list of one keyframe, or of several sharing a key, spans no range, and `limit` remapping the
sampling key through it is a division by zero. `limit` returns the point itself before remapping.

An empty looped list falls back to its `default` field, as the DLL does. An eased list has no such
field, so an empty one contributes zero here — the DLL has no guard for one at all.

### Tangents scale with the interval

A `VectorKeyframe`'s tangents are stored per unit of key, and the standard Hermite basis is over a
normalized parameter, so it wants them per unit of span. The two convert by the width of the interval
being crossed, and `hermiteAt` scales by `delta = end.key - start.key`.

The DLL multiplies both tangents by the interval (`0x62469bf`). Retail key axes are almost never one
unit wide, so dropping the conversion multiplies every tangent by `1/delta` — on a typical 0.03-wide interval, an overshoot of thirty times. What keeps the mistake
invisible is that almost every retail keyframe is flat, and a flat Hermite is the same smooth step
under either reading.

The degenerate lists need no guard: `at` skips zero-length spans, and a single keyframe comes back
with `start === end`, so the interval is zero exactly where `span` is 0 or 1 — the endpoints, where
`hermite` returns the keyframe value and never reads a tangent.

### Easing outside the enum

Seven inner lists carry a byte past the table, all junk in one unplayed effect
([Corpus](#easing-bytes-outside-easetype)). The DLL would read whatever follows the table, but every
one sits on a list of a single keyframe, and an eased list returns a lone keyframe's value without
calling an easing. `ease` treats such a byte as `Linear` so evaluation cannot return `undefined`. The
raw byte is preserved on read and written back unchanged.

The two 6s once counted here are the table's seventh entry, `AutoInverse`.

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

Instances form a tree via `children`; cross-tree links — an appearance bound to an emitter — are
`targets`, serialized as the separate flat `Pair` records. Walking only `children` finds the nodes
and none of the pairings.

### The `flags` field marks a container, not the CRC

An instance whose `flags` is non-zero references no node, and its `crc` carries nothing — it may hold
any value. Retail writes `0xee223b51` in every one of them, residue from Digital Anvil's in-house
authoring tool rather than a value the format defines. `DefaultId` names that residue so it can be
recognized; it is not the mechanism, and a reader that tests it instead of the flag is right about
retail by coincidence. See [Corpus](#the-container-instance).

Because retail never writes any other flag value, whether the field is a bitfield or an enum is
untested: read non-zero as "no node reference" and infer nothing further.

The constant is written `0xee223b51 | 0` because instance CRCs are read with `readInt32`.

### Entry identifiers are not derivable

`id` holds the `childId` the entry was read with. Retail identifiers are sparse, unordered handles
the authoring tool left behind rather than a numbering the tree implies — `br_mine01_blast50` stores
its five entries as `3, 6, 7, 1, 2`. They are preserved on read and reused on write; an instance
built by hand and given no `id` is numbered around whatever ids are already taken.

### Pair ordering is not preserved

The order of the flat `Pair` records is the one thing that does not survive a round trip. The writer
emits them in traversal order; the links themselves are always identical, so re-reading the output
reproduces the model exactly and writing it again is a fixed point.

Retail order follows no rule the corpus can recover. Sorting by source id, by target id, by entry
order and by traversal order were each checked, and the best explained three quarters of the effects
— some files store their pairs ascending by source, others descending. Authoring residue.

## Notes

### `effect_crc` pins the rule

The eight `DATA/FX/*/*_ale.ini` files carry a `[VisEffect]` entry per effect, holding the `.ale` path
and an `effect_crc` — a signed `int32` that is the only link into the file. There is no name field
beside it and no fallback if it matches nothing, so the entry's own `nickname` takes no part in the
lookup.

Node and property names never leave the file, so their hashing could have been one loader's
convention; `effect_crc` is Digital Anvil's build tool writing the same hash into a table the game
parses separately, which makes case-sensitivity a property of the format rather than an
implementation detail. Reading those INIs is the consumer's.

## API

### `./alchemy`

| Export               | Kind      |                                                                                                    |
| -------------------- | --------- | -------------------------------------------------------------------------------------------------- |
| `Alchemy`            | interface | Both libraries of one `.ale`, which are only ever found together.                                  |
| `AnimatedColor`      | type      | `EaseAnimation<Keyframe & EaseAnimation<VectorKeyframe>>` — a colour over param and over age.      |
| `AnimatedCurve`      | type      | `EaseAnimation<Keyframe & LoopAnimation<VectorKeyframe>>` — the looping form.                      |
| `AnimatedFloat`      | type      | `EaseAnimation<Keyframe & EaseAnimation<FloatKeyframe>>`.                                          |
| `Animation`          | interface | `{ keyframes: T[] }`, the base of both animation forms.                                            |
| `Blending`           | interface | `{ source: BlendingMode, target: BlendingMode }`.                                                  |
| `BlendingMode`       | enum      | Blend factor, which is `D3DBLEND` verbatim.                                                        |
| `colorAt`            | function  | `(animation: AnimatedColor, p, t): Vector3`                                                        |
| `curveAt`            | function  | `(animation: AnimatedCurve, p, t): number`                                                         |
| `DefaultId`          | const     | CRC of the root container every effect hangs its instances from.                                   |
| `DefaultTransformOrder` | const  | The order bytes every retail transform carries, and `alchemy.dll`'s own default (`0x435`).         |
| `ease`               | function  | `(type: EaseType, a, b, t): number`                                                                |
| `EaseAnimation`      | interface | An `Animation` with an `easing` type.                                                              |
| `EaseType`           | enum      | Easing animation type. The list may be incomplete.                                                 |
| `easeVector`         | function  | `(type: EaseType, a: Vector3, b: Vector3, t): Vector3`                                             |
| `Effect`             | interface | One named effect: a tree of `NodeInstance` children, plus four undecoded fields.                   |
| `EffectLibrary`      | interface | Effect library.                                                                                    |
| `floatAt`            | function  | `(animation: AnimatedFloat, p, t): number`                                                         |
| `FloatKeyframe`      | interface | `Keyframe & { value: number }`.                                                                    |
| `floatWhen`          | function  | An eased list carries no fallback the way a looped one does, so an empty list contributes nothing. |
| `getNodeByCRC`       | function  | Finds node by CRC.                                                                                 |
| `getNodeByName`      | function  | Finds node by name.                                                                                |
| `getNodeName`        | function  | Retrieves alchemy node name from property `Node_Name`.                                             |
| `hasAlchemy`         | function  | Whether the directory carries an effect library, asked before reading it.                          |
| `hermiteAt`          | function  | `(animation: LoopAnimation<VectorKeyframe>, key): number`                                          |
| `limit`              | function  | `(flags: WrapFlags, start, end, key): { key, count }`                                              |
| `LoopAnimation`      | interface | An `Animation` with a `default` and `WrapFlags`.                                                   |
| `Node`               | interface | Alchemy node. Type determines how it is used.                                                      |
| `NodeInstance`       | interface | One placement of a node inside an effect: `crc`, `flags`, `sort`, children.                        |
| `NodeLibrary`        | interface | Alchemy node library.                                                                              |
| `NodeType`           | type      | Known alchemy node types.                                                                          |
| `Property`           | type      | Alchemy node property.                                                                             |
| `PropertyName`       | type      | Known alchemy node property names.                                                                 |
| `PropertyType`       | enum      | Alchemy node property type.                                                                        |
| `readAlchemy`        | function  | Reads both libraries from a directory, looking for the two names within.                           |
| `readEffectLibrary`  | function  | Reads effect library.                                                                              |
| `readNodeLibrary`    | function  | Reads node library.                                                                                |
| `setNodeName`        | function  | Assigns alchemy node name.                                                                         |
| `sparamLevel`        | function  | `(animation: EaseAnimation<T>, p): SparamLevel<T> \| undefined` — the sparam level alone.          |
| `SparamLevel`        | interface | `{ lower, upper, span, easing }`: the two inner lists `p` lands between, and how they blend.       |
| `Transform`          | interface | Animated transform.                                                                                |
| `transformAt`        | function  | `(point: Transform, p, t): TransformAt`                                                            |
| `TransformAt`        | interface | A sampled transform: `position`, `rotation`, `scale`.                                              |
| `TransformOrder`     | type      | The three order bytes a transform opens with, stored but never evaluated.                          |
| `TransformPoint`     | interface | Animated transform point — three `AnimatedCurve`s.                                                 |
| `transformPointAt`   | function  | `(point: TransformPoint, p, t): Vector3`                                                           |
| `VectorKeyframe`     | interface | `Keyframe & { value: Vector3 }`.                                                                    |
| `vectorWhen`         | function  | Empty vector list, as `floatWhen`.                                                                 |
| `WorldId`            | const     | Parent identifier standing in for the world, i.e. the instance is a root.                          |
| `WrapFlags`          | enum      | Looped animation out-of-bounds toggles.                                                            |
| `writeAlchemy`       | function  | Writes both libraries as the two sibling directories they are.                                     |
| `writeEffectLibrary` | function  | Writes effect library.                                                                             |
| `writeNodeLibrary`   | function  | Writes node library.                                                                               |

## Corpus

`corpus.test.ts` reads every `.ale` in the game.

|                                  | Count  |
| -------------------------------- | ------ |
| Files                            | 596    |
| Nodes                            | 5,575  |
| Effects                          | 1,213  |
| Node instances                   | 6,648  |
| — referencing a node             | 5,505  |
| — containers (`flags` non-zero)  | 1,143  |
| Properties carrying a blend pair | 2,658  |
| `AnimatedCurve` properties       | 26,617 |
| Transform properties             | 5,590  |

Nothing throws, and every instance CRC is defined in the library in its own file — **an observation
about the exporter, not the namespace**, which is global like every other CRC space here. 146 of the
5,429 distinct node names are defined in more than one `.ale` and 111 of those disagree, so 219
references resolve differently depending on which file loaded last. Retail uses seventeen of the node
types; `FxNode` and `FxOrientedAppearance` are declared but never appear.

Instanced node types, and the split by category, are in
[RENDERER.md §9.2](../refs/RENDERER.md#92-what-actually-draws).

### Hashing

| Lookup                        | Resolves                          |
| ----------------------------- | --------------------------------- |
| Case-sensitive (this library) | **all 5,505 instance references** |
| Case-folded                   | 2,814 — 2,691 stranded            |

2,660 of the 5,429 distinct node names are mixed case. Property names are hashed the same way.

From the other side, `effect_crc` in the eight `*_ale.ini` files is `getResourceId(name, true)` on
all 1,218 entries, 60 of which are mixed case and every one of those matching case-sensitive and none
case-folded. Folding resolves a strict subset of 1,150 and gains nothing.

Every one of the 5,575 nodes carries `Node_Name`, and names are unique within a library. Exactly one
— an `FxConeEmitter` in `FX/EXPLOSIONS/gf_explosion_br_large01.ale` — has it set to the empty string,
which hashes to zero; no instance references it.

### Blend pairs

Nine distinct pairs occur, and one is 2,489 of the 2,658: `SourceAlpha`/`One`, plain additive
blending. `SourceAlpha`/`InverseSourceAlpha` accounts for 161 more, and the remaining seven pairs for
one or two each. `FX/EXPLOSIONS/gf_small_damage.ale`'s `gf_small_damage_smoke2.app` writes
`BothSourceAlpha` (13) as a target.

### The container instance

Across the 6,648 instances, `flags` takes only the values 0 (5,505 times) and 1 (1,143 times), every
flagged instance carries `0xee223b51`, and no unflagged one does. The two conditions coincide
perfectly, so the flag is the mechanism on grounds outside the data.

The container occurs 1,143 times, always at root, never as either end of a link, and its direct
children always have `flags` 0; 1,143 of the 1,213 effects have exactly one and the remaining 70 have
none. No name in any library hashes to `0xee223b51`.

### Effect library versions

Retail ships two: 1.1 in 501 files and 1 in 95. Only 1.1 carries the four `unknown` floats.
`unknown4` is never negative anywhere and ranges up to 56, while the other three are unconstrained in
sign — consistent with a centre and radius bounding the effect, though nothing confirms it. On a
version 1 library they are absent and read back as zero.

### Degenerate animation data

The 27,662 looped lists behind the 26,617 `AnimatedCurve` properties break down as 14,127 empty,
11,791 holding a single keyframe, and 1,744 holding more — 40 of which put every keyframe on the same
key. Before `limit` was fixed, the division by zero put `NaN` into 10,831 of the 26,617 curve
properties and 1,155 of the 1,289 enabled transforms; wrap flags that clamp masked it.

Seven retail properties hold an empty eased list: three where it is the only list (`BasicApp_Rotate`
on the rain appearances, so the property is zero throughout), and four in `no_engine.app` where it
sits at outer key 0 beside a populated list at key 1, which then ramps up out of zero as sparam
rises.

Evaluating the corpus is a separate check from reading it, and a stricter one: every animated
property in the game is sampled across a grid of sparam and time values, and every component of every
result must be a finite number.

### Tangent intervals

Across the 596 files, 9,322 of 9,324 adjacent-keyframe intervals are something other than 1 — key
axes are not normalized to a lifetime, and one rotation curve in `FX/SPACE/gf_neutronstar.ale` is
keyed over 0–360.

What keeps a missing interval scale invisible is that only 562 of 25,081 keyframes carry a non-zero
tangent at all. The disagreement is confined to 142 lists across 54 files, concentrated in
`Node_Transform` position and rotation (96 lists) and `Emitter_Frequency` (28).

### Easing bytes outside `EaseType`

Nine inner keyframe lists in the whole corpus carry a byte past `Auto`. Seven are past the table; the
two 6s are `AutoInverse`, and were counted here before the table was read:

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

The seven in `gf_bolt01.ale` are junk. Every one has bit 3 set and its low three bits clear (`0x08`,
`0x78`, `0x88`, `0xF8`) — a shape no six-value enum produces — and sits on a list of a single
keyframe, so nothing reads it. That file is registered in `FX/WEAPONS/weapons_ale.ini` but named by
no `[Effect]` entry in `FX/effects.ini`.

`AutoInverse` and `FLDustAppearance` imply one another across the entire corpus. `FLDustAppearance` is one
of the four node types Digital Anvil added on top of stock Alchemy (with `FLDustField`,
`FLBeamAppearance` and `FLBeamField`). It has exactly two instances in the game, and both use easing
6; no other node type uses 6 anywhere in 5,575 nodes. Every other dust effect — `icedust`,
`leedsdust`, `snowdust`, `asteroiddust`, `golddust`, the `attractdust` family and the rest — is the
same effect built from stock `FxBasicAppearance` with easing 4 on the same four-keyframe alpha shape.

Set `dust.ale` beside `icedust.ale`:

|                              | `dust` / `motionblur_dust`                                      | `icedust` / `leedsdust` / … |
| ---------------------------- | --------------------------------------------------------------- | --------------------------- |
| Appearance node              | `FLDustAppearance`                                              | `FxBasicAppearance`         |
| Alpha easing                 | **6**                                                           | 4 (`Smooth`)                |
| Emitter                      | `FxSphereEmitter`, frequency 5000, `InitLifeSpan` 10, radius 60 | identical                   |
| Field                        | `FLDustField`, radius 60.1                                      | identical                   |
| Effect type in `effects.ini` | `EFT_MOTION_DUST`                                               | `EFT_MISC_DUST`             |

The appearance node type and the easing byte are the only differences, and `FLDustAppearance`
declares no property `FxBasicAppearance` lacks. Both curves rise then fall, so `AutoInverse` eases the
fade in out and the fade out in, where `Smooth` on the stock dust eases both ends of each.

Both curves are a fade in, a hold, and a fade out, with the outer easing set to `Smooth`:

| List                        | Keyframes (`key` → `value`)                    |
| --------------------------- | ---------------------------------------------- |
| `dust.ale` alpha            | 0 → 0, 0.25 → 0.35, 0.5 → 0.35, 1 → 0          |
| `motionblur_dust.ale` alpha | 0 → 0, 0.2693 → 0.5382, 0.5193 → 0.5382, 1 → 0 |

### Wrap words

Across every looped list in the corpus — `AnimatedCurve` properties and the nine curves of each
enabled transform — six words occur:

| Word   | Before      | After       | Lists  | Spanning a range |
| ------ | ----------- | ----------- | ------ | ---------------- |
| `0x00` | hold        | hold        | 38,715 | 1,465            |
| `0x01` | cycle       | hold        | 7      | 0                |
| `0x10` | hold        | cycle       | 623    | 503              |
| `0x20` | hold        | cycle with offset | 4 | 3              |
| `0x30` | hold        | oscillate   | 4      | 3                |
| `0x33` | oscillate   | oscillate   | 2      | 2                |

The eight spanning lists under `0x20`, `0x30` and `0x33` are all in `FX/MISC/standardeffects.ale`, and
all but one are `Node_Transform` rotation: a 0→360 spin on `FlameThrower_Cone.emt` and
`Trippy_box.emt` under `0x20`, and a ±20° wobble on the two `blackhole_spout_Cone.emt` nodes under
`0x30` and `0x33`. Read as the old bitfield, the spins mirrored and the wobble snapped back. No word
uses linear, and none carries a nibble past 4.

### Transform headers never vary

A sweep over all 5,590 transform properties turns up exactly two headers, both with the default
order bytes `04 03 05`:

| Header        | Curve byte | Count | Payload     |
| ------------- | ---------- | ----- | ----------- |
| `04 03 05 00` | `0x00`     | 4,301 | none        |
| `04 03 05 80` | `0x80`     | 1,289 | nine curves |

They fall on `Node_Transform` (5,575 — one per node), the unnamed `0x0BA0B3BB` on `FLBeamAppearance`
(11, never enabled) and `MeshApp_ParticleTransform` (4, one enabled).

The curve byte says only whether the transform is the identity: the payload is always all nine curves,
and the order bytes stay constant while the set of channels that carry keyframes varies seven ways
beneath them:

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

Five property CRCs match no name in the published Alchemy list, and all five sit on the two node
types Digital Anvil added themselves. Their types are recovered from the stream, so they read and
write correctly — only the labels are missing.

| Hash         | Type            | Node type          | Observed values |
| ------------ | --------------- | ------------------ | --------------- |
| `0x1C65B7B9` | `Boolean`       | `FLBeamAppearance` | always `false`  |
| `0x03503B61` | `Boolean`       | `FLBeamAppearance` | always `true`   |
| `0x0ABE0402` | `Boolean`       | `FLBeamAppearance` | always `false`  |
| `0x0BA0B3BB` | `Transform`     | `FLBeamAppearance` | —               |
| `0xE63AA248` | `AnimatedCurve` | `FLDustField`      | —               |

`BeamApp_LineAppearance`, which the name list does carry, never appears in retail under its own hash
— `getResourceId('BeamApp_LineAppearance', true)` is `0xED1AC1D7`, which is none of the five. That
rules out a hash collision, not the property.

### Round-trip

Everything is byte for byte, and writing is a fixed point in every file, with two exceptions, both
authoring residue that carries no meaning:

| What                             | Files affected | Detail                                                                                                                                  |
| -------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Empty-string encoding            | 2 of 596       | `FX/WEAPONS/flashgrenade.ale` and `FX/MISC/rtc_vanceimpact.ale` come back two bytes longer; both hold one string that was authored blank |
| Order of the flat `Pair` records | 146 of 596     | The links themselves are identical                                                                                                      |

## TODO

Everything below reads, writes and round-trips byte for byte, so a one-byte edit is a controlled
test. Items a `todo` test reports on every run are marked.

### The four `Effect` floats

Version 1.1 libraries carry `unknown1..4` per effect, consistent with a centre and radius bounding
the effect but unconfirmed. *Experiment*: inflate `unknown4` on a small effect and see whether it
survives being culled at a distance or off the edge of the screen where it previously vanished.

### The five unnamed property hashes

Four on `FLBeamAppearance`, one on `FLDustField` (see [Corpus](#the-five-unnamed-property-hashes)).
Retail `alchemy.dll` has since settled what each *does*, though not what any is called:

| Hash         | In the DLL                                                                    |
| ------------ | ----------------------------------------------------------------------------- |
| `0x1C65B7B9` | Switches the beam to wireframe with no texture — Librelancer's `BeamApp_LineAppearance` |
| `0x03503B61` | Accepted and discarded; reads back `false`                                    |
| `0x0ABE0402` | Accepted and discarded; reads back `false`                                    |
| `0x0BA0B3BB` | Stored and never read                                                         |
| `0xE63AA248` | Absent — nothing compares against it, so the game ignores it                   |

`BeamApp_LineAppearance` still does not hash to `0x1C65B7B9`, so if that is its name the published
spelling differs from the one the exporter hashed. The names are what remains open, and nothing in the
binary carries them.
