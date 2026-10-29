import type Vector3 from '#/math/vector3.js'

/**
 * Default `Nt_name`, compiled into `EXE/flmaterials.dll`.
 *
 * The engine's property tables run `<label>, <file name>[, <default>]` — and across all three
 * material DLLs (`flmaterials.dll`, `shading.dll`, `deformable2.dll`) this is the **only** property
 * carrying that third string. It sits at file offset `0x12258`, immediately after `NomadTexture
 * Name` and `nt_name`:
 *
 * ```
 * 0001223c  "NomadTexture Name\0"  "nt_name\0"  "NomadRGB1_NomadAlpha1\0"  "Diffuse V Address Mode\0"
 * ```
 *
 * It resolves to a real texture: `SHIPS/NOMAD/nomad_fx.txm` holds one entry of that name, a
 * 256x256 `rgba32_8888` Targa chain of nine levels, and it is the only place in the game data it
 * appears. Nothing names it — **no retail material carries an `Nt_name` at all** — so the default
 * is the entire mechanism by which a nomad hull gets its texture. The materials that need it are
 * authored as ordinary types — `DcDtBtOcOtTwo` for most, one `DcDt` — and become
 * `NomadMaterialNoBendy` through the `^nomad.*$` pattern in the `[MaterialMap]` section of
 * `dacom.ini`, which sees the material name lowercased.
 *
 * Deliberately *not* applied by `readMaterial`. Filling it in would write an `Nt_name` file into
 * materials that never had one, which is both a change to what the shader reads and the end of the
 * byte-exact round trip. Apply it at the point of use, where a missing slot means "the default",
 * not "no texture".
 */
export const DEFAULT_NOMAD_TEXTURE_NAME = 'NomadRGB1_NomadAlpha1'

/** A texture slot: the name a {@link Texture} entry is looked up by, and how it is addressed. */
export interface TextureReference {
  /**
   * Texture name, resolved against a `Texture library` by {@link getResourceId}. Retail names look
   * like filenames but are not paths — the extension is part of the name and is often stale
   * (`.tga` on a DirectDrawSurface, and 800-odd carry a packer timestamp such as
   * `.tga021124183652`).
   */
  name: string

  /**
   * Flag word, `<slot>_flags`, carried as read.
   *
   * Not a bitfield but **three fields packed together**. The engine's property tables name them,
   * one triple per slot — `shading.dll` sets `Diffuse Texture Wrap Mode`, `Diffuse Texture U Address
   * Mode` and `Diffuse Texture V Address Mode` against the single file `Dt_flags`, repeats the
   * triple for `Et`, `Bt`, `Dm`, `Dm0` and `Dm1`, and `flmaterials.dll` once more for `nt_flags`.
   * `shading.dll` splits the word at load (`0x6eb1512`, `0x6eb1630`):
   *
   * | Bits | Field                                       | Read with           |
   * |------|---------------------------------------------|---------------------|
   * | 0–1  | U address, a {@link TextureAddress}         | {@link getAddress}  |
   * | 2–3  | V address, the same                         | {@link getAddress}  |
   * | 4–7  | UV map, 4 above its index — the *wrap mode* | {@link getMapIndex} |
   *
   * So bit 6 is the UV map field's base of 4, not a flag, which is why every retail word sets it;
   * bit 4 on top of it asks for UV1. Bits 0 and 1 together are border, not mirror and clamp at once.
   * Retail carries six words:
   *
   * | Value  | U      | V      | UV map | Count |
   * |--------|--------|--------|--------|-------|
   * | `0x40` | wrap   | wrap   | 0      |  7297 |
   * | `0x50` | wrap   | wrap   | 1      |   468 |
   * | `0x4a` | clamp  | clamp  | 0      |   338 |
   * | `0x5a` | clamp  | clamp  | 1      |    53 |
   * | `0x48` | wrap   | clamp  | 0      |    39 |
   * | `0x42` | clamp  | wrap   | 0      |    13 |
   *
   * No field correlates with the texture it points at: every combination of storage and pixel
   * format shows up under `0x40`, and the clamped and unclamped sets overlap completely. The word
   * describes the sampler, not the image.
   */
  flags: number
}

/**
 * Material types attested in retail assets, most common first.
 *
 * The name selects a class in `shading.dll` or `flmaterials.dll`, and its tokens name properties:
 * `Dc` diffuse colour, `Dt` diffuse texture, `Ec` emission colour, `Et` emission texture, `Bt`
 * detail texture, `OcOt` opacity, `Two` two-sided. There is no `Ot_name` — opacity is `Oc` and the
 * alpha of the diffuse texture. The tokens decide no behaviour: a material blends by its values and
 * its `Dt` format, not by `OcOt` in its name. `DcDtEtTwo` and the `DcDtBt*` names are registered by
 * no DLL and draw nothing unless `[MaterialMap]` renames them.
 *
 * The tokens do not predict which property files are present. 245 `DcDt` materials carry `Dc`
 * alone with no texture at all, `DcDtOcOt` occurs in six different property sets, and one lone
 * `DcDt` carries an `Ec`, which its class reads. So this list documents the class, not a schema;
 * see {@link Material}, whose properties are all optional for exactly that reason.
 */
export const MATERIAL_TYPES = [
  'DcDt',
  'DcDtEc',
  'DcDtOcOt',
  'DcDtEt',
  'DcDtBt',
  'Nebula',
  'DcDtBtEc',
  'DcDtEcOcOt',
  'DcDtTwo',
  'DcDtEcOcOtTwo',
  'DcDtEcEt',
  'AtmosphereMaterial',
  'DetailMapMaterial',
  'Masked2DetailMapMaterial',
  'DcDtOcOtTwo',
  'DetailMap2Dm1Msk2PassMaterial',
  'DcDtBtOcOtTwo',
  'DcDtEcTwo',
  'IllumDetailMapMaterial',
  'DcDtBtOcOt',
  'DcDtBtEcEt',
  'DcDtBtTwo',
  'DcDtEtTwo',
] as const

/**
 * Shader names the engine knows that no shipped asset selects. They reach a mesh through the
 * `[MaterialMap]` section of `EXE/dacom.ini` — plain text, not BINI — which rewrites a material's
 * type when its name matches a pattern, evaluated in reverse of the listed order so the most
 * specific entry goes last:
 *
 * ```ini
 * name = ^detailmap_.* = BtDetailMapMaterial
 * name = ^nomad.*$ = NomadMaterialNoBendy
 * name = ^ui_.* = HUDIconMaterial
 * Name = ^anim_hud.*$ = HUDAnimMaterial
 * ```
 *
 * So a nomad hull is authored as plain `DcDtBtOcOtTwo` and becomes `NomadMaterialNoBendy` at load
 * time. The section also rewrites between shipped types (`DcDtEcEt` to `DcDtEt`, `EcEtOcOt` to
 * `DcDtOcOt`), which is why `EcEt` appears in circulated type lists but in no asset. Resolving the
 * table is out of scope here; the names are listed so a writer can produce them deliberately.
 */
export const MAPPED_MATERIAL_TYPES = [
  'NebulaTwo',
  'EcEt',
  'BtDetailMapMaterial',
  'BtDetailMapMaterialTwo',
  'NomadMaterial',
  'NomadMaterialNoBendy',
  'GlassMaterial',
  'GFGlassMaterial',
  'HighGlassMaterial',
  'PlanetWaterMaterial',
  'ExclusionZoneMaterial',
  'HUDIconMaterial',
  'HUDAnimMaterial',
  'NullMaterial',
] as const

/** A type {@link MATERIAL_TYPES} or {@link MAPPED_MATERIAL_TYPES} names. */
export type KnownMaterialType =
  (typeof MATERIAL_TYPES)[number] | (typeof MAPPED_MATERIAL_TYPES)[number]

/**
 * Material type. Any string is valid — `[MaterialMap]` can name a shader this list does not, and
 * the known names are offered for completion only.
 */
export type MaterialType = KnownMaterialType | (string & {})

/**
 * One entry of a `Material library`.
 *
 * Every property but {@link name} and {@link type} is optional, and the absent ones are absent
 * rather than defaulted: the property files present under a material are not implied by its type,
 * and a writer that filled in the gaps would change what the shader reads. Which properties a
 * given shader consumes is a question for the shader, not for this record.
 */
export interface Material {
  /** Material name, resolved by {@link getResourceId} from a mesh's material CRC. */
  name: string

  /** Shader to render with, `Type`. */
  type: MaterialType

  /** Ambient colour, `Ac`. Overrides the scene ambient. */
  ambient?: Vector3

  /** Diffuse colour, `Dc`. */
  diffuse?: Vector3

  /** Emission colour, `Ec`. */
  emission?: Vector3

  /** Specular colour, `Sc`. Documented, but no retail material carries one. */
  specular?: Vector3

  /** Specular power, `Sp`. Documented, but no retail material carries one. */
  power?: number

  /** Opacity, `Oc`. Retail values run 0 to 0.99. */
  opacity?: number

  /** Diffuse texture, `Dt_name` and `Dt_flags`. */
  diffuseTexture?: TextureReference

  /** Emission texture, `Et_name` and `Et_flags`. */
  emissionTexture?: TextureReference

  /** Detail texture, `Bt_name` and `Bt_flags`, blended over the diffuse texture. */
  detailTexture?: TextureReference

  /**
   * Nomad texture, `Nt_name` and `Nt_flags`. No retail material carries one — every
   * `NomadMaterial` falls back to {@link DEFAULT_NOMAD_TEXTURE_NAME}.
   */
  nomadTexture?: TextureReference

  /** Diffuse mask, `Dm_name` and `Dm_flags`. */
  maskTexture?: TextureReference

  /** First diffuse mask, `Dm0_name` and `Dm0_flags`. */
  maskTexture0?: TextureReference

  /** Second diffuse mask, `Dm1_name` and `Dm1_flags`. */
  maskTexture1?: TextureReference

  /**
   * Mask tiling multiplier, `TileRate`. Not bound to {@link maskTexture} — the 25
   * `DetailMap2Dm1Msk2PassMaterial` materials pair a plain `TileRate` with `Dm1`, which is why the
   * rates are carried flat rather than folded into the slots they scale.
   */
  tileRate?: number

  /** First mask tiling multiplier, `TileRate0`. */
  tileRate0?: number

  /** Second mask tiling multiplier, `TileRate1`. */
  tileRate1?: number

  /** Opacity level, `Alpha`. Used by `AtmosphereMaterial`. */
  alpha?: number

  /** Steep view angle fade factor, `Fade`. Used by `AtmosphereMaterial`. */
  fade?: number

  /** Shell scale, `Scale`. Used by `AtmosphereMaterial`, always 1.025 or 1.03. */
  scale?: number

  /** Flip texture horizontally, `flip u`. */
  flipU?: boolean

  /** Flip texture vertically, `flip v`. */
  flipV?: boolean
}

/** The materials of a `Material library`, in directory order. */
export type MaterialLibrary = Material[]
