# Renderer

Notes for building a **WebGL2** renderer on top of this library. Not an implementation — a map of the
places where the on-disk structures do not line up with what WebGL2 offers, and what the retail data
actually contains at each of them.

Every count here is measured against the retail `DATA` tree the corpus tests read: **2,178 meshes,
22,416 mesh groups, 8,792 mesh references, 14,412 joint records, 7,525 materials, 6,861 textures,
204 deformable models**. Where a claim is inference rather than measurement it says so.

The format targets **Direct3D 8.1**. Most of the work of a port is undoing three assumptions D3D8
made that WebGL2 does not honour: a base vertex index on every draw call, a fixed-function vertex
format, and a row-vector matrix convention.

---

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
3. Resolve the ref against the mesh library by CRC, and walk its groups. **Each group is one draw
   call** with its own material CRC (§3).
4. Bind the material's shader parameters and textures, resolved by CRC against the libraries in the
   same file (§6, §7).

Across retail that is 8,792 refs expanding to **22,090 group draws**; the busiest single reference
holds 39 groups, and the busiest file (`SHIPS/LIBERTY/LI_DREADNOUGHT/li_dreadnought.cmp`) holds 145.

> **Resolution is by CRC, and the namespace is global.** A `VMeshRef` names its mesh by
> `getResourceId` alone with nothing to say which file it lives in. 530 references in
> `INTERFACE/**` resolve into `INTERFACE/interface.generic.vms`, which the game loads unprompted.
> Merge libraries across files rather than resolving one file at a time — see [VMESH.md](VMESH.md).

---

## 2. Coordinate system, winding and matrices

### Winding is consistent and needs no repair

Sampling 382,231 triangles across every rigid part that carries vertex normals: the cross product
`(b-a) × (c-a)` agrees with the stored vertex normal in **381,539** of them and opposes it in 692,
with one degenerate triangle. Not one part of 6,962 is majority-reversed.

So the index order is counter-clockwise when read with a right-handed cross product, and
`gl.frontFace(gl.CCW)` — the default — is correct **as long as you upload positions unchanged**.

Freelancer's space is left-handed (D3D, +Z into the screen). Two consistent choices, and only two:

| Import | Projection | Front face | Notes |
|---|---|---|---|
| Positions verbatim | left-handed (map +Z to increasing depth) | `gl.CCW` | Hardpoint axes, joint axes and `.sur` hulls stay comparable to the data |
| Negate Z on import | ordinary right-handed GL | `gl.CW` | Every axis, normal and matrix must be mirrored too, consistently |

Mirroring one and not the other is the classic failure: the model renders inside-out, and turning
culling off "fixes" it while leaving the lighting wrong.

**No part transform mirrors.** Every joint rotation (14,412 records) and every hardpoint orientation
(12,053) has determinant **+1** to within 1e-2, and all are orthonormal. So winding never flips
per-part, and a rotation's inverse is its transpose.

### Matrices upload verbatim — but the JS helpers disagree about rotation sense

A `Matrix3` on disk is nine floats: `x.x x.y x.z`, `y.x y.y y.z`, `z.x z.y z.z`. In D3D's row-vector
convention those are the three **rows**, and `e1 · M` is the first row. In GLSL's column-vector
convention `mat3(...)` from the same nine floats has those triples as **columns**, and `M * e1` is
the first column — the same vector. The two conventions are transposes of each other twice over, so:

```js
// correct: no transpose, no reordering
gl.uniformMatrix3fv(loc, false, new Float32Array([x.x, x.y, x.z, y.x, y.y, y.z, z.x, z.y, z.z]))
```

For a 4×4 with translation, those go in columns 0–2 and `position` in column 3.

Two measured traps inside [`src/math/`](../src/math):

- **`Quat.transform` rotates the opposite way from `Matrix3.transform`.** They are self-consistent
  within their own families — `Quat.fromMatrix(Matrix3.fromQuaternion(q))` round-trips `q` exactly —
  but `Matrix3.transform(v, Matrix3.fromQuaternion(q))` equals `Quat.transform(v, Quat.conjugate(q))`.
  Crossing between them, which a renderer does the moment it slerps an animation keyframe onto a
  joint's rest matrix, silently reverses the rotation. Pick one family, convert at the boundary with
  `Matrix3.fromQuaternion`, and let only matrices reach the shader.

  ```js
  Quat.transform({x:1,y:0,z:0}, Quat.axisAngle({axis: Vector3.z, angle: Math.PI/2}))  // (0,  1, 0)
  Matrix3.transform({x:1,y:0,z:0}, Matrix3.axisAngle(Vector3.z, Math.PI/2))          // (0, -1, 0)
  ```

- **`Matrix3.push` and `Transform.push` compose in opposite orders.** `Transform.push` yields
  `parent ∘ child`, which is what a hierarchy wants; `Matrix3.push` yields `child ∘ parent`. Both
  unit tests happen to use commuting inputs, so neither pins the order down. Do not accumulate a
  joint chain with `Matrix3.push`.

---

## 3. VMesh → GPU buffers

### 3.1 Vertex formats

`format` is a D3DFVF bitmask; `vertexByteLength` gives the stride. Retail uses eight of them:

| FVF | Stride | Position | Normal | Diffuse | UV sets | Meshes |
|---|---|---|---|---|---|---|
| `0x112` | 32 | ✓ | ✓ | | 1 | 1,495 |
| `0x212` | 40 | ✓ | ✓ | | 2 | 501 |
| `0x102` | 20 | ✓ | | | 1 | 86 |
| `0x142` | 24 | ✓ | | ✓ | 1 | 58 |
| `0x012` | 24 | ✓ | ✓ | | 0 | 21 |
| `0x152` | 36 | ✓ | ✓ | ✓ | 1 | 11 |
| `0x252` | 44 | ✓ | ✓ | ✓ | 2 | 4 |
| `0x002` | 12 | ✓ | | | 0 | 2 |

Attributes are tightly packed in FVF order — position, normal, diffuse, then UV sets — so offsets
are derived by walking the flags in that order, not by lookup. Position is always present, and
`PointSize` and `Specular` never are.

Two decoding quirks:

- **`Diffuse` is a `D3DCOLOR`**, a `uint32` holding `0xAARRGGBB`. Little-endian, that is the byte
  sequence **B, G, R, A**. Bind it as `4 × UNSIGNED_BYTE, normalized` and swizzle in the shader
  (`color.bgra`); binding it as RGBA gives you a blue ship.
- **UV origin is top-left** (D3D). GL samples from the bottom-left, so either flip `v` in the shader
  or normalize every texture to a single origin at load — see §7, which argues for the latter.

Every stride is a multiple of 4, so any of them can be used as a `vertexAttribPointer` offset —
which matters for strategy B below.

### 3.2 The base offset scheme, and what it really means

Three structures each carry an offset, and the relationship between them is the single most
error-prone thing in the format.

```
VMeshRef   { vertexStart, vertexCount, indexStart, indexCount, groupStart, groupCount }
VMeshGroup { materialId, vertexStart, vertexEnd, elementCount }
indices[]  uint16, relative
```

**The absolute vertex of an index is `ref.vertexStart + group.vertexStart + index`.** Both offsets
apply; neither is absolute on its own. Measured across all 8,792 references:

| Reading | Group ranges of refs sharing a mesh (892 meshes) |
|---|---|
| index + `group.vertexStart` only | **overlap in 892 of 892**, cover the buffer in 81 |
| index + `ref.vertexStart` + `group.vertexStart` | overlap in 81, **tile exactly in 811, cover the buffer in 892** |

The minimum `group.vertexStart` within a reference is **0 in all 8,792 references** — groups are
numbered from their reference's base, not from the mesh's. From `SOLAR/STARSPHERE/starsphere_br02.cmp`,
one mesh of 1,829 vertices shared by five refs:

```
without ref.vertexStart: [0,539] [0,84] [0,807] [0,179] [0,215]      ← all overlapping
with    ref.vertexStart: [0,807] [808,1347] [1348,1563] [1564,1743] [1744,1828]
```

Two more relationships hold without exception, so both fields are derived rather than authored, and
a loader can assert them:

- `ref.indexStart` equals the summed `elementCount` of all groups before `groupStart` (8,792/8,792).
- `ref.vertexCount` equals `max(vertexEnd) - min(vertexStart) + 1` over the covered groups (8,792/8,792).

`vertexEnd` is **inclusive**: `group.vertexStart + max(index) === group.vertexEnd`, for all 22,416
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

> **`getMeshDraw` in [`src/vmesh/library.ts`](../src/vmesh/library.ts) omits `ref.vertexStart`.** It
> slices the vertex buffer at `group.vertexStart * stride`, which is the overlapping reading above:
> correct for the 2,257 references whose `vertexStart` is 0, wrong for the other 6,535. Its index
> slice is right. Treat its `vertices` field as unusable until that is fixed, and compute the base
> yourself.

### 3.3 WebGL2 has no base vertex

`gl.drawElements` takes a byte offset into the index buffer and nothing else. There is no
`drawElementsBaseVertex`, so the `ref.vertexStart + group.vertexStart` above has to go somewhere.
Four places it can go:

**A. Rebase the indices at load — the default choice.**
Add the base into each index once, at import, producing one index buffer per mesh whose values are
absolute. One VAO per mesh, one `drawElements` per group at the group's byte offset.

`uint16` still suffices: the largest retail mesh holds **22,391 vertices**, so absolute indices stay
far below 65,535 and the index buffer does not grow. Costs one pass over 22,416 groups at load and
nothing at draw time. Loses the ability to share one uploaded index buffer between two differently
based references of the same mesh — which never happens, since refs partition the buffer rather than
aliasing it.

**B. One VAO per (mesh, base offset), with the base folded into the attribute pointers.**
`vertexAttribPointer`'s offset is in bytes, so `base * stride` shifts the whole vertex layout and the
relative indices then land correctly. Keeps index data byte-identical to the file.

The cost is VAO count. Distinct `(mesh, base)` pairs per file: median **2**, 95th percentile **38**,
maximum **207** (`or_osiris.cmp`); 13,290 across the corpus against 2,176 meshes. One mesh alone can
carry 85 distinct group bases. Attribute offsets must be a multiple of the component size — all eight
strides are multiples of 4, so this is always legal.

**C. `gl_VertexID` plus a uniform.** Does not work. `gl_VertexID` is available in WebGL2 (ES 3.00
shaders), but it cannot influence *attribute fetch* — the base is applied by the fixed-function
puller before the shader runs. It only helps if you abandon attributes entirely and fetch vertices
from a buffer texture or UBO by hand, which trades a load-time loop for a permanent one.

**D. `WEBGL_draw_instanced_base_vertex_base_instance`.** Exposes exactly the missing parameter, and
its `WEBGL_multi_draw_*` sibling can also collapse a reference's groups into a single call. Not core,
not universal — worth a fast path, never worth being the only path.

**Recommendation: A**, with D as an optional fast path and B if you need the uploaded buffers to stay
byte-identical to the file (a viewer that also writes, say). Note that if you go further and merge
several meshes into one buffer, indices must widen to `UNSIGNED_INT` and you should avoid emitting
`0xFFFF`/`0xFFFFFFFF` — WebGL2 gives no toggle for primitive restart, and the fixed index is treated
as one.

### 3.4 Draw calls and grouping

`primitive` is a `D3DPRIMITIVETYPE` and the enum carries all six, but **every retail mesh is
`TriangleList`** (asserted by `vmesh/corpus.test.ts`). A renderer can hard-code triangles and treat
anything else as a load error, rather than carrying five untestable paths.

Groups within one reference are contiguous in the index buffer, so consecutive groups sharing a
material can be merged into a single `drawElements` — they are adjacent index ranges. Meshes carry
1–12 distinct materials each (588 have exactly one), so the win is modest; sorting draws by material
across parts matters more.

### 3.5 The wireframe overlay

`VMeshWire`/`VWireData` is the line overlay drawn over a ship in the scanner and dealer views. It
addresses the same `VMeshLibrary` mesh by CRC but supplies its own `LineList` index buffer.

It has the same base offset problem, and it bites harder: **2,330 of 3,539 wires have a non-zero
`vertexStart`**, and its indices are likewise relative to it. `vertexStart`/`vertexRange` are the
`MinIndex`/`NumVertices` pair. Reuse the mesh's VAO (strategy A rebases these indices too) and bind a
separate element buffer.

---

## 4. Level of detail

A rigid part holds either a bare `VMeshPart` or a `MultiLevel` of them:

- `Switch2` holds **N+1** breakpoints for N levels; `ranges[0]` is 0 in every retail model.
- `atRange(multiLevel, distance)` returns the level whose `[ranges[i], ranges[i+1])` contains the
  camera distance, or `undefined` past the last breakpoint — which is the model's cue to vanish,
  not a bug to clamp away.
- **LOD is per part, not per model.** Each part carries its own `MultiLevel`, and a large ship's
  parts switch at different distances.
- Four capital ships carry denormal junk in the middle of `Switch2`. The reader hands the
  breakpoints back verbatim; a renderer should tolerate a non-ascending list rather than sort it
  (sorting changes which level shows).

Deformable models do it differently: a `.dfm` carries `Fractions` per level (`1, 0.8, 0.6, 0.4,
0.2, 0.1`), a fraction of a detail range supplied by the INI that places the character.

---

## 5. The joint graph

### 5.1 Building the tree

`readModel` returns the root `Model<RigidPart>`; children hang off `children`, each with the `joint`
that attaches it to its parent. The hierarchy comes from the `Cons` constraint list, **not** from
directory nesting — the fragment directories are all flat siblings of `Cmpnd`. Names are matched by
`getResourceId`, so lookups are case-insensitive, and part names may carry leading or trailing
spaces (a few retail ones do).

`trade_turret01.cmp` constrains a part it never declares; `arrangeByConstraints` drops the unresolved
constraint and assembles the rest. A renderer should do the same rather than refuse the model.

Joint records across the rigid and deformable corpus:

| Type | Records | Driven by |
|---|---|---|
| `loose` | 6,343 | position + rotation |
| `fixed` | 4,370 | nothing |
| `sphere` | 2,770 | rotation |
| `prismatic` | 504 | one float, offset along `axis` |
| `revolute` | 425 | one float, angle about `axis` |
| `cylinder` | 0 | cannot be animated at all — see [COMPOUND.md](COMPOUND.md) |

### 5.2 Composing a joint

Measured over every record that has the fields:

- **`offset` (`child_point`) is exactly zero in all 3,699 records that carry one.**
- `axis` is unit length in all 929 records that carry one.
- `position` is non-zero in 13,865 of 14,412.
- No revolute or prismatic joint has `min === max === 0`; every one has a real range.

Because `offset` is always zero, the local transform reduces to a translation, the rest rotation,
and the driven degree of freedom:

```
fixed, loose   L      = T(position) · R(rotation)
revolute       L(θ)   = T(position) · R(rotation) · R(axis, θ)      θ ∈ [min, max]
prismatic      L(d)   = T(position) · R(rotation) · T(axis · d)     d ∈ [min, max]
sphere         L(q)   = T(position) · R(rotation) · R(q)
world          W_child = W_parent · L_child
```

Two things this does not settle, both of which want an in-engine check rather than more measurement:

- **Whether the driven rotation goes before or after the rest rotation.** The `Cyl` struct comment
  inherited from Conquest: Frontier Wars describes `axis` as living in the *parent* frame, which
  would put `R(axis, θ)` on the left of `R(rotation)`. The two orders coincide only when the rest
  rotation is identity — true for just **294 of the 929** driven joints, so 635 will visibly differ.
  Animate something with an obvious correct answer (a docking bay ring, landing gear) and look.
- **Where `offset` belongs if a non-retail asset ever sets one.** The natural reading is a pivot,
  `… · T(offset) · R(…) · T(-offset)`, but nothing in the data exercises it.

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
`i * interval` and no timestamps are stored.

Rotations arrive in four encodings — full float W-X-Y-Z, implied identity, and two `int16`
quantizations — all decoded to a `Quat` by `readChannel`, so a renderer never sees the packing. It
does see the quaternion, which is where the `Quat.transform` sense mismatch in §2 becomes a live
issue: convert with `Matrix3.fromQuaternion` and compose in matrix space.

### 5.4 Traversal

One depth-first walk per model per frame produces a `mat4` per part. Costs are small — refs per file
have a median of 1 and a 95th percentile of 32 — so per-draw uniform uploads are fine, and there is
no reason to reach for instancing before profiling says so.

**Hardpoints** compose the same way: `T(position) · R(orientation)` in their owning part's space,
then the part's world transform. They are what equipment, effects and (for characters) whole body
parts attach to. All 12,053 have determinant +1, so an attached model never mirrors.

---

## 6. Materials

`readMaterials(root)` yields a flat list resolved by CRC from a group's `materialId`. A material is a
shader name plus an open set of properties — **the type does not determine which properties are
present**, so read what is there and default nothing (see [MATERIAL.md](MATERIAL.md)).

The `Type` string is the shader selector, and its tokens name the inputs:

| Token | Meaning | Renderer consequence |
|---|---|---|
| `Dc` / `Dt` | diffuse colour / texture | base colour; `Dt` alpha is the opacity channel |
| `Ec` / `Et` | emission colour / texture | additive, unlit |
| `Bt` | detail texture | blended over diffuse |
| `Oc` / `Ot` | opacity | **alpha blending on** |
| `Two` | two-sided | **`gl.disable(gl.CULL_FACE)`** |

Measured: **243 two-sided materials** and **904 that want blending** out of 7,525. `DcDt` alone is
4,308 of them, so the common path is a lit, textured, opaque, back-face-culled triangle.

Draw order follows from that: opaques first sorted by material to minimise state changes, then
blended materials back-to-front with depth writes off. Nothing in the format records a render order,
so this is convention, not data.

**Texture slots** are a `<slot>_name` / `<slot>_flags` pair. The name resolves by CRC against a
`Texture library` — retail names look like filenames but are not paths, and the extension is often
stale. The flags word is three settings packed together, of which only the address modes are
actionable:

| Bit | Meaning | Maps to |
|---|---|---|
| 1 | Clamp U | `TEXTURE_WRAP_S = CLAMP_TO_EDGE` |
| 3 | Clamp V | `TEXTURE_WRAP_T = CLAMP_TO_EDGE` |
| 0, 2 | Mirror U / V | never set in retail |
| 4, 6 | wrap mode field | purpose unresolved; ignore |

Only six distinct words occur, and clamping appears only on `Dt`. Everything else is `REPEAT` —
which matters, because sampled UVs run well outside 0..1 (measured range roughly -34..87 in U and
-34..810 in V). WebGL2 allows `REPEAT` on any texture, power-of-two or not.

`Nt_name` is the one property with a compiled-in default, `NomadRGB1_NomadAlpha1`, exported as
`defaultNomadTextureName`. No retail material carries the slot, so apply the default at bind time —
the reader deliberately does not.

**`MaterialAnim`** (root-level sibling of `Cmpnd`, rigid models only) animates a material's UV
transform: per-segment offset and scale velocities, with `MAKeys` giving the transform each segment
starts from. Feed the resulting UV matrix as a uniform; it changes per material per frame, not per
vertex.

---

## 7. Textures

`readTextures(root)` yields `TextureEntry` — narrow on `type === 'animated'` first, then on
`storage`. The three storage forms map to three different upload calls:

| `storage` | Retail count | Upload |
|---|---|---|
| `dds` | 4,447 | `compressedTexImage2D` per level (block formats) or `texImage2D` (uncompressed DDS) |
| `targa` | 2,400 | `texImage2D` per level |
| `cube` | 2 | six faces, `+X -X +Y -Y +Z -Z`, in that order |

Pixel formats present: `dxt1` 4,230, `rgb24_888` 1,789, `rgba32_8888` 615, `dxt3` 129, `dxt5` 42,
`rgba16_5551` 24, `rgb16_565` 20.

Things that will bite:

- **S3TC is an extension even in WebGL2.** Request `WEBGL_compressed_texture_s3tc`; 4,401 of the
  6,849 image entries — 64% — are block-compressed and unreadable without it. `dxt1` must upload as `COMPRESSED_RGBA_S3TC_DXT1_EXT`, never
  the RGB variant — punch-through is selected per block and nothing in the container flags it, so
  the RGB decode renders those texels opaque black.
- **`UNPACK_FLIP_Y_WEBGL` is illegal for compressed uploads** — `compressedTexImage2D` raises
  `INVALID_OPERATION` when it is set. Since DDS is already top-down and 2,391 Targa chains are
  bottom-up, the only convention that covers both is to **normalize at load**: flip the bottom-up
  Targa rows yourself, then sample with a single origin everywhere. The `flip` field on each entry
  reports the actual origin (top-down for all 4,447 DDS, both cubemaps and 9 Targas; bottom-up for
  the rest) — it is a statement of fact, not an instruction.
- **`UNPACK_ALIGNMENT` must be 1 for `rgb24_888`.** Rows are `width * 3` bytes, which is not a
  multiple of 4 for most widths, and the default alignment of 4 shears the image.
- **Mip chains are usually incomplete.** 4,394 of them stop at 4×4 (six more at 8×4) and 807 hold a
  single level. Set `TEXTURE_MAX_LEVEL` to `levels - 1`, or allocate with `texStorage2D` at exactly
  that count — otherwise the texture is incomplete and samples black. `generateMipmap` is not an
  option for compressed data and would be wrong for the rest.
- All retail textures are **power-of-two**; 20 are non-square. WebGL2 handles both, and `RGB565`,
  `RGBA4` and `RGB5_A1` are core sized formats, so the 16-bit entries need no expansion.
- 12 entries are **animated** — a `Frame rects` table over sibling atlas entries. Resolve the frame
  to a UV rect at bind time; the sheet is an ordinary texture.

---

## 8. Deformable models

A `.dfm` is one skinned mesh per detail level plus a bone tree. The compound layer is byte-for-byte
the rigid one, so §5 applies unchanged — `getBoneModel` returns the same `Model<T>` tree.

- **Bones are an ordered table**, and `Index` is the bone's directory position. That position, not
  the name, is what `Bone_id_chain` skins to.
- **`Bone to root` is the bind pose in root space.** Points are stored in that same space (measured:
  a head's points and its bones' positions occupy the same extents), so the skinning matrix is
  `pose(bone) · inverse(boneToRoot)`. All bone rotations have determinant +1, so the inverse is
  `[Rᵀ | -Rᵀt]`.
- **At most 4 influences per point** across all 204 models — a `vec4` of weights and indices. Bones
  per model reach **86**; a character assembles from a head, a body and two hands sharing hardpoints,
  so budget for the sum. At 86 bones a `mat4` array is 344 vec4s and even a `mat3x4` one is 258 —
  both past the 256-vec4 floor WebGL2 guarantees for vertex uniforms. Use a uniform block (the
  guaranteed 16 KB holds 256 `mat4`) or a bone texture, not a plain uniform array.
- **Positions and UVs are indexed separately.** A drawn vertex is `Point_indices[i]` paired with
  `UV0_indices[i]`, which lets a UV seam split without splitting the skinning weights. GPUs have one
  index stream, so weld the pairs into unique vertices at load and rewrite the face group indices.
- **All 4,184 face groups are triangle strips** (`Tristrip_indices`). Convert to lists at load: it
  makes group merging possible and sidesteps WebGL2's untoggleable primitive restart.
- **`Lod Bits` is a permission, not a usage mask** — all bits or none, and 2,237 bones with every bit
  set appear in no `Bone_id_chain`. Do not use it to decide which bones a level needs.
- The eleven `UV_*` files on `Mesh0` of 104 heads slide eye and mouth patches across a sprite sheet
  driven by a bone's translation — a UV offset, clamped, applied to a listed subset of coordinates.
  Skippable for a first renderer; the face will simply not blink.

---

## 9. Checklist

Things that produce a plausible-looking but wrong image, in rough order of how long they take to
find:

1. `ref.vertexStart` dropped — 6,535 of 8,792 references draw the wrong vertices, and single-part
   models look fine throughout (§3.2).
2. Diffuse colour read as RGBA instead of BGRA (§3.1).
3. `TEXTURE_MAX_LEVEL` unset on a chain that stops at 4×4 — black textures (§7).
4. `UNPACK_ALIGNMENT` left at 4 for `rgb24_888` — sheared image (§7).
5. Z negated for a right-handed projection without flipping `frontFace` — inside-out hull (§2).
6. `vertexEnd` treated as exclusive — the last vertex of every group missing (§3.2).
7. A quaternion crossed into matrix space without `Matrix3.fromQuaternion` — joints animate
   backwards (§2).
8. `Matrix3.push` used for the joint chain — wrong composition order wherever rotations do not
   commute (§2).
9. UV `v` flipped in some paths and not others — textures upside down only on the Targa half of a
   model (§7).
10. `Two` ignored — one-sided cockpit glass and foliage (§6).

---

## TODO

Four open questions reach the renderer. None of them blocks a correct-looking image — each is a
place where this document picks the reading that cannot go visibly wrong, and the game would settle
which reading is right.

| Question | Taken here as | Settled by |
| --- | --- | --- |
| Texture flag bits 4 and 6 — the wrap mode field (§6) | ignored; bit 4 is probably "sample UV1", which would matter on detail maps | [MATERIAL.md § TODO](MATERIAL.md#todo) |
| Targa origin bit on nine chains (§7) | reported through `flip`, rows untouched | [TEXTURE.md § TODO](TEXTURE.md#todo) |
| `MAKeys` against `MADeltas` in material animation | both read, neither derived; the UV transform driver is unconfirmed | [RIGID.md § TODO](RIGID.md#todo) |
| `Edge_angles` on two deformable models | ignored | [DEFORMABLE.md § TODO](DEFORMABLE.md#todo) |

Bit 4 is the one with teeth: a detail map sampling the wrong coordinate set tiles at the wrong rate
rather than vanishing, which is exactly the kind of error §9 is about — plausible-looking and slow
to find.

---

## Related documents

[VMESH.md](VMESH.md) · [COMPOUND.md](COMPOUND.md) · [RIGID.md](RIGID.md) ·
[ANIMATION.md](ANIMATION.md) · [MATERIAL.md](MATERIAL.md) · [TEXTURE.md](TEXTURE.md) ·
[DEFORMABLE.md](DEFORMABLE.md) · [SURFACE.md](SURFACE.md)
