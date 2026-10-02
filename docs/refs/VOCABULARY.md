# Vocabulary

The words this project uses for Freelancer's data, each in a sentence or two, with a link to where
it is explained in full. Read it to learn the nomenclature before a module document, or come back
to it when a term in one stops you.

Names the game itself uses (on-disk node names, INI keys, DLL names) are set in `code`. Plain words
are the project's own. Terms are grouped by subject, and within a group related terms sit together
rather than alphabetically. A few words mean two things; they are listed together at the
[end](#words-with-two-meanings).

## The project

- **Retail** — the game as shipped: the `DATA` tree plus `EXE` and `DLLS`. It is the baseline every
  claim in `docs/` is measured against, as opposed to modded or hand-made data.
  → [RETAIL § The corpus](RETAIL.md#the-corpus)
- **Corpus** — the retail install as the test suites find it (`$FREELANCER_DATA`). A **corpus
  suite** (`corpus.test.ts`) asserts every count in `docs/` back against it and skips itself when no
  install is present. A figure that stops matching means a reader drifted, not that the figure is
  stale. → [RETAIL](RETAIL.md), [ARCHITECTURE § Commands](ARCHITECTURE.md#commands)
- **Corpus chapter** — the `## Corpus` section that closes every module document: counts,
  distributions, round-trip results and quirks, kept apart from the format description above it.
  → [ARCHITECTURE § Documentation conventions](ARCHITECTURE.md#documentation-conventions)
- **Sweep** — one pass over the install collecting every file of a kind.
  → [RETAIL § The corpus](RETAIL.md#the-corpus)
- **Quirk** — an oddity in retail data that a sweep will meet and has to tolerate, such as a
  commented-out section header or a constraint naming a part that does not exist.
  → [RETAIL § Quirks a sweep will hit](RETAIL.md#quirks-a-sweep-will-hit)
- **Authoring residue** — bytes Digital Anvil's tools left behind that the game never reads: entry
  ids, pair order, stack garbage after a name. It is the usual reason a file round-trips by value
  rather than byte for byte. → [RETAIL § Round-trip fidelity](RETAIL.md#round-trip-fidelity)
- **Three layers** — every format is read in three steps, each usable on its own: bytes, then the
  interim document, then the meaning. → [ARCHITECTURE § Three layers](ARCHITECTURE.md#three-layers)
- **Binary layer** — a `BufferView` cursor over bytes. It makes no choices.
  → [ARCHITECTURE § Three layers](ARCHITECTURE.md#three-layers)
- **Interim layer** (interim document, interim model) — the file as it spells itself, in public
  classes an editor can build by hand: `Directory`/`File` for UTF, `Section`/`Property`/`Value` for
  INI, `Global`/`Value` for THN, `Resource[]` for a DLL. Its methods are structural, never semantic:
  a method belongs here only if it needs no knowledge of what the game does with the bytes.
  → [ARCHITECTURE § Three layers](ARCHITECTURE.md#three-layers)
- **Meaning layer** (typed layer) — plain data with no methods and no identity, saying what the game
  does with the bytes: a rigid model, a material, a scene. INI has none; what a section means is the
  consumer's. → [ARCHITECTURE § Three layers](ARCHITECTURE.md#three-layers)
- **Round trip** — reading a file and writing it back, possibly through other forms on the way.
  → [RETAIL § Round-trip fidelity](RETAIL.md#round-trip-fidelity)
- **Byte-exact** — a round trip whose output bytes equal its input, where the format permits it.
  → [RETAIL § Round-trip fidelity](RETAIL.md#round-trip-fidelity)
- **Fixed point** — the weaker guarantee that holds everywhere: what the writer emits reads back
  identical and writes again to the same bytes.
  → [RETAIL § Round-trip fidelity](RETAIL.md#round-trip-fidelity)
- **Lossless read-modify-write** — anything the library does not model survives a round trip
  untouched, so an editor does not damage a mod.
  → [ARCHITECTURE § Invariants](ARCHITECTURE.md#invariants)
- **Consumer** — the application using the library. It owns policy: which files load and in what
  order, defaults, caching, budgets, output conventions. The library owns what the data means.
  → [ARCHITECTURE § Invariants](ARCHITECTURE.md#invariants)
- **Load order** — which file wins when several define the same name. It is the consumer's, and the
  library never opens a file. → [ARCHITECTURE § Invariants](ARCHITECTURE.md#invariants)
- **Absent** — a value the file does not carry is a missing key, never `null`, and a reader never
  fills in a default for it. → [ARCHITECTURE § Invariants](ARCHITECTURE.md#invariants),
  [MATERIAL § Defaults belong at the point of use](../modules/MATERIAL.md#defaults-belong-at-the-point-of-use)
- **Refusal** — an input a reader or writer rejects outright rather than guess at, such as a
  partial cubemap or a THN name outside the measured vocabulary.
  → [TEXTURE § Refusals](../modules/TEXTURE.md#refusals),
  [THORN § The typed layer](THORN.md#the-typed-layer)
- **TODO** — a question pending observation in the running game, not pending code. It marks an
  unread meaning, never an unread byte, and names the reading taken meanwhile and the experiment
  that would settle it.
  → [ARCHITECTURE § Documentation conventions](ARCHITECTURE.md#documentation-conventions),
  [RETAIL § TODO](RETAIL.md#todo--what-is-pending-in-the-game)
- **Entry point** (subpath) — one package import path, such as `@treewyrm/freelancer/thn/scene`,
  with its own exports. Each module document's `## API` lists them.
  → [README § Entry points](../../README.md#entry-points)

## Names and hashes

Freelancer refers to almost everything by a hash of its name rather than by the name.

- **Nickname** — the string identifier of an INI object or archetype, such as `li_elite`. Other
  files refer to it by its object id. A nickname that looks numeric is still a string.
  → [INI § The tag is the token's shape](../modules/INI.md#the-tag-is-the-tokens-shape-not-the-fields-type)
- **Archetype** — an object definition declared in INI (`[Ship]`, `[Gun]`, `[Solar]`) and read by
  one of the engine's `Archetype::` classes. The class chain decides which keys a section accepts.
  → [SECTIONS § The archetype hierarchy](SECTIONS.md#the-archetype-hierarchy-is-exact-not-inferred)
- **Resource id** (`getResourceId`, the Freelancer CRC32) — the hash for names inside UTF files:
  meshes, materials, textures, parts, hardpoints, Alchemy nodes. It is CRC-32 over `dacom.dll`'s
  table, which was generated with a signed shift and so differs from the standard one in its high
  byte. → [UTF § Hashing](../modules/UTF.md#hashing)
- **Object id** (`getObjectId`, `id32`) — the other hash, for INI nicknames and voice bank entries.
  Using the wrong one of the two gives a wrong number, never an error.
  → [UTF § Hashing](../modules/UTF.md#hashing), [AUDIO § The hash](AUDIO.md#the-hash)
- **Case folding** — both hashes ignore ASCII case by default, as the game compares names with
  `stricmp`. Alchemy is the one place that hashes case-sensitively.
  → [UTF § Hashing](../modules/UTF.md#hashing),
  [ALCHEMY § Name hashing is case-sensitive](../modules/ALCHEMY.md#name-hashing-is-case-sensitive)
- **Global resolution** — a hashed reference resolves against everything currently loaded, not
  against the file it sits in, so libraries merge.
  → [VMESH § Resolution is global](../modules/VMESH.md#resolution-is-global-not-per-file),
  [RENDERER § 1](RENDERER.md#1-the-shape-of-a-draw)
- **windows-1252** — the encoding a name is turned into bytes with before it is hashed.
  → [UTF § Utilities](../modules/UTF.md#utilities)

## UTF containers

- **UTF** (Universal Tree Format) — the binary container most assets ship in: a tree of named
  directories and files. Models, materials, textures, animations, effects and voice banks are UTF;
  surfaces, INI and scene scripts are not. → [UTF](../modules/UTF.md)
- **Directory** / **File** — the two kinds of UTF entry. They are also the interim model an editor
  builds a tree with. → [UTF § Tree entries](../modules/UTF.md#tree-entries)
- **Dictionary** (UTF) — the block of entry names, stored once each as NUL-terminated ASCII.
  → [UTF § On-disk layout](../modules/UTF.md#on-disk-layout)
- **Library** — a UTF directory pooling one kind of resource by name: a mesh, texture, material,
  animation, node or effect library. A library sits in its own file or is embedded in the model
  that uses it.

## Models

- **Rigid model** — a model whose parts do not deform: `.3db`, `.cmp` or `.sph`.
  → [RIGID](../modules/RIGID.md)
- **`.3db`** — a single-part rigid model. Its geometry and hardpoints sit at the root, with no
  `Cmpnd`. → [RIGID § Layout](../modules/RIGID.md#layout)
- **`.cmp`** — a compound rigid model: named parts, each in its own fragment, joined into a tree by
  the joints under `Cmpnd`. → [RIGID § Layout](../modules/RIGID.md#layout),
  [COMPOUND](../modules/COMPOUND.md)
- **`.sph`** — a planet or star. It holds no geometry, only a `Sphere` node with a material per cube
  face (`M0`–`M5`), an optional atmosphere shell (`M6`) and a radius; the game tessellates it.
  → [RIGID § Procedural spheres](../modules/RIGID.md#procedural-spheres)
- **Compound** (`Cmpnd`) — the directory that turns a flat set of named parts into a tree. `.cmp`
  and `.dfm` share it byte for byte. → [COMPOUND](../modules/COMPOUND.md)
- **Part** — one named node of a compound: a piece of geometry in a `.cmp`, a bone in a `.dfm`.
  `Cmpnd` lists them as `Root` and `Part_<name>`, each with `Object name`, `Index` and `File name`.
  → [COMPOUND § The hierarchy](../modules/COMPOUND.md#the-hierarchy)
- **Fragment** — the top-level directory holding one part's contents, beside `Cmpnd` and named by
  the part's `File name`. → [COMPOUND § Layout](../modules/COMPOUND.md#layout)
- **Constraint** (`Cons`) — a record naming a parent part, a child part and the joint between them.
  The part tree is rebuilt from constraints, not from how directories nest.
  → [COMPOUND § Constraints](../modules/COMPOUND.md#constraints)
- **Joint** — how a child part hangs from its parent, and which degrees of freedom animation may
  drive: `Fix` (rigid), `Rev` (rotation about one axis), `Pris` (sliding along one axis), `Cyl`
  (both, and it cannot be animated), `Sphere` (rotation; its limits are never applied), `Trans`
  (free sliding, loaded but never shipped), `Loose` (free).
  → [COMPOUND § Joints](../modules/COMPOUND.md#joints),
  [ANIMATION § Why cylinder joints cannot be animated](../modules/ANIMATION.md#why-cylinder-joints-cannot-be-animated)
- **Position and offset** — the two ends of a joint's contact point, in the parent's frame and in
  the child's. The offset is a contact point, not a pivot.
  → [COMPOUND § Position and offset](../modules/COMPOUND.md#position-and-offset),
  [RENDERER § 5.2](RENDERER.md#52-composing-a-joint)
- **Hardpoint** — a named attachment frame on a part or a bone: a weapon mount, an engine, a dock
  point, a costume seat. It is fixed, or revolute with an axis and limits.
  → [COMPOUND § Hardpoints](../modules/COMPOUND.md#hardpoints)
- **Camera part** — a fragment holding only a camera (`Fovx`, `Fovy`, `Znear`, `Zfar`), found in
  cockpit models. → [RIGID § Cameras](../modules/RIGID.md#cameras)
- **VMesh** — Freelancer's geometry format, laid out as Direct3D 8 vertex buffers, index buffers
  and draw parameters. Meshes sit in a shared library and parts point into it.
  → [VMESH](../modules/VMESH.md)
- **Mesh library** (`VMeshLibrary`) — a pool of meshes that references from any loaded file point
  into. → [VMESH § Mesh library](../modules/VMESH.md#mesh-library)
- **Mesh** (`VMeshData`) — a primitive type, a vertex format, a list of groups, one index buffer and
  one vertex buffer. → [VMESH § `VMeshData`](../modules/VMESH.md#vmeshdata)
- **Mesh group** (`VMeshGroup`) — one draw call's range of a mesh, with the CRC of its material. Its
  indices are relative to its start vertex. → [VMESH § Mesh group](../modules/VMESH.md#mesh-group)
- **Mesh reference** (`VMeshRef`, inside `VMeshPart`) — a part's pointer, by CRC, to a range of
  groups, indices and vertices in a mesh, with a bounding box and sphere. An **empty reference**
  draws nothing and exists to carry a joint.
  → [VMESH § Mesh reference](../modules/VMESH.md#mesh-reference),
  [VMESH § Empty references](../modules/VMESH.md#empty-references)
- **Base vertex** — the reference's start vertex plus the group's; a vertex's absolute index is that
  plus the stored index. WebGL2 has no base-vertex draw.
  → [RENDERER § 3.2](RENDERER.md#32-the-base-offset-scheme-and-what-it-really-means)
- **Vertex format** (FVF) — the Direct3D bitmask describing a vertex's layout. Its texture bits are a
  count of UV sets. → [VMESH § `VertexFormat`](../modules/VMESH.md#vertexformat)
- **Wireframe overlay** (`VMeshWire`, its one file `VWireData`) — a line list over a library mesh,
  drawn in the scanner and dealer views. → [VMESH § Wireframe
  overlay](../modules/VMESH.md#wireframe-overlay)
- **`.vms`** — a file holding nothing but a mesh library. The game loads `interface.generic.vms`
  without being asked. → [VMESH § The one external reference](../modules/VMESH.md#the-one-external-reference)
- **Level of detail** (`MultiLevel`, `Level<n>`, `Switch2`) — a rigid part picks one of several
  meshes by camera distance; `Switch2` holds the breakpoints, and past the last one the part is not
  drawn. → [VMESH § Levels of detail](../modules/VMESH.md#levels-of-detail),
  [RENDERER § 4](RENDERER.md#4-level-of-detail)
- **Material animation** (`MaterialAnim`: `MACount`, `MADeltas`, `MAKeys`, `MAFlags`) — a root-level
  directory beside `Cmpnd` that animates a material's UV transform over looping segments.
  `shading.dll` evaluates it and never reads `MAFlags`.
  → [RIGID § Material UV animation](../modules/RIGID.md#material-uv-animation)
- **Exporter leftovers** (`Exporter Version`, `Extent tree`, `Mass properties`, `Rigid body`) —
  nodes the original tools wrote that the game ignores. Collision comes from `.sur` and mass from
  INI instead. → [RIGID § Nodes this module does not read](../modules/RIGID.md#nodes-this-module-does-not-read)

## Collision

- **Surface** (`.sur`) — a model's collision file. It is not UTF but a thin chunked container
  around IVP data, matched to the model's parts by id. → [SURFACE](../modules/SURFACE.md)
- **Surface part** — one collidable piece: an id (0 for a `.3db`'s root, otherwise the CRC of the
  part name), a fixed flag, an extent, a surface block and the hardpoints it covers.
  → [SURFACE § Part](../modules/SURFACE.md#part),
  [SURFACE § Matching a part to a model part](../modules/SURFACE.md#matching-a-part-to-a-model-part)
- **Chunk** (`vers`, `!fxd`, `exts`, `surf`, `hpid`) — the four-character tags of the container.
  They carry no length, so an unknown tag cannot be skipped.
  → [SURFACE § Part](../modules/SURFACE.md#part)
- **Hull** (ledge) — a convex polyhedron of triangles. A **terminal hull** is a real collision
  volume whose id is a label: a part CRC, a hardpoint CRC or 0. A **skip hull** sits on an inner
  node and bounds everything below it. A **hardpoint hull** is a terminal hull the part's `hpid`
  lists. → [SURFACE § Hull](../modules/SURFACE.md#hull),
  [SURFACE § A hull id is a label](../modules/SURFACE.md#a-hull-id-is-a-label)
- **Ledgetree** — the binary tree of bounding volumes whose leaves carry the terminal hulls.
  → [SURFACE § Node](../modules/SURFACE.md#node)
- **Mass properties** (`massCenter`, `rotationInertia`, `radius`, `surfaceDeviation`) — values
  derived from the terminal hulls. `rotationInertia` decides how debris tumbles.
  → [SURFACE § Where the four derived values come from](../modules/SURFACE.md#where-the-four-derived-values-come-from)
- **Fixed-joint fold** — the exporter copies a fixed-jointed child's hulls into each fixed
  ancestor's part, so one parent answers for its whole fixed subtree.
  → [SURFACE § The fixed-joint fold](../modules/SURFACE.md#the-fixed-joint-fold)
- **Hitbox** — this project's term for a surface part built from caller-supplied convex hulls.
  → [SURFACE § Building a hitbox](../modules/SURFACE.md#building-a-hitbox)

## Characters

- **Deformable model** (`.dfm`) — a character piece: a body, a head or a hand. It holds one skinned
  mesh per detail level and a table of bones. → [DEFORMABLE](../modules/DEFORMABLE.md)
- **Bone** — a `<bone>.3db` directory holding `Bone to root`, `Lod Bits` and `Hardpoints`. Bones
  form an ordered table, and skinning refers to a bone by its position there, not its name.
  → [DEFORMABLE § Bones are a table](../modules/DEFORMABLE.md#bones-are-a-table-not-just-a-tree)
- **`Bone to root`** — a bone's bind transform, stored inverted: it maps root space into bone space.
  Read it; do not invert it. → [RENDERER § 8](RENDERER.md#8-deformable-models)
- **Bind pose** / **rig** — a body's `Cons` chain is the animation rig and is not its bind pose; for
  heads and hands the two coincide. The game only ever poses the chain.
  → [DEFORMABLE § The chain is not the bind pose](../modules/DEFORMABLE.md#the-chain-is-not-the-bind-pose)
- **Detached bone** — a bone no `Cmpnd` part claims. It carries one fixed hardpoint naming the host
  hardpoint it sits on, and is the seam between costume pieces.
  → [DEFORMABLE § Detached bones](../modules/DEFORMABLE.md#detached-bones)
- **Skeleton** (`Skeleton/Name`) — names the `.cmp` whose animation library drives the model.
  → [DEFORMABLE § Layout](../modules/DEFORMABLE.md#layout)
- **`Lod Bits`** — one bit per detail level on each bone; no retail binary reads it.
  → [DEFORMABLE § Lod Bits](../modules/DEFORMABLE.md#lod-bits)
- **Fractions** — one float per detail level of a `.dfm`. Each is looked up in the part's
  `[DetailSwitchTable]` for its distance. → [DEFORMABLE § Level fractions](../modules/DEFORMABLE.md#level-fractions)
- **UV bone** — eye animation on heads: the eye bone's rotation offsets the texture of the `eye*`
  face groups. → [DEFORMABLE § The UV bone](../modules/DEFORMABLE.md#the-uv-bone)
- **Costume** — a body, a head and two hands joined when loaded, plus up to eight accessories.
  `costumes.ini` declares the pairing, and this library does not interpret it. → [COSTUME](COSTUME.md)
- **Host** / **child** (costume) — the body is the host, being first; heads and hands are its
  children. → [COSTUME § How the game joins them](COSTUME.md#how-the-game-joins-them-one-rule-shared-names)
- **Join** — the game links every later bone carrying a hardpoint name to the first bone carrying it,
  so that the two hardpoints coincide. No name is hardcoded.
  → [COSTUME § How the game joins them](COSTUME.md#how-the-game-joins-them-one-rule-shared-names)
- **Attachment** — a shared name on the child's root bone, such as `hp_head`: the join that places
  the whole child. → [COSTUME § The pieces and the seats](COSTUME.md#the-pieces-and-the-seats)
- **Seat** — the host hardpoint a child's detached bone names, such as `hp_neck`.
  → [COSTUME § The seam is a detached bone](COSTUME.md#the-seam-is-a-detached-bone-linked-like-any-other)
- **Seam** — the child's bone slot for its detached bone, joined to its seat like any other bone; a
  seam the host does not seat is destroyed.
  → [COSTUME § The seam is a detached bone](COSTUME.md#the-seam-is-a-detached-bone-linked-like-any-other)
- **Rig family** — a group of bodies that seat the same heads exactly; the two match `[Skeleton]
  sex`. → [COSTUME § The seam frame is per rig family](COSTUME.md#the-seam-frame-is-per-rig-family-and-the-game-shows-it)

## Animation

- **Animation library** (`Animation/Script`) — a model's named scripts, embedded in a `.cmp` or kept
  in a standalone `.anm`. → [ANIMATION § Layout](../modules/ANIMATION.md#layout)
- **`.anm`** — a standalone animation file, used by deformable models. The model does not record
  which one it uses; `bodyparts.ini` decides. → [ANIMATION](../modules/ANIMATION.md),
  [RENDERER § 5.3](RENDERER.md#53-animation)
- **Script** — one named animation, such as `Sc_open dock`: a set of maps played together. INI names
  a script, and the game matches it by CRC. → [ANIMATION](../modules/ANIMATION.md)
- **Object map** / **joint map** — a map drives either the model's root object or one joint, through
  one channel. → [ANIMATION § Object maps and joint maps](../modules/ANIMATION.md#object-maps-and-joint-maps)
- **Channel** (`Header`, `Frames`) — a keyframe track, always linearly interpolated. Each channel
  loops at its own length.
  → [ANIMATION § Channels](../modules/ANIMATION.md#channels),
  [ANIMATION § Channels loop independently](../modules/ANIMATION.md#channels-loop-independently-at-their-own-lengths)
- **Interval** / **time marker** — the spacing between keyframes in seconds; a negative interval
  means each keyframe carries its own time instead. → [ANIMATION § `Header`](../modules/ANIMATION.md#header)
- **Channel type** — a bitfield saying what each keyframe holds. The low nibble comes from Conquest:
  Frontier Wars and the five bits above it are Freelancer's compression (`ZeroPosition`,
  `IdentityQuaternion`, `VectorQuaternion`, `AngleQuaternion`, `ShortQuaternion`).
  → [ANIMATION § `ChannelType`](../modules/ANIMATION.md#channeltype),
  [ANIMATION § Quantized quaternions](../modules/ANIMATION.md#quantized-quaternions)
- **Joint rest** — the joint's position and rotation declared in `Cons`. Sphere and loose channels
  displace it rather than replace it.
  → [ANIMATION § A sphere or loose channel is a displacement](../modules/ANIMATION.md#a-sphere-or-loose-channel-is-a-displacement-of-the-joints-rest)
- **Joint range** — a joint's declared `min`/`max`. Retail animation exceeds it; the reader keeps
  what the file stores, and the engine clamps revolute and prismatic values to it.
  → [ANIMATION § The range is enforced](../modules/ANIMATION.md#the-range-is-enforced)
- **Root motion** — an object map moving its object from where it stood, and on a loop carrying on
  from where the last cycle ended. → [ANIMATION § Object maps are relative](../modules/ANIMATION.md#object-maps-are-relative-and-carry-motion-forward)
- **`Root height`** — how far above a room's floor a character stands; it lifts the object, not the
  skeleton. → [ANIMATION § Root height](../modules/ANIMATION.md#root-height-elevates-the-character-not-the-skeleton)

## Textures and materials

- **Texture library** — a directory with one entry per texture, in a standalone `.txm`, inside a
  `.mat` or embedded in a model. → [TEXTURE](../modules/TEXTURE.md)
- **Texture entry** — one texture, in one of four exclusive forms: animated, `CUBE`, `MIPS` or
  `MIP0..n`. → [TEXTURE § Layout](../modules/TEXTURE.md#layout)
- **`MIPS`** — one DirectDrawSurface (DDS) holding the whole mip chain, compressed or not.
  → [TEXTURE § `MIPS`](../modules/TEXTURE.md#mips--directdrawsurface)
- **`MIP0..n`** — one uncompressed Targa per mip level, largest first.
  → [TEXTURE § `MIP0..n`](../modules/TEXTURE.md#mip0n--targa-mip-chains)
- **`CUBE`** — a cubemap: one DirectDrawSurface holding six face chains.
  → [TEXTURE § Cubemaps](../modules/TEXTURE.md#cubemaps)
- **Targa flip bit** — the Targa flag for a top-left origin, reported as `flip`. The game reverses
  the rows of those chains and of nothing else.
  → [TEXTURE § Vertical origin](../modules/TEXTURE.md#vertical-origin),
  [TEXTURE § What the game reorders](../modules/TEXTURE.md#what-the-game-reorders)
- **Animated texture** — an entry with no pixels of its own that steps through UV rectangles on
  sibling atlas entries named `<name>_<index>`.
  → [TEXTURE § Animated textures](../modules/TEXTURE.md#animated-textures)
- **Entry name** — texture names look like file names but are opaque labels, often two file names
  run together with a timestamp, and are matched by CRC.
  → [TEXTURE § Entry naming](../modules/TEXTURE.md#entry-naming)
- **Punch-through** — DXT1 decides transparency per 4×4 block and the container does not record it,
  so there is no separate DXT1-with-alpha format.
  → [TEXTURE § There is no `dxt1a`](../modules/TEXTURE.md#there-is-no-dxt1a)
- **Material library** (`.mat`, `Material count`) — a directory with one entry per material, in a
  standalone `.mat` or embedded in a model. → [MATERIAL § Layout](../modules/MATERIAL.md#layout)
- **Material** — one directory of flat property files, referenced by meshes by CRC. Every property
  is optional. → [MATERIAL](../modules/MATERIAL.md)
- **Material type** (`Type`) — the name of the shader a material draws with: token-composed like
  `DcDt` or `DcDtOcOtTwo`, or a whole word like `Nebula` or `DetailMapMaterial`. It does not decide
  which properties are present.
  → [MATERIAL § Types](../modules/MATERIAL.md#types),
  [MATERIAL § `Type` does not determine the property set](../modules/MATERIAL.md#type-does-not-determine-the-property-set)
- **Type tokens** — `Dc` diffuse colour, `Dt` diffuse texture, `Ec` emission colour, `Et` emission
  texture, `Bt` detail texture, `Oc`/`Ot` opacity (either turns blending on, and the alpha comes from
  `Dt`), `Two` two-sided. → [RENDERER § 6](RENDERER.md#6-materials),
  [MATERIAL § Properties](../modules/MATERIAL.md#properties)
- **Texture slot** (`<slot>_name`, `<slot>_flags`) — a pair of material files: the texture's name,
  looked up by CRC, and a word of addressing flags that describes the sampler, not the image.
  → [MATERIAL § Texture flags](../modules/MATERIAL.md#texture-flags)
- **`[MaterialMap]`** — a section of `EXE/dacom.ini` that rewrites a material's type when it loads,
  by type or by name pattern. The library does not apply it.
  → [MATERIAL § Types](../modules/MATERIAL.md#types)
- **Nomad texture** (`Nt`) — the slot nomad hulls draw from. No retail material sets it; the
  engine's compiled-in default `NomadRGB1_NomadAlpha1` does.
  → [MATERIAL § Defaults](../modules/MATERIAL.md#defaults)
- **Draw order** — opaque groups first, then blended ones back to front. Nothing in the format
  records it. → [MATERIAL § Draw order](../modules/MATERIAL.md#draw-order)

## Alchemy (particle effects)

- **Alchemy** (`.ale`, `alchemy.dll`) — Freelancer's particle-effect system. An `.ale` holds a node
  library and an effect library, and `alchemy.dll` is the authority on how they behave.
  → [ALCHEMY](../modules/ALCHEMY.md)
- **Node library** (`AlchemyNodeLibrary`) — the reusable, typed parameter blocks an effect is built
  from. → [ALCHEMY § Node library](../modules/ALCHEMY.md#node-library)
- **Node** — one entry of the node library: a type such as `FxCubeEmitter` and a list of properties.
  It is named by `Node_Name` and referenced by the case-sensitive CRC of that name.
  → [ALCHEMY § Node library](../modules/ALCHEMY.md#node-library)
- **`Fx*`** / **`FL*`** — stock Alchemy node types, and the four Digital Anvil added for Freelancer:
  the dust and beam appearances and fields.
  → [ALCHEMY § Node library](../modules/ALCHEMY.md#node-library)
- **Emitter** — a node that creates particles, firing along its local +Y.
  → [ALCHEMY § Known names](../modules/ALCHEMY.md#known-names)
- **Appearance** — a node that draws the particles of the emitter it is linked to: a sprite, a
  rect, a beam, or a whole effect per particle.
  → [ALCHEMY § Known names](../modules/ALCHEMY.md#known-names),
  [RENDERER § 9.2](RENDERER.md#92-what-actually-draws)
- **Field** — a node that acts on the particles of any appearance linked to it: radial, gravity, air,
  turbulence, collide, dust, beam. → [ALCHEMY § Known names](../modules/ALCHEMY.md#known-names)
- **Property** (Alchemy) — a typed value on a node, named by a CRC. Its prefix, such as `BasicApp_`,
  names a group of parameters rather than the node type carrying it.
  → [ALCHEMY § Node properties](../modules/ALCHEMY.md#node-properties),
  [ALCHEMY § Known names](../modules/ALCHEMY.md#known-names)
- **Effect library** (`ALEffectLib`) — the named effects, each arranging nodes into a tree.
  → [ALCHEMY § Effect library](../modules/ALCHEMY.md#effect-library)
- **Effect** — one named tree of node instances. The game links to it from INI by `effect_crc`.
  → [ALCHEMY § Effect library](../modules/ALCHEMY.md#effect-library),
  [ALCHEMY § `effect_crc` pins the rule](../modules/ALCHEMY.md#effect_crc-pins-the-rule)
- **Node instance** — one use of a node inside an effect, with `children` (contained) and `targets`
  (linked). → [ALCHEMY § Effect library](../modules/ALCHEMY.md#effect-library)
- **Pair** (target) — a link across the tree binding an appearance to an emitter, stored apart from
  the tree. → [ALCHEMY § Effect library](../modules/ALCHEMY.md#effect-library)
- **Folder** (container) — an instance whose `flags` is non-zero. The DLL builds it as a bare
  `FxNode` and never looks its CRC up. → [ALCHEMY § Two fields, two
  jobs](../modules/ALCHEMY.md#two-fields-two-jobs-flags-makes-a-container-control_root_id-makes-it-the-root)
- **Control root** (`Control Root`, `CONTROL_ROOT_ID`) — the folder whose CRC is the hash of
  `Control Root`: the one node an effect's placement reaches. What hangs from it moves with the
  effect; what sits beside it does not. The name ships nowhere in retail and was recovered by
  search. → [ALCHEMY § Two fields, two
  jobs](../modules/ALCHEMY.md#two-fields-two-jobs-flags-makes-a-container-control_root_id-makes-it-the-root),
  [ALCHEMY § The root's name was
  recovered](../modules/ALCHEMY.md#the-roots-name-was-recovered-not-read)
- **Placement** — the matrix the host gives an effect. It goes to the control root, or to each
  top-level instance when there is none. → [ALCHEMY § Two fields, two
  jobs](../modules/ALCHEMY.md#two-fields-two-jobs-flags-makes-a-container-control_root_id-makes-it-the-root)
- **World** (`WORLD_ID`) — the parent id that marks an instance as top-level.
  → [ALCHEMY § Effect library](../modules/ALCHEMY.md#effect-library)
- **Sparam** — a control value the host supplies to blend between an effect's states. It is the
  outer key of every animated property. → [ALCHEMY § Evaluation](../modules/ALCHEMY.md#evaluation)
- **Particle age** — the inner key of an animated property: a particle's age over its lifespan, or
  the node's own time, depending on what samples it.
  → [ALCHEMY § Evaluation](../modules/ALCHEMY.md#evaluation)
- **Eased list** / **looped list** — the two inner keyframe lists: one easing type held at the ends,
  or Hermite keyframes with a fallback and a wrap mode at each end.
  → [ALCHEMY § Containers](../modules/ALCHEMY.md#containers),
  [ALCHEMY § `WrapMode`](../modules/ALCHEMY.md#wrapmode)
- **Easing** (`EaseType`) — a byte indexing `alchemy.dll`'s table of seven easing functions.
  → [ALCHEMY § `EaseType`](../modules/ALCHEMY.md#easetype)
- **Transform** (Alchemy, `Node_Transform`) — a node's animated position, rotation and scale.
  → [ALCHEMY § `AnimatedTransform`](../modules/ALCHEMY.md#animatedtransform)
- **LOD value** — a value the host sets that scales how many particles an emitter makes and how
  large an appearance draws. → [ALCHEMY § Known names](../modules/ALCHEMY.md#known-names)

## INI and what the engine reads

- **INI** — the game's data format: sections of properties of values, in one of three encodings.
  The file's signature decides the encoding, never its extension. → [INI](../modules/INI.md)
- **Text form** — plain-text INI. The game accepts it wherever retail ships BINI.
  → [INI § Text form](../modules/INI.md#text-form)
- **BINI** — compiled binary INI, which the game reads in place.
  → [INI § BINI form](../modules/INI.md#bini-form)
- **Save form** (`.fl`, `FLS1`) — text INI under a positional XOR mask; obfuscation, not encryption.
  → [INI § Save form](../modules/INI.md#save-form)
- **Section** / **property** / **value** — `[Name]`, then named lists of values. Names repeat
  freely, so a document is an ordered sequence, not a map.
  → [INI § The document model](../modules/INI.md#the-document-model)
- **Value tag** — how a value's token looked (boolean, integer, float, string), not the type the
  game reads it as. → [INI § The tag is the token's shape](../modules/INI.md#the-tag-is-the-tokens-shape-not-the-fields-type)
- **Coercion** — the game never asks a value's type; it asks for the type it wants, and the reader
  converts. → [INI § How the game reads a value](../modules/INI.md#how-the-game-reads-a-value)
- **Arity** — how many values a property carries. Reading past it is a hard error in the game.
  → [INI § How the game reads a value](../modules/INI.md#how-the-game-reads-a-value)
- **Bare property** — a property with no values, such as `separable`, which the game reads as true.
  → [INI § Booleans do not occur](../modules/INI.md#booleans-do-not-occur-and-the-writer-must-never-emit-one)
- **`INI_Reader`** — the engine's one INI reader class, in `common.dll`. Its calls are the evidence
  for which keys the game reads.
  → [ENGINE § The export table names the reader](ENGINE.md#the-export-table-names-the-reader)
- **Object type** (`type` on `[Solar]`, `[Ship]`) — one bitfield shared by solar and ship types and
  the targeting filters. → [ENGINE § Object types](ENGINE.md#object-types)
- **Hardpoint type** (`hp_type`, `hp_gun_type`) — the closed vocabulary of mount types that decides
  which equipment fits where. → [ENGINE § Hardpoint types](ENGINE.md#hardpoint-types)
- **Zone shape** / **zone property flags** — `[Zone] shape` and `property_flags`.
  → [ENGINE § Zone shapes](ENGINE.md#zone-shapes),
  [ENGINE § Zone property flags](ENGINE.md#zone-property-flags)
- **Mission scripting** (`[Trigger]`, `Act_*`, `Cnd_*`) — the actions and conditions of mission
  trigger blocks. → [ENGINE § Mission scripting](ENGINE.md#mission-scripting)
- **Declared shape** — the types and positions the engine asks a property for, such as `f f f`. It
  can differ from the recorded tags, because the reader coerces.
  → [ENGINE § Value shapes](ENGINE.md#value-shapes),
  [SECTIONS § Declared value shapes](SECTIONS.md#declared-value-shapes)
- **Unread key** / **engine-only key** — a key retail writes that nothing reads, and a key the
  engine reads that retail never sets.
  → [ENGINE § The 105 keys nothing reads](ENGINE.md#the-105-keys-nothing-reads),
  [ENGINE § The 180 keys retail never sets](ENGINE.md#the-180-keys-retail-never-sets)

## Names, infocards and voices

- **Resource DLL** — a code-less DLL holding the game's names and infocards. `resources.dll` comes
  first, then the ones `freelancer.ini`'s `[Resources]` lists, in order.
  → [RESOURCE](../modules/RESOURCE.md)
- **Global id** / **local id** — a global id is library index × `0x10000` plus the resource's
  local number in that library. Adding a DLL anywhere but the end renumbers what follows.
  → [RESOURCE § The id space](../modules/RESOURCE.md#the-id-space)
- **`ids_name`** — the global id of an object's display name, a string in an `RT_STRING` table.
  → [RESOURCE § `RT_STRING`](../modules/RESOURCE.md#rt_string--every-ids_name)
- **`ids_info`** / **infocard** — the global id of an object's description, an RDL document in an
  `RT_HTML` resource. Names and infocards are separate id spaces.
  → [RESOURCE § `RT_HTML`](../modules/RESOURCE.md#rt_html--every-ids_info)
- **String table** — Win32 strings stored sixteen to a block. An empty slot is a hole and reads as
  absent. → [RESOURCE § `RT_STRING`](../modules/RESOURCE.md#rt_string--every-ids_name)
- **RDL** — the markup inside every infocard: XML read by `common.dll` into a flat list of
  instructions to a text cursor, whatever the nesting. Only `TEXT` needs its closing tag.
  → [RDL](RDL.md)
- **`TEXT`**, **`PARA`**, **`TRA`**, **`JUST`** — append text, end a paragraph, change the text
  style, set the alignment. → [RDL § The document](RDL.md#the-document),
  [RDL § `TRA` merges](RDL.md#tra-merges-and-unmasked-bits-keep-their-current-value)
- **`PUSH`** / **`POP`** — save and restore the defaults a `TRA`'s `def` bits restore to; they do
  not delimit content. **`POS`** and **`STYLE`** — move the cursor, call up a style registered in
  code; the reader knows both, no infocard uses either.
  → [RDL § `PUSH` and `POP`](RDL.md#push-and-pop-set-the-defaults)
- **Voice bank** — a UTF file under `DATA/AUDIO`, one per speaker, holding one waveform per line of
  dialogue. Entries are named by the object id of the line's `msg`.
  → [AUDIO](AUDIO.md), [AUDIO § Layout](AUDIO.md#layout)

## Scene scripts

- **THN** (`.thn`) — a scene script, for cutscenes and base rooms: a compiled Lua 3.2 chunk that is
  data, not code, assigning `duration`, `entities` and `events`. → [THN](../modules/THN.md),
  [THN § A THN is data, not code](../modules/THN.md#a-thn-is-data-not-code)
- **THORN** (`thorn.dll`) — the scene library that plays THN scripts and defines every name they
  use. → [THN § The engine](../modules/THN.md#the-engine), [THORN](THORN.md)
- **Scene vocabulary** — every global THORN registers: entity types, event types, flags and the
  other enums. The registry is closed.
  → [THORN § The registry is closed](THORN.md#the-registry-is-closed)
- **Identifier** — a bare name like `SCENE` read from THORN's globals, which is not the string
  `"SCENE"`. `Y` and `N` are the booleans.
  → [THN § The value domain](../modules/THN.md#the-value-domain),
  [THN § `Y` and `N` are the booleans](../modules/THN.md#y-and-n-are-the-booleans)
- **Export form** — retail scripts come from two exporters: the symbolic form writes names, the
  numeric form writes resolved numbers. → [THN § Two export forms](../modules/THN.md#two-export-forms)
- **Entity** — an object in a scene: a compound, a deformable, a camera, a light, a sound, a
  marker and so on, with a type-specific property block.
  → [THORN § Entity types](THORN.md#entity-types)
- **Event** — a timed action on target entities, such as `START_MOTION` or `ATTACH_ENTITY`.
  → [THORN § Event types](THORN.md#event-types)
- **Property block** (`spatialprops`, `cameraprops`, `lightprops`, `pathprops`, …) — an entity's or
  event's per-type settings. → [THORN § Properties](THORN.md#properties)
- **`userprops`** — the one block THORN passes through untouched, for the game to read.
  → [THORN § `userprops` is not THORN's](THORN.md#userprops-is-not-thorns)
- **Provenance** (dll, binary, code, corpus, guide) — where each vocabulary row's claim comes from,
  strongest first. → [THORN § Provenance](THORN.md#provenance)

## The executables

- **`alchemy.dll`** — the particle runtime. → [ALCHEMY](../modules/ALCHEMY.md)
- **`common.dll`** — home of `INI_Reader`. It resolves keywords through name/value tables, so both
  the names and the numbers survive. → [ENGINE § Where these live](ENGINE.md#where-these-live)
- **`content.dll`** — game logic that matches keywords by string comparison, so only names survive.
  → [ENGINE § `content.dll`](ENGINE.md#contentdll--names-without-values)
- **`dacom.dll`** — the engine DLL whose CRC table defines the resource id.
  → [UTF § Hashing](../modules/UTF.md#hashing)
- **`dacom.ini`** — the plain-text engine configuration that holds `[MaterialMap]`.
  → [MATERIAL § Types](../modules/MATERIAL.md#types)
- **`shading.dll`**, **`flmaterials.dll`** — the material DLLs: texture loading, material property
  tables, material animation. → [MATERIAL § Defaults](../modules/MATERIAL.md#defaults),
  [TEXTURE § What the game reorders](../modules/TEXTURE.md#what-the-game-reorders)
- **`thorn.dll`** — the scene-script library. → [THORN](THORN.md)
- **`Freelancer.exe`** — the game itself, wrapped in SecuROM copy protection.
  → [ENGINE § The executable is SecuROM-wrapped](ENGINE.md#the-executable-is-securom-wrapped)

## Lineage and other tools

- **Digital Anvil** — Freelancer's developer. Its build tools and exporters wrote every retail file.
- **Conquest: Frontier Wars** (CFW) — Digital Anvil's earlier game. Joint records and the low bits
  of the animation channel type are its structures, unchanged.
  → [COMPOUND § Where the records come from](../modules/COMPOUND.md#where-the-records-come-from),
  [ANIMATION § Where the low bits come from](../modules/ANIMATION.md#where-the-low-bits-come-from)
- **openFLAME** — the engine behind CFW. A few retail files still carry its trees; every reader
  skips them. → [RETAIL § openFLAME leftovers](RETAIL.md#openflame-leftovers)
- **IVP** (Ipion Virtual Physics) — the physics middleware, later Havok, whose surface structures
  `.sur` wraps. → [SURFACE § Relationship to IVP](../modules/SURFACE.md#relationship-to-ivp)
- **MAXLancer**, **Librelancer**, **LancerEdit** — community tools cited for comparison. Each
  document notes where one agrees with the game and where it does not.
  → [COSTUME § What Librelancer and MAXLancer do](COSTUME.md#what-librelancer-and-maxlancer-do)
- **Discovery** — a large mod, used as a second corpus where retail never exercises a feature.
  → [RESOURCE § More than seven libraries](../modules/RESOURCE.md#more-than-seven-libraries)

## Words with two meanings

- **Resource id** — the `getResourceId` hash of a UTF name, or a Win32 resource's own number inside
  a DLL (the local id). → [UTF § Hashing](../modules/UTF.md#hashing),
  [RESOURCE § The id space](../modules/RESOURCE.md#the-id-space)
- **Type** — a material's shader, an object's `[Ship]`/`[Solar]` type, an INI value's tag, a THN
  entity's `type`, or a Win32 resource type. Each is its own vocabulary.
- **Dictionary** — the names block of a UTF file, or the names-and-strings block of a BINI file.
  → [UTF § On-disk layout](../modules/UTF.md#on-disk-layout),
  [INI § BINI form](../modules/INI.md#bini-form)
- **Part** — a node of a compound model, or a piece of a surface. They pair up by the part name's
  CRC. → [SURFACE § Matching a part to a model part](../modules/SURFACE.md#matching-a-part-to-a-model-part)
- **`MultiLevel`** — a rigid part's switch between meshes, or a `.dfm`'s list of whole skinned
  meshes. → [VMESH § Levels of detail](../modules/VMESH.md#levels-of-detail),
  [DEFORMABLE § Layout](../modules/DEFORMABLE.md#layout)
- **Sphere** — a joint kind, or the procedural sphere of a `.sph`.
  → [COMPOUND § Joints](../modules/COMPOUND.md#joints),
  [RIGID § Procedural spheres](../modules/RIGID.md#procedural-spheres)
- **Transform** — an Alchemy node's animated transform (`AnimatedTransform`), or one step of a
  transform stack in `./math` (`Transform`).
  → [ALCHEMY § `AnimatedTransform`](../modules/ALCHEMY.md#animatedtransform), [MATH](../modules/MATH.md)
- **Host** — whatever places a guest: the game engine for an Alchemy effect or a THORN scene, the
  body for a costume's head and hands. → [ALCHEMY § Two fields, two
  jobs](../modules/ALCHEMY.md#two-fields-two-jobs-flags-makes-a-container-control_root_id-makes-it-the-root),
  [COSTUME § The pieces and the seats](COSTUME.md#the-pieces-and-the-seats)
