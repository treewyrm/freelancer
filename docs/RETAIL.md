# Retail data

Observations that belong to the retail Freelancer install as a whole rather than to any one module:
where the corpus lives, how faithfully each module reproduces it, and which assets are not
Freelancer's at all. Per-format detail stays in the module documents.

## The corpus

The `corpus.test.ts` suites — `src/vmesh/`, `src/animation/`, `src/surface/`, `src/rigid/`,
`src/texture/`, `src/material/`, `src/deformable/`, `src/alchemy/` — validate the readers against
retail game assets. `src/corpus.ts` looks for a Freelancer `DATA` directory at `$FREELANCER_DATA`,
falling back to `~/Downloads/Freelancer/DATA`, and each suite skips itself with a reason when
neither exists. **The rest of the test suite never depends on retail data being present.**

Retail is the authority these modules are measured against, so a claim about the format is worth
only the count behind it. The numbers below and in the module documents come from sweeps over that
install and are pinned by the suites, not recalled.

## Round-trip fidelity

What each module reproduces when a retail file is read and written back. **Writing is a fixed point
everywhere** — what is written reads back identical and writes again to the same bytes — which is
the weaker guarantee that still holds where byte-exactness does not.

| Module | Byte-exact | What cannot round-trip |
| --- | --- | --- |
| Material | all 7,525 materials | file order inside a material: the writer emits the authored order (6,569 files), not the case-insensitive sorted order a second tool used (956) |
| Deformable | all 204 models | nothing of its own — see the constraint residue below |
| Texture | 4,447 DirectDrawSurfaces, both cubemaps, 12 animated textures, 629 of 2,400 Targa chains | 1,668 colour-mapped chains (palette not carried), 102 16-bit (expansion to 24 does not invert), 1 declaring attribute bits — all come back larger with the same pixels |
| Alchemy | 596 effect files, less the two cases opposite | `Pair` record order (146 files); the empty string has two retail encodings and the writer emits one (2 files) — both authoring residue, links and values identical either way |
| Animation | — | 55 keyframes whose source data is out of encoding range |
| Compound | — | every constraint record leaves stack residue past the terminator of its two 64-byte name fields — all 9,096 deformable and all 5,316 rigid records. `writeConstraints` zero-fills |

Details and the reasoning behind each gap live in [MATERIAL.md](MATERIAL.md),
[DEFORMABLE.md](DEFORMABLE.md), [TEXTURE.md](TEXTURE.md), [ALCHEMY.md](ALCHEMY.md),
[ANIMATION.md](ANIMATION.md) and [COMPOUND.md](COMPOUND.md).

## openFLAME leftovers

Five retail files carry trees from **openFLAME**, the engine behind Digital Anvil's earlier
*Conquest: Frontier Wars*. They share the UTF container with Freelancer and nothing else: the game
cannot load them, no `.ini` names them, and no module here interprets their content. They are listed
so a sweep of retail data recognizes them instead of mistaking them for an unread Freelancer
structure — **find them, skip them, do not implement them.**

| File | Root nodes | Content |
| --- | --- | --- |
| `EQUIPMENT/MODELS/HARDWARE/no_cargo_extender.3db` | `openFLAME 3D N-mesh`, `Rigid body` | Pre-VMesh geometry, plus a nested `Material library` and `Texture library` |
| `EQUIPMENT/MODELS/HARDWARE/no_invulnerability.3db` | same | same |
| `EQUIPMENT/MODELS/HARDWARE/no_key.3db` | same | same |
| `EQUIPMENT/MODELS/HARDWARE/no_power_boost.3db` | same | same |
| `SOLAR/BLACKHOLE/bh_flute4.pte` | `Particle Event`, `Rigid body` | `particle1.Def`, an `Animation library`, a paletted `Texture library`, `Scale`, `PointExtent` |

The four `.3db` files are openFLAME end to end — their root holds `Exporter Version` and the two
trees, and no Freelancer geometry at all. `bh_flute4.pte` is the only `.pte` in the data.

### The vocabulary is the marker, not the extension

openFLAME geometry is `Vertices` / `Edges` / `Normals` / `Face groups` (a space, where Freelancer
writes `Face_groups`) over `Object vertex list`, `Face vertex chain` and `Face D-coefficient`. Its
materials key on `Material identifier` and nest `Ambient` / `Diffuse` / `Specular` / `Transparency`
directories each with a `Map` subdirectory, where a Freelancer material holds only flat property
files. Its textures are `Palette 8 bit` with `Image indices` and `Palette RGB 888`. `Rigid body`
wraps `Mass properties` and either an `Extent tree` or, in the `.pte`, an `Extent data` /
`Bounding volume` pair.

**None of these names occurs in a Freelancer-authored asset**, which is what makes the test cheap.

### Every reader already yields nothing, deliberately

`readVMeshLibrary` reads an openFLAME root as an empty library. `readTextures` and `readMaterials`
come back empty because both libraries are nested inside the openFLAME tree rather than sitting at
the file root where those readers look. Reaching an entry directly is covered too — `readTexture`
returns `undefined` on a paletted entry rather than guessing. Nothing throws.

The two paletted texture forms nest oppositely, so neither reader can assume the other: the `.3db`
files put `MIP0..n` **under** `Palette 8 bit`, while the `.pte` puts a `Palette 8 bit` under **each**
`MIP0..n` and adds `U wrap mode` / `V wrap mode`.

See [TEXTURE.md](TEXTURE.md) for the paletted layout, [MATERIAL.md](MATERIAL.md) for the nested
library, and [COMPOUND.md](COMPOUND.md) for the shared joint lineage — the one place the two engines
genuinely overlap, since Freelancer's joint records are Conquest structures unchanged.

### `FX/MISC/tlrtube.3db` is not one of them

It was grouped with these for a long time on the strength of being pre-VMesh. Its vocabulary is
Freelancer's own, it carries no openFLAME marker, and what it is residue of is `FxMeshAppearance` —
an unfinished Freelancer feature that crashes the game when a particle spawns for that appearance.
It stays unread because there is no working in-game behaviour to validate a reader against, not
because another engine authored it. The full argument is in [RIGID.md](RIGID.md).

## TODO — what is pending in the game

Questions the corpus cannot answer, because the answer is a behaviour rather than a byte. Each
module document carries its own `TODO` section with the full argument and the experiment; this is
the index. **Everything listed reads, writes and round-trips today** — the reader picks the reading
that cannot go visibly wrong, and the open question is which reading is right.

| Question | Where | Experiment |
| --- | --- | --- |
| `TransformFlags` bits 2, 8, 9, 16, 18 — constant across all 5,590 retail transforms, so not a channel selector; what they select is unknown | [ALCHEMY.md](ALCHEMY.md#todo) | Clear one bit at a time on `gf_explosion_debris_trail01.ale` and fly |
| Easing type 6, used only by `FLDustAppearance` and by both of its instances | [ALCHEMY.md](ALCHEMY.md#todo) | One-byte edit to `dust.ale`, set it to 4 and fly; `todo` test |
| A key landing on the end of a curve carrying no wrap flags — fold or hold | [ALCHEMY.md](ALCHEMY.md#todo) | Source `TODO`; `todo` test |
| The four version-1.1 `Effect` floats — a bounding sphere, unconfirmed | [ALCHEMY.md](ALCHEMY.md#todo) | Inflate `unknown4` and watch culling |
| Texture flag bits 4 and 6 — the wrap mode field the DLL proves is there | [MATERIAL.md](MATERIAL.md#todo) | Clear bit 4 on a detail material's `Bt_flags` |
| What `MAFlags` selects — only `2` and `0` occur, across 82 entries | [RIGID.md](RIGID.md#todo) | Flip it on the Bizmark banner |
| Whether `MAKeys` or `MADeltas` drives the UV transform | [RIGID.md](RIGID.md#todo) | Zero one file, then the other |
| Whether Freelancer honours the Targa top-left origin bit | [TEXTURE.md](TEXTURE.md#todo) | Look at the nine chains that set it |
| `DDSCAPS_ALPHA` on a cubemap — format-driven or always | [TEXTURE.md](TEXTURE.md#todo) | Write an opaque cubemap and load it |
| Whether anything reads `Edge_angles` | [DEFORMABLE.md](DEFORMABLE.md#todo) | Delete them from one of the two files |
| Whether the engine still decodes a `0x08` event channel | [ANIMATION.md](ANIMATION.md#todo) | Author one and load the model |

Two questions that look like they belong here do not. **Cylinder joint animation is impossible**,
not unimplemented — a cylinder needs 2 floats and no combination of the channel type bits comes to
2 ([ANIMATION.md](ANIMATION.md)). **`FX/MISC/tlrtube.3db`'s animated UV set is blocked, not
pending** — validating a reader for it needs `FxMeshAppearance` to stop crashing first
([RIGID.md](RIGID.md#todo)).

---

[UTF.md](UTF.md) · [VMESH.md](VMESH.md) · [COMPOUND.md](COMPOUND.md) · [RIGID.md](RIGID.md) ·
[ANIMATION.md](ANIMATION.md) · [SURFACE.md](SURFACE.md) · [ALCHEMY.md](ALCHEMY.md) ·
[TEXTURE.md](TEXTURE.md) · [MATERIAL.md](MATERIAL.md) · [DEFORMABLE.md](DEFORMABLE.md) ·
[AUDIO.md](AUDIO.md) · [RENDERER.md](RENDERER.md)
