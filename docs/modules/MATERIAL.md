# Material

A material library is a UTF directory named `Material library` holding one subdirectory per
material, plus a `Material count` file. Libraries appear as standalone `.mat` files and embedded in
models — `.3db`, `.cmp`, `.dfm` and one `.sph`. Starspheres, cutscene props and deformable models
cannot reference an external `.mat` and must embed.

## Layout

```
Material library (UTF directory)
  ├─ Material count (UTF file) ─── int32, the number of material directories beside it
  │
  └─ <material name> (UTF directory per material)
       │
       ├─ Type ────────────────── the shader to render with
       ├─ Dc, Ec, Ac, Sc ──────── float[3] colours
       ├─ Oc, Sp, Alpha, … ────── float scalars
       ├─ Dt_name, Dt_flags ───── a texture slot: a name into the texture library, and how to
       ├─ Et_name, Et_flags ───── address it
       ├─ Bt_name, Bt_flags
       └─ …
```

A material holds nothing but files — no retail material has a subdirectory. The directory name is
spelled several ways, so every lookup goes through `getResourceId`.

Materials are referenced by CRC from mesh groups, so a name collision inside one library makes a
material unreachable.

`Material count` is derived on write rather than carried.

## Types

`Type` names a class in `shading.dll` or `flmaterials.dll`, and that is all it selects. The four
`DcDt*` names (`DcDt`, `DcDtEc`, `DcDtOcOt`, `DcDtEcOcOt`) bind one factory (`0x6ed27d0`), the four
`*Two` names another (`0x6ed27e0`), and nothing downstream reads the spelling. Its tokens are `Dc`
diffuse colour, `Dt` diffuse texture, `Ec` emission colour, `Et` emission texture, `Bt` detail texture,
`OcOt` opacity and `Two` two-sided. They name properties, and predict neither which property files
are present nor what the class does with them.

`Material` therefore models properties as independently optional — a property that was absent stays
absent rather than being defaulted on the way out. Measurement in
[Corpus](#type-does-not-determine-the-property-set).

There is no `Ot_name`: opacity comes from the alpha channel of the diffuse texture.

`MATERIAL_TYPES` lists the types retail authors; `MAPPED_MATERIAL_TYPES` lists more the engine knows
that no shipped asset selects — `NomadMaterial`, `GlassMaterial`, `HUDIconMaterial`, `NullMaterial`
and the rest. Those reach a mesh through `[MaterialMap]` in `EXE/dacom.ini` — plain text, not BINI —
which rewrites a material's type when its name matches a pattern:

```ini
[MaterialMap]            ; evaluation of material map happens in reverse order listed
                         ; so put more specific last
EcEtOcOt= DcDtOcOt
DcDtEcEt= DcDtEt
name = ^detailmap_.* = BtDetailMapMaterial
name = ^tlr_material$ = NebulaTwo
;name = ^nomad.*$ = NomadMaterial ---> this must be commented out
name = ^nomad.*$ = NomadMaterialNoBendy
name = ^ui_.* = HUDIconMaterial
Name = ^planet.*_glass$ = GFGlassMaterial
Name = ^anim_hud.*$ = HUDAnimMaterial
```

A nomad hull is authored as plain `DcDtBtOcOtTwo` and becomes `NomadMaterialNoBendy` at load time.
The two nomad names draw identically: the second clock `NomadMaterial` advances (`flmaterials.dll`
`0x66f88bd`) is read by nothing. Resolving that table is out of scope. `Material.type` is a plain
string because `[MaterialMap]` can name a shader neither list carries.

A type no DLL registers draws nothing. `DcDtEtTwo` and every `DcDtBt*` spelling are authored in retail
and registered nowhere. `DcDtEtTwo` does sit in `shading.dll` as a string (`0x6ed179c`), but nothing
references it. The material library logs *Unable to create material* (`0x6ecc47e`) and has no
fallback class. `[MaterialMap]` rescues 443 of the 445 materials so typed: 430 through
`^detailmap_.*` and 13 through `^nomad.*$`.

The name has one other consequence. `[BatchedMaterials] Type = .*OcOt`, in the same `dacom.ini`,
wraps a matching type in `BatchedMaterial` (`0x6ec9b8b`). It tests the type after `[MaterialMap]`
(`0x6ec9b46`, then `0x6ec9b73`), using `shading.dll`'s own regular expressions (`0x6ecfae0`,
`0x6ed0540`), which search rather than anchor. The name rules see the material's name lowercased
(`_strlwr`, `0x6ec9afa`), which is how `Nomad surface` meets `^nomad.*$`.

## Properties

| File                       | `Material`                 | Payload        |
| -------------------------- | -------------------------- | -------------- |
| `Type`                     | `type`                     | string         |
| `Dt_name` / `Dt_flags`     | `diffuseTexture`           | string/u32     |
| `Dc`                       | `diffuse`                  | float[3]       |
| `Ec`                       | `emission`                 | float[3]       |
| `Et_name` / `Et_flags`     | `emissionTexture`          | string/u32     |
| `Bt_name` / `Bt_flags`     | `detailTexture`            | string/u32     |
| `Oc`                       | `opacity`                  | float          |
| `Ac`                       | `ambient`                  | float[3]       |
| `flip u` / `flip v`        | `flipU` / `flipV`          | u32 as bool    |
| `Dm_name` / `Dm_flags`     | `maskTexture`              | string/u32     |
| `Dm0_name` / `Dm0_flags`   | `maskTexture0`             | string/u32     |
| `Dm1_name` / `Dm1_flags`   | `maskTexture1`             | string/u32     |
| `TileRate`                 | `tileRate`                 | float          |
| `TileRate0` / `TileRate1`  | `tileRate0` / `tileRate1`  | float          |
| `Alpha` / `Fade` / `Scale` | `alpha` / `fade` / `scale` | float          |
| `Sc` / `Sp`                | `specular` / `power`       | float[3]/float |
| `Nt_name` / `Nt_flags`     | `nomadTexture`             | string/u32     |

Those 25 names are the whole set, pinned by a corpus case. `Sc`, `Sp` and the nomad slot are
modelled from the documented property list and are never authored.

`TileRate` is not bound to `Dm` — `DetailMap2Dm1Msk2PassMaterial` materials pair a plain `TileRate`
with `Dm1`, so the rates are carried flat rather than folded into the slots they scale.

### What the engine does with them

The six colour properties are a Direct3D 8 `D3DMATERIAL8` verbatim: `Dc` Diffuse, `Oc` its alpha,
`Ac` Ambient, `Sc` Specular, `Ec` Emissive and `Sp` Power (map at `0x6ebd770`). They go to
`SetMaterial` untouched, so `Ec` is emission inside the lit colour, before any texture multiplies it.
Several readings are not what the names suggest:

- **`Dc` overwrites `Ac`.** The parameter setter copies Diffuse into Ambient whenever the key is `Dc`
  (`0x6eb2439`; the planet copy is at `0x6eb6cb9`). Parameters load `Ac` first, so an authored `Ac`
  survives only on a material with no `Dc`.
- **`flip u` and `flip v` are never read.** `DetailMapMaterial` loads them and clamps them to 0 or 1
  (`0x6eb6e08`), and no code touches the fields again. No other retail binary holds the string.
- **`TileRate` is a texture matrix.** The mask stage samples UV0 through `diag(TileRate, TileRate)`
  (`0x6eb8354`). `TileRate0` and `TileRate1` do the same for `Dm0` and `Dm1`.
- **A class reads only what it declares.** `DcDtEt` declares `Dc`, `Dt` and `Et` (`0x6eb60b0`), so its
  `Ec` is never loaded. `Nebula` declares only `Dt` (`0x6ebc5a0`). The nomad hull loads `Dc` and never
  reads it (`0x66f87a0`).
- **Glass floors `Oc` at 0.8** (`flmaterials.dll` `0x670402c`). Of the nine retail glass materials,
  seven carry 0.79999995 and two 0.39999998, and all nine draw at 0.8.
- **The atmosphere's scalars drive a texture lookup, not an opacity.** `AtmosphereMaterial` scales its
  mesh by `Scale` and writes every vertex's UV on the CPU each frame (`0x6eb3082`–`0x6eb31f3`).
  `Fade` scales `u`, which runs from the shell's horizon to the point facing the camera, and `Alpha`
  picks the row, `v = 1 − Alpha`. See [RENDERER § 6](../refs/RENDERER.md#6-materials).

Texture names look like filenames but are not paths — the extension is part of the name and is often
stale, `.tga` on a DirectDrawSurface. Roughly 800 carry a packer timestamp (`.tga021124183652`), and
five name an `.avi` no texture library holds.

## Defaults

A material need not carry a property for the shader to read one. The engine's property tables run
`<label>, <file name>[, <default>]`, and across all three material DLLs — `flmaterials.dll`,
`shading.dll`, `deformable2.dll` — exactly one property carries that third string:

```
flmaterials.dll @ 0x1223c
  "NomadTexture Name\0"  "nt_name\0"  "NomadRGB1_NomadAlpha1\0"  "Diffuse V Address Mode\0"
```

`DEFAULT_NOMAD_TEXTURE_NAME` exports it. It resolves to a real texture — `SHIPS/NOMAD/nomad_fx.txm`
holds one entry of that name, the only place in the game data it appears. No retail material carries
an `Nt_name`, so the default is the entire mechanism by which a nomad hull gets its texture.

`readMaterial` does not apply it — see [Defaults belong at the point of
use](#defaults-belong-at-the-point-of-use).

## Texture flags

Every `*_flags` file is a `uint32` packing three fields, not a flat bitfield. The engine's property
tables name them, one triple per texture slot; `shading.dll` carries

```
Diffuse Texture Wrap Mode / Diffuse Texture U Address Mode / Diffuse Texture V Address Mode
```

against the single `Dt_flags` file, and repeats the same triple for `Et`, `Bt`, `Dm`, `Dm0` and
`Dm1`; `flmaterials.dll` repeats it once more for `nt_flags`.

`shading.dll` splits the word three ways at load (`0x6eb1512`, `0x6eb1630`):

| Bits | Field                   | Used as                                                    |
| ---- | ----------------------- | ---------------------------------------------------------- |
| 0–1  | U address               | `D3DTSS_ADDRESSU = value + 1`: wrap, mirror, clamp, border |
| 2–3  | V address               | `D3DTSS_ADDRESSV`, the same                                |
| 4–7  | the table's *wrap mode* | `D3DTSS_TEXCOORDINDEX = field ≥ 4 ? field − 4 : 0`         |

So `0x40` samples UV0 and `0x50` samples UV1. Bit 6 is the field's base rather than a flag, which is
why every retail word sets it. Bits 0 and 1 together are border, not mirror and clamp at once. A slot
with no flags file takes field 4, UV0.

`TextureReference.flags` is the word as read, a plain `number`. Each field is a mask and shift pair
with an accessor: `ADDRESS_U_MASK` and `ADDRESS_V_MASK` hold a `TextureAddress` (`Wrap`, `Mirror`,
`Clamp`, `Border`) reached through `getAddress` and `setAddress`, and `MAP_INDEX_MASK` holds the UV
map field, which `getMapIndex` resolves the way the device is told it and `setMapIndex` writes 4
above the index.

No bit correlates with the texture it points at. Every combination of storage and pixel format shows
up under the same word, and the clamped and unclamped sets overlap completely: the word describes
the sampler, not the image.

## Draw order

A model using both opaque and transparent materials should be a multi-part compound, with mesh
groups bound to a transparent material kept in parts separate from the opaque ones — cockpit glass
in its own part, not merged into the hull. A constraint on how assets are built, not something this
module enforces.

`Freelancer.exe` sorts each of its object lists back to front by squared centre distance, opaque
lists included (`0x51eda0`). No material class turns depth writes off for an ordinary blended draw;
only four do it in their own draw: `PlanetWaterMaterial`, the nomad hull, `AtmosphereMaterial`, and
pass B of `IllumDetailMapMaterial` (`0x6eba122`). A `*OcOt` type is wrapped in `BatchedMaterial`,
whose order is stored as −1 (`0x6ec8b49`), so its draw submits at once rather than through the
batcher (`0x6ec9589`).

## Notes

### Defaults belong at the point of use

Filling the nomad texture default in on read would write an `Nt_name` file into materials that never
had one — a change to what the shader reads, and the end of the byte-exact round trip. At the point
of use, a missing slot means "the default" rather than "no texture".

Numeric defaults are float immediates rather than strings, so a string scan cannot see them; they
are read from the constructors instead. The single-pass class zeroes its `D3DMATERIAL8` and sets
`Dc`, `Oc` and `Ac` to 1 (`0x6ebd352`–`0x6ebd379`). An absent `Ec`, `Sc` or `Sp` is therefore 0, and an
absent `Dc`, `Ac` or `Oc` is white and opaque. A slot with no `_flags` file takes UV map field 4,
UV0.

## API

### `./material`

| Export                    | Kind      |                                                                            |
| ------------------------- | --------- | -------------------------------------------------------------------------- |
| `ADDRESS_U_MASK`          | const     | The U address field of a slot's flag word, bits 0–1, `0x3`.                |
| `ADDRESS_U_SHIFT`         | const     | Shift of that field, 0.                                                    |
| `ADDRESS_V_MASK`          | const     | The V address field of a slot's flag word, bits 2–3, `0xc`.                |
| `ADDRESS_V_SHIFT`         | const     | Shift of that field, 2.                                                    |
| `DEFAULT_NOMAD_TEXTURE_NAME` | const  | Default `Nt_name`, compiled into `EXE/flmaterials.dll`.                    |
| `getAddress`              | function  | `(flags, axis): TextureAddress` — how a slot addresses one axis.           |
| `getMapIndex`             | function  | `(flags): number` — the UV map a slot samples, as the device is told it.   |
| `getMaterial`             | function  | Finds a material by name or resource CRC, the way a mesh's reference does. |
| `KnownMaterialType`       | type      | A type `MATERIAL_TYPES` or `MAPPED_MATERIAL_TYPES` names.                  |
| `MAP_INDEX_MASK`          | const     | The UV map field of a slot's flag word, bits 4–7, `0xf0`.                  |
| `MAP_INDEX_SHIFT`         | const     | Shift of that field, 4.                                                    |
| `MAPPED_MATERIAL_TYPES`   | const     | Shader names the engine knows that no shipped asset selects.               |
| `Material`                | interface | One entry of a `Material library`.                                         |
| `MATERIAL_TYPES`          | const     | Material types attested in retail assets, most common first.               |
| `MaterialLibrary`         | type      | `Material[]` — the materials of a `Material library`, in directory order.  |
| `MaterialType`            | type      | Material type. Any string is valid — `[MaterialMap]` can name others.      |
| `readMaterial`            | function  | Reads one material from its directory.                                     |
| `readMaterialLibrary`     | function  | `(parent: Directory): MaterialLibrary` — empty when there is no library.   |
| `setAddress`              | function  | `(flags, axis, address): number` — sets one axis, leaving the rest.        |
| `setMapIndex`             | function  | `(flags, index): number` — sets the UV map, leaving the address bits.      |
| `TextureAddress`          | enum      | How a sampler addresses one axis past the texture's edge.                  |
| `TextureAxis`             | type      | `'u' \| 'v'` — the axis `getAddress` and `setAddress` reach.               |
| `TextureReference`        | interface | A texture slot: the name looked up, and how it is addressed.               |
| `writeMaterial`           | function  | Writes one material as a directory of property files.                      |
| `writeMaterialLibrary`    | function  | Writes a `Material library` directory.                                     |

## Corpus

Retail carries 1,429 libraries holding 7,525 materials:

| Extension | Libraries |
| --------- | --------- |
| `.3db`    | 788       |
| `.cmp`    | 330       |
| `.dfm`    | 204       |
| `.mat`    | 106       |
| `.sph`    | 1         |

`.txm`, `.ale`, `.utf` and `.vms` carry none. One of the 107 `.mat` files, `FX/envmapbasic.mat`,
ships a `Texture Library` holding a cubemap and no materials at all.

The directory is spelled three ways — `Material library` ×1,362, `material library` ×66,
`Material Library` ×1. All 1,429 sit at the file root; four assets hold a second library nested
inside an `openFLAME 3D N-mesh` tree, out of scope ([RETAIL.md](../refs/RETAIL.md#openflame-leftovers)). No
name collision occurs inside any library.

### `Type` does not determine the property set

| Type                            | Count | Distinct property sets |
| ------------------------------- | ----- | ---------------------- |
| `DcDt`                          | 4,308 | 4                      |
| `DcDtEc`                        | 967   | 3                      |
| `DcDtOcOt`                      | 631   | 6                      |
| `DcDtEt`                        | 395   | 2                      |
| `DcDtBt`                        | 248   | 2                      |
| `Nebula`                        | 182   | 3                      |
| `DcDtBtEc`                      | 178   | 2                      |
| `DcDtEcOcOt`                    | 168   | 5                      |
| `DcDtTwo`                       | 128   | 3                      |
| `DcDtEcOcOtTwo`                 | 55    | 4                      |
| `DcDtEcEt`                      | 54    | 1                      |
| `AtmosphereMaterial`            | 39    | 1                      |
| `DetailMapMaterial`             | 39    | 1                      |
| `Masked2DetailMapMaterial`      | 36    | 1                      |
| `DcDtOcOtTwo`                   | 35    | 4                      |
| `DetailMap2Dm1Msk2PassMaterial` | 25    | 1                      |
| `DcDtBtOcOtTwo`                 | 12    | 2                      |
| `DcDtEcTwo`                     | 11    | 1                      |
| `IllumDetailMapMaterial`        | 7     | 1                      |
| `DcDtBtOcOt`                    | 3     | 2                      |
| `DcDtBtEcEt`                    | 2     | 1                      |
| `DcDtBtTwo`                     | 1     | 1                      |
| `DcDtEtTwo`                     | 1     | 1                      |

245 `DcDt` materials carry a `Dc` and no texture at all. `DcDtOcOt` occurs in six different property
sets, four of which have no `Oc`. One lone `DcDt` carries an `Ec`, and its class reads it: `DcDt` and
`DcDtEc` bind the same factory (`0x6ed27d0`). The `Ec` that 58 `Nebula` materials carry is never
loaded, because `Nebula` declares only `Dt` (`0x6ebc5a0`).

Circulated type tables disagree with the shipped data in both directions: `DcDtEcEt`, `DcDtBt` and
the rest of the `Bt` family are authored and usually omitted, while `EcEt` is usually listed and
appears nowhere. `shading.dll` does register it — `EcEt` and `EcEtTwo`, `Et × lit` blended
`ONE / ONE` (`0x6eb8a40`) — and no retail file reaches either; the first type-to-type rewrite in
`[MaterialMap]` sends `EcEtOcOt` to `DcDtOcOt`.

### Property occurrence

| File                       | Count |
| -------------------------- | ----- |
| `Type`                     | 7,525 |
| `Dt_name` / `Dt_flags`     | 7,160 |
| `Dc`                       | 1,494 |
| `Ec`                       | 1,494 |
| `Et_name` / `Et_flags`     | 452   |
| `Bt_name` / `Bt_flags`     | 446   |
| `Oc`                       | 346   |
| `Ac`                       | 146   |
| `flip u` / `flip v`        | 107   |
| `Dm1_name` / `Dm1_flags`   | 68    |
| `TileRate`                 | 64    |
| `Dm0_name` / `Dm0_flags`   | 43    |
| `TileRate0` / `TileRate1`  | 43    |
| `Alpha` / `Fade` / `Scale` | 39    |
| `Dm_name` / `Dm_flags`     | 39    |
| `Sc` / `Sp`                | 0     |
| `Nt_name` / `Nt_flags`     | 0     |

Scalar ranges: `Oc` 0 to 0.99 (36 distinct), `Alpha` 0.3 to 0.7, `Fade` always 1.1, `Scale` 1.025 or
1.03, `TileRate` 4 to 12.

Fourteen materials need the nomad default (`Nomad surface`, `Nomad frame`, `Nomad Interior` across
the nomad ships, the dyson solar and two weapon models); 13 are authored as `DcDtBtOcOtTwo` or
`DcDtBtTwo` and one as `DcDt`, and all reach `NomadMaterialNoBendy` through `^nomad.*$`.

### Texture flag words

Six distinct words occur across all 8,208 slots:

| Value  | U     | V     | UV map | Count |
| ------ | ----- | ----- | ------ | ----- |
| `0x40` | wrap  | wrap  | 0      | 7,297 |
| `0x50` | wrap  | wrap  | 1      | 468   |
| `0x4a` | clamp | clamp | 0      | 338   |
| `0x5a` | clamp | clamp | 1      | 53    |
| `0x48` | wrap  | clamp | 0      | 39    |
| `0x42` | clamp | wrap  | 0      | 13    |

No axis is ever mirrored or bordered. Clamping is on `Dt`, plus 55 `Et` slots: 53 at `0x5a`, all
character eyes in `.dfm` heads, and two at `0x4a`, illumination maps on two cityscapes. The UV map
field above the address bits is always 4 (`0x40`, UV0) or 5 (`0x50`, UV1).

- Bit 6 is set on every one of the 8,208 slots, in every slot kind. It is the field's base.
- Bit 4 appears only on `Bt` and `Et`, never on `Dt`, `Dm`, `Dm0` or `Dm1`. 425 of the 446 `Bt` slots
  ask for UV1. So do 96 `Et` slots, every one a character eye in a `.dfm` head.

### Round-trip

Every one of the 7,525 materials writes back with its property files byte for byte identical, and
writing is a fixed point everywhere. Both pinned by `corpus.test.ts`.

Not reproduced: the order of the files inside a material. `writeMaterial` emits the authored order —
`Type` first, then each texture slot's name beside its flags — matching 6,569 materials exactly. The
other 956 are stored in case-insensitive name order instead:

```
Ac Alpha Dc Dt_flags Dt_name Fade Scale Type
```

The split falls along asset boundaries — 100 files entirely name-sorted against 1,329 entirely
authored, with no file mixing the two — and includes every `AtmosphereMaterial` and every detail-map
material. Nothing reads a material positionally; entries are found by name hash.

`Material count` equals the number of material directories in all 1,428 libraries that have one.
`SOLAR/SUNS/sun.sph` is the single library shipped without a count file — and the single one spelled
`Material Library` — and gains one on the way back out.

## TODO

### A slot asking for UV1 on a mesh with one set

The coordinate field is settled ([Texture flags](#texture-flags)); what the device does with it is
not, in one case. A `Bt` slot at `0x50` on a mesh whose vertex format carries a single texture
coordinate set asks for `TEXCOORDINDEX` 1 with nothing behind it, and every `Et` at `0x50` or `0x5a`
sits in a `.dfm`, whose vertex buffer carries `UV0` alone. *Experiment*: find a detail material on a
one-set mesh in game and compare it against the same model with its `Bt` slot removed. A surface that
keeps tiling at the detail rate is sampling UV0.
