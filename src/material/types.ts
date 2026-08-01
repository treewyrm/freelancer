import type Vector3 from '#/math/vector3.js'

/**
 * Texture addressing bits carried by every `*_flags` file.
 *
 * The word is not a flat bitfield but **three settings packed together**. The engine's property
 * tables name them explicitly, one triple per texture slot — in `shading.dll`, `Diffuse Texture
 * Wrap Mode`, `Diffuse Texture U Address Mode` and `Diffuse Texture V Address Mode` all sit
 * against the single file `Dt_name`'s companion `Dt_flags`, and the same triple repeats for
 * `Et`, `Bt`, `Dm`, `Dm0` and `Dm1`; `flmaterials.dll` repeats it once more for `nt_flags`.
 *
 * The address modes are a mirror/clamp pair per axis, matching `D3DTEXTUREADDRESS` set through
 * `D3DTSS_ADDRESSU`/`ADDRESSV`. Retail never sets either mirror bit — of the six distinct flag
 * words in the corpus, the only address state used is clamp, and only ever on `Dt`:
 *
 * | Value  | Bits                              | Count |
 * |--------|-----------------------------------|-------|
 * | `0x40` | {@link Unknown1}                  |  7297 |
 * | `0x50` | Unknown1, {@link Unknown0}        |   468 |
 * | `0x4a` | Unknown1, ClampU, ClampV          |   338 |
 * | `0x5a` | Unknown1, Unknown0, ClampU/ClampV |    53 |
 * | `0x48` | Unknown1, ClampV                  |    39 |
 * | `0x42` | Unknown1, ClampU                  |    13 |
 *
 * Which leaves the two high bits as the wrap mode, the third setting of the triple: read as a
 * field above the address bits it takes the value 4 (`0x40`) or 5 (`0x50`), never anything else.
 * They keep neutral names because the *width* of that field is inferred rather than read out of
 * the binary — the DLL proves a wrap mode shares the word, not where it ends.
 *
 * No bit correlates with the texture it points at: every combination of storage and pixel format
 * shows up under `0x40`, and the clamped and unclamped sets overlap completely. These describe the
 * sampler, not the image.
 */
export enum TextureFlags {
  None = 0,

  /** Wrap U by mirroring. Unused in retail. */
  MirrorU = 1 << 0,

  /** Clamp U to edge. */
  ClampU = 1 << 1,

  /** Wrap V by mirroring. Unused in retail. */
  MirrorV = 1 << 2,

  /** Clamp V to edge. */
  ClampV = 1 << 3,

  /** Low bit of the wrap mode field. Set on `Bt` and `Et` slots only. */
  Unknown0 = 1 << 4,

  /** High bit of the wrap mode field. Set on every retail flag word, in every slot. */
  Unknown1 = 1 << 6,
}

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
 * authored as ordinary `DcDtBtOcOtTwo` and become `NomadMaterialNoBendy` through the `^nomad.*$`
 * pattern in the `[MaterialMap]` section of `dacom.ini`.
 *
 * Deliberately *not* applied by `readMaterial`. Filling it in would write an `Nt_name` file into
 * materials that never had one, which is both a change to what the shader reads and the end of the
 * byte-exact round trip. Apply it at the point of use, where a missing slot means "the default",
 * not "no texture".
 */
export const defaultNomadTextureName = 'NomadRGB1_NomadAlpha1'

/** A texture slot: the name a {@link Texture} entry is looked up by, and how it is addressed. */
export interface TextureReference {
  /**
   * Texture name, resolved against a `Texture library` by {@link getResourceId}. Retail names look
   * like filenames but are not paths — the extension is part of the name and is often stale
   * (`.tga` on a DirectDrawSurface, and 800-odd carry a packer timestamp such as
   * `.tga021124183652`).
   */
  name: string

  /** {@link TextureFlags} bitfield. */
  flags: number
}

/**
 * Material types attested in retail assets, most common first.
 *
 * The name selects a shader, and its tokens describe the inputs the shader reads: `Dc` diffuse
 * colour, `Dt` diffuse texture, `Ec` emission colour, `Et` emission texture, `Bt` detail texture,
 * `OcOt` opacity, `Two` two-sided. There is no `Ot_name` — opacity is the alpha channel of the
 * diffuse texture.
 *
 * The tokens do not predict which property files are present. 245 `DcDt` materials carry `Dc`
 * alone with no texture at all, `DcDtOcOt` occurs in six different property sets, and one lone
 * `DcDt` carries an `Ec` its shader cannot read. So this list documents the shader, not a schema;
 * see {@link Material}, whose properties are all optional for exactly that reason.
 */
export const materialTypes = [
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
export const mappedMaterialTypes = [
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

/** A type {@link materialTypes} or {@link mappedMaterialTypes} names. */
export type KnownMaterialType =
  (typeof materialTypes)[number] | (typeof mappedMaterialTypes)[number]

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
   * `NomadMaterial` falls back to {@link defaultNomadTextureName}.
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
