# Texture

A texture library is a UTF directory named `Texture library` holding one subdirectory per texture.
Libraries appear as standalone `.txm` files, alongside materials in `.mat` files, and embedded
directly in models — `.3db`, `.cmp`, `.dfm` and one `.sph`. Export names are in
[API.md](API.md#texture).

## Architecture

```
Texture library (UTF directory)
  └─ <texture name> (UTF directory per texture)
       │
       ├─ MIPS (UTF file) ────────── a whole DirectDrawSurface, header and mip chain
       │
       ├─ MIP0, MIP1, … MIPn ─────── one uncompressed Targa per mip level
       │
       ├─ CUBE (UTF file) ────────── a DirectDrawSurface holding all six cubemap faces
       │
       └─ Texture count ─────────┐   an animation over sibling atlas entries
          Frame count            │
          FPS                    │
          Frame rects ───────────┘
```

The four forms are mutually exclusive in practice, and `readTexture` tries them in the order
animated → `CUBE` → `MIPS` → `MIP0..n`.

**Which image form an entry uses is not a function of its pixel format** — retail authored
`rgb24_888` both ways. `TextureStorage` (`dds`, `targa` or `cube`) carries it, so `writeTexture` puts
a texture back in the form it came from rather than guessing.

The directory name is spelled three ways, so every lookup goes through `getResourceId`, never a string
compare. Entry names are matched by CRC, so a collision inside one library would make a texture
unreachable.

---

## `MIPS` — DirectDrawSurface

A complete `.dds` file: the 4-byte `DDS ` magic, a 124-byte `DDSURFACEDESC2`, then the mip chain.
Fields the reader consumes, at their absolute offsets:

| Offset | Field                 | Notes                                                            |
| ------ | --------------------- | ---------------------------------------------------------------- |
| 0      | magic                 | `DDS ` (`0x20534444`)                                            |
| 8      | `dwFlags`             | `DDSD_PIXELFORMAT` required; `DDSD_MIPMAPCOUNT` optional         |
| 12     | `dwHeight`            |                                                                  |
| 16     | `dwWidth`             |                                                                  |
| 28     | `dwMipMapCount`       | 1 when `DDSD_MIPMAPCOUNT` is clear                               |
| 80     | `ddspf.dwFlags`       | `DDPF_FOURCC` (0x4), `DDPF_RGB` (0x40), `DDPF_ALPHAPIXELS` (0x1) |
| 84     | `ddspf.dwFourCC`      | `DXT1`, `DXT3`, `DXT5`, or 0                                     |
| 88     | `ddspf.dwRGBBitCount` | uncompressed only                                                |
| 92–104 | R/G/B/A bit masks     | uncompressed only                                                |

**The masks are read unsigned.** An `0xff000000` alpha mask read as a signed int32 comes back negative
and matches no known format, which made every 32-bit uncompressed surface throw. Retail has no such
surface, so only synthetic content exposes it.

### Writing the header back

Retail's surfaces vary in exactly four fields — dimensions, mip count, pixel format and the mipmap
caps bit — so `writeDirectDrawSurface` derives the whole 128-byte header rather than carrying it:

| Field                             | Written as                                                                         |
| --------------------------------- | ---------------------------------------------------------------------------------- |
| `dwFlags`                         | `0xa1006` compressed, `0x2100e` otherwise                                          |
| `dwPitchOrLinearSize`             | top level's byte length, or `width * bitCount >> 3`                                |
| `dwDepth`, reserved, `dwCaps3..4` | zero                                                                               |
| `dwMipMapCount`                   | number of levels, with `DDSD_MIPMAPCOUNT` set even for one                         |
| `ddspf.dwFlags`                   | `DDPF_FOURCC`, or `DDPF_RGB` plus `DDPF_ALPHAPIXELS` if the alpha mask is non-zero |
| `dwCaps`                          | `0x401008`, or `0x1000` for a single level                                         |
| `dwCaps2`                         | zero, or the cubemap and face bits when six surfaces are written                   |

Two of those are worth not "fixing": **`DDSD_CAPS` is left clear**, as it is in every retail flat
surface despite `dwCaps` being populated, and `DDSD_MIPMAPCOUNT` is set on single-level surfaces too.
Both match the game's own writer. [Cubemaps](#cubemaps) reverse the first and drop the second.

Levels are checked against the dimensions they will be read back at before anything is written — the
header records only the base size, so a chain that does not halve from it would be walked at the wrong
offsets rather than read as written.

### Mip chain sizing

Block-compressed levels are padded up to whole 4×4 blocks, so a 2×2 or 1×1 level still occupies one
block:

```
Math.max(1, (w + 3) >> 2) * Math.max(1, (h + 3) >> 2) * (DXT1 ? 8 : 16)
```

The obvious `(w >> 2) * (h >> 2)` yields **zero bytes** below 4×4. Uncompressed chains do run to 1×1,
where `w * h * bitCount >> 3` is still correct.

---

## `MIP0..n` — Targa mip chains

`MIP0`, `MIP1`, … each hold a complete uncompressed `.tga`, one per mip level, largest first. Only two
of the seven Targa image types occur: colour-mapped (1) and RGB (2); RLE variants are rejected.

Targa stores colour BGR-first, so 24- and 32-bit images are channel-swapped on read and 16-bit images
are expanded to 24-bit RGB. **A texture's `depth` is therefore never 16 by the time it leaves the
reader.** Colour maps are normalised to RGB order once, up front, so expanding the index map is a
straight copy.

Trailing bytes past the pixel data — the 26-byte v2 footer six retail Targas carry — are ignored.

### Vertical origin

Bit 5 of the image descriptor selects a top-left origin; Targa's default is bottom-left. The reader
**reports** the origin through `Texture.flip` rather than reordering rows, matching `readMIPS`, which
reports `flip: true` unconditionally because DDS always stores the top row first. Whether Freelancer's
own loader honours the descriptor bit is unresolved (see [TODO](#todo)); reporting rather than
transforming means a consumer that finds out either way needs no decode change.

The origin and bit depth are identical across every level of every retail chain, so `readMIP` throws
rather than guessing when levels disagree.

### Writing a chain back

`writeTargaImage` only writes the uncompressed RGB image type, with an empty identification field, an
origin of 0,0 and no attribute bits — which is what retail stores, minus one image. Level dimensions
are derived by halving, since `readMIP` keeps only the base size. The lossy cases are enumerated in
[Corpus](#round-trip).

---

## Animated textures

Some textures animate by stepping through sibling atlas entries rather than storing frames themselves.
The entry holds no pixels at all:

| File            | Type     | Meaning                                            |
| --------------- | -------- | -------------------------------------------------- |
| `Texture count` | int32    | Number of atlases; always max frame index + 1      |
| `Frame count`   | int32    | Number of records in `Frame rects`                 |
| `FPS`           | float32  | Frame rate                                         |
| `Frame rects`   | struct[] | 20 bytes each: int32 atlas index, then u1 v1 u2 v2 |

Each frame names an atlas by index, resolved against a sibling entry called `<name>_<index>` — so
`Pylon.avi` frame 3 samples the `Pylon.avi_3` entry — and a UV rectangle within it.

`Texture count` is not modelled, since it is fully implied by the frame indices.
`writeAnimatedTexture` derives it on the way out rather than carrying it, which is what leaves
`AnimatedTexture` with no field that could disagree with its own frames.

---

## Cubemaps

A `CUBE` file is **one ordinary DirectDrawSurface whose payload is six whole mip chains back to
back**, in the order the face bits are numbered: **+X, −X, +Y, −Y, +Z, −Z**. One header describes all
of them, so every face shares the dimensions, pixel format and level count.
`readDirectDrawSurface` returns them as `surfaces`, one chain per face — a plain texture has one, a
cubemap six — and a partial cubemap is refused rather than read at offsets its missing faces would
have shifted.

**`CubeTexture` is a separate interface from `Texture` rather than a flag on it**, discriminated by
`storage: 'cube'`. Putting the faces in `levels` would mean one face standing in for the whole with
the other five hidden behind it; as it is, uploading a cubemap as a 2D texture is a type error instead
of a silently wrong render.

The cubemap header is not the one `writeMIPS` emits. The two forms disagree on four fields, and each
follows the retail files it has:

| Field                 | `MIPS`                       | `CUBE`                                     |
| --------------------- | ---------------------------- | ------------------------------------------ |
| `DDSD_CAPS`           | clear                        | **set**                                    |
| `DDSD_MIPMAPCOUNT`    | set, even for a single level | **absent**, `dwMipMapCount` zero           |
| `dwPitchOrLinearSize` | one row, or the top level    | **zero**, with neither pitch flag          |
| `dwCaps`              | `DDSCAPS_TEXTURE`            | plus `DDSCAPS_COMPLEX` and `DDSCAPS_ALPHA` |

**None of that is a rule the format imposes**; it is what the two tools that wrote this data did.

## Transparency belongs to the material, not the texture

`Texture` carries no `alpha` flag, deliberately. Whether a texture is drawn blended is decided by the
material that binds it, through the `Oc` and `Ot` tokens in its `Type` string. A DXT1 texture bound to
a plain `DcDt` material is opaque whatever its blocks contain, and nothing consults the texture's own
format to decide. A flag on `Texture` would be both the wrong layer and fully implied by
`TextureType`.

## There is no `dxt1a`

DXT1's transparency mode is selected **per block**, by the endpoint ordering inside the block:
`color0 > color1` gives four interpolated opaque colours, `color0 <= color1` gives three colours plus a
transparent index 3. It is not a property of the image, and nothing in the container records it.

Detecting it means scanning every block, and testing the endpoints alone over-reports — a flat block
encoded as `color0 === color1` also enters 3-colour mode without ever referencing index 3.

**Uploading everything as `COMPRESSED_RGBA_S3TC_DXT1_EXT` is correct for both modes** — opaque blocks
yield alpha 1 there anyway, whereas the `RGB` variant renders punch-through texels as opaque black. So
the RGB enum is never the better choice, and the distinction buys nothing. Because 1-bit alpha is a
cutout rather than a blend, it also needs no back-to-front draw ordering.

## Entry naming

Many entries concatenate the filenames of the two source images the artist combined — a colour map and
a separate opacity map:

```
debris_field.tgadebris_field_alpha.tga
space_tank02dmg.tgaspace_tank02dmg_op.tga
tree_64.tga021121174811tree_64.tga
```

The embedded digits appear to be an export timestamp in `YYMMDDHHMMSS` form — `021121174811` is
2002-11-21 17:48:11 — which fits the game's development window. **Names are opaque identifiers matched
by CRC; none of this is parsed.**

## Refusals

`readTextures` collects per-entry failures and throws a single `AggregateError` at the end, so one
malformed texture does not hide the rest of the library.

The writers refuse what they cannot express rather than emitting something plausible: a
block-compressed or 16-bit texture stored as a Targa chain, a bottom-up bitmap stored as a
DirectDrawSurface (DDS is top-down unconditionally, and no reader here reorders rows), a mip level
whose buffer does not match the dimensions it would be read back at, a surface count that is neither
one nor six, or a set of cubemap faces whose chains disagree in length.

**openFLAME paletted textures are out of scope.** `readTexture` returns `undefined` on one rather than
throwing. See [RETAIL.md](RETAIL.md#openflame-leftovers) and [the layout below](#openflame-paletted-entries).

---

## Corpus

Retail carries **1,417 libraries holding 6,869 textures**:

| Extension | Libraries |
| --------- | --------- |
| `.3db`    | 717       |
| `.cmp`    | 324       |
| `.dfm`    | 204       |
| `.txm`    | 104       |
| `.mat`    | 67        |
| `.sph`    | 1         |

`.ale`, `.utf` and `.vms` carry none. 1,413 sit at the file root; the remaining four are nested inside
an `openFLAME 3D N-mesh` tree. **No name collision occurs inside any library.**

| Form            | Entries | Reader                |
| --------------- | ------- | --------------------- |
| `MIPS`          | 4,447   | `readMIPS`            |
| `MIP0..n`       | 2,400   | `readMIP`             |
| Animated        | 12      | `readAnimatedTexture` |
| `CUBE`          | 2       | `readCUBE`            |
| `Palette 8 bit` | 8       | — out of scope        |

Four entries carry both a `MIPS` and a `MIP0..n` chain; `MIPS` wins, the Targa chain is never decoded,
and — since writing follows what was read — it is dropped on the way back out.

Which decode into eight pixel formats:

| `TextureType` | Count | Source                 |
| ------------- | ----- | ---------------------- |
| `dxt1`        | 4,230 | `MIPS`                 |
| `rgb24_888`   | 1,789 | 1,787 Targa + 2 `MIPS` |
| `rgba32_8888` | 613   | Targa                  |
| `dxt3`        | 129   | `MIPS`                 |
| `dxt5`        | 42    | `MIPS`                 |
| `rgba16_5551` | 24    | `MIPS`                 |
| `rgb16_565`   | 20    | `MIPS`                 |
| `animated`    | 12    | `Frame rects`          |

### Mip chain depth

Every block-compressed chain in the game stops at exactly 4×4, which is why the naive
`(w >> 2) * (h >> 2)` sizing survives the corpus untouched:

| Levels | Surfaces | Smallest level |
| ------ | -------- | -------------- |
| 7      | 2,770    | 4×4            |
| 6      | 1,290    | 4×4            |
| 5      | 298      | 4×4            |
| 4      | 40       | 4×4            |
| 3      | 2        | 4×4            |
| 1      | 1        | 128×128        |

The single-level outlier is `FX/plasmaring.txm :: plasmaring`, which has no chain to descend.

### Uncompressed pixel formats

Retail authored only three, all of which `getTypeByMask` recognises alongside two it never used
(`rgba16_4444` and `rgba32_8888`):

| Bits | R        | G      | B    | A      | Count | Type          |
| ---- | -------- | ------ | ---- | ------ | ----- | ------------- |
| 16   | 0x7c00   | 0x3e0  | 0x1f | 0x8000 | 24    | `rgba16_5551` |
| 16   | 0xf800   | 0x7e0  | 0x1f | 0      | 20    | `rgb16_565`   |
| 24   | 0xff0000 | 0xff00 | 0xff | 0      | 2     | `rgb24_888`   |

### Targa levels

| Stored           | Levels | Decoded to    |
| ---------------- | ------ | ------------- |
| 8-bit colour map | 11,351 | `rgb24_888`   |
| 32-bit BGRA      | 2,078  | `rgba32_8888` |
| 16-bit BGRA-5551 | 219    | `rgb24_888`   |
| 24-bit BGR       | 140    | `rgb24_888`   |

Every colour map in retail is **256 entries of BGR-888 with 8-bit indices**, so the 16-bit palette
branch is unreachable against the game's own data.

**Nine chains set the top-left origin bit:**

```
FX/animated.txm :: lightningaxm_0_0     INTERFACE/HUD/hud.txm :: backdrop
FX/animated.txm :: sparks1anim_0_0      INTERFACE/HUD/hud.txm :: static
FX/kioncannon.txm :: kionflare_0        SOLAR/BLACKHOLE/blackhole.txm :: bhflash_0
FX/lightning2.txm :: lightning256_0
FX/missleeffect.txm :: impact_0
FX/standardeffects.txm :: XP_HERM_0
```

Six Targas carry a 26-byte v2 footer (`SOLAR/RINGS/rings.txm :: ringdetail` and friends).

### Animated textures

Twelve entries, at 3, 10, 15 and 30 FPS, splitting evenly between two authoring styles:

| Style               | Count | Layout                                                        |
| ------------------- | ----- | ------------------------------------------------------------- |
| One atlas, tiled    | 7     | A single atlas cut into a grid — 4×4 for 16 frames, 2×2 for 4 |
| One atlas per frame | 5     | `Texture count` atlases, each rect the full surface `0,0→1,1` |

The seven tiled animations are the interesting ones: their rectangles run **V downward**
(`v1: 1 → v2: 0.75` for the first frame of a 4×4 grid), and their atlases are precisely seven of the
nine Targas that set the top-left origin bit. Rects authored V-up against a bitmap stored top-down is
what you would expect if the descriptor bit is meaningful — suggestive on the open question below,
though not on its own conclusive.

`Texture count` is exactly the highest frame index plus one in all twelve.

### Cubemaps

Two entries — `FX/envmapbasic.mat` and `FX/envmapglass.txm` — each store a 64×64 A8R8G8B8 surface with
a single level and `DDSCAPS2_CUBEMAP` plus all six face bits, 98,432 bytes of `128 + 6 × 64 × 64 × 4`.
Nothing else in the corpus carries the file, and neither of the two also carries a `MIPS`.

### DXT1 punch-through

Scanning every block across the corpus finds **4,389 punch-through blocks out of 16.5 million**, in
ten textures, and **none** of the 4,230 DXT1 textures sets `DDPF_ALPHAPIXELS`:

```
BASES/LIBERTY/li_resort_deck.cmp :: tree_64.tga021121174811tree_64.tga
BASES/LIBERTY/li_resort_waterscape.cmp :: tree_64.tga021121174646tree_64.tga
SHIPS/BRETONIA/br_capships.mat :: space_tank02dmg.tgaspace_tank02dmg_op.tga
SHIPS/UTILITY/utility_liner.mat :: space_tank02dmg.tgaspace_tank02dmg_op.tga
SOLAR/ast_loot.mat :: loot_artifact.tgaloot_artifact_alpha.tga
SOLAR/solar_mat_dockable02.mat :: small_station_lod_a.tga
SOLAR/solar_mat_dockable02.mat :: small_station_lod_b.tga
SOLAR/solar_mat_space_dmg.mat :: space_tank02dmg.tgaspace_tank02dmg_op.tga
SOLAR/solar_mat_tink.mat :: x_pnl_a.tga
SOLAR/solar_mat_tlr.mat :: x_pnl_a.tga
```

Of 7,533 materials, 904 carry the `Oc`/`Ot` opacity tokens:

```
DcDtOcOt 631   DcDtEcOcOt 168   DcDtEcOcOtTwo 55   DcDtOcOtTwo 35   DcDtBtOcOtTwo 12   DcDtBtOcOt 3
```

### Round-trip

All **4,447 DirectDrawSurfaces**, **both cubemaps** and all **12 animated textures** write back byte
for byte. Of the 2,400 Targa chains, **629 come back byte for byte**; the rest cannot, for reasons that
are enumerated rather than assumed — the corpus test requires every difference to have one:

| Reason         | Chains | Why                                                                                                                 |
| -------------- | ------ | ------------------------------------------------------------------------------------------------------------------- |
| Colour map     | 1,668  | The palette is not carried on `TargaPixels`; re-quantizing 16.7M colours down to 256 is a lossy guess this library does not make |
| 16-bit         | 102    | Expanded to 24-bit on read, and the expansion does not invert                                                       |
| Attribute bits | 1      | `SOLAR/RINGS/rings.txm :: ringdetail`, the one chain declaring its 8 alpha bits (and the one carrying a v2 footer)  |

Those files come back **larger, with the same pixels** — a colour-mapped 256×256 level becomes a
24-bit one. **Writing is a fixed point everywhere**: what the writer emits reads back as the same
texture, level bytes included, and writes again to identical bytes. Without that, the lossy cases would
drift on every save.

### openFLAME paletted entries

The four `EQUIPMENT/MODELS/HARDWARE/no_*.3db` files hold a nested texture library of eight paletted
entries:

```
<name> (UTF directory)
  ├─ Image X size (int32)
  ├─ Image Y size (int32)
  └─ Palette 8 bit
       ├─ MIP0 … MIPn (UTF directory per level, down to 1×1)
       │    ├─ Image indices (uint8 per pixel)
       │    └─ Alpha 8 bit (uint8 per pixel, when the entry has an opacity source)
       └─ Palette RGB 888 (768 bytes, 256 colours)
```

`SOLAR/BLACKHOLE/bh_flute4.pte` nests the palette the other way round — one `Palette 8 bit` under
**each** `MIP0..n` — and adds `U wrap mode` / `V wrap mode`, so neither reader can assume the other.
Freelancer cannot load either, so neither will this library.

---

## TODO

### Does Freelancer honour the Targa origin bit?

Nine retail Targa chains set bit 5 of the image descriptor, selecting a top-left origin against
Targa's bottom-left default. The reader reports it through `Texture.flip` rather than reordering rows,
so a consumer that finds out either way needs no decode change — but which way is right is unresolved,
and the nine are conspicuous: HUD backdrops, lightning, flares, an explosion impact.

They are their own test. If Freelancer honours the bit, those nine appear the same way up as everything
else; if it ignores the bit and always reads bottom-up, they appear flipped in game, and being sprites
and flares is exactly why nobody would have noticed while authoring them. Compare one against its own
pixels — `INTERFACE/HUD/hud.txm :: backdrop` has an unambiguous up.

Clearing the bit on a chain and reading the pixels back the other way is the confirming edit, but the
observation alone settles it.

### `DDSCAPS_ALPHA` on a cubemap

`writeDirectDrawSurface` emits it for a cubemap whose pixel format carries an alpha mask, mirroring
`DDPF_ALPHAPIXELS`. Both retail cubemaps are A8R8G8B8, so *"when the format has alpha"* and *"always,
on a cubemap"* fit the two files equally, and the flat surfaces settle nothing — the `rgba16_5551` ones
carry an alpha mask and set no such bit.

Retail has no opaque cubemap and no cubemap with more than one level per face, so both generalizations
are unattested. Writing a DXT1 or `rgb16_565` cube into `FX/envmapbasic.mat` and seeing whether the
game loads it, renders it, or refuses is the only way to learn which rule its loader applies — and the
same edit with a full mip chain per face tests the second.
