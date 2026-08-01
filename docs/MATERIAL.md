# Material

Reader and writer for Freelancer's material libraries. A library is a UTF directory named
`Material library` holding one subdirectory per material, plus a `Material count` file. Libraries
appear as standalone `.mat` files and embedded directly in models — `.3db`, `.cmp`, `.dfm` and one
`.sph`.

Retail carries **1,429 libraries holding 7,525 materials**:

| Extension | Libraries |
| --------- | --------- |
| `.3db`    | 788       |
| `.cmp`    | 330       |
| `.dfm`    | 204       |
| `.mat`    | 106       |
| `.sph`    | 1         |

`.txm`, `.ale`, `.utf` and `.vms` carry none — texture libraries and material libraries are
siblings, not nested, and a `.txm` is textures alone. One of the 107 `.mat` files,
`FX/envmapbasic.mat`, is textures alone too: it ships a `Texture Library` holding the cubemap and
no materials at all.

Certain assets cannot reference an external `.mat` and must embed their materials: starspheres,
cutscene props and deformable models.

## Architecture

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

A material holds nothing but files — no retail material has a subdirectory. The directory is
spelled three ways (`Material library` ×1362, `material library` ×66, `Material Library` ×1), so
every lookup goes through `getResourceId`, never a string compare. All 1,429 sit at the file root;
four assets hold a second library nested inside an `openFLAME 3D N-mesh` tree, which is Conquest:
Frontier Wars residue the game itself cannot load and is out of scope, as it is for textures.

Materials are referenced by CRC from mesh groups, so a name collision inside one library would make
a material unreachable. Retail has none.

## Types

`Type` names a shader. Its tokens describe what the shader reads — `Dc` diffuse colour, `Dt`
diffuse texture, `Ec` emission colour, `Et` emission texture, `Bt` detail texture, `OcOt` opacity,
`Two` two-sided — but **the tokens do not predict which property files are present**:

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

245 `DcDt` materials carry a `Dc` and no texture at all. `DcDtOcOt` occurs in six different
property sets, four of which have no `Oc`. One lone `DcDt` carries an `Ec` its shader cannot read.
So `Material` models the properties as **independently optional**, not as a union discriminated by
type, and a property that was absent stays absent rather than being defaulted on the way back out.

There is no `Ot_name`: opacity comes from the alpha channel of the diffuse texture.

`materialTypes` lists the 23 above; `mappedMaterialTypes` lists 14 more the engine knows that no
shipped asset selects — `NomadMaterial`, `GlassMaterial`, `HUDIconMaterial`, `NullMaterial` and the
rest. Those reach a mesh through the `[MaterialMap]` section of `EXE/dacom.ini` — plain text, not
BINI — which rewrites a material's type when its name matches a pattern:

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

So a nomad hull is authored as plain `DcDtBtOcOtTwo` and becomes `NomadMaterialNoBendy` at load
time. Resolving that table is out of scope here, but it explains the type lists: `Material.type` is
a plain string because `[MaterialMap]` can name a shader neither list carries, and the two
type-to-type rewrites at the top are why `EcEt` appears in circulated tables and in no asset.

Those tables disagree with the shipped data in both directions: `DcDtEcEt`, `DcDtBt` and the rest
of the `Bt` family are authored and usually omitted, while `EcEt` is usually listed and appears
nowhere.

## Defaults

A material need not carry a property for the shader to read one. The engine's property tables run
`<label>, <file name>[, <default>]`, and across all three material DLLs — `flmaterials.dll`,
`shading.dll`, `deformable2.dll` — exactly one property carries that third string:

```
flmaterials.dll @ 0x1223c
  "NomadTexture Name\0"  "nt_name\0"  "NomadRGB1_NomadAlpha1\0"  "Diffuse V Address Mode\0"
```

`defaultNomadTextureName` exports it. It resolves to a real texture — `SHIPS/NOMAD/nomad_fx.txm`
holds one entry of that name, a 256×256 `rgba32_8888` Targa chain of nine levels, and it is the
only place in the game data it appears. **Nothing names it**: no retail material carries an
`Nt_name` at all, so the default is the entire mechanism by which a nomad hull gets its texture.
The fourteen materials that need it (`Nomad surface`, `Nomad frame`, `Nomad Interior` across the
nomad ships, the dyson solar and two weapon models) are authored as `DcDtBtOcOtTwo` or `DcDtBtTwo`
and reach `NomadMaterialNoBendy` through `^nomad.*$`.

`readMaterial` deliberately does **not** apply it. Filling a default in would write an `Nt_name`
file into materials that never had one — a change to what the shader reads, and the end of the
byte-exact round trip. Defaults belong at the point of use, where a missing slot means "the
default" rather than "no texture".

Numeric defaults would be float immediates rather than strings and so are not visible this way;
scanning the string tables can only rule out further _string_ defaults, which it does.

## Properties

| File                       | `Material`                 | Payload        | Count |
| -------------------------- | -------------------------- | -------------- | ----- |
| `Type`                     | `type`                     | string         | 7,525 |
| `Dt_name` / `Dt_flags`     | `diffuseTexture`           | string/u32     | 7,160 |
| `Dc`                       | `diffuse`                  | float[3]       | 1,494 |
| `Ec`                       | `emission`                 | float[3]       | 1,494 |
| `Et_name` / `Et_flags`     | `emissionTexture`          | string/u32     | 452   |
| `Bt_name` / `Bt_flags`     | `detailTexture`            | string/u32     | 446   |
| `Oc`                       | `opacity`                  | float          | 346   |
| `Ac`                       | `ambient`                  | float[3]       | 146   |
| `flip u` / `flip v`        | `flipU` / `flipV`          | u32 as bool    | 107   |
| `Dm1_name` / `Dm1_flags`   | `maskTexture1`             | string/u32     | 68    |
| `TileRate`                 | `tileRate`                 | float          | 64    |
| `Dm0_name` / `Dm0_flags`   | `maskTexture0`             | string/u32     | 43    |
| `TileRate0` / `TileRate1`  | `tileRate0` / `tileRate1`  | float          | 43    |
| `Alpha` / `Fade` / `Scale` | `alpha` / `fade` / `scale` | float          | 39    |
| `Dm_name` / `Dm_flags`     | `maskTexture`              | string/u32     | 39    |
| `Sc` / `Sp`                | `specular` / `power`       | float[3]/float | 0     |
| `Nt_name` / `Nt_flags`     | `nomadTexture`             | string/u32     | 0     |

Those 25 names are the whole set; no retail material carries a file outside it, which a corpus case
pins so a name the reader does not know cannot appear unnoticed. `Sc`, `Sp` and the nomad slot are
modelled from the documented property list and are never authored — the nomad texture a
`NomadMaterial` samples has to arrive some other way.

`TileRate` is **not** bound to `Dm`. The 25 `DetailMap2Dm1Msk2PassMaterial` materials pair a plain
`TileRate` with `Dm1`, so the rates are carried flat rather than folded into the slots they scale.

Retail scalar ranges, for orientation: `Oc` 0 to 0.99 (36 distinct), `Alpha` 0.3 to 0.7, `Fade`
always 1.1, `Scale` 1.025 or 1.03, `TileRate` 4 to 12.

Texture names look like filenames but are not paths — the extension is part of the name and is
often stale, `.tga` on a DirectDrawSurface. Roughly 800 carry a packer timestamp
(`.tga021124183652`), and five name an `.avi` no texture library holds.

## Texture flags

Every `*_flags` file is a `uint32`, and it is **not a flat bitfield but three settings packed
together**. The engine's property tables name them explicitly, one triple per texture slot —
`shading.dll` carries

```
Diffuse Texture Wrap Mode / Diffuse Texture U Address Mode / Diffuse Texture V Address Mode
```

against the single `Dt_flags` file, and repeats the same triple for `Et`, `Bt`, `Dm`, `Dm0` and
`Dm1`; `flmaterials.dll` repeats it once more for `nt_flags`. So the word holds one wrap mode and
two address modes, and nothing else.

Six distinct words occur across all 8,208 slots:

| Value  | Bits                               | Count |
| ------ | ---------------------------------- | ----- |
| `0x40` | Unknown1                           | 7,297 |
| `0x50` | Unknown1, Unknown0                 | 468   |
| `0x4a` | Unknown1, ClampU, ClampV           | 338   |
| `0x5a` | Unknown1, Unknown0, ClampU, ClampV | 53    |
| `0x48` | Unknown1, ClampV                   | 39    |
| `0x42` | Unknown1, ClampU                   | 13    |

The low four bits are the two address modes, a mirror/clamp pair per axis, matching
`D3DTEXTUREADDRESS` set through `D3DTSS_ADDRESSU`/`ADDRESSV`. **Neither mirror bit is ever set**,
and clamping only ever appears on `Dt`.

That leaves bits 4 and 6 as the wrap mode, the third setting of the triple. Read as a field above
the address bits it takes the value 4 (`0x40`) or 5 (`0x50`), never anything else, and the two bits
behave very differently:

- **bit 6 is set on every one of the 8,208 slots**, in every slot kind — the constant part of the
  mode, whatever the mode means.
- **bit 4 appears only on `Bt` and `Et`** — never on `Dt`, `Dm`, `Dm0` or `Dm1`. That is exactly
  where a second texture coordinate set would be wanted, the thing a detail map needs and a base map
  does not, and matches the second UV set `BtDetailMapMaterial` is documented to use.

`TextureFlags` keeps neutral names (`Unknown0`, `Unknown1`) for the two, because the DLL proves a
wrap mode shares the word without saying where the field ends — the partition into 2+2+n bits is
inference. The bits round-trip untouched, so clearing bit 4 on a detail material is a clean in-game
experiment.

No bit correlates with the texture it points at. Every combination of storage and pixel format shows
up under `0x40`, and the clamped and unclamped sets overlap completely — so the word describes the
sampler, not the image.

## Round trip

**Every one of the 7,525 materials writes back with its property files byte for byte identical**,
and writing is a fixed point everywhere: what is written reads back the same and writes again to the
same bytes. Both are pinned by `corpus.test.ts`.

The one thing not reproduced is the order of the files inside a material. `writeMaterial` emits the
authored order — `Type` first, then each texture slot's name beside its flags — which matches 6,569
materials exactly. The other 956 are stored in case-insensitive name order instead:

```
Ac Alpha Dc Dt_flags Dt_name Fade Scale Type
```

That split is a second authoring tool rather than a meaningful distinction. It falls along asset
boundaries — 100 files entirely name-sorted against 1,329 entirely authored, with **no file mixing
the two** — and it includes every `AtmosphereMaterial` and every detail-map material, which is
simply where that tool was used. Nothing reads a material positionally; entries are found by name
hash.

`Material count` is derived on write rather than carried, the same call `Texture count` gets in an
animated texture. It equals the number of material directories in all 1,428 libraries that have
one, so a field for it could only offer a way to disagree. `SOLAR/SUNS/sun.sph` is the single
library shipped without a count file — and, not coincidentally, the single one spelled
`Material Library` — and gains one on the way back out.

## Draw order

A model using both opaque and transparent materials should be a multi-part compound, with mesh
groups bound to a transparent material kept in parts separate from the opaque ones — cockpit glass
in its own part, not merged into the hull. Opaque groups are drawn front to back, then transparent
groups back to front with depth writes disabled. This is a constraint on how assets are built, not
something this module enforces.
