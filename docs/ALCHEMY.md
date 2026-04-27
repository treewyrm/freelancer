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

### Evaluation functions

| Function                        | Description                                                                                                                                                                      |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `at(keyframes, key)`            | Binary search returning `{ before, ahead, span }` for interpolation                                                                                                              |
| `ease(type, a, b, t)`           | Scalar interpolation by easing type                                                                                                                                              |
| `limit(flags, start, end, key)` | Applies `WrapFlags` to remap a key, returns `{ key, count }`                                                                                                                     |
| `floatAt(animation, p, t)`      | Evaluates `AnimatedFloat` at sparam `p` and time `t`                                                                                                                             |
| `colorAt(animation, p, t)`      | Evaluates `AnimatedColor` at `p` and `t`, returns `Vector`                                                                                                                       |
| `curveAt(animation, p, t)`      | Evaluates `AnimatedCurve` via Hermite spline at `p` and `t`                                                                                                                      |
| `transformAt(transform, p, t)`  | Evaluates a `Transform` at `p` and `t`; returns `{ flags, position, rotation, scale }` as `Vector` each; missing components default to zero-vector (scale defaults to `{1,1,1}`) |

The two-axis evaluation (`p`, `t`) allows properties to vary both over a particle's lifespan (`t`) and over an external control value `p` (referred to in-game as **sparam**). `sparam` is supplied by the game engine to blend between animation states — for example, transitioning an engine thruster effect between idle and full throttle.

---

## `effect.ts` — Effect Library

### `NodeInstance` interface

```ts
interface NodeInstance {
  crc: number // CRC of the referenced node name
  flags: number // display flags
  sort: number // serialization order
  children: NodeInstance[]
  targets: NodeInstance[]
}
```

Instances form a tree via `children`. Cross-tree links (e.g. appearance→emitter bindings) are stored as `targets`, which are serialized as separate flat `Pair` records.

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

The flat `Entry` structure `{ flags, crc, parentId, childId }` is reassembled into the tree using `assemble` / `flatten` from `hierarchy.ts`. `parentId >= WorldId (0x8000)` means the instance is a root child. `DefaultId = 0xee223b51` is a sentinel value used as a default identifier.

### Constants

| Constant    | Value        | Description                                |
| ----------- | ------------ | ------------------------------------------ |
| `WorldId`   | `0x8000`     | Parent ID indicating a root-level instance |
| `DefaultId` | `0xee223b51` | Default/sentinel node instance identifier  |

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
