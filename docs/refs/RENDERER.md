# Renderer

Notes for building a WebGL2 renderer on top of this library: a map of where the on-disk structures
do not line up with what WebGL2 offers, and what the retail data contains at each of them.

The format targets Direct3D 8.1. Most of the work of a port is undoing three assumptions D3D8 made
that WebGL2 does not honour: a base vertex index on every draw call, a fixed-function vertex format,
and a row-vector matrix convention.

Every count here is measured against the retail `DATA` tree; the totals are in [Corpus](#corpus).
Where a claim is inference rather than measurement it says so.

## 1. The shape of a draw

```
<model>.cmp (UTF root)
  ├─ VMeshLibrary/<mesh>/VMeshData ── one shared VB + IB per mesh, split into groups
  ├─ Cmpnd/                        ── part list + Cons constraints → the joint tree
  ├─ <part fragment>/              ── MultiLevel or VMeshPart → a VMeshRef into the library
  │    └─ Hardpoints/
  ├─ Animation/Script/<name>/      ── channels driving the joints
  ├─ Material library/<name>/      ── shader name + colours + texture slots
  └─ Texture library/<name>/       ── pixels
```

One frame, per model:

1. Walk the `Cmpnd` tree, composing a world transform per part (§5).
2. Per part, pick a LOD level by camera distance (§4) — that yields one `VMeshRef`.
3. Resolve the ref against the mesh library by CRC, and walk its groups. Each group is one draw call
   with its own material CRC (§3).
4. Bind the material's shader parameters and textures, resolved by CRC against the libraries in the
   same file (§6, §7).

Across retail that is 8,792 refs expanding to 22,090 group draws; the busiest single reference holds
39 groups, and the busiest file (`SHIPS/LIBERTY/LI_DREADNOUGHT/li_dreadnought.cmp`) holds 145.

Resolution is by CRC, and the namespace is global. A `VMeshRef` names its mesh by `getResourceId`
alone with nothing to say which file it lives in. 530 references in `INTERFACE/**` resolve into
`INTERFACE/interface.generic.vms`, which the game loads unprompted. Merge libraries across files
rather than resolving one file at a time — see [VMESH.md](../modules/VMESH.md).

## 2. Coordinate system, winding and matrices

### Winding is consistent, but the screen mapping is not D3DX's

The index order is counter-clockwise when read with a right-handed cross product, measured against
the stored vertex normals ([Corpus](#corpus)).

Freelancer's screen mapping is the mirror of `D3DXMatrixLookAtLH`'s about the vertical axis. Build a
view matrix the way `D3DXMatrixLookAtLH` does — `z = normalize(at − eye)`,
`x = normalize(cross(up, z))`, `y = cross(z, x)` — pair it with a left-handed projection whose x
scale is positive, put the eye at −Z, and world +X lands at ndc x +0.241, on the right of the screen.
The game puts it on the left. Evidence in [The mirror, measured off the
files](#the-mirror-measured-off-the-files).

So there is a reflection to place, and where you put it is the choice:

| Import             | Projection                        | Front face | Notes                                                                      |
| ------------------ | --------------------------------- | ---------- | -------------------------------------------------------------------------- |
| Positions verbatim | left-handed, **x column negated** | `gl.CCW`   | Hardpoint axes, joint axes and `.sur` hulls stay comparable to the data    |
| Negate X on import | left-handed, x column as written  | `gl.CCW`   | Every position, normal, axis and matrix must be mirrored too, consistently |

Both rows are `gl.CCW` — the reflection decides the winding either way. What they trade off is
whether the imported data still matches the file, which is why the first is the one to take.

Why the reflection flips the winding: GL decides facing from the signed area in window coordinates. A
left-handed view space projected onto GL's left-handed NDC preserves handedness, so a triangle whose
right-handed normal faces the camera would arrive clockwise — and negating the x column mirrors that
to counter-clockwise.

**Measure winding through the same view-projection you draw through**, and settle the mirror against
something outside the pipeline. See [The winding probe cannot catch the
mirror](#the-winding-probe-cannot-catch-the-mirror).

Getting the front face wrong on its own renders the model inside-out, and turning culling off "fixes"
it while leaving the lighting wrong. Mirroring positions without mirroring the axes and matrices with
them fails the same way.

One more thing moves with the mirror: whatever names the view's `right` in world space — the vector a
billboard is built from and a pan slides along — is the **negative** of the view matrix's x axis. Read
it unnegated and every camera-facing sprite is mirrored and every pan drags backwards.

No part transform mirrors. Every joint rotation and every hardpoint orientation has determinant +1
and is orthonormal, so winding never flips per-part and a rotation's inverse is its transpose.

### Matrices upload transposed, and `Matrix3.transform` is the odd one out

A `Matrix3` on disk is nine floats: `x.x x.y x.z`, `y.x y.y y.z`, `z.x z.y z.z`. Those triples are
the **rows** of an ordinary column-vector rotation matrix. The part's axes are therefore the *columns*
of the stored triples, not the triples themselves, and reaching GLSL means a transpose:

```js
// correct: the triples become the rows of the mat3
gl.uniformMatrix3fv(loc, true, new Float32Array([x.x, x.y, x.z, y.x, y.y, y.z, z.x, z.y, z.z]))

// same thing written out, transpose flag off
gl.uniformMatrix3fv(loc, false, new Float32Array([x.x, y.x, z.x, x.y, y.y, z.y, x.z, y.z, z.z]))
```

For a 4×4 with translation, those nine go in as rows and `position` in column 3. That is what
`Matrix4.fromRotationTranslation` does, and it is the reason `Matrix4` exists: it holds its four
`Vector4` **columns**, already transposed, so `Matrix4.toArray` is a straight concatenation and
uploads with `transpose = false`. A hardpoint's `orientation` goes through the same call.

Measured on ships whose weapon hardpoints span both the hull, whose part carries no joint, and
rotated wings: guns fire forward whichever part holds them, so the two must agree in root space.
Transposed they come out exactly parallel on every ship measured; untransposed three of seven
scatter, one to 0.631 — confirmed visually across the Liberty ships. Uploading untransposed rotates
backwards every part whose rest rotation is not identity — among the 929 driven joints alone that is
635 of them.

A hardpoint's `orientation` is the same `Matrix3` from the same exporter and wants the same
treatment: its local Z axis is the third *column* of the triples-as-rows. Reading one of the two
matrices each way cancels along any chain that uses both, which can make a wrong convention look
right, or a right one look wrong.

Three consequences for `src/math/`:

- **`Matrix3.transform` and `Matrix3.lookAt` apply the inverse of what the file means.** They take
  the triples for the axes, so `Matrix3.transform(v, M)` rotates by the transpose of `M`.
  `Matrix3.fromQuaternion` and `Matrix3.axisAngle` are the ones that agree with the file — they emit
  rows. Convert at the boundary with `Matrix3.fromQuaternion` and let only matrices reach the shader;
  do not use `Matrix3.transform` to check your work.

  ```js
  Quat.transform({x:1,y:0,z:0}, Quat.axisAngle({axis: Vector3.z, angle: Math.PI/2}))  // (0,  1, 0)
  Matrix3.transform({x:1,y:0,z:0}, Matrix3.axisAngle(Vector3.z, Math.PI/2))          // (0, -1, 0)
  ```

- **`Matrix3.multiply` and `Quat.multiply` take their arguments in opposite orders.**
  `Quat.multiply(a, b)` applies `b` first; `Matrix3.multiply(a, b)` applies `a` first. Neither is
  wrong, and both unit tests use commuting inputs, so nothing in the suite pins either down.

- **`Matrix3.push` and `Transform.push` agree**, and both yield `parent ∘ child`, which is what a
  hierarchy wants. Verified against `Quat.multiply` as an independent reference.

- **`Matrix4` sidesteps all three**, because it holds columns rather than rows. `Matrix4.transform`
  applies the matrix as written, `Matrix4.multiply(a, b)` applies `b` first, and
  `Matrix4.push(stack, child)` yields `parent * child` — the ordinary conventions, at the cost of
  being the transpose of the `Matrix3` it was built from. Convert once, at
  `Matrix4.fromRotationTranslation`, and let only 4×4s reach the shader.

## 3. VMesh → GPU buffers

### 3.1 Vertex formats

`format` is a D3DFVF bitmask; `vertexByteLength` gives the stride. Retail uses eight:

| FVF     | Stride | Position | Normal | Diffuse | UV sets | Meshes |
| ------- | ------ | -------- | ------ | ------- | ------- | ------ |
| `0x112` | 32     | ✓        | ✓      |         | 1       | 1,495  |
| `0x212` | 40     | ✓        | ✓      |         | 2       | 501    |
| `0x102` | 20     | ✓        |        |         | 1       | 86     |
| `0x142` | 24     | ✓        |        | ✓       | 1       | 58     |
| `0x012` | 24     | ✓        | ✓      |         | 0       | 21     |
| `0x152` | 36     | ✓        | ✓      | ✓       | 1       | 11     |
| `0x252` | 44     | ✓        | ✓      | ✓       | 2       | 4      |
| `0x002` | 12     | ✓        |        |         | 0       | 2      |

Attributes are tightly packed in FVF order — position, normal, diffuse, then UV sets — so offsets are
derived by walking the flags in that order, not by lookup. Position is always present, and
`PointSize` and `Specular` never are.

- **`Diffuse` is a `D3DCOLOR`**, a `uint32` holding `0xAARRGGBB`. Little-endian, that is the byte
  sequence B, G, R, A. Bind it as `4 × UNSIGNED_BYTE, normalized` and swizzle in the shader
  (`color.bgra`); binding it as RGBA gives a blue ship.
- **UV origin is top-left** (D3D). GL samples from the bottom-left — see §7, which argues against
  normalizing either side.

Every stride is a multiple of 4, so any of them can be used as a `vertexAttribPointer` offset — which
matters for strategy B below.

### 3.2 The base offset scheme, and what it really means

Three structures each carry an offset, and the relationship between them is the most error-prone
thing in the format.

```
VMeshRef   { vertexStart, vertexCount, indexStart, indexCount, groupStart, groupCount }
VMeshGroup { materialId, vertexStart, vertexEnd, elementCount }
indices[]  uint16, relative
```

**The absolute vertex of an index is `ref.vertexStart + group.vertexStart + index`.** Both offsets
apply; neither is absolute on its own. Measured across all 8,792 references:

| Reading                                         | Group ranges of refs sharing a mesh (892 meshes)                |
| ----------------------------------------------- | --------------------------------------------------------------- |
| index + `group.vertexStart` only                | **overlap in 892 of 892**, cover the buffer in 81               |
| index + `ref.vertexStart` + `group.vertexStart` | overlap in 81, **tile exactly in 811, cover the buffer in 892** |

The minimum `group.vertexStart` within a reference is 0 in all 8,792 references — groups are numbered
from their reference's base, not from the mesh's. From `SOLAR/STARSPHERE/starsphere_br02.cmp`, one
mesh of 1,829 vertices shared by five refs:

```
without ref.vertexStart: [0,539] [0,84] [0,807] [0,179] [0,215]      ← all overlapping
with    ref.vertexStart: [0,807] [808,1347] [1348,1563] [1564,1743] [1744,1828]
```

Two more relationships hold without exception, so both fields are derived rather than authored, and a
loader can assert them:

- `ref.indexStart` equals the summed `elementCount` of all groups before `groupStart` (8,792/8,792).
- `ref.vertexCount` equals `max(vertexEnd) - min(vertexStart) + 1` over the covered groups
  (8,792/8,792).

`vertexEnd` is inclusive: `group.vertexStart + max(index) === group.vertexEnd`, for all 22,416
groups. The vertex window of a group is therefore `vertexEnd - vertexStart + 1` vertices wide.

In D3D8 terms one group is:

```cpp
device->SetStreamSource(0, vb, stride);          // no base vertex — it goes in the draw
device->DrawIndexedPrimitive(D3DPT_TRIANGLELIST,
  ref.vertexStart + group.vertexStart,           // MinIndex, and the base every index is added to
  group.vertexEnd - group.vertexStart + 1,       // NumVertices
  startIndex,                                    // ref.indexStart + Σ prior elementCount
  group.elementCount / 3);
```

`getMeshDraw` in `src/vmesh/library.ts` yields exactly those four numbers, per group: `startIndex`,
`elementCount`, `baseVertex` — the sum above, not `group.vertexStart` alone — and `numVertices`. It
slices nothing, because `baseVertex` is a draw parameter here and has to become something else under
§3.3.

### 3.3 WebGL2 has no base vertex

`gl.drawElements` takes a byte offset into the index buffer and nothing else. There is no
`drawElementsBaseVertex`, so `ref.vertexStart + group.vertexStart` has to go somewhere. Four places
it can go:

**A. Rebase the indices at load — the default choice.** Add the base into each index once, at import,
producing one index buffer per mesh whose values are absolute. One VAO per mesh, one `drawElements`
per group at the group's byte offset.

`uint16` still suffices: the largest retail mesh holds 22,391 vertices, so absolute indices stay far
below 65,535 and the index buffer does not grow. Costs one pass over 22,416 groups at load and
nothing at draw time. Loses the ability to share one uploaded index buffer between two differently
based references of the same mesh — which never happens, since refs partition the buffer rather than
aliasing it.

**B. One VAO per (mesh, base offset), with the base folded into the attribute pointers.**
`vertexAttribPointer`'s offset is in bytes, so `base * stride` shifts the whole vertex layout and the
relative indices then land correctly. Keeps index data byte-identical to the file.

The cost is VAO count. Distinct `(mesh, base)` pairs per file: median 2, 95th percentile 38, maximum
207 (`or_osiris.cmp`); 13,290 across the corpus against 2,176 meshes. One mesh alone can carry 85
distinct group bases. Attribute offsets must be a multiple of the component size — all eight strides
are multiples of 4, so this is always legal.

**C. `gl_VertexID` plus a uniform.** Does not work. `gl_VertexID` is available in WebGL2 (ES 3.00
shaders), but it cannot influence *attribute fetch* — the base is applied by the fixed-function
puller before the shader runs. It only helps if you abandon attributes entirely and fetch vertices
from a buffer texture or UBO by hand, which trades a load-time loop for a permanent one.

**D. `WEBGL_draw_instanced_base_vertex_base_instance`.** Exposes exactly the missing parameter, and
its `WEBGL_multi_draw_*` sibling can also collapse a reference's groups into a single call. Not core,
not universal — worth a fast path, never worth being the only path.

**Recommendation: A**, with D as an optional fast path and B if you need the uploaded buffers to stay
byte-identical to the file. If you go further and merge several meshes into one buffer, indices must
widen to `UNSIGNED_INT` and you should avoid emitting `0xFFFF`/`0xFFFFFFFF` — WebGL2 gives no toggle
for primitive restart, and the fixed index is treated as one.

### 3.4 Draw calls and grouping

`primitive` is a `D3DPRIMITIVETYPE` and the enum carries all six. Every retail mesh is `TriangleList`
(asserted by `vmesh/corpus.test.ts`), but the engine passes the field through to
`DrawIndexedPrimitive` unexamined, so a mesh authored as points, lines or strips draws as such. Map
it to the matching `drawElements` mode — `POINTS`, `LINES`, `LINE_STRIP`, `TRIANGLES`,
`TRIANGLE_STRIP`, `TRIANGLE_FAN` — rather than assuming triangles; the group merging below applies
only to the list modes, since strips and fans are not concatenable.

Groups within one reference are contiguous in the index buffer, so consecutive groups sharing a
material can be merged into a single `drawElements`. Meshes carry 1–12 distinct materials each (588
have exactly one), so the win is modest; sorting draws by material across parts matters more.

### 3.5 The wireframe overlay

`VMeshWire`/`VWireData` is the line overlay drawn over a ship in the scanner and dealer views. It
addresses the same `VMeshLibrary` mesh by CRC but supplies its own `LineList` index buffer.

It has the same base offset problem, and it bites harder: 2,330 of 3,539 wires have a non-zero
`vertexStart`, and its indices are likewise relative to it. `vertexStart`/`vertexRange` are the
`MinIndex`/`NumVertices` pair. Reuse the mesh's VAO (strategy A rebases these indices too) and bind a
separate element buffer.

## 4. Level of detail

A rigid part holds either a bare `VMeshPart` or a `MultiLevel` of them:

- `Switch2` holds N+1 breakpoints for N levels; `ranges[0]` is 0 in every retail model.
- `atRange(multiLevel, distance)` returns the level whose `[ranges[i], ranges[i+1])` contains the
  camera distance, or `undefined` past the last breakpoint — the model's cue to vanish, not a bug to
  clamp away.
- LOD is per part, not per model. Each part carries its own `MultiLevel`, and a large ship's parts
  switch at different distances.
- Four capital ships carry denormal junk in the middle of `Switch2`. The reader hands the breakpoints
  back verbatim; a renderer should tolerate a non-ascending list rather than sort it (sorting changes
  which level shows).

Deformable models do it differently: a `.dfm` carries `Fractions` per level
(`1, 0.8, 0.6, 0.4, 0.2, 0.1`), a fraction of a detail range supplied by the INI that places the
character.

## 5. The joint graph

### 5.1 Building the tree

`readModel` returns the root `Model<RigidPart>`; children hang off `children`, each with the `joint`
that attaches it to its parent. The hierarchy comes from the `Cons` constraint list, not from
directory nesting — the fragment directories are all flat siblings of `Cmpnd`. Names are matched by
`getResourceId`, and part names may carry leading or trailing spaces.

`trade_turret01.cmp` constrains a part it never declares; `arrangeByConstraints` drops the unresolved
constraint and assembles the rest. A renderer should do the same rather than refuse the model.

Joint records across the rigid and deformable corpus:

| Type        | Records | Driven by                                                             |
| ----------- | ------- | --------------------------------------------------------------------- |
| `loose`     | 6,343   | position + rotation                                                   |
| `fixed`     | 4,370   | nothing                                                               |
| `sphere`    | 2,770   | rotation                                                              |
| `prismatic` | 504     | one float, offset along `axis`                                        |
| `revolute`  | 425     | one float, angle about `axis`                                         |
| `cylinder`  | 0       | cannot be animated at all — see [COMPOUND.md](../modules/COMPOUND.md) |

### 5.2 Composing a joint

Measured over every record that has the fields:

- `offset` (`child_point`) is exactly zero in all 3,699 records that carry one.
- `axis` is unit length in all 929 records that carry one.
- `position` is non-zero in 13,865 of 14,412.
- No revolute or prismatic joint has `min === max === 0`.

`position` (`parent_point`) and `offset` (`child_point`) are the two ends of one contact: the point
named in the *child's* frame lands on the point named in the parent's. So `offset` subtracts on the
far right of the product, past the rest rotation and past whatever degree of freedom the joint is
driven through:

```
fixed, loose   L      = T(position) · R(rotation)
revolute       L(θ)   = T(position) · R(axis, θ) · R(rotation) · T(-offset)    θ ∈ [min, max]
prismatic      L(d)   = T(position) · T(axis · d) · R(rotation) · T(-offset)   d ∈ [min, max]
cylinder       L(θ,d) = T(position) · T(axis · d) · R(axis, θ) · R(rotation) · T(-offset)
sphere         L(q)   = T(position) · R(q) · R(rotation) · T(-offset)
world          W_child = W_parent · L_child
```

`fixed` and `loose` have no second point in the record. Because `offset` is zero in every retail
record, all four of the others reduce on retail data to a translation, the rest rotation and the
driven degree of freedom — the trailing factor is there for authored assets.

**The driven factor goes on the left, before the rest rotation.** That is `axis` living in the
*parent* frame, which is what the `Cyl` struct comment inherited from Conquest: Frontier Wars says.
The two orders coincide only where the rest rotation is identity, true for just 294 of the 929 driven
joints, so 635 come out visibly wrong under the other. Nothing in the files separates them; settled
by playing retail scripts under both orders.

**`offset` is a contact point, not a pivot.** MAXLancer's `scripts/Transform.ms` composes its axis
and spheric joint controllers as `preTranslate (translate R position) -offset`, which in
column-vector order is `T(position) · R · T(-offset)` — the offset *inside* the rotation, one
trailing factor, not a conjugating pair. A pivot would leave the child's contact point where it
already was; this moves it onto the parent's. Whether the engine reads it on a `Pris` at all is open
— see [TODO](#todo).

### 5.3 Animation

`Animation/Script/<name>` holds maps; a `.cmp` embeds them beside `Cmpnd`, a `.dfm` keeps them in a
standalone `.anm`. Both parse through the same `readAnimationLibrary(root)`.

- An **`ObjectMap`** names one object (`Parent name`) and moves the model root in its own space.
  Position and rotation only.
- A **`JointMap`** names `Parent name` and `Child name` and drives the joint between them. Which
  field of the sample applies follows the joint type: `value` for revolute and prismatic, `rotation`
  for sphere, both `position` and `rotation` for loose.

`sampleChannel(channel, time)` lerps position, slerps rotation and lerps the scalar. A channel with a
negative `interval` stores a timestamp per keyframe; otherwise keyframes are evenly spaced at
`i * interval`.

**Every sample is a delta on the joint's rest, loose included.** §5.2's composition takes the driven
factor to the left of the rest rotation, and a loose channel's *position* goes the same way — added
to the rest origin in the parent's frame, not substituted for it:

```
loose  L(p, q) = T(position + p) · R(q) · R(rotation)
```

No retail `.cmp` script drives a loose joint, so only `.anm` data settles it, and it does: 1,955,761
position keyframes nearer zero than their joint's rest origin against 1,854 nearer the rest, and
1,904,934 rotations nearer the identity against 4,713. See [ANIMATION.md](../modules/ANIMATION.md). Read as a
replacement, every head bone in the game collapses onto its parent's origin.

**A revolute channel's scalar is an angle and must be interpolated as one, where its storage is
wrapped.** All 414 retail revolute channels keep the angle inside (-π, π], so `sampleChannel`'s plain
lerp runs an almost-full turn backwards wherever a keyframe pair steps across the seam — 150 of them
do. Take the short way round: `a + wrap(b - a) · span`, with `wrap(d) = d - 2π·round(d / 2π)`, which
drops the direction reversals across retail from 492 to 155. Test the channel first: wrapped means no
value leaves the band, and a channel that does leave it is stating a real sweep past half a turn.
Retail never does; mods do. **Never do this to a prismatic channel**, whose scalar is metres on a
line; 370 of 543 of those step over π and every one means it. `ChannelType.Angle` is a single bit
shared by both, so only the joint says which — see [ANIMATION.md](../modules/ANIMATION.md).

**Channels loop at their own lengths, not the script's.** `getScriptDuration` is the longest map, and
a shorter channel cycles inside it rather than holding — `rift_pylon.cmp` gives one script channels
of 2, 4, 8 and 16 seconds. 14 of retail's 186 multi-map `.cmp` scripts mix lengths. Keep the playback
clock on the script and wrap per channel underneath it.

**`getScriptDuration` is the last keyframe's own key, not the key after it**, so a clock that reads
`t mod duration` lands on zero at exactly the end. Looping wants that; *holding* on the last frame
does not, and gets the first frame instead — a door left open at the end of its closing animation.
Wrap in the clock, where the choice is known, and clamp at the sampler.

Rotations arrive in four encodings — full float W-X-Y-Z, implied identity, and two `int16`
quantizations — all decoded to a `Quat` by `readChannel`. Convert with `Matrix3.fromQuaternion` and
compose in matrix space, per §2.

### 5.4 Traversal

One depth-first walk per model per frame produces a `mat4` per part. Costs are small — refs per file
have a median of 1 and a 95th percentile of 32 — so per-draw uniform uploads are fine.

**Hardpoints** compose the same way: `T(position) · R(orientation)` in their owning part's space,
then the part's world transform. All 12,053 have determinant +1, so an attached model never mirrors.

`orientation` takes the same transpose as a joint's `rotation` (§2); reading the two with different
conventions cancels along the chain, so a mounted gun can point the right way for the wrong reason.

## 6. Materials

`readMaterials(root)` yields a flat list resolved by CRC from a group's `materialId`. A material is a
shader name plus an open set of properties — the type does not determine which properties are
present, so read what is there and default nothing (see [MATERIAL.md](../modules/MATERIAL.md)).

The `Type` string is the shader selector, and its tokens name the inputs:

| Token       | Meaning                   | Renderer consequence                           |
| ----------- | ------------------------- | ---------------------------------------------- |
| `Dc` / `Dt` | diffuse colour / texture  | base colour; `Dt` alpha is the opacity channel |
| `Ec` / `Et` | emission colour / texture | additive, unlit                                |
| `Bt`        | detail texture            | blended over diffuse                           |
| `Oc` / `Ot` | opacity                   | **alpha blending on**                          |
| `Two`       | two-sided                 | **`gl.disable(gl.CULL_FACE)`**                 |

Measured: 243 two-sided materials and 904 that want blending out of 7,525. `DcDt` alone is 4,308, so
the common path is a lit, textured, opaque, back-face-culled triangle.

Draw order follows: opaques first sorted by material to minimise state changes, then blended
materials back-to-front with depth writes off. Nothing in the format records a render order, so this
is convention, not data.

**Texture slots** are a `<slot>_name` / `<slot>_flags` pair. The name resolves by CRC against a
`Texture library` — retail names look like filenames but are not paths, and the extension is often
stale. The flags word is three settings packed together, of which only the address modes are
actionable:

| Bit  | Meaning         | Maps to                          |
| ---- | --------------- | -------------------------------- |
| 1    | Clamp U         | `TEXTURE_WRAP_S = CLAMP_TO_EDGE` |
| 3    | Clamp V         | `TEXTURE_WRAP_T = CLAMP_TO_EDGE` |
| 0, 2 | Mirror U / V    | never set in retail              |
| 4, 6 | wrap mode field | purpose unresolved; ignore       |

Only six distinct words occur, and clamping appears only on `Dt`. Everything else is `REPEAT` —
which matters, because sampled UVs run well outside 0..1 (measured range roughly −34..87 in U and
−34..810 in V). WebGL2 allows `REPEAT` on any texture, power-of-two or not.

`Nt_name` is the one property with a compiled-in default, `NomadRGB1_NomadAlpha1`, exported as
`defaultNomadTextureName`. No retail material carries the slot, so apply the default at bind time.

**`MaterialAnim`** (root-level sibling of `Cmpnd`, rigid models only) animates a material's UV
transform: per-segment offset and scale velocities, with `MAKeys` giving the transform each segment
starts from and four zeros before the first. Apply it as `uv · (1 + scale) + offset` — offset after
scale, the scales stored as displacements from 1 — on UV0, from a clock that starts at load and
always loops. Feed it as a uniform; it changes per material per frame, not per vertex. See
[RIGID.md § What the game does with it](../modules/RIGID.md#what-the-game-does-with-it).

## 7. Textures

`readTextures(root)` yields `TextureEntry` — narrow on `type === 'animated'` first, then on
`storage`. The three storage forms map to three different upload calls:

| `storage` | Retail count | Upload                                                                              |
| --------- | ------------ | ----------------------------------------------------------------------------------- |
| `dds`     | 4,447        | `compressedTexImage2D` per level (block formats) or `texImage2D` (uncompressed DDS) |
| `targa`   | 2,400        | `texImage2D` per level                                                              |
| `cube`    | 2            | six faces, `+X -X +Y -Y +Z -Z`, in that order                                       |

Pixel formats present: `dxt1` 4,230, `rgb24_888` 1,789, `rgba32_8888` 615, `dxt3` 129, `dxt5` 42,
`rgba16_5551` 24, `rgb16_565` 20.

Things that will bite:

- **S3TC is an extension even in WebGL2.** Request `WEBGL_compressed_texture_s3tc`; 4,401 of the
  6,849 image entries — 64% — are block-compressed and unreadable without it. `dxt1` must upload as
  `COMPRESSED_RGBA_S3TC_DXT1_EXT`, never the RGB variant — punch-through is selected per block and
  nothing in the container flags it, so the RGB decode renders those texels opaque black.
- **Upload in file order, except a Targa chain reporting `flip: true`, whose rows go in reversed.**
  That is what the game's loader does: every image ends up bottom row first, the UVs beside it put
  zero at the image bottom, and V = 0 samples the first row uploaded. A DDS declares top-down for all
  4,447 retail surfaces and is copied as stored regardless, so `flip` is an instruction for
  `storage: 'targa'` only — nine chains in retail, seven of them the grid animations' atlases. See
  [TEXTURE.md § What the game reorders](../modules/TEXTURE.md#what-the-game-reorders). The reversal is
  a CPU copy of an uncompressed level, so `UNPACK_FLIP_Y_WEBGL` still never comes up, which is as
  well: `compressedTexImage2D` raises `INVALID_OPERATION` when it is set.
- **`UNPACK_ALIGNMENT` must be 1 for `rgb24_888`.** Rows are `width * 3` bytes, which is not a
  multiple of 4 for most widths, and the default alignment of 4 shears the image.
- **Mip chains are usually incomplete.** 4,394 stop at 4×4 (six more at 8×4) and 807 hold a single
  level. Set `TEXTURE_MAX_LEVEL` to `levels - 1`, or allocate with `texStorage2D` at exactly that
  count — otherwise the texture is incomplete and samples black. `generateMipmap` is not an option
  for compressed data and would be wrong for the rest.
- All retail textures are power-of-two; 20 are non-square. WebGL2 handles both, and `RGB565`, `RGBA4`
  and `RGB5_A1` are core sized formats, so the 16-bit entries need no expansion.
- 12 entries are animated — a `Frame rects` table over sibling atlas entries. Resolve the frame to a
  UV rect at bind time; the sheet is an ordinary texture, and **frame V is ordinary V** — provided
  the atlas was uploaded as the game loads it. All seven tiled atlases are top-left Targas; upload one
  in file order and every tiled animation plays its rows backwards. See
  [TEXTURE.md § Animated textures](../modules/TEXTURE.md#animated-textures).

## 8. Deformable models

A `.dfm` is one skinned mesh per detail level plus a bone tree. The compound layer is byte-for-byte
the rigid one, so §5 applies unchanged — `getBoneModel` returns the same `Model<T>` tree.

- **Bones are an ordered table**, and `Index` is the bone's directory position. That position, not
  the name, is what `Bone_id_chain` skins to.
- **`Bone to root` is stored as the *inverse* bind — read it, do not invert it.** The skinning matrix
  is `pose(bone) · inverse(bindPose)`, and what the file holds under that name is already
  `inverse(bindPose)`: reading the nine floats as rows and the three that follow as a translation,
  the matrix maps root space **into** bone space. So with a `Bone` as this library reads it the
  product is `pose(bone) · Matrix4.fromRotationTranslation(bone.rotation, bone.position)`, with no
  inversion anywhere, and the forward bind pose — where a bone actually sits, and where a debug gizmo
  goes — is that matrix inverted. All bone rotations have determinant +1, so the inverse is
  `[Rᵀ | -Rᵀt]`. Librelancer names the same matrix the other way round — see
  [Librelancer's `BoneToRoot`](#librelancers-bonetoroot).

  Measured: composing `bindPose(bone) · asRead(bone)` over all 9,456 retail
  bones gives the identity to 8.88e-16, and skinning every one of the 855,377 drawn vertices with the
  resulting table moves them 3.14e-7 at worst. Points are stored in bind-pose root space.

- **A body's `Cons` chain is not its bind pose, so bind pose is what "rest" means.** For heads and
  hands the constraint chain reproduces the bind pose exactly — 6,543 of 6,543 head bones and 252 of
  252 hand bones — but all 88 bodies disagree, displacing their own points by 0.828 on average and
  4.556 at worst, and not rigidly: pairwise distances change by up to 1.19 on a figure 1.6 tall.
  `br_bartender_body.dfm`'s mesh spans y −0.97..0.63 while its chain lays the skeleton along
  z −0.10..1.23. A renderer with no animation loaded takes each bone's pose from its own
  `Bone to root`; composing down the chain draws every body mangled.
- **At most 4 influences per point** across all 204 models — a `vec4` of weights and indices. Bones
  per model reach 86; a character assembles from a head, a body and two hands sharing hardpoints, so
  budget for the sum. At 86 bones a `mat4` array is 344 vec4s and even a `mat3x4` one is 258 — both
  past the 256-vec4 floor WebGL2 guarantees for vertex uniforms. Use a uniform block (the guaranteed
  16 KB holds 256 `mat4`) or a bone texture, not a plain uniform array.
- **Positions and UVs are indexed separately.** A drawn vertex is `Point_indices[i]` paired with
  `UV0_indices[i]`, which lets a UV seam split without splitting the skinning weights. GPUs have one
  index stream, so weld the pairs into unique vertices at load and rewrite the face group indices.
- **All 4,184 face groups are triangle strips** (`Tristrip_indices`). Convert to lists at load: it
  makes group merging possible and sidesteps WebGL2's untoggleable primitive restart. Triangle `i` is
  `(i, i+1, i+2)` for even `i` and `(i+1, i, i+2)` for odd, and degenerates are skipped without
  disturbing that parity — the parity follows the position in the strip, not the count emitted. Not
  an optimisation: the exporter stitches short runs together with repeated indices, spending 1,014
  strip entries on 204 triangles in one hand mesh, and emitting them draws zero-area triangles across
  the model. That parity is the one agreeing with the stored vertex normals under a right-handed
  cross product, 542,903 against 4,828 over 547,731 triangles — the same convention §2 gives for
  rigid meshes.
- **`Lod Bits` is a permission, not a usage mask** — all bits or none, and 2,237 bones with every bit
  set appear in no `Bone_id_chain`. Do not use it to decide which bones a level needs.
- **An `.anm` drives the `Cons` chain, and §5.3 applies unchanged.** A joint map names a bone by its
  `Object name` and the chain supplies the joint, which for a `.dfm` is only ever `Sphere` or
  `Loose`, so the revolute wrap has nothing to do here. Names match exactly: all 27 constrained bones
  of a body are driven by every one of `bodygenericmale.anm`'s 455 scripts, and 59 of 59 on a head by
  `facialmale.anm`'s 769. A bone the script does not name stays at its joint's rest, not at its bind
  pose — mixing the two composes a posed skeleton in two spaces at once.
- **Which `.anm` a model takes is not in the model.** `Skeleton/Name` names the `.cmp` the model was
  authored against — `Head02.cmp` ×104, `AutoHeaderNode.cmp` ×87, `L Palm.cmp` and `R Palm.cmp` ×6
  each, `torture_root.cmp` ×1 — and never an animation file. The eleven `.anm` files under
  `CHARACTERS/ANIMATIONS` are bound to models by `bodyparts.ini`'s `[Skeleton]` groups, so the
  association is the load-order layer's. Each file covers a category and not a model: `handmale.anm`
  carries both hands, so 26 of its 54 scripts drive a right hand and 28 drive none of it.
- **`Root height` places the character in a room, not the skeleton in the model.** On all 455 body
  scripts and no facial or hand one; Librelancer applies it to the world object beside a floor height
  a THN event sets. A renderer with no room applies nothing — see [ANIMATION.md](../modules/ANIMATION.md).
- The eleven `UV_*` files on `Mesh0` of 104 heads slide eye and mouth patches across a sprite sheet
  driven by a bone's translation. Skippable for a first renderer; the face will not blink.

## 9. Particles

An `.ale` is a node library and an effect library in one container, both unwrapped by `readAlchemy`.
Corpus: 596 files, 1,213 effects, 5,575 nodes, 6,648 instances, of which 5,505 reference a node.

Four resolution rules, each of which produces a working renderer that draws the wrong thing:

- **Hashing is case-sensitive here and nowhere else** — `getResourceId(name, true)`. Folding the way
  every other lookup in this library does strands 2,691 of the 5,505 references.
- **The namespace is global**, exactly as VMesh's is (§1), so merge the node libraries the same way.
  All 5,505 references *are* defined in their own `.ale` — but that is the exporter's habit, not a
  scoping rule, and reading it as one is a mistake this document made. **146 of the 5,429 distinct
  names are defined in more than one file and 111 of those disagree**, so 219 references land on a
  name whose meaning depends on load order, and the consumer's load order is what settles them.
  Resolving one file at a time hides that rather than avoiding it.
- **`flags` decides whether an instance names a node; `DefaultId` decides where the effect is
  placed.** An instance with `flags` set is a container, built without looking its CRC up. The
  container whose CRC is `0xee223b51` is the effect's **attachment root**, and the placement matrix
  the host gives the effect is applied to that node alone. Retail sets both on all 1,143 containers,
  so either test recognizes one. See
  [ALCHEMY.md](../modules/ALCHEMY.md#two-fields-two-jobs-flags-makes-a-container-defaultid-makes-it-the-root).
- **Place the root, not the effect.** Nodes under the root move with the placement; a node at the
  top level beside it does not. Particles are stored in their appearance's frame, so an emitter
  under the root and its appearance beside it leave a trail: every birth comes out where the emitter
  is now, and every particle stays where it was born. Multiplying the placement over the whole
  effect at draw time puts every particle back on the emitter and erases the trail. 277 of the
  1,143 rooted retail effects are laid out this way
  ([Corpus](../modules/ALCHEMY.md#the-container-instance)).

An effect is a tree of `NodeInstance` with two independent edge sets: `children` for containment, and
`targets` — resolved from the flat `Pair` table — for the emitter → appearance binding. Walking only
`children` finds the nodes and none of the pairings.

### 9.1 What varies per particle, and what does not

**No appearance parameter is randomized per particle.** Every visual property is a pure function of
`(sparam, t)` — sparam being the engine-supplied blend control, `t` the normalized particle lifetime.
Randomness enters only at spawn, through `CubeEmitter_Min/MaxSpread`, `SphereEmitter_Min/MaxRadius`,
`ConeEmitter_Min/MaxSpread` and `Emitter_InitLifeSpan`, and lands in per-particle state rather than
in the curves.

| Scope                                   | Values                                                                               |
| --------------------------------------- | ------------------------------------------------------------------------------------ |
| Per appearance node — **the batch key** | `BasicApp_TexName`, `BasicApp_BlendInfo`, tri/quad, `FlipTexU`/`FlipTexV`, node type |
| Per emitter instance                    | sparam                                                                               |
| Per particle                            | spawn position, velocity, spawn time, lifespan                                       |
| Derived, `f(sparam, t)`                 | colour, alpha, size, aspect, rotation, atlas frame                                   |

So a particle's entire visual history is fixed at spawn. One exception matters before designing a
vertex format: with `BasicApp_UseCommonTexFrame` clear, each particle indexes the atlas from its own
age, so the frame cannot be a draw-level uniform.

### 9.2 What actually draws

Instanced node types, by count — the 5,505 references, not the 5,575 nodes, since 143 nodes are
referenced by nothing and a shared node is referenced more than once:

| Category           | Types and counts                                                                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Appearance (2,637) | `FxBasicAppearance` 1,797 · `FxRectAppearance` 431 · `FxPerpAppearance` 219 · `FLBeamAppearance` 164 · `FxParticleAppearance` 20 · `FxMeshAppearance` 4 · `FLDustAppearance` 2 |
| Emitter (2,653)    | `FxSphereEmitter` 1,497 · `FxConeEmitter` 787 · `FxCubeEmitter` 369                                                                                                            |
| Field (215)        | `FLDustField` 64 · `FxAirField` 53 · `FxTurbulenceField` 41 · `FxGravityField` 33 · `FxRadialField` 21 · `FxCollideField` 3                                                    |

Seventeen node types occur in the libraries but sixteen ever draw: `FLBeamField` exists as exactly
one node in the whole corpus and no instance references it. `FxNode` and `FxOrientedAppearance` are
declared by the format and appear nowhere.

Appearance nodes per effect: median 2, 95th percentile 5, maximum 11; exactly one effect has none.
Distinct `BasicApp_TexName` per effect: median 2, maximum 6. Those two numbers bound what any
batching scheme can win — see §9.4.

### 9.3 Four ways to get quads on screen

**A. A CPU-expanded, world-space vertex stream.** Build six vertices per particle, already
billboarded, and hand them over. No model matrix — the view-projection is the only bound matrix,
which is what collapses a whole emitter into one `drawArrays`. Simple, and testable without a GL
context. Cost is a per-frame rewrite of every live particle.

**B. Instanced quads.** A static corner buffer plus per-instance attributes through
`vertexAttribDivisor`, with the billboard basis built in the vertex shader. Cuts per-frame bandwidth
roughly fourfold and moves the basis math off the CPU. It does not reduce draw calls — those are
already one per appearance node under A. `BasicApp_TriTexture`/`QuadTexture` selects a 3- or 4-vertex
sprite, so either carry two base geometries or always emit the quad.

**C. Instanced, with the curves evaluated on the GPU.** Because every appearance parameter is
`f(sparam, t)` (§9.1), a node's whole curve set bakes into a `p × t` lookup texture or a small
uniform block, sampled in the vertex shader. The per-instance record then becomes write-once at
spawn: for a steady-state emitter the per-frame upload tends to zero instead of scaling with live
particle count. The only option that changes the asymptotics rather than the constant.

**D. Simulation on the GPU, via transform feedback.** Rejected on architectural rather than
performance grounds. Emission is an integral of `Emitter_Frequency` rather than a sample, so the
particle pool is the one stateful thing in an otherwise pure pipeline; keeping it on the CPU at a
fixed step is what makes it a function of `(sparam, time)` again, which a timeline scrubber and a
headless sweep both require.

**Recommendation: A, with C as the destination and B as the step between.** B alone optimizes the
cheaper half of the problem; C is what exploits the data model, and B is its prerequisite. None of it
is urgent — see §9.5.

### 9.4 Blend modes, and why sorting is mostly unnecessary

`BasicApp_BlendInfo` is a `D3DBLEND` source/target pair. Only nine distinct pairs occur across 2,658
retail properties, and 2,489 of them are `SourceAlpha`/`One` — plain additive.
`SourceAlpha`/`InverseSourceAlpha` accounts for 161 more; the remaining seven pairs are one or two
instances each.

Additive is order-independent, so ~94% of particle draws need no depth sort: depth test on, depth
write off, quads in any order. Only the ~6% remainder wants back-to-front, and sorting per-instance
records is cheaper than sorting six-vertex spans.

Merging batches *across* appearance nodes means making the texture stop being per-batch state, via an
array texture or an atlas. At a median of 2 appearance nodes and 2 distinct textures per effect that
is worth nothing for a single effect; it only pays when many effects are on screen at once.

Two things to tolerate rather than reject: `BlendingMode.None` is 0 and means the property is unset,
not a D3D mode (the D3D enum starts at 1); and `gf_small_damage.ale` writes `BothSourceAlpha` as a
*target*, a slot Direct3D would refuse. Both are real bytes that round-trip.

### 9.5 Collapse the constant curves first

The cheapest win, independent of every option in §9.3. Of the 27,662 looped lists behind the 26,617
`AnimatedCurve` properties, 14,127 are empty and 11,791 hold a single keyframe — 25,918 of 27,662 are
constants wearing an animation's clothes. Only 1,744 hold more than one key, and 40 of those put
every key on the same key value.

Folding those to scalars at load removes most sampling work under any draw strategy, and shrinks a
option-C lookup table to the handful of nodes that genuinely animate.

One hazard if the evaluator is ported to GLSL: Hermite tangents are stored per unit of key, not per
unit of span. `hermiteAt` scales by `delta = end.key - start.key`, and 9,322 of 9,324 retail
intervals are not 1 wide, so dropping the scale overshoots by roughly the reciprocal of a typical
0.03 interval. Only 562 of 25,081 keyframes carry a non-zero tangent, so the mistake stays invisible
across most of the corpus.

### 9.6 Where the billboard model stops

188 of the 2,637 appearance references — about 7% — do not fit an instanced quad:

- **`FLBeamAppearance` (164)** chains particles into a strip, so it needs them in emission order. A
  pool that recycles slots by swapping the last entry into the freed one does not keep that order,
  and the resulting strip crosses itself.
- **`FxParticleAppearance` (20)** spawns whole sub-effects per particle, named by
  `ParticleApp_LifeName`/`ParticleApp_DeathName`. The draw walk recurses rather than being flat.
- **`FxMeshAppearance` (4)** draws real geometry per particle via `MeshApp_MeshName`, routing through
  §3 and §6 instead. The one place in the format where classic mesh instancing applies, and the least
  used. `FX/MISC/tlrtube.3db` is residue of this feature and crashes the retail game when a particle
  spawns for it — see [RETAIL.md](RETAIL.md).

A fourth fits the geometry but not the parameter model: **`FLDustAppearance` (2)** samples its alpha
at particle age like any appearance, then multiplies it by a term computed from the camera's speed,
and stretches each quad along the particle's motion across the view since the last frame — the space
dust that fades in as the camera moves. It declares no property `FxBasicAppearance` lacks, so the
node type is the entire signal; retail `alchemy.dll` holds the arithmetic (`0x620fcb0`).

`FxRectAppearance` (431) is a velocity-aligned stretched quad rather than a camera-facing one. It
keeps the vertex count and the batch key, so it instances alongside the billboards under a different
orientation rule.

### 9.7 Culling

Nothing in an effect states a bound. The four version-1.1 `Effect` floats are plausibly a centre and
radius — `unknown4` is never negative and ranges to 56, the other three are unconstrained in sign —
but this is inference and the reading is unconfirmed
([ALCHEMY.md § TODO](../modules/ALCHEMY.md#todo)). It is also the only per-effect volume the format offers, so a
renderer that wants to cull effects must either test that reading or derive a bound from the
emitters.

## 10. Checklist

Things that produce a plausible-looking but wrong image, in rough order of how long they take to
find:

1. `ref.vertexStart` dropped — 6,535 of 8,792 references draw the wrong vertices, and single-part
   models look fine throughout (§3.2).
2. Diffuse colour read as RGBA instead of BGRA (§3.1).
3. `TEXTURE_MAX_LEVEL` unset on a chain that stops at 4×4 — black textures (§7).
4. `UNPACK_ALIGNMENT` left at 4 for `rgb24_888` — sheared image (§7).
5. The projection's x column left unnegated — the whole scene mirrored, invisible on a ship and
   unmissable on a sign, and a winding probe sharing the projection cannot catch it (§2).
6. `vertexEnd` treated as exclusive — the last vertex of every group missing (§3.2).
7. A `Matrix3` uploaded untransposed — every part whose rest rotation is not identity assembles
   rotated backwards, which reads as a broken model rather than as a mirror (§2).
8. A joint's `rotation` and a hardpoint's `orientation` read with different conventions — the error
   cancels along a chain that uses both, so it can hide, or frame the wrong suspect (§2).
9. UV `v` flipped in some paths and not others — textures upside down only on the Targa half of a
   model (§7).
10. `Two` ignored — one-sided cockpit glass and foliage (§6).
11. Alchemy node names hashed case-folded — 2,691 of 5,505 instance references resolve to nothing, so
    roughly half of every effect is silently missing rather than visibly broken (§9).
12. A particle container detected by its CRC instead of its `flags` — correct on all 1,213 retail
    effects and wrong on the first asset another tool writes (§9).
13. Hermite tangents applied without the `end.key - start.key` scale — only 562 of 25,081 keyframes
    carry a non-zero tangent, so almost everything still looks right (§9.5).
14. A driven joint composed with the rest rotation on the left — 635 of 929 driven joints assemble
    wrongly, and the 294 whose rest rotation is identity keep looking right (§5.2).
15. An animation clock wrapped at `getScriptDuration` while *holding* — the last frame of a script
    shows its first, so a closing door ends open (§5.3).
16. A revolute angle lerped on a line instead of round a circle — 150 of 414 retail channels whip
    backwards through a seam, and the other 264 look perfect (§5.3).
17. …or lerped round a circle unconditionally, which reverses any channel that stores a sweep past
    half a turn. No retail channel does; a mod's will (§5.3).
18. Every channel of a script run to the script's duration — the short ones freeze while the long
    ones play, on 14 of retail's 186 multi-map scripts (§5.3).

## Notes

### The mirror, measured off the files

Take a wall face, stand a viewer in front of it (`forward = −N`, `up = +Y`,
`right = cross(up, forward)`), and ask which way the texture's `u` runs. Across
`li_01_manhattan_cityscape`, `br_01_avalon_cityscape` and `br_03_warwick_cityscape`, all 60 faces
carrying legible signage have `u` increasing to the viewer's left — 60 of 60; whole models run the
same way about 4:1. The lettering on those textures — *Weather*, *SODA*, *Avalon*, *THE STORYTELLER*
— is plainly readable in game, so the mapping that produces them readable is the game's.

Librelancer lands on the same image by a third route. It uploads the vertex buffer verbatim
(`Utf/Vms/VMeshData.cs`) and then uses **`System.Numerics`' right-handed** `Matrix4x4.CreateLookAt`
and `CreatePerspectiveFieldOfView` (`Render/Cameras/LookAtCamera.cs:31`), never the `…LeftHanded`
variants, which appear nowhere in the tree. A right-handed `CreateLookAt` takes
`z = normalize(eye − target)` and so yields `x = cross(up, z) = (−1, 0, 0)` where `LookAtLH` yields
`(+1, 0, 0)` — the same eye, the mirror image, `+X` on the left. And it never calls `glFrontFace` at
all, leaving GL's `CCW` default; the only culling state it sets is `glCullFace(GL_BACK)`
(`Graphics/Backends/OpenGL/GLRenderContext.cs:203`). Right-handed view space reverses handedness once
in the projection, which is what makes that default correct there.

### The winding probe cannot catch the mirror

Measure the winding through an unmirrored `perspectiveLH` and a camera-facing retail triangle comes
out clockwise 18,268 times against 2. That number is correct, reproducible, and endorses `gl.CW` —
which, paired with the unmirrored projection, is perfectly self-consistent and draws every model
*mirrored*. It is invisible on a ship, because ships are very nearly symmetric about their long axis;
it is unmissable the moment anything carries lettering. The probe and the renderer share the
projection under test, so the mirror has to be settled against something outside the pipeline —
texture `u` on a legible sign is the cheapest such thing in the corpus.

### Librelancer's `BoneToRoot`

Librelancer computes `InvBindPose = boneToRoot.Inverse()` and looks like it disagrees with §8; it
does not. Its *reader* has already inverted — `ConvertData.ToMatrix4x3` transposes the 3×3 and
negates the translation before composing — so its `BoneToRoot` is the inverse of what
`fromRotationTranslation` gives here. One operation, two names for the matrix, and taking both
statements at face value inverts once too many.

### Older package versions

`getMeshDraw` once sliced the vertex buffer at `group.vertexStart * stride`, the overlapping reading:
correct for the 2,257 references whose `ref.vertexStart` is 0, wrong for the other 6,535. If you hold
an older copy of the package, treat its `vertices` field as unusable and compute the base yourself.

## Corpus

The totals this document is written against, all from the retail `DATA` tree:

|                   | Count                                  |
| ----------------- | -------------------------------------- |
| Meshes            | 2,178                                  |
| Mesh groups       | 22,416                                 |
| Mesh references   | 8,792, expanding to 22,090 group draws |
| Joint records     | 14,412                                 |
| Hardpoints        | 12,053                                 |
| Materials         | 7,525                                  |
| Textures          | 6,861                                  |
| Deformable models | 204                                    |
| Particle effects  | 1,213, over 596 files                  |

Distributions each section leans on: vertex formats in §3.1, the base offset measurement in §3.2, VAO
counts in §3.3, joint kinds in §5.1, joint field constants in §5.2, texture storage and pixel formats
in §7, and the particle node types in §9.2. Fuller versions live in the module documents' own
**Corpus** chapters, indexed by [RETAIL.md](RETAIL.md).

Three sweeps are this document's alone:

- **Winding.** Sampling 382,231 triangles across every rigid part that carries vertex normals, the
  cross product `(b-a) × (c-a)` agrees with the stored normal in 381,539 and opposes it in 692, with
  one degenerate triangle. Not one part of 6,962 is majority-reversed. Projecting those through a
  left-handed `lookAt`/`perspective` pair with the camera out along each stored normal gives 18,268
  counter-clockwise against 2 once the projection's x column is negated — and exactly 18,268
  *clockwise* against 2 if it is not.
- **Determinants.** Every joint rotation (14,412) and every hardpoint orientation (12,053) has
  determinant +1 to within 1e-2, and all are orthonormal — so winding never flips per-part, an
  attached model never mirrors, and a rotation's inverse is its transpose (§2).
- **Sampled UV range.** Roughly −34..87 in U and −34..810 in V, which is why `REPEAT` is not optional
  (§6).

## TODO

Four open questions reach the renderer. None blocks a correct-looking image — each is a place where
this document picks the reading that cannot go visibly wrong.

| Question                                                          | Taken here as                                                              | Settled by                                                             |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Whether a **prismatic** joint's `offset` is applied at all (§5.2) | applied, the same as on the other three types                              | Author a `Pris` joint with a non-zero `child_point` and load the model |
| Texture flag bits 4 and 6 — the wrap mode field (§6)              | ignored; bit 4 is probably "sample UV1", which would matter on detail maps | [MATERIAL.md § TODO](../modules/MATERIAL.md#todo)                      |
| `Edge_angles` on two deformable models                            | ignored                                                                    | [DEFORMABLE.md § TODO](../modules/DEFORMABLE.md#todo)                  |
| The four version-1.1 `Effect` floats (§9.7)                       | unused; no effect culling                                                  | [ALCHEMY.md § TODO](../modules/ALCHEMY.md#todo)                        |

The joint composition order (§5.2) is **closed**: playing retail scripts under both orders answered
it, and the driven factor goes before the rest rotation.

**The prismatic row is a suspicion with a source behind it.** MAXLancer's `scripts/Transform.ms`
applies `offset` in its revolute, cylinder and spheric branches and not in its prismatic one, with a
`(?)` on the comment saying so. §5.2 applies it, because the two points mean the same thing in a
`Pris` record as in a `Rev` one and nothing in the format distinguishes them; but a `Pris` joint
whose slide axis already carries the displacement has no obvious need for a second one. Retail cannot
say — all 3,699 records that carry an offset leave it zero, prismatic ones included — so this needs a
hand-authored `.cmp`: one `Pris` joint, a non-zero `child_point`, and a look at whether the child
sits where the offset puts it. A null result means dropping the trailing factor from the prismatic
row of §5.2's table alone.

Bit 4 is the one with teeth: a detail map sampling the wrong coordinate set tiles at the wrong rate
rather than vanishing, which is exactly the kind of error §10 is about.

## Related documents

[VMESH.md](../modules/VMESH.md) · [COMPOUND.md](../modules/COMPOUND.md) · [RIGID.md](../modules/RIGID.md) ·
[ANIMATION.md](../modules/ANIMATION.md) · [MATERIAL.md](../modules/MATERIAL.md) · [TEXTURE.md](../modules/TEXTURE.md) ·
[DEFORMABLE.md](../modules/DEFORMABLE.md) · [SURFACE.md](../modules/SURFACE.md) · [ALCHEMY.md](../modules/ALCHEMY.md)
