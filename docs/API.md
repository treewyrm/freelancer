# API

Every name reachable from a subpath export, listed once, so nothing useful stays hidden behind a
barrel that never re-exported it. **505 exports across 21 entry points.** The format documents say
what the bytes mean; this one says what you can import.

Resolved from `src/` with the TypeScript checker rather than transcribed from the barrels, because
five of them use `export *` and one adds declarations of its own. Whenever an `index.ts` changes,
this list is what changes with it.

## Entry points

| Entry point      | Exports | What it is                                                                |
| ---------------- | ------- | ------------------------------------------------------------------------- |
| `.`              | 12      | hashing and name resolution — the one thing every module shares           |
| `./utility`      | 26      | `BufferView`, windows-1252, C-style number parsing, tree walks            |
| `./math`         | 28      | vectors, quaternions, `Matrix3`/`Matrix4`, `Transform`, scalar and keyframe helpers |
| `./utf`          | 4       | the UTF container: `Directory`, `File`                                    |
| `./alchemy`      | 51      | `.ale` node and effect libraries, and the animation evaluators            |
| `./animation`    | 36      | joint and object animation scripts                                        |
| `./vmesh`        | 32      | geometry: `VMeshData`, `VMeshRef`, LOD ranges, wireframes                 |
| `./compound`     | 14      | `Cmpnd` hierarchy, constraints, hardpoints                                |
| `./rigid`        | 24      | `.3db`/`.cmp` parts, cameras, spheres, material animations                |
| `./surface`      | 8       | `.sur` collision hulls                                                    |
| `./texture`      | 41      | `.txm` libraries, DDS, Targa, DXT and 16-bit expansion                    |
| `./material`     | 13      | `Material library` entries and the shader-name tables                     |
| `./deformable`   | 23      | `.dfm` character models                                                   |
| `./ini`          | 24      | INI in any of the three encodings, plus the section/property accessors    |
| `./ini/text`     | 4       | text INI only                                                             |
| `./ini/binary`   | 14      | BINI only, and its layout constants                                       |
| `./ini/save`     | 6       | `.fl` saves: text under a positional XOR mask                             |
| `./thn`          | 16      | scene scripts in either encoding, interim layer                           |
| `./thn/text`     | 3       | Lua source only — the whole write path                                    |
| `./thn/bytecode` | 10      | compiled Lua 3.2 chunks, read only                                        |
| `./thn/scene`    | 67      | the typed scene layer: entities and events                                |
| `./resource`     | 57      | resource DLLs, `ids_name` strings and `ids_info` infocards                |

`./ini` re-exports `binary`, `save`, `text` and `value` as namespaces, and `./thn` re-exports
`bytecode`, `text` and `value` the same way, so the split subpaths are a convenience rather than the
only route.

## How to read this

`kind` is what the checker reports, which is not always what the source line says. Six names in
`./math` are an interface and a `const` object under one identifier — `Vector3` is both the shape
and the namespace of operations on it — and those carry their own member tables below. The third
column is the first sentence of the doc comment, or the signature when there is no comment.

---

## `.`

The hash functions. `getResourceId` is UTF-side (mesh names, material names, Alchemy nodes),
`getObjectId` is INI-side (archetypes, system objects).

| Export            | Kind     |                                                                                       |
| ----------------- | -------- | ------------------------------------------------------------------------------------- |
| `filterObjects`   | function | `<T>(items, predicate, value, caseSensitive?): T[]`                                   |
| `filterResources` | function | `<T>(items, predicate, value, caseSensitive?): T[]`                                   |
| `getObject`       | function | Finds object matching key value.                                                      |
| `getObjectId`     | function | Gets object id (archetypes, system objects, etc).                                     |
| `getResource`     | function | Finds resource matching key value.                                                    |
| `getResourceId`   | function | Gets asset/resource id (model parts, material and texture references, alchemy nodes). |
| `Hash`            | type     | A resolved 32-bit id.                                                                 |
| `Hashable`        | type     | What a lookup accepts: a name, an id, or bytes.                                       |
| `Hasher`          | type     | `(item: T) => Hashable` — how a lookup gets a key out of an item.                     |
| `setObject`       | function | Sets object in array (replaces existing object matching key).                         |
| `setResource`     | function | Sets resource in array (replaces existing resource matching key).                     |
| `toBytes`         | function | Converts hashables into bytes, encoding a string as windows-1252.                     |

## `./utility`

| Export             | Kind      |                                                                                         |
| ------------------ | --------- | --------------------------------------------------------------------------------------- |
| `atof`             | function  | C `atof`: leading whitespace, then as much of a decimal or exponential float as parses. |
| `atoi`             | function  | C `atoi`: leading whitespace, an optional sign, then digits until the first non-digit.  |
| `BufferView`       | class     | `DataView` with an internal cursor, for reading and writing in sequence.                |
| `classify`         | function  | Classifies a text token the way the BINI compiler did.                                  |
| `encoding`         | namespace | windows-1252 `decode` / `encode` / `byteLengthOf`.                                      |
| `equals`           | function  | Compares two names the way the game compares them.                                      |
| `findTreeElement`  | function  | `<T extends Tree<T>>(root, predicate): T \| undefined`                                  |
| `fold`             | function  | Case-folds ASCII only, which is what `stricmp` does, and so every name lookup.          |
| `formatFloat32`    | function  | Shortest decimal text that reads back as exactly the same `float32`.                    |
| `formatInt32`      | function  | Text that parses back as exactly the same `int32`.                                      |
| `fromDOSTimestamp` | function  | Convert DOS timestamp to `Date`.                                                        |
| `fromFileTime`     | function  | `(value: bigint): Date`                                                                 |
| `INT32_MAX`        | const     | Inclusive upper bound of a BINI integer value.                                          |
| `INT32_MIN`        | const     | Inclusive lower bound of the same.                                                      |
| `isHex`            | function  | `(value: string): boolean`                                                              |
| `isInt32`          | function  | `(value: number): boolean`                                                              |
| `listTreeElements` | function  | `<T extends Tree<T>>(parent): Generator<T>`                                             |
| `listTreePairs`    | function  | `<T extends Tree<T>>(parent): Generator<Parenthesis<T>>`                                |
| `Parenthesis`      | interface | A parent-child pair representing a link in a hierarchy.                                 |
| `parseHex`         | function  | `(value: string): number`                                                               |
| `reduceTree`       | function  | `<T extends Tree<T>, R>(root, reducer, initial): R`                                     |
| `toDOSTimestamp`   | function  | Convert `Date` to DOS timestamp.                                                        |
| `toFileTime`       | function  | `(date: Date): bigint`                                                                  |
| `toHex`            | function  | `(value, byteLength?, prefix?): string`                                                 |
| `Tree`             | interface | Tree node recursively containing child nodes.                                           |
| `trim`             | function  | `(value: string): string`                                                               |

### `BufferView` statics

`allocate(length)`, `concat(views)`, `join(...views)`, `from(string)`.

### `BufferView` instance

Cursor state — `offset`, `byteRemain`, `bytes`, `littleEndian`, `rewind()`, `slice()`, `subarray()`,
`findTerminator(offset)` — on top of the whole `DataView` surface. Paired cursor accessors:
`readUint8`/`writeUint8`, `readInt8`, `readUint16`, `readInt16`, `readUint32`, `readInt32`,
`readBigUint64`, `readBigInt64`, `readFloat32`, `readFloat64`, plus `readBuffer`/`writeBuffer`,
`getBuffer`/`setBuffer`, `readString`/`writeString`, `getString`/`setString`,
`readStringZ`/`writeStringZ`, `readHex`/`writeHex`.

## `./math`

| Export           | Kind      |                                                                            |
| ---------------- | --------- | -------------------------------------------------------------------------- |
| `AnimationRange` | interface | Animation query result: the keyframes either side of a key, and the blend. |
| `at`             | function  | `<T extends Keyframe>(keyframes, key): AnimationRange<T>`                  |
| `AxisAngle`      | interface | `{ axis: Vector3, angle: number }`                                         |
| `clamp`          | function  | `(a, min?, max?): number`                                                  |
| `equal`          | function  | `(a, b, epsilon?): boolean`                                                |
| `fract`          | function  | `(a): number`                                                              |
| `hermite`        | function  | `(p0, m0, p1, m1, t): number`                                              |
| `Keyframe`       | interface | `{ key: number }` — the base every keyframe list is ordered by.            |
| `lerp`           | function  | `(p0, p1, t): number`                                                      |
| `Matrix3`        | interface | 3x3 transformation matrix, and the namespace of operations on it.          |
| `Matrix4`        | interface | 4x4 matrix as four **columns**, and the namespace of operations on it.     |
| `mod`            | function  | `(a, b): number`                                                           |
| `pingPong`       | function  | `(a): number`                                                              |
| `quadIn`         | function  | `(t): number`                                                              |
| `quadOut`        | function  | `(t): number`                                                              |
| `Quat`           | type      | Quaternion — an alias of `Vector4`, plus its own operation namespace.      |
| `random`         | function  | `(min?, max?): number`                                                     |
| `remap`          | function  | `(a, aMin, aMax, bMin, bMax): number`                                      |
| `remapExp`       | function  | `(a, aMin?, aMax?, bMin?, bMax?): number`                                  |
| `remapLog`       | function  | `(a, aMin?, aMax?, bMin?, bMax?): number`                                  |
| `saw`            | function  | `(v, a?, p?): number`                                                      |
| `smooth`         | function  | `(t): number`                                                              |
| `smoother`       | function  | `(t): number`                                                              |
| `square`         | function  | `(v, a?, p?, duty?): number`                                               |
| `Transform`      | interface | Transformation stack element: `position` and `orientation`.                |
| `triangle`       | function  | `(v, a?, p?): number`                                                      |
| `Vector3`        | interface | 3D vector, and the namespace of operations on it.                          |
| `Vector4`        | interface | 4D vector, and the namespace of operations on it.                          |

The six namespaces carry the work, and none of it is reachable from the type name alone:

| Namespace   | Members                                                                                                                                                                                                                                                                                              |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Vector3`   | `identity`, `x`, `y`, `z`, `is`, `isNaN`, `isFinite`, `equal`, `dot`, `magnitude`, `normalize`, `angle`, `distance`, `copy`, `add`, `addScalar`, `subtract`, `subtractScalar`, `multiply`, `multiplyScalar`, `divide`, `divideScalar`, `cross`, `lerp`, `slerp`, `random`, `sphere`, `read`, `write` |
| `Vector4`   | `zero`, `x`, `y`, `z`, `w`, `is`, `isNaN`, `isFinite`, `equal`, `dot`, `magnitude`, `normalize`, `angle`, `distance`, `copy`, `add`, `addScalar`, `subtract`, `subtractScalar`, `multiply`, `multiplyScalar`, `divide`, `divideScalar`, `project`, `lerp`, `random`, `read`, `write` |
| `Quat`      | `identity`, `conjugate`, `multiply`, `axisAngle`, `getAxisAngle`, `fromTo`, `fromEuler`, `fromMatrix`, `transform`, `nlerp`, `slerp`                                                                                                                                                                 |
| `Matrix3`   | `identity`, `is`, `isNaN`, `isFinite`, `equal`, `transform`, `copy`, `determinant`, `transpose`, `invert`, `multiply`, `axisAngle`, `fromQuaternion`, `lookAt`, `push`, `read`, `write`                                                                                                              |
| `Matrix4`   | `identity`, `is`, `isNaN`, `isFinite`, `equal`, `copy`, `fromRotationTranslation`, `fromTRS`, `fromTransform`, `translation`, `scaling`, `transform`, `transformPoint`, `transformDirection`, `multiply`, `transpose`, `determinant`, `invert`, `toMatrix3`, `toTransform`, `decompose`, `toArray`, `toArray3`, `fromArray`, `perspectiveLH`, `orthographicLH`, `lookAtLH`, `push` |
| `Transform` | `identity`, `copy`, `transform`, `revert`, `multiply`, `interpolate`, `push`                                                                                                                                                                                                                         |

**`Vector4` mirrors `Vector3` except where four dimensions have no counterpart** — there is no
`cross` (the binary cross product is a 3D fact) and no `sphere`. Four differences are deliberate and
none of them are typos:

- The zero vector is **`zero`, not `identity`**. `Quat` is an alias of `Vector4` and `Quat.identity`
  is the identity *rotation* `(0, 0, 0, 1)`; two members named `identity` holding different values
  would be picked wrong. `Vector4.w` is that same `(0, 0, 0, 1)` in its role as a basis vector.
- **`Vector4.copy` defaults `w` to `1`, not `0`** — the identity rotation and a homogeneous *point*
  are the same four numbers, and both are what this type is for. So `Vector4.copy(vector3)` is the
  lift of a position into homogeneous coordinates, and `Vector4.copy({})` is `Quat.identity`.
- **There is no `Vector4.slerp`.** `Quat.slerp` is the arc interpolation, and it is the one that
  handles the double cover; a second, subtly different one would only ever be reached by mistake.
- **`Vector4.random` is uniform on the unit 3-sphere** (Shoemake), which for a unit quaternion is a
  uniformly distributed random rotation — not the same thing as four independent random components.

`Vector4.project` is the perspective divide — `xyz / w`, dropping `w` — that `Matrix4.transform`
leaves to the caller. It is the clip-space-to-NDC step; a direction (`w = 0`) has no projection, and
the infinities that come back say so rather than being clamped.

**`Matrix3` and `Matrix4` hold transposes of each other, deliberately.** A `Matrix3` on disk is nine
floats whose triples are the *rows* of a column-vector rotation matrix ([RENDERER.md
§2](RENDERER.md#matrices-upload-transposed-and-matrix3transform-is-the-odd-one-out)); a `Matrix4`
here is four `Vector4` **columns**, `w` being the translation, so `Matrix4.toArray` is a straight
concatenation and lands column-major — `uniformMatrix4fv` with `transpose = false`, or four
consecutive `mat4` attribute locations. `Matrix4.fromRotationTranslation` transposes on the way in,
which is what makes `Matrix4.multiply(a, b)` apply `b` first where `Matrix3.multiply(a, b)` read
against the file applies `a` first, and `Matrix4.push(stack, child)` compose `parent * child` where
`Matrix3.push` reads the other way. Nothing on disk is a 4x4 — joints, hardpoints and parts all
carry a `Matrix3` and a `Vector3` — so `Matrix4` has no `read`/`write` pair, only
`toArray`/`fromArray`.

## `./utf`

| Export      | Kind      |                              |
| ----------- | --------- | ---------------------------- |
| `Directory` | class     | UTF structure directory.     |
| `Entry`     | interface | UTF entry structure.         |
| `File`      | class     | File entry in UTF structure. |
| `Header`    | interface | UTF header structure.        |

`Directory` statics: `read(bytes)`, and the layout constants `SIGNATURE`, `VERSION`, `FILE`,
`DIRECTORY`, `ENTRY_BYTE_LENGTH`, `VERSION_BYTE_LENGTH`, `HEADER_BYTE_LENGTH`.
Instance: `name`, `children`, `directories`, `files`, `getDirectory(...path)`, `setDirectory`,
`getFile(...path)`, `setFile`, `delete`, `append`, `write()`.

`File` instance: `name`, `data`, `buffer`, `byteOffset`, `byteLength`, and the payload accessors
`readIntegers`/`writeIntegers`, `readFloats`/`writeFloats`, `readStrings`/`writeStrings`, `append`.

## `./alchemy`

| Export               | Kind      |                                                                                                    |
| -------------------- | --------- | -------------------------------------------------------------------------------------------------- |
| `Alchemy`            | interface | Both libraries of one `.ale`, which are only ever found together.                                  |
| `AnimatedColor`      | type      | `EaseAnimation<Keyframe & EaseAnimation<VectorKeyframe>>` — a colour over life and over age.       |
| `AnimatedCurve`      | type      | `EaseAnimation<Keyframe & LoopAnimation<VectorKeyframe>>` — the looping form.                      |
| `AnimatedFloat`      | type      | `EaseAnimation<Keyframe & EaseAnimation<FloatKeyframe>>`.                                          |
| `Animation`          | interface | `{ keyframes: T[] }`, the base of both animation forms.                                            |
| `Blending`           | interface | `{ source: BlendingMode, target: BlendingMode }`.                                                  |
| `BlendingMode`       | enum      | Blend factor, which is `D3DBLEND` verbatim.                                                        |
| `colorAt`            | function  | `(animation: AnimatedColor, p, t): Vector3`                                                        |
| `curveAt`            | function  | `(animation: AnimatedCurve, p, t): number`                                                         |
| `DefaultId`          | const     | CRC of the root container every effect hangs its instances from.                                   |
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
| `isTransformEnabled` | function  | Tests if transform data is provided.                                                               |
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
| `Transform`          | interface | Animated transform.                                                                                |
| `transformAt`        | function  | `(point: Transform, p, t): TransformAt`                                                            |
| `TransformAt`        | interface | A sampled transform: `flags`, `position`, `rotation`, `scale`.                                     |
| `TransformFlags`     | enum      | Which of position, rotation and scale a transform actually carries.                                |
| `TransformPoint`     | interface | Animated transform point — three `AnimatedCurve`s.                                                 |
| `transformPointAt`   | function  | `(point: TransformPoint, p, t): Vector3`                                                           |
| `VectorKeyframe`     | interface | `Keyframe & { value: Vector3 }`.                                                                   |
| `vectorWhen`         | function  | Empty vector list, as `floatWhen`.                                                                 |
| `WorldId`            | const     | Parent identifier standing in for the world, i.e. the instance is a root.                          |
| `WrapFlags`          | enum      | Looped animation out-of-bounds toggles.                                                            |
| `writeAlchemy`       | function  | Writes both libraries as the two sibling directories they are.                                     |
| `writeEffectLibrary` | function  | Writes effect library.                                                                             |
| `writeNodeLibrary`   | function  | Writes node library.                                                                               |

## `./animation`

| Export                  | Kind      |                                                                                 |
| ----------------------- | --------- | ------------------------------------------------------------------------------- |
| `AnimationLibrary`      | type      | Animation scripts of a model.                                                   |
| `AnimationMap`          | type      | `ObjectMap \| JointMap`.                                                        |
| `Channel`               | interface | Keyframe track of a single animated property set.                               |
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
| `Keyframe`              | interface | Animation keyframe. Which properties are set is dictated by the channel type.   |
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

## `./vmesh`

| Export              | Kind      |                                                                                   |
| ------------------- | --------- | --------------------------------------------------------------------------------- |
| `atRange`           | function  | Picks the detail level covering a camera distance; `undefined` past the last one. |
| `BoundingBox`       | interface | `{ a: Vector3, b: Vector3 }`.                                                     |
| `BoundingSphere`    | interface | `{ center: Vector3, radius: number }`.                                            |
| `Format`            | enum      | Direct3D flexible vertex format (FVF).                                            |
| `getMapCount`       | function  | Calculates number of UV maps for the vertex format.                               |
| `getMesh`           | function  | `(library: VMeshLibrary, name: Hashable): VMeshData \| undefined`                 |
| `getMeshDraw`       | function  | Generator — yields one `MeshDraw` per group of a reference, in index order.       |
| `MeshDraw`          | interface | `{ materialId, startIndex, elementCount, baseVertex, numVertices }` — offsets.    |
| `MultiLevel`        | interface | `{ type: 'multilevel', ranges: number[], levels: VMeshPart[] }`.                  |
| `Primitive`         | enum      | Direct3D primitive type (`D3DPRIMITIVETYPE`).                                     |
| `readMultiLevel`    | function  | `(parent: Directory): MultiLevel \| undefined`                                    |
| `readVMeshData`     | function  | `(parent: Directory): VMeshData`                                                  |
| `readVMeshGroup`    | function  | `(view: BufferView): VMeshGroup`                                                  |
| `readVMeshLibrary`  | function  | `(parent: Directory): VMeshLibrary`                                               |
| `readVMeshPart`     | function  | `(parent: Directory): VMeshPart \| undefined`                                     |
| `readVMeshRef`      | function  | `(parent: Directory): VMeshRef`                                                   |
| `readVMeshWire`     | function  | `(parent: Directory): VMeshWire \| undefined`                                     |
| `vertexByteLength`  | function  | Calculates vertex byte length for the vertex format.                              |
| `VMeshData`         | interface | One mesh: `primitive`, `format`, `groups`, `indices`, `vertices`.                 |
| `VMeshGroup`        | interface | One draw range: `materialId`, `vertexStart`, `vertexEnd`, `elementCount`.         |
| `VMeshLibrary`      | type      | `VMeshData[]`.                                                                    |
| `VMeshPart`         | interface | `{ type: 'vmeshpart', reference: VMeshRef }`.                                     |
| `VMeshRef`          | interface | A slice of a mesh by CRC, with its group/index/vertex offsets and bounds.         |
| `VMeshWire`         | interface | `{ data: VWireData }`.                                                            |
| `VWireData`         | interface | Wireframe line data, stored as authored and never recomputed on write.            |
| `writeMultiLevel`   | function  | `(value: MultiLevel): Directory`                                                  |
| `writeVMeshData`    | function  | `(data: VMeshData): Directory`                                                    |
| `writeVMeshGroup`   | function  | `(group: VMeshGroup): BufferView`                                                 |
| `writeVMeshLibrary` | function  | `(values: Iterable<VMeshData>): Directory`                                        |
| `writeVMeshPart`    | function  | `(parent: VMeshPart): Directory`                                                  |
| `writeVMeshRef`     | function  | `(ref: VMeshRef): File`                                                           |
| `writeVMeshWire`    | function  | `(data: VMeshWire): Directory`                                                    |

## `./compound`

| Export                 | Kind      |                                                                                  |
| ---------------------- | --------- | -------------------------------------------------------------------------------- |
| `arrangeByConstraints` | function  | Arranges compound objects into hierarchy from constraints.                       |
| `Constraint`           | interface | `{ parent: string, child: string, joint: Joint }`.                               |
| `getHardpoint`         | function  | `(hardpoints: Hardpoint[], name: Hashable): Hardpoint \| undefined`              |
| `getModelHardpoint`    | function  | Finds a hardpoint anywhere in a model, returning it with the part that owns it.  |
| `Hardpoint`            | type      | Attachment hardpoint. There is no prismatic form — only `Fixed` and `Revolute`.  |
| `isCompoundModel`      | function  | `(directory: Directory): boolean`                                                |
| `Joint`                | type      | Compound object child-to-parent connection joint.                                |
| `Model`                | interface | `Model<T>` — a `Tree` node carrying `name`, `index`, filename and a payload `T`. |
| `readConstraints`      | function  | Reads compound hierarchy constraints.                                            |
| `readHardpoints`       | function  | Reads hardpoints from object directory.                                          |
| `readModel`            | function  | Reads compound object from directory.                                            |
| `writeConstraints`     | function  | Writes one file per constraint, for a caller to append together by name.         |
| `writeHardpoints`      | function  | `(hardpoints: Iterable<Hardpoint>): Directory`                                   |
| `writeModel`           | function  | Writes compound object into directory.                                           |

## `./rigid`

| Export                     | Kind      |                                                                                    |
| -------------------------- | --------- | ---------------------------------------------------------------------------------- |
| `Camera`                   | interface | Camera part of a compound model, used by cockpit models.                           |
| `getMaterialAnim`          | function  | Finds a material animation by name.                                                |
| `getMaterialAnimDuration`  | function  | Animation duration in seconds, the sum of its segment durations.                   |
| `isCamera`                 | function  | `(directory: Directory): boolean`                                                  |
| `isSphere`                 | function  | `(directory: Directory): boolean`                                                  |
| `MaterialAnim`             | interface | Animates the UV transform of a single material, named by the directory holding it. |
| `MaterialAnimLibrary`      | type      | `MaterialAnim[]`.                                                                  |
| `MaterialKey`              | interface | UV transform a segment starts from.                                                |
| `MaterialKeyframe`         | interface | One segment of a material animation; `time` is its own duration, not an offset.    |
| `MeshSource`               | type      | What a rigid part hangs its geometry off: one reference, or a switch over several. |
| `readCamera`               | function  | `(parent: Directory): Camera`                                                      |
| `readMaterialAnim`         | function  | Reads a material animation from its directory.                                     |
| `readMaterialAnimLibrary`  | function  | Reads the material animation library from a file root directory.                   |
| `readRigidModel`           | function  | `(directory: Directory): RigidModel`                                               |
| `readSphere`               | function  | `(parent: Directory): Sphere`                                                      |
| `Rigid`                    | interface | `{ type: 'rigid', hardpoints, part?: MeshSource, wireframe?: VMeshWire }`.         |
| `RigidModel`               | type      | `Model<RigidPart> \| RigidPart` — a compound tree, or a lone part.                 |
| `RigidPart`                | type      | `Rigid \| Camera \| Sphere`.                                                       |
| `Sphere`                   | interface | Procedural sphere model, used by `.sph` planet and star files.                     |
| `writeCamera`              | function  | `(camera: Camera): Directory`                                                      |
| `writeMaterialAnim`        | function  | Writes a material animation into a directory named after the material.             |
| `writeMaterialAnimLibrary` | function  | Writes a material animation library into a `MaterialAnim` directory.               |
| `writeRigidModel`          | function  | `(model: RigidModel): Directory`                                                   |
| `writeSphere`              | function  | `(sphere: Sphere): Directory`                                                      |

## `./surface`

The narrowest entry point in the package, and the one where the most is left behind — see
[Not reachable](#not-reachable-from-any-subpath).

| Export                | Kind      |                                                                                    |
| --------------------- | --------- | ---------------------------------------------------------------------------------- |
| `Extent`              | interface | Extents section (bounding box).                                                    |
| `Face`                | interface | Hull triangle face. Corresponds to IVP's `IVP_Compact_Triangle`.                   |
| `Hull`                | interface | One convex hull: `id`, `type`, its faces, and a reserved word.                     |
| `Node`                | interface | Boundary volume hierarchy node. Corresponds to IVP's `IVP_Compact_Ledgetree_Node`. |
| `Part`                | interface | `Extent & Surface & { id, fixed, hardpoints }` — one collidable piece.             |
| `Point`               | interface | Hull vertex, shared between the hulls of a part.                                   |
| `readSurfaceLibrary`  | function  | `(view: BufferView): Part[]`                                                       |
| `writeSurfaceLibrary` | function  | `(parts: Part[]): BufferView`                                                      |

## `./texture`

| Export                   | Kind      |                                                                                    |
| ------------------------ | --------- | ---------------------------------------------------------------------------------- |
| `AnimatedTexture`        | interface | A frame list indexing sibling atlases named `<name>_N`.                            |
| `AnimatedTextureFrame`   | interface | One frame: which atlas, and the rectangle within it.                               |
| `Compression`            | enum      | DDS `dwFourCC` compression, `dxt1`/`dxt3`/`dxt5` or none.                          |
| `CubeFaces`              | type      | The six faces of a cubemap, in the order DirectDraw stores them.                   |
| `CUBEMAP_FACES`          | const     | How many faces a cubemap holds.                                                    |
| `CubeTexture`            | interface | A cubemap, stored as a single DirectDrawSurface holding all six faces.             |
| `decompress`             | function  | DXT1/3/5 block decompression to RGB(A).                                            |
| `decompressAlphaDXT3`    | function  | Decompress DXT3 alpha channel.                                                     |
| `decompressAlphaDXT5`    | function  | Decompress DXT5 alpha channel.                                                     |
| `decompressRGB`          | function  | Decompress RGB channels.                                                           |
| `DirectDrawSurface`      | interface | A DDS: dimensions, `bitCount`, `compression`, colour `mask`, and the mip surfaces. |
| `expand565to888`         | function  | Converts 16-bit (5-6-5) pixel to 24-bit.                                           |
| `expandRGB`              | function  | Expands 16-bit bitmap to 24 or 32-bit with custom colour masks.                    |
| `expandRGBtoRGBA`        | function  | Converts 24-bit RGB to 32-bit RGBA.                                                |
| `getTextureCount`        | function  | Number of sibling atlases the frames index into, written back as `Texture count`.  |
| `ImageType`              | enum      | Targa image type — colour-mapped, RGB, greyscale, and their RLE forms.             |
| `readAnimatedTexture`    | function  | `(parent: Directory): AnimatedTexture \| undefined`                                |
| `readCUBE`               | function  | Reads a cubemap, stored as one DirectDrawSurface holding all six faces.            |
| `readDirectDrawSurface`  | function  | `(view: BufferView): DirectDrawSurface`                                            |
| `readMIP`                | function  | Reads texture as sequence of uncompressed Targa images.                            |
| `readMIPS`               | function  | Reads texture as mipmaps (uncompressed or DXTn) stored in DirectDrawSurface.       |
| `readTargaImage`         | function  | Reads bitmap from targa file. Its `options` type is not exported.                  |
| `readTexture`            | function  | Reads one texture library entry.                                                   |
| `readTextures`           | function  | Reads textures from directory. Looks for `Texture library` within.                 |
| `swapRB16`               | function  | Swap red and blue in a 16-bit ARGB-1555 value.                                     |
| `swapRB24`               | function  | Swap red and blue in a 24-bit RGB value.                                           |
| `swapRB32`               | function  | Swap red and blue in a 32-bit ARGB value.                                          |
| `TargaBitmap`            | interface | `TargaPixels & { flip: boolean }` — origin reported as read, rows never reordered. |
| `TargaPixels`            | interface | `width`, `height`, `depth`, and the pixel bytes.                                   |
| `Texture`                | interface | A flat texture: one mip chain, as a DirectDrawSurface or a chain of Targas.        |
| `TextureEntry`           | type      | Any entry a `Texture library` holds. Narrow on `type === 'animated'` first.        |
| `TextureStorage`         | type      | Which on-disk form holds the image data: `MIPS`, `MIP0..n`, or `CUBE`.             |
| `TextureType`            | type      | The pixel formats, with no `dxt1a` — punch-through is per block, not per image.    |
| `writeAnimatedTexture`   | function  | `(texture: AnimatedTexture): Directory`                                            |
| `writeCUBE`              | function  | Writes a cubemap as one DirectDrawSurface holding all six faces.                   |
| `writeDirectDrawSurface` | function  | Writes a DirectDrawSurface, header and mip chains.                                 |
| `writeMIP`               | function  | Writes texture as a sequence of uncompressed Targa images, one file per level.     |
| `writeMIPS`              | function  | Writes texture as mipmaps (uncompressed or DXTn) in a DirectDrawSurface.           |
| `writeTargaImage`        | function  | Writes an uncompressed RGB(A) Targa.                                               |
| `writeTexture`           | function  | Writes one texture library entry, in whichever form `TextureStorage` names.        |
| `writeTextures`          | function  | `(textures: Iterable<TextureEntry>): Directory`                                    |

## `./material`

| Export                    | Kind      |                                                                            |
| ------------------------- | --------- | -------------------------------------------------------------------------- |
| `defaultNomadTextureName` | const     | Default `Nt_name`, compiled into `EXE/flmaterials.dll`.                    |
| `getMaterial`             | function  | Finds a material by name or resource CRC, the way a mesh's reference does. |
| `KnownMaterialType`       | type      | A type `materialTypes` or `mappedMaterialTypes` names.                     |
| `mappedMaterialTypes`     | const     | Shader names the engine knows that no shipped asset selects.               |
| `Material`                | interface | One entry of a `Material library`.                                         |
| `MaterialType`            | type      | Material type. Any string is valid — `[MaterialMap]` can name others.      |
| `materialTypes`           | const     | Material types attested in retail assets, most common first.               |
| `readMaterial`            | function  | Reads one material from its directory.                                     |
| `readMaterials`           | function  | Reads materials from a directory, looking for a `Material library` within. |
| `TextureFlags`            | enum      | Texture addressing bits carried by every `*_flags` file.                   |
| `TextureReference`        | interface | A texture slot: the name looked up, and how it is addressed.               |
| `writeMaterial`           | function  | Writes one material as a directory of property files.                      |
| `writeMaterials`          | function  | Writes a `Material library` directory.                                     |

## `./deformable`

| Export                 | Kind      |                                                                                     |
| ---------------------- | --------- | ----------------------------------------------------------------------------------- |
| `Bone`                 | interface | One bone, stored as a `<name>.3db` directory at the file root.                      |
| `BONE_TO_ROOT_LENGTH`  | const     | Byte length of `Bone to root`: a 3x3 rotation followed by a translation.            |
| `DeformableModel`      | interface | A `.dfm` model — a rigid compound turned inside out.                                |
| `Edge`                 | interface | An edge of a face group, with the angle between the two faces meeting along it.     |
| `FaceGroup`            | interface | A run of faces sharing one material; strip or list, never both.                     |
| `Geometry`             | interface | The skinned surface of one detail level, as flat parallel arrays.                   |
| `getBone`              | function  | Finds a bone by name or resource CRC.                                               |
| `getBoneModel`         | function  | Assembles the bone hierarchy, producing the same `Model` tree a rigid compound has. |
| `Level`                | interface | One detail level: a whole skinned mesh, split into face groups by material.         |
| `Mapping`              | interface | A texture coordinate set; positions and UVs are indexed separately.                 |
| `readBone`             | function  | Reads a bone from its `<name>.3db` directory.                                       |
| `readDeformableModel`  | function  | Reads a deformable model from a file root directory.                                |
| `readFaceGroup`        | function  | Reads a face group from a `Group<n>` directory.                                     |
| `readGeometry`         | function  | Reads geometry from a `Geometry` directory.                                         |
| `readLevel`            | function  | Reads one `Mesh<n>` directory.                                                      |
| `readLevels`           | function  | Reads the `MultiLevel` directory of a deformable model.                             |
| `UVBone`               | interface | Texture coordinates driven by a bone's translation rather than by the skin.         |
| `writeBone`            | function  | Writes a bone into its `<name>.3db` directory.                                      |
| `writeDeformableModel` | function  | Writes a deformable model into a file root directory.                               |
| `writeFaceGroup`       | function  | Writes a face group into a `Group<n>` directory.                                    |
| `writeGeometry`        | function  | Writes geometry into a `Geometry` directory.                                        |
| `writeLevel`           | function  | Writes one `Mesh<n>` directory.                                                     |
| `writeLevels`          | function  | Writes a `MultiLevel` directory.                                                    |

## `./ini`

| Export             | Kind      |                                                                              |
| ------------------ | --------- | ---------------------------------------------------------------------------- |
| `addProperty`      | function  | Appends a property, which is how a repeated property is added.               |
| `addSection`       | function  | Appends a section.                                                           |
| `binary`           | namespace | Everything under `./ini/binary`.                                             |
| `Document`         | type      | A whole file: an ordered sequence of sections, duplicates legal.             |
| `filterProperties` | function  | Every property with this name, in file order.                                |
| `filterSections`   | function  | Every section with this name, in file order.                                 |
| `findByNickname`   | function  | Finds a section by its `nickname`, comparing hashes rather than text.        |
| `findProperty`     | function  | First property with this name, or `undefined`.                               |
| `findSection`      | function  | First section with this name, or `undefined`.                                |
| `Format`           | type      | `'binary' \| 'text' \| 'save'`.                                              |
| `formatOf`         | function  | Detects the encoding of a buffer without parsing it.                         |
| `getNickname`      | function  | The `nickname` a section identifies itself by, as text.                      |
| `getValue`         | function  | First value of the first property with this name.                            |
| `getValues`        | function  | Values of the first property with this name; `undefined` differs from empty. |
| `hasProperty`      | function  | Whether a property is present at all, whatever its values.                   |
| `Property`         | interface | A named list of values. Zero values is normal and means something.           |
| `read`             | function  | Reads an INI in whichever encoding it is in — the signature decides.         |
| `save`             | namespace | Everything under `./ini/save`.                                               |
| `Section`          | interface | A named list of properties. The name is opaque text, not an identifier.      |
| `text`             | namespace | Everything under `./ini/text`.                                               |
| `value`            | namespace | Value constructors, predicates and coercions (below).                        |
| `Value`            | type      | One value of one property, tagged rather than a bare primitive.              |
| `ValueType`        | type      | Which of the four things a value is.                                         |
| `write`            | function  | Writes a document as bytes, binary by default; never masks unless asked.     |

`value`: `boolean`, `integer`, `float`, `string`, `from`, `list`, `isBoolean`, `isInteger`,
`isFloat`, `isNumber`, `isString`, `toBoolean`, `toInteger`, `toFloat`, `toText`, `equals`.

## `./ini/text`

| Export         | Kind      |                                                                             |
| -------------- | --------- | --------------------------------------------------------------------------- |
| `read`         | function  | Parses text INI into sections. Deliberately forgiving, because the data is. |
| `write`        | function  | Serializes sections as text INI. No quoting or escaping anywhere.           |
| `WriteOptions` | interface | Formatting options for both `write` and `writeSection`.                     |
| `writeSection` | function  | Serializes a single section, for diffing or splicing into a larger file.    |

## `./ini/binary`

| Export                 | Kind     |                                                                                      |
| ---------------------- | -------- | ------------------------------------------------------------------------------------ |
| `Dictionary`           | class    | The names-and-values block at the end of a BINI. One table, not two.                 |
| `HEADER_BYTE_LENGTH`   | const    | `signature`, `version`, `namesOffset`.                                               |
| `isBinary`             | function | Whether a buffer starts with the `BINI` signature. Check this, not the suffix.       |
| `MAX_NAME_OFFSET`      | const    | Largest offset a name can sit at, since those offsets are `uint16`.                  |
| `MAX_PROPERTIES`       | const    | Largest `propertyCount`.                                                             |
| `MAX_VALUES`           | const    | Largest `valueCount`.                                                                |
| `PROPERTY_BYTE_LENGTH` | const    | `nameOffset` uint16, `valueCount` uint8.                                             |
| `read`                 | function | Reads a BINI into sections.                                                          |
| `SECTION_BYTE_LENGTH`  | const    | `nameOffset` uint16, `propertyCount` uint16.                                         |
| `SIGNATURE`            | const    | `BINI`, read as a little-endian `uint32`.                                            |
| `VALUE_BYTE_LENGTH`    | const    | `type` uint8 and a fixed four-byte payload, whatever the type.                       |
| `ValueTag`             | type     | `Boolean`/`Integer`/`Float`/`String` — a `const` object and the union of its values. |

## `./ini/save`

| Export               | Kind     |                                                                              |
| -------------------- | -------- | ---------------------------------------------------------------------------- |
| `HEADER_BYTE_LENGTH` | const    | The signature, and the whole of the header — no version field, no length.    |
| `isSave`             | function | Whether a buffer starts with the `FLS1` signature. Check this, not the suffix. |
| `mask`               | function | Applies the mask to a body, and is its own inverse.                          |
| `read`               | function | Reads a masked save into sections.                                           |
| `SIGNATURE`          | const    | `FLS1`, read as a little-endian `uint32`.                                    |
| `write`              | function | Writes a document as a masked save.                                          |
| `VERSION`              | const    | The only version retail carries, in all 1,251 files.                                 |
| `write`                | function | Writes sections as a BINI, reproducing the original compiler's byte layout.          |

`Dictionary` instance: `byteLength`, `size`, `push(value)`, `toBytes()`.

## `./thn`

| Export            | Kind      |                                                                         |
| ----------------- | --------- | ----------------------------------------------------------------------- |
| `bytecode`        | namespace | Everything under `./thn/bytecode`.                                      |
| `Document`        | type      | A whole script: an ordered sequence of assignments.                     |
| `Entry`           | interface | One `key = value` pair of a table's hash part, in insertion order.      |
| `Format`          | type      | `'bytecode' \| 'text'`.                                                 |
| `formatOf`        | function  | Detects the encoding of a buffer without parsing it.                    |
| `Global`          | interface | One top-level `name = value` assignment.                                |
| `IdentifierValue` | interface | A bare identifier — the one value with no JSON equivalent.              |
| `NumberValue`     | interface | A number, kept as the literal text it was written as.                   |
| `read`            | function  | Reads a scene script in whichever encoding it is in.                    |
| `StringValue`     | interface | A quoted string: a file path, an entity name, a subtitle.               |
| `TableValue`      | interface | A Lua table, which is both of JSON's containers at once.                |
| `text`            | namespace | Everything under `./thn/text`.                                          |
| `value`           | namespace | Value constructors, guards and accessors (below).                       |
| `Value`           | type      | One value of one assignment or one table slot.                          |
| `ValueType`       | type      | Which of the four things a value is.                                    |
| `write`           | function  | Writes a script as bytes. `format` accepts only `'text'`, deliberately. |

`value`: `number`, `string`, `identifier`, `table`, `list`, `from`, `isNumber`, `isString`,
`isIdentifier`, `isTable`, `toNumber`, `getEntry`, `getGlobal`, `equals`.

## `./thn/text`

| Export         | Kind      |                                                               |
| -------------- | --------- | ------------------------------------------------------------- |
| `read`         | function  | Parses a plain-text scene script. A Lua _literal_ parser.     |
| `write`        | function  | Renders a script as Lua source. This is the whole write path. |
| `WriteOptions` | interface | Formatting options for `write`.                               |

## `./thn/bytecode`

Read only; there is no bytecode writer, and the two undecoded header fields are why.

| Export               | Kind      |                                                                               |
| -------------------- | --------- | ----------------------------------------------------------------------------- |
| `ConstantTag`        | type      | Constant pool entry tags. Only two occur in 442,599 retail constants.         |
| `GAP_BYTE_LENGTH`    | const     | Between `ENDCODE` and the constant count, in every file. Not decoded.         |
| `HEADER_BYTE_LENGTH` | const     | Fixed prefix, code length, and two bytes that are not decoded.                |
| `isBytecode`         | function  | Whether a buffer is a compiled chunk rather than script text.                 |
| `Opcode`             | interface | `{ name, width: 0 \| 1 \| 2, count: boolean }`.                               |
| `OPCODE_BYTES`       | const     | Opcode name to its byte. The writer's direction; unused by the reader.        |
| `OPCODES`            | const     | Every opcode, indexed by its byte.                                            |
| `read`               | function  | Reads a compiled Lua 3.2 chunk into a script. An evaluator, not a decompiler. |
| `SIGNATURE`          | const     | `ESC` `L` `u` `a`, then the version byte.                                     |
| `VERSION`            | const     | Lua 3.2. The version byte is the fifth of the signature.                      |

## `./thn/scene`

The largest entry point, and almost all of it is the vocabulary: ten entity arms, fifteen event
arms, and the property blocks they carry.

| Export                  | Kind      |                                                                                   |
| ----------------------- | --------- | --------------------------------------------------------------------------------- |
| `AttachEntity`          | interface | `ATTACH_ENTITY` event.                                                            |
| `AudioProps`            | interface | `audioprops` block.                                                               |
| `AxisName`              | type      | `X_AXIS` … `NEG_Z_AXIS`.                                                          |
| `AxisRotation`          | type      | Degrees about an axis. The animation form, never on an entity.                    |
| `Camera`                | interface | `CAMERA` entity.                                                                  |
| `CameraAnimProps`       | interface | `cameraprops` on a `START_CAMERA_PROP_ANIM` — different keys from the entity's.   |
| `CameraProps`           | interface | `cameraprops` on a `CAMERA` entity.                                               |
| `Compound`              | interface | `COMPOUND` entity.                                                                |
| `CompoundProps`         | interface | `compoundprops` block.                                                            |
| `ConnectHardpoints`     | interface | `CONNECT_HARDPOINTS` event.                                                       |
| `data`                  | namespace | The numeric tables behind every name (below).                                     |
| `Deformable`            | interface | `DEFORMABLE` entity.                                                              |
| `Entity`                | type      | One entity. Ten arms, which is every type retail uses.                            |
| `EntityCommon`          | interface | What every entity carries, whatever its type.                                     |
| `EntityOf`              | type      | Narrows to the entity of a given type, so a consumer can filter without a cast.   |
| `EntityTypeName`        | type      | The ten names.                                                                    |
| `Event`                 | type      | One event. Fifteen arms, which is every action retail uses.                       |
| `EventCommon`           | interface | What every event carries.                                                         |
| `EventOf`               | type      | Narrows to the event of a given action.                                           |
| `EventTypeName`         | type      | The fifteen names.                                                                |
| `FogModeName`           | type      | `F_NONE`, `F_EXP`, `F_EXP2`, `F_LINEAR`.                                          |
| `FogProps`              | interface | Fog, as a `fogprops` block or inline on a `SCENE`.                                |
| `Light`                 | interface | `LIGHT` entity.                                                                   |
| `LightProps`            | interface | `lightprops` block.                                                               |
| `LightTypeName`         | type      | `L_POINT`, `L_SPOT`, `L_DIRECT`.                                                  |
| `Marker`                | interface | A placeholder with no visual.                                                     |
| `Matrix3`               | type      | A rotation matrix, as three `Vector3` rows.                                       |
| `Monitor`               | interface | The render target. The one entity type with no `spatialprops`.                    |
| `MotionPath`            | interface | `MOTION_PATH` entity.                                                             |
| `NullPath`              | interface | A `MOTION_PATH` with no path on it.                                               |
| `OrientationSplinePath` | interface | Position and orientation per keyframe. Every retail path that has one is this.    |
| `Oriented`              | interface | Where the action orients something.                                               |
| `OrientedPoint`         | interface | One keyframe of an oriented path.                                                 |
| `ParamCurve`            | interface | A parameter curve. Every retail `points` row is exactly four numbers.             |
| `PathFlagName`          | type      | `OPEN`, `CLOSED`.                                                                 |
| `PathProps`             | type      | A path an object is moved along, as a Catmull-Rom spline.                         |
| `PathTypeName`          | type      | The two spline class names.                                                       |
| `Placed`                | interface | An entity that renders, and therefore has a place to be.                          |
| `Psys`                  | interface | `PSYS` entity.                                                                    |
| `PsysProps`             | interface | `psysprops` block.                                                                |
| `Quaternion`            | type      | A readonly four-number tuple.                                                     |
| `read`                  | function  | Turns an interim document into a scene. Both export forms read the same.          |
| `Scene`                 | interface | The scene descriptor. One per script, with one retail exception.                  |
| `Script`                | interface | A whole script: what the three globals mean.                                      |
| `SetCamera`             | interface | `SET_CAMERA` event.                                                               |
| `Sound`                 | interface | `SOUND` entity.                                                                   |
| `SpatialProps`          | interface | Position and orientation. `orient` places, `q_orient` and `axisrot` animate.      |
| `SplinePath`            | interface | Position only. Named by `thorn.dll`, used by no retail script.                    |
| `StartAudioPropAnim`    | interface | `START_AUDIO_PROP_ANIM` event.                                                    |
| `StartCameraPropAnim`   | interface | `START_CAMERA_PROP_ANIM` event.                                                   |
| `StartFlrHeightAnim`    | interface | `START_FLR_HEIGHT_ANIM` event.                                                    |
| `StartFogPropAnim`      | interface | `START_FOG_PROP_ANIM` event.                                                      |
| `StartIk`               | interface | Inverse kinematics — the third most common event in retail.                       |
| `StartLightPropAnim`    | interface | `START_LIGHT_PROP_ANIM` event.                                                    |
| `StartMotion`           | interface | `START_MOTION` event.                                                             |
| `StartPathAnimation`    | interface | `START_PATH_ANIMATION` event.                                                     |
| `StartPsys`             | interface | `START_PSYS` event.                                                               |
| `StartPsysPropAnim`     | interface | `START_PSYS_PROP_ANIM` event.                                                     |
| `StartSound`            | interface | `START_SOUND` event.                                                              |
| `StartSpatialPropAnim`  | interface | `START_SPATIAL_PROP_ANIM` event.                                                  |
| `Targeted`              | interface | Where the action addresses part of an entity rather than the whole of it.         |
| `TargetTypeName`        | type      | `ROOT`, `HARDPOINT`, `PART`.                                                      |
| `TruthName`             | type      | `N`, `Y`.                                                                         |
| `Unknown`               | type      | Keys the vocabulary does not name, kept verbatim so a rewrite does not lose them. |
| `UserProps`             | type      | `userprops` — read by Freelancer, not by THORN.                                   |
| `Vector3`               | type      | A readonly three-number tuple.                                                    |
| `write`                 | function  | Turns a scene back into an interim document, always in symbolic form.             |

`data`: `ENTITY_TYPES`, `UNUSED_ENTITY_TYPES`, `EVENT_TYPES`, `UNUSED_EVENT_TYPES`,
`LEGACY_EVENT_TYPES`, `AXES`, `TARGET_TYPES`, `LIGHT_TYPES`, `FOG_MODES`, `TRUTH`, `RENDER_FLAGS`,
`SOUND_ENTITY_FLAGS`, `entityFlagsOf`, `ATTACH_FLAGS`, `SOUND_FLAGS`, `UNUSED_FLAGS`, `CURVE_TYPES`,
`PATH_TYPES`, `PATH_FLAGS`, `USER_PROPS`, `CATEGORIES`, `namesOf`.

## `./resource`

Split three ways: the id space, the two payload formats, and the PE container.

### Id space

| Export             | Kind      |                                                                                     |
| ------------------ | --------- | ----------------------------------------------------------------------------------- |
| `globalIdOf`       | function  | Global id for a resource in the library at `index`.                                 |
| `libraryOf`        | function  | Library index a global id falls in.                                                 |
| `localOf`          | function  | Local resource id within its library.                                               |
| `Library`          | interface | Everything a set of libraries resolves, in the global id space.                     |
| `LIBRARY_ID_RANGE` | const     | Ids each library contributes before the next one begins.                            |
| `partition`        | function  | Splits a global map back into per-library maps of local ids, ready for the writers. |
| `readLibrary`      | function  | Merges libraries into one id space, keeping names and infocards apart.              |
| `RETAIL_LIBRARIES` | const     | Retail's order, as `freelancer.ini` gives it. A default, not a rule.                |

### Strings and infocards

| Export                | Kind      |                                                                       |
| --------------------- | --------- | --------------------------------------------------------------------- |
| `blockOf`             | function  | Resource id of the block holding a string.                            |
| `slotOf`              | function  | Slot within that block.                                               |
| `indexOf`             | function  | Lowest string index a block covers.                                   |
| `readBlock`           | function  | Decodes one block into up to sixteen strings, keyed by string index.  |
| `readStrings`         | function  | Collects every string in a resource list, keyed by its local index.   |
| `writeStrings`        | function  | Encodes strings as `RT_STRING` resources, one per block of sixteen.   |
| `readCard`            | function  | Decodes one payload as UTF-16LE, dropping a leading byte order mark.  |
| `readInfocards`       | function  | Collects every infocard in a resource list, keyed by its local id.    |
| `writeCard`           | function  | Encodes text as UTF-16LE with a leading byte order mark.              |
| `writeInfocards`      | function  | Encodes infocards as `RT_HTML` resources, one per id.                 |
| `ResourceOptions`     | interface | Options shared by the writers that build resources from decoded text. |
| `STRING_BLOCK_LENGTH` | const     | Strings per `RT_STRING` block. Fixed by the format.                   |

### PE container

| Export         | Kind      |                                                                              |
| -------------- | --------- | ---------------------------------------------------------------------------- |
| `isImage`      | function  | Whether a buffer starts with `MZ` and its `e_lfanew` reaches a `PE\0\0`.     |
| `read`         | function  | Reads every resource in a Win32 image, flattening the three-level directory. |
| `write`        | function  | Writes resources as a resource-only DLL.                                     |
| `writeSection` | function  | Builds the `.rsrc` section, in the linker's layout.                          |
| `WriteOptions` | interface | `imageBase` and COFF `timestamp`; both default, so output is deterministic.  |
| `Resource`     | interface | One resource: a leaf of the directory tree, with the path that reaches it.   |
| `ResourceId`   | type      | A resource type or entry identity: a number, or a name.                      |
| `Type`         | type      | Resource types, by their Win32 `RT_*` numbers.                               |

Plus the layout constants, all measured against retail: `CODE_PAGE_WINDOWS_1252`, `DATA_ALIGNMENT`,
`DEFAULT_IMAGE_BASE`, `DIRECTORY_COUNT`, `DIRECTORY_RELOCATION`, `DIRECTORY_RESOURCE`,
`DOS_SIGNATURE`, `FILE_ALIGNMENT`, `HEADERS_BYTE_LENGTH`, `IMAGE_CHARACTERISTICS`,
`LANGUAGE_ENGLISH_US`, `LANGUAGE_NEUTRAL`, `MACHINE_I386`, `OPTIONAL_BYTE_LENGTH`, `OPTIONAL_MAGIC`,
`PADDING`, `PE_OFFSET_POINTER`, `PE_SIGNATURE`, `RESOURCE_DATA_BYTE_LENGTH`,
`RESOURCE_DIRECTORY_BYTE_LENGTH`, `RESOURCE_ENTRY_BYTE_LENGTH`, `RESOURCE_HIGH_BIT`,
`RESOURCE_VERSION_MAJOR`, `RESOURCE_VERSION_MINOR`, `SECTION_ALIGNMENT`, `SECTION_BYTE_LENGTH`,
`SECTION_DISCARDABLE_DATA`, `SECTION_READ_DATA`, `SUBSYSTEM_GUI`.

---

## Not reachable from any subpath

Exported from a source file but re-exported by no barrel, so no consumer can name them. Most are
internal by design; a few are holes.

### Internal by design

Per-record readers and writers that only their own module's aggregate function calls. They are
`export`ed so the unit tests can reach them, and that is the whole reason.

| File                    | Names                                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| `alchemy/animation.ts`  | the eighteen `read*`/`write*` keyframe and animation record functions                                |
| `alchemy/effect.ts`     | `readEntry`, `writeEntry`, `readPair`, `writePair`, `readEffect`, `writeEffect`                      |
| `alchemy/misc.ts`       | `readInteger`, `readFloat`, `readString`, `readBlending`, `readArray`, and writers                   |
| `alchemy/node.ts`       | `readNode`, `writeNode`                                                                              |
| `alchemy/property.ts`   | `readProperty`, `writeProperty`                                                                      |
| `compound/hardpoint.ts` | `readPosition`, `readOrientation`, `readAxis`, `readFixed`, `readRevolute`, and writers              |
| `compound/joint.ts`     | `readFixed`, `readRevolute`, `readPrismatic`, `readCylinder`, `readSphere`, `readLoose`, and writers |
| `deformable/arrays.ts`  | `readUint16Array`, `readUint32Array`, `readFloat32Array`, and writers                                |
| `rigid/rigid.ts`        | `readRigid`, `writeRigid`, `readPart`, `writePart`                                                   |
| `surface/*.ts`          | `readExtent`, `readPoint`, `readNode`, `readPart`, `readHull`, and writers                           |
| `texture/targa.ts`      | `readUncompressedColorMap`, `readUncompressedRGB`, `swapBGRtoRGB`                                    |
| `vmesh/group.ts`        | `byteLength`                                                                                         |
| `utility/*.ts`          | `chunkview`, `dictionary`, `view.concatViews`, `hierarchy.flatten`/`assemble`                        |
| `crc32.ts`, `id32.ts`   | the raw hash functions, wrapped by `.`'s `getResourceId` / `getObjectId`                             |
| `corpus.ts`             | the retail-tree test harness, deliberately outside the exports map                                   |

### Holes

Each of these is either named in a public signature, or needed to do the thing its module exists to
do, and neither is reachable.

| Name                               | File                 | Why it matters                                                                                                                                                         |
| ---------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Surface`                          | `surface/surface.ts` | `Part extends Extent, Surface` — `massCenter`, `rotationInertia`, `radius`, `surfaceDeviation`, `points` and the BVH `root` have no nameable type on the consumer side |
| `getNodes`, `getHulls`             | `surface/surface.ts` | the only walk from a `Part` down to its hulls                                                                                                                          |
| `readSurface`, `writeSurface`      | `surface/surface.ts` | per-part access; only the whole library is reachable                                                                                                                   |
| `HullType`                         | `surface/hull.ts`    | the type of `Hull.type`, which is otherwise an opaque number                                                                                                           |
| `getIndices`                       | `surface/hull.ts`    | faces to a flat index list — what drawing or colliding against a hull needs                                                                                            |
| `TriangleIndices`, `TriangleFlags` | `surface/face.ts`    | the types of `Face.points`, `Face.opposites`, `Face.virtualEdges`                                                                                                      |
| `Entry`, `Pair`                    | `alchemy/effect.ts`  | the link and pair records an `Effect`'s instance tree is built from                                                                                                    |
| `TargaOptions`                     | `texture/targa.ts`   | the parameter type of the exported `readTargaImage`                                                                                                                    |

`./surface` accounts for six of the eight. It exports eight names against the directory's 34, and a
consumer holding a `Part` can reach its extents but not its geometry.
