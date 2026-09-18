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

`Type` names a shader. Its tokens describe what the shader reads — `Dc` diffuse colour, `Dt` diffuse
texture, `Ec` emission colour, `Et` emission texture, `Bt` detail texture, `OcOt` opacity, `Two`
two-sided — but the tokens do not predict which property files are present.

`Material` therefore models properties as independently optional — a property that was absent stays
absent rather than being defaulted on the way out. Measurement in
[Corpus](#type-does-not-determine-the-property-set).

There is no `Ot_name`: opacity comes from the alpha channel of the diffuse texture.

`materialTypes` lists the types retail authors; `mappedMaterialTypes` lists more the engine knows
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
Resolving that table is out of scope. `Material.type` is a plain string because `[MaterialMap]` can
name a shader neither list carries.

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

`defaultNomadTextureName` exports it. It resolves to a real texture — `SHIPS/NOMAD/nomad_fx.txm`
holds one entry of that name, the only place in the game data it appears. No retail material carries
an `Nt_name`, so the default is the entire mechanism by which a nomad hull gets its texture.

`readMaterial` does not apply it — see [Defaults belong at the point of
use](#defaults-belong-at-the-point-of-use).

## Texture flags

Every `*_flags` file is a `uint32` packing three settings, not a flat bitfield. The engine's property
tables name them, one triple per texture slot; `shading.dll` carries

```
Diffuse Texture Wrap Mode / Diffuse Texture U Address Mode / Diffuse Texture V Address Mode
```

against the single `Dt_flags` file, and repeats the same triple for `Et`, `Bt`, `Dm`, `Dm0` and
`Dm1`; `flmaterials.dll` repeats it once more for `nt_flags`. The word holds one wrap mode and two
address modes, and nothing else.

The low four bits are the two address modes, a mirror/clamp pair per axis, matching
`D3DTEXTUREADDRESS` set through `D3DTSS_ADDRESSU`/`ADDRESSV`. That leaves bits 4 and 6 as the wrap
mode. `TextureFlags` keeps neutral names — `Unknown0` for bit 4, `Unknown1` for bit 6 — because the
partition of the word into 2 + 2 + n bits is inference. See [TODO](#todo).

No bit correlates with the texture it points at. Every combination of storage and pixel format shows
up under the same word, and the clamped and unclamped sets overlap completely: the word describes
the sampler, not the image.

## Draw order

A model using both opaque and transparent materials should be a multi-part compound, with mesh
groups bound to a transparent material kept in parts separate from the opaque ones — cockpit glass
in its own part, not merged into the hull. Opaque groups are drawn front to back, then transparent
groups back to front with depth writes disabled. A constraint on how assets are built, not something
this module enforces.

## Notes

### Defaults belong at the point of use

Filling the nomad texture default in on read would write an `Nt_name` file into materials that never
had one — a change to what the shader reads, and the end of the byte-exact round trip. At the point
of use, a missing slot means "the default" rather than "no texture".

Numeric defaults would be float immediates rather than strings and so are not visible by scanning
string tables; that scan can only rule out further *string* defaults, which it does.

## API

### `./material`

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
sets, four of which have no `Oc`. One lone `DcDt` carries an `Ec` its shader cannot read.

Circulated type tables disagree with the shipped data in both directions: `DcDtEcEt`, `DcDtBt` and
the rest of the `Bt` family are authored and usually omitted, while `EcEt` is usually listed and
appears nowhere. `EcEt` is one of the two type-to-type rewrites at the top of `[MaterialMap]`.

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
the nomad ships, the dyson solar and two weapon models); all are authored as `DcDtBtOcOtTwo` or
`DcDtBtTwo` and reach `NomadMaterialNoBendy` through `^nomad.*$`.

### Texture flag words

Six distinct words occur across all 8,208 slots:

| Value  | Bits                               | Count |
| ------ | ---------------------------------- | ----- |
| `0x40` | Unknown1                           | 7,297 |
| `0x50` | Unknown1, Unknown0                 | 468   |
| `0x4a` | Unknown1, ClampU, ClampV           | 338   |
| `0x5a` | Unknown1, Unknown0, ClampU, ClampV | 53    |
| `0x48` | Unknown1, ClampV                   | 39    |
| `0x42` | Unknown1, ClampU                   | 13    |

Neither mirror bit is ever set, and clamping only ever appears on `Dt`. Read as a field above the
address bits, the wrap mode takes the value 4 (`0x40`) or 5 (`0x50`) and never anything else.

- Bit 6 is set on every one of the 8,208 slots, in every slot kind.
- Bit 4 appears only on `Bt` and `Et` — never on `Dt`, `Dm`, `Dm0` or `Dm1`. That is where a second
  texture coordinate set would be wanted, and it matches the second UV set `BtDetailMapMaterial` is
  documented to use.

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

### The wrap mode in `*_flags` — bits 4 and 6

Bits 4 and 6 hold the wrap mode ([Texture flags](#texture-flags)); their behaviour across 8,208
slots is described but not explained ([Corpus](#texture-flag-words)).

Both bits round-trip untouched. *Experiment*:

1. Clear bit 4 on a `Bt_flags` of a detail material. If the detail layer starts sampling the base UV
   set — tiling at the wrong rate rather than disappearing — the bit selects the coordinate set.
2. Set bit 4 on a `Dt_flags`, where retail never has it. A base map that starts sampling UV1 on a
   mesh that has one confirms the same reading from the other side.
3. Clear bit 6 anywhere. If nothing changes it is a constant the exporter writes; if the slot stops
   sampling, it is an enable.

Until one runs, `TextureFlags` keeps the neutral names and the 2 + 2 + n partition stays inference.
