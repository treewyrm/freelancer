# Texture

A texture library is a UTF directory named `Texture library` holding one subdirectory per texture.
Libraries appear as standalone `.txm` files, alongside materials in `.mat` files, and embedded in
models — `.3db`, `.cmp`, `.dfm` and one `.sph`.

## Layout

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

Which image form an entry uses is not a function of its pixel format — retail authored `rgb24_888`
both ways. `TextureStorage` (`dds`, `targa` or `cube`) carries it, so `writeTexture` puts a texture
back in the form it came from.

The directory name is spelled three ways, so every lookup goes through `getResourceId`. Entry names
are matched by CRC, so a collision inside one library makes a texture unreachable.

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

The masks are read unsigned. An `0xff000000` alpha mask read as a signed int32 comes back negative
and matches no known format. Retail has no 32-bit uncompressed surface, so only synthetic content
exposes it.

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

`DDSD_CAPS` is left clear, as in every retail flat surface despite `dwCaps` being populated, and
`DDSD_MIPMAPCOUNT` is set on single-level surfaces too. Both match the game's own writer.
[Cubemaps](#cubemaps) reverse the first and drop the second.

Levels are checked against the dimensions they will be read back at before anything is written — the
header records only the base size, so a chain that does not halve from it would be walked at the
wrong offsets.

### Mip chain sizing

Block-compressed levels are padded up to whole 4×4 blocks, so a 2×2 or 1×1 level still occupies one
block:

```
Math.max(1, (w + 3) >> 2) * Math.max(1, (h + 3) >> 2) * (DXT1 ? 8 : 16)
```

The obvious `(w >> 2) * (h >> 2)` yields zero bytes below 4×4. Uncompressed chains do run to 1×1,
where `w * h * bitCount >> 3` is still correct.

## `MIP0..n` — Targa mip chains

`MIP0`, `MIP1`, … each hold a complete uncompressed `.tga`, one per mip level, largest first. Only
two of the seven Targa image types occur: colour-mapped (1) and RGB (2); RLE variants are rejected.

Targa stores colour BGR-first, so 24- and 32-bit images are channel-swapped on read and 16-bit
images are expanded to 24-bit RGB. A texture's `depth` is therefore never 16 by the time it leaves
the reader. Colour maps are normalised to RGB order once, up front, so expanding the index map is a
straight copy.

Trailing bytes past the pixel data — the 26-byte v2 footer six retail Targas carry — are ignored.

The origin and bit depth are identical across every level of every retail chain, so `readMIP` throws
rather than guessing when levels disagree.

### Vertical origin

Bit 5 of the image descriptor selects a top-left origin; Targa's default is bottom-left. The reader
**reports** the origin through `Texture.flip` rather than reordering rows, matching `readMIPS`, which
reports `flip: true` unconditionally because DDS always stores the top row first.

Freelancer reorders nothing, and a consumer reproducing it should not either. See [Why nothing is
reordered](#why-nothing-is-reordered). The nine chains that set the bit are the open case — see
[TODO](#todo).

### Writing a chain back

`writeTargaImage` only writes the uncompressed RGB image type, with an empty identification field, an
origin of 0,0 and no attribute bits — what retail stores, minus one image. Level dimensions are
derived by halving, since `readMIP` keeps only the base size. Lossy cases in
[Corpus](#round-trip).

## Animated textures

Some textures animate by stepping through sibling atlas entries rather than storing frames
themselves. The entry holds no pixels.

| File            | Type     | Meaning                                            |
| --------------- | -------- | -------------------------------------------------- |
| `Texture count` | int32    | Number of atlases; always max frame index + 1      |
| `Frame count`   | int32    | Number of records in `Frame rects`                 |
| `FPS`           | float32  | Frame rate                                         |
| `Frame rects`   | struct[] | 20 bytes each: int32 atlas index, then u1 v1 u2 v2 |

Each frame names an atlas by index, resolved against a sibling entry called `<name>_<index>` — so
`Pylon.avi` frame 3 samples the `Pylon.avi_3` entry — and a UV rectangle within it.

`Texture count` is not modelled, since it is implied by the frame indices. `writeAnimatedTexture`
derives it on the way out, which leaves `AnimatedTexture` with no field that could disagree with its
own frames.

## Cubemaps

A `CUBE` file is one ordinary DirectDrawSurface whose payload is six whole mip chains back to back,
in the order the face bits are numbered: +X, −X, +Y, −Y, +Z, −Z. One header describes all of them, so
every face shares the dimensions, pixel format and level count. `readDirectDrawSurface` returns them
as `surfaces`, one chain per face — a plain texture has one, a cubemap six — and a partial cubemap is
refused rather than read at offsets its missing faces would have shifted.

`CubeTexture` is a separate interface from `Texture` rather than a flag on it, discriminated by
`storage: 'cube'`, so uploading a cubemap as a 2D texture is a type error instead of a silently wrong
render.

The cubemap header is not the one `writeMIPS` emits. The two forms disagree on four fields, and each
follows the retail files it has:

| Field                 | `MIPS`                       | `CUBE`                                     |
| --------------------- | ---------------------------- | ------------------------------------------ |
| `DDSD_CAPS`           | clear                        | **set**                                    |
| `DDSD_MIPMAPCOUNT`    | set, even for a single level | **absent**, `dwMipMapCount` zero           |
| `dwPitchOrLinearSize` | one row, or the top level    | **zero**, with neither pitch flag          |
| `dwCaps`              | `DDSCAPS_TEXTURE`            | plus `DDSCAPS_COMPLEX` and `DDSCAPS_ALPHA` |

None of that is a rule the format imposes; it is what the two tools that wrote this data did.

## Transparency belongs to the material, not the texture

`Texture` carries no `alpha` flag. Whether a texture is drawn blended is decided by the material that
binds it, through the `Oc` and `Ot` tokens in its `Type` string. A DXT1 texture bound to a plain
`DcDt` material is opaque whatever its blocks contain, and nothing consults the texture's own format
to decide.

## There is no `dxt1a`

DXT1's transparency mode is selected per block, by the endpoint ordering inside the block:
`color0 > color1` gives four interpolated opaque colours, `color0 <= color1` gives three colours plus
a transparent index 3. It is not a property of the image, and nothing in the container records it.

Detecting it means scanning every block, and testing the endpoints alone over-reports — a flat block
encoded as `color0 === color1` also enters 3-colour mode without ever referencing index 3.

Uploading everything as `COMPRESSED_RGBA_S3TC_DXT1_EXT` is correct for both modes: opaque blocks
yield alpha 1 there anyway, whereas the `RGB` variant renders punch-through texels as opaque black.
Because 1-bit alpha is a cutout rather than a blend, it needs no back-to-front draw ordering.

## Entry naming

Many entries concatenate the filenames of the two source images the artist combined — a colour map
and a separate opacity map:

```
debris_field.tgadebris_field_alpha.tga
space_tank02dmg.tgaspace_tank02dmg_op.tga
tree_64.tga021121174811tree_64.tga
```

The embedded digits are an export timestamp in `YYMMDDHHMMSS` form — `021121174811` is 2002-11-21
17:48:11. Names are opaque identifiers matched by CRC; none of this is parsed.

## Refusals

`readTextures` collects per-entry failures and throws a single `AggregateError` at the end, so one
malformed texture does not hide the rest of the library.

The writers refuse what they cannot express: a block-compressed or 16-bit texture stored as a Targa
chain, a bottom-up bitmap stored as a DirectDrawSurface (DDS is top-down unconditionally), a mip
level whose buffer does not match the dimensions it would be read back at, a surface count that is
neither one nor six, or a set of cubemap faces whose chains disagree in length.

openFLAME paletted textures are out of scope. `readTexture` returns `undefined` on one rather than
throwing. See [RETAIL.md](../refs/RETAIL.md#openflame-leftovers) and
[the layout below](#openflame-paletted-entries).

## Notes

### Why nothing is reordered

The declared origin is not the authored one.
`BASES/LIBERTY/li_01_manhattan_cityscape.cmp :: banner2manh.tga` is a DDS, so `flip: true` by
specification, and its lettering — *Weather*, *SODA*, *Avalon* — reads only once the rows are
reversed. The bottom-left Targas store the picture the same way round;
`INTERFACE/BASESIDE/news_vendor.3db :: UI_CITY_news.tga` spells `NEWS` reversed in file order too.

Both containers hold the picture bottom row first, the UVs beside them are 3ds Max's with zero at the
image bottom, and the two cancel: rows in file order sampled by the file's own V come out the right
way up.

Librelancer reached the same conclusion against the running game: its Targa reader carries the
row-reversal written out and commented out, under *"Technically we should flip these, but Freelancer
does not / Leave unflipped"* (`ImageLib/TGA.cs:186`); its DDS reader has no flip either, and no
shader in the tree flips `v`.

Reporting rather than transforming is what lets a consumer act on the nine outliers without a decode
change.

## API

### `./texture`

| Export                   | Kind      |                                                                                    |
| ------------------------ | --------- | ---------------------------------------------------------------------------------- |
| `AnimatedTexture`        | interface | A frame list indexing sibling atlases named `<name>_N`.                            |
| `AnimatedTextureFrame`   | interface | One frame: which atlas, and the rectangle within it.                               |
| `Compression`            | enum      | DDS `dwFourCC` compression, `dxt1`/`dxt3`/`dxt5` or none.                          |
| `CubeFaces`              | type      | The six faces of a cubemap, in the order DirectDraw stores them.                   |
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

## Corpus

Retail carries 1,417 libraries holding 6,869 textures:

| Extension | Libraries |
| --------- | --------- |
| `.3db`    | 717       |
| `.cmp`    | 324       |
| `.dfm`    | 204       |
| `.txm`    | 104       |
| `.mat`    | 67        |
| `.sph`    | 1         |

`.ale`, `.utf` and `.vms` carry none. 1,413 sit at the file root; the remaining four are nested
inside an `openFLAME 3D N-mesh` tree. No name collision occurs inside any library.

| Form            | Entries | Reader                |
| --------------- | ------- | --------------------- |
| `MIPS`          | 4,447   | `readMIPS`            |
| `MIP0..n`       | 2,400   | `readMIP`             |
| Animated        | 12      | `readAnimatedTexture` |
| `CUBE`          | 2       | `readCUBE`            |
| `Palette 8 bit` | 8       | — out of scope        |

Four entries carry both a `MIPS` and a `MIP0..n` chain; `MIPS` wins, the Targa chain is never
decoded, and — since writing follows what was read — it is dropped on the way back out.

Eight pixel formats:

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

The single-level outlier is `FX/plasmaring.txm :: plasmaring`.

### Uncompressed pixel formats

Retail authored only three, all recognised by `getTypeByMask` alongside two it never used
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

Every colour map in retail is 256 entries of BGR-888 with 8-bit indices, so the 16-bit palette branch
is unreachable against the game's own data.

Nine chains set the top-left origin bit:

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

The seven tiled animations run V downward (`v1: 1 → v2: 0.75` for the first frame of a 4×4 grid),
and their atlases are precisely seven of the nine Targas that set the top-left origin bit. A rect
with zero at the image bottom over a bitmap stored bottom row first puts frame 0 at the top left.
Honour the bit and frame 0 lands at the bottom instead, so the animation runs its rows backwards.

`Texture count` is exactly the highest frame index plus one in all twelve.

### Cubemaps

Two entries — `FX/envmapbasic.mat` and `FX/envmapglass.txm` — each store a 64×64 A8R8G8B8 surface
with a single level and `DDSCAPS2_CUBEMAP` plus all six face bits, 98,432 bytes of
`128 + 6 × 64 × 64 × 4`. Neither also carries a `MIPS`.

### DXT1 punch-through

Scanning every block across the corpus finds 4,389 punch-through blocks out of 16.5 million, in ten
textures, and none of the 4,230 DXT1 textures sets `DDPF_ALPHAPIXELS`:

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

All 4,447 DirectDrawSurfaces, both cubemaps and all 12 animated textures write back byte for byte. Of
the 2,400 Targa chains, 629 come back byte for byte; the rest cannot, for reasons the corpus test
requires every difference to have:

| Reason         | Chains | Why                                                                                                                 |
| -------------- | ------ | ------------------------------------------------------------------------------------------------------------------- |
| Colour map     | 1,668  | The palette is not carried on `TargaPixels`; re-quantizing 16.7M colours down to 256 is a lossy guess this library does not make |
| 16-bit         | 102    | Expanded to 24-bit on read, and the expansion does not invert                                                       |
| Attribute bits | 1      | `SOLAR/RINGS/rings.txm :: ringdetail`, the one chain declaring its 8 alpha bits (and the one carrying a v2 footer)  |

Those files come back larger, with the same pixels — a colour-mapped 256×256 level becomes a 24-bit
one. Writing is a fixed point everywhere: what the writer emits reads back as the same texture, level
bytes included, and writes again to identical bytes.

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
each `MIP0..n` — and adds `U wrap mode` / `V wrap mode`, so neither reader can assume the other.
Freelancer cannot load either, so neither will this library.

## TODO

### Do the nine top-left Targa chains render mirrored?

The general question is closed: retail stores the picture bottom row first in both containers, the
game reorders neither, and the UVs cancel it — see [Vertical origin](#vertical-origin). What remains
is the nine chains listed under [Targa levels](#targa-levels) that set bit 5, whose rows run the
other way to everything else.

A loader that reorders nothing draws those nine vertically mirrored against how they were authored;
being sprites, flares and a near-symmetric HUD plate is why nobody would notice. Either the game
mirrors them and always did, or its loader carries a case for the bit that the other 2,391 chains
never exercise. Six of the nine are effect atlases, so the frame order is the tell.

*Experiment*: observe those nine in game. Clearing the bit on a chain and reading the pixels back the
other way is the confirming edit.

### `DDSCAPS_ALPHA` on a cubemap

`writeDirectDrawSurface` emits it for a cubemap whose pixel format carries an alpha mask, mirroring
`DDPF_ALPHAPIXELS`. Both retail cubemaps are A8R8G8B8, so *"when the format has alpha"* and *"always,
on a cubemap"* fit the two files equally, and the flat surfaces settle nothing — the `rgba16_5551`
ones carry an alpha mask and set no such bit.

Retail has no opaque cubemap and no cubemap with more than one level per face, so both
generalizations are unattested. *Experiment*: write a DXT1 or `rgb16_565` cube into
`FX/envmapbasic.mat` and see whether the game loads it, renders it, or refuses; the same edit with a
full mip chain per face tests the second.
