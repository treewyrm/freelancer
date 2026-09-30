# Math

`Vector3`, `Vector4`, `Quat`, `Matrix3`, `Matrix4`, `Transform`, `BoundingBox` and
`BoundingSphere` are each an interface plus a companion `const` namespace of the same name carrying
the operations —
[Invariant 5](../refs/ARCHITECTURE.md#invariants): math is opt-in, never built into the type design.
`generateConvexHull` is the one piece of geometry construction that lives here rather than in
[SURFACE.md](SURFACE.md#convex-hull), because a convex hull is a fact about a point set, not a
policy; `createHullGeometry` in that module is the bridge back.

The two bounding volumes are shared rather than declared per format: `VMeshRef`'s box and sphere,
a surface part's extent and an Alchemy effect's sphere are the same two shapes, `{ min, max }` and
`{ center, radius }`, whatever order each file stores their components in.

## API

### `./math`

| Export               | Kind      |                                                                            |
| -------------------- | --------- | -------------------------------------------------------------------------- |
| `AnimationRange`     | interface | Animation query result: the keyframes either side of a key, and the blend. |
| `at`                 | function  | `<T extends Keyframe>(keyframes, key): AnimationRange<T>`                  |
| `AxisAngle`          | interface | `{ axis: Vector3, angle: number }`                                         |
| `BoundingBox`        | interface | Axis-aligned box `{ min, max }`, and the namespace of operations on it.    |
| `BoundingSphere`     | interface | Sphere `{ center, radius }`, and the namespace of operations on it.        |
| `clamp`              | function  | `(a, min?, max?): number`                                                  |
| `ConvexHull`         | interface | A convex hull, holding only the points that are on it.                     |
| `ConvexHullOptions`  | interface | What a caller decides about a hull: a point budget and a tolerance.        |
| `equal`              | function  | `(a, b, epsilon?): boolean`                                                |
| `fract`              | function  | `(a): number`                                                              |
| `generateConvexHull` | function  | Convex hull of a point set, wound counter-clockwise seen from outside.     |
| `hermite`            | function  | `(p0, m0, p1, m1, t): number`                                              |
| `Keyframe`           | interface | `{ key: number }` — the base every keyframe list is ordered by.            |
| `lerp`               | function  | `(p0, p1, t): number`                                                      |
| `Matrix3`            | interface | 3x3 transformation matrix, and the namespace of operations on it.          |
| `Matrix4`            | interface | 4x4 matrix as four **columns**, and the namespace of operations on it.     |
| `mod`                | function  | `(a, b): number`                                                           |
| `pingPong`           | function  | `(a): number`                                                              |
| `quadIn`             | function  | `(t): number`                                                              |
| `quadOut`            | function  | `(t): number`                                                              |
| `Quat`               | type      | Quaternion — an alias of `Vector4`, plus its own operation namespace.      |
| `random`             | function  | `(min?, max?): number`                                                     |
| `remap`              | function  | `(a, aMin, aMax, bMin, bMax): number`                                      |
| `remapExp`           | function  | `(a, aMin?, aMax?, bMin?, bMax?): number`                                  |
| `remapLog`           | function  | `(a, aMin?, aMax?, bMin?, bMax?): number`                                  |
| `saw`                | function  | `(v, a?, p?): number`                                                      |
| `smooth`             | function  | `(t): number`                                                              |
| `smoother`           | function  | `(t): number`                                                              |
| `square`             | function  | `(v, a?, p?, duty?): number`                                               |
| `Transform`          | interface | Transformation stack element: `position` and `orientation`.                |
| `triangle`           | function  | `(v, a?, p?): number`                                                      |
| `Vector3`            | interface | 3D vector, and the namespace of operations on it.                          |
| `Vector4`            | interface | 4D vector, and the namespace of operations on it.                          |

The eight namespaces carry the work, and none of it is reachable from the type name alone:

| Namespace   | Members                                                                                                                                                                                                                                                                                              |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Vector3`   | `identity`, `x`, `y`, `z`, `is`, `isNaN`, `isFinite`, `equal`, `dot`, `magnitude`, `normalize`, `angle`, `distance`, `copy`, `add`, `addScalar`, `subtract`, `subtractScalar`, `multiply`, `multiplyScalar`, `divide`, `divideScalar`, `cross`, `lerp`, `slerp`, `random`, `sphere`, `read`, `write` |
| `Vector4`   | `zero`, `x`, `y`, `z`, `w`, `is`, `isNaN`, `isFinite`, `equal`, `dot`, `magnitude`, `normalize`, `angle`, `distance`, `copy`, `add`, `addScalar`, `subtract`, `subtractScalar`, `multiply`, `multiplyScalar`, `divide`, `divideScalar`, `project`, `lerp`, `random`, `read`, `write`                 |
| `Quat`      | `identity`, `conjugate`, `multiply`, `axisAngle`, `getAxisAngle`, `fromTo`, `fromEuler`, `fromMatrix`, `transform`, `nlerp`, `slerp`                                                                                                                                                                 |
| `Matrix3`   | `identity`, `is`, `isNaN`, `isFinite`, `equal`, `transform`, `copy`, `determinant`, `transpose`, `invert`, `multiply`, `axisAngle`, `fromQuaternion`, `lookAt`, `push`, `read`, `write`                                                                                                              |
| `Matrix4`   | `identity`, `is`, `isNaN`, `isFinite`, `equal`, `copy`, `fromRotationTranslation`, `fromTRS`, `fromTransform`, `translation`, `scaling`, `transform`, `transformPoint`, `transformDirection`, `multiply`, `transpose`, `determinant`, `invert`, `toMatrix3`, `toTransform`, `decompose`, `toArray`, `toArray3`, `fromArray`, `perspectiveLH`, `orthographicLH`, `lookAtLH`, `push` |
| `Transform` | `identity`, `copy`, `transform`, `revert`, `multiply`, `interpolate`, `push`                                                                                                                                                                                                                         |
| `BoundingBox` | `copy`, `fromPoints`                                                                                                                                                                                                                                                                               |
| `BoundingSphere` | `copy`                                                                                                                                                                                                                                                                                          |

**`Vector4` mirrors `Vector3` except where four dimensions have no counterpart:**

- The zero vector is **`zero`, not `identity`**: `Quat` is an alias of `Vector4` and `Quat.identity`
  is the identity *rotation* `(0, 0, 0, 1)`, so two members named `identity` holding different values
  would be picked wrong. `Vector4.w` is that same value in its role as a basis vector.
- **`Vector4.copy` defaults `w` to `1`, not `0`** — the identity rotation and a homogeneous *point*
  are the same four numbers, so `Vector4.copy(vector3)` lifts a position into homogeneous
  coordinates and `Vector4.copy({})` is `Quat.identity`.
- **There is no `Vector4.slerp`.** `Quat.slerp` handles the double cover; a second, subtly different
  one would only ever be reached by mistake.
- **`Vector4.random` is uniform on the unit 3-sphere** (Shoemake), which for a unit quaternion is a
  uniformly distributed random rotation, not four independent random components.

`Vector4.project` is the perspective divide — `xyz / w`, dropping `w` — that `Matrix4.transform`
leaves to the caller: the clip-space-to-NDC step, where a direction (`w = 0`) has no projection and
the infinities that come back say so rather than being clamped.

**`Matrix3` and `Matrix4` hold transposes of each other, deliberately.** A `Matrix3` on disk is nine
floats whose triples are the *rows* of a column-vector rotation matrix
([RENDERER.md §2](../refs/RENDERER.md#matrices-upload-transposed-and-matrix3transform-is-the-odd-one-out));
a `Matrix4` here is four `Vector4` **columns**, `w` being the translation, so `Matrix4.toArray` is a
straight concatenation and lands column-major — `uniformMatrix4fv` with `transpose = false`, or four
consecutive `mat4` attribute locations. `Matrix4.fromRotationTranslation` transposes on the way in,
which is what makes `Matrix4.multiply(a, b)` apply `b` first where `Matrix3.multiply(a, b)` read
against the file applies `a` first, and `Matrix4.push(stack, child)` compose `parent * child` where
`Matrix3.push` reads the other way. Nothing on disk is a 4x4 — joints, hardpoints and parts all
carry a `Matrix3` and a `Vector3` — so `Matrix4` has no `read`/`write` pair, only
`toArray`/`fromArray`.
