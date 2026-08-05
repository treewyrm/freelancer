import type { Property } from '#/ini/types.js'

/**
 * What the effect data means, as plain records.
 *
 * Four rules from [SCHEMA.md](../../docs/SCHEMA.md), and every one of them is forced by something in
 * this module's own corpus rather than adopted on faith:
 *
 * - **Every property is independently optional.** `[Effect] effect_type` is present 704 times out of
 *   705 and `vis_effect` 660 — the section name does not predict the property set, so absence is a
 *   missing key and stays missing on write-back.
 * - **Coerce to the declared type; never switch on the value tag.** `[EffectType] radius` is
 *   float-typed in some files and int-typed in others, as are `run_time`, `head_width`,
 *   `core_width`, `head_brightness`, `trail_brightness` and `[fuse] lifetime`. The tag is authoring
 *   residue and the interim layer keeps it for byte-exactness; nothing here reads it.
 * - **A repeated property is an ordered list.** `[VisEffect] textures` repeats up to ten times and
 *   `[start_effect] hardpoint` repeats in 129 sections — one effect fired at many hardpoints.
 * - **Unrecognized properties are preserved, not dropped.** Retail already contains residue this
 *   module must not eat: `[Effect]` carries a property literally named `:` once, `[start_effect]`
 *   carries the zero-value flags `only` and `age_fire` once each, and `[destroy_group]` carries
 *   `separable`, `dmg_hp` and `dmg_obj` once each.
 *
 * Types are not JSON-safe-by-contract but happen to be, since nothing here holds a typed array.
 */

/** Anything read from a section keeps what this module did not recognize. */
export interface Unrecognized {
  /**
   * Properties with no field on this type, in the order they were read.
   *
   * A modded install carries fields this library has never heard of, and retail carries authoring
   * residue. Both survive a read-modify-write instead of being silently deleted.
   */
  unrecognized?: Property[]
}

/** An 8-bit RGB triplet, which is how the beam appearances write colour. */
export type Color = [red: number, green: number, blue: number]

/** A translation or a set of Euler angles, both written as three numbers. */
export type Triplet = [x: number, y: number, z: number]

/**
 * `[VisEffect]`, the join from the INI graph to an Alchemy effect.
 *
 * 1,218 in retail, all of them in the eight `*_ale.ini` files and nowhere else.
 */
export interface VisEffect extends Unrecognized {
  /** Always present. What `[Effect] vis_effect` names. */
  nickname: string

  /** Always present. Path to the `.ale`, relative to the data directory. */
  alchemy: string

  /**
   * Always present. Selects one effect inside that `.ale`.
   *
   * **This is `getResourceId(name, true)` — the case-SENSITIVE hash.** It resolves 1,210 of the
   * 1,218; the folded hash the rest of the library defaults to resolves a strict subset of 1,150,
   * losing the 60 mixed-case names and gaining nothing. See
   * {@link import('./viseffect.js').findEffect}.
   */
  effect_crc: number

  /** Texture libraries the effect needs, in order. Repeats up to ten times; absent on 20. */
  textures?: string[]
}

/** `[Effect]` — what the rest of the data references by nickname. 705 in retail. */
export interface Effect extends Unrecognized {
  nickname: string
  effect_type?: string
  vis_effect?: string
  vis_generic?: string
  vis_beam?: string
  snd_effect?: string
  lgt_effect?: string
  lgt_range_scale?: number
  lgt_radius?: number
}

/** `[EffectType]` — priority, culling and lifetime for a class of effect. 45 in retail. */
export interface EffectType extends Unrecognized {
  nickname: string
  priority?: number
  generic_priority?: number
  lod_type?: string
  radius?: number
  visibility?: string
  update?: string
  run_time?: number

  /** Always two values in retail: the radii the effect is allocated a particle budget within. */
  pbubble?: [number, number]
}

/** `[EffectLOD]` — screen-size thresholds per LOD class. 6 in retail. */
export interface EffectLOD extends Unrecognized {
  /** Identifies the class. Note this is `type`, not `nickname`. */
  type: string
  max_lod_screen_size?: number
  min_lod_screen_size?: number
  min_screen_size?: number
}

/** Shared by `[BeamSpear]` and `[BeamBolt]`, which differ only by the `sec_*` and `core_length` fields. */
export interface BeamAppearance extends Unrecognized {
  nickname: string
  tip_length?: number
  tail_length?: number
  head_width?: number
  core_width?: number
  tip_color?: Color
  core_color?: Color
  outter_color?: Color
  tail_color?: Color
  head_brightness?: number
  trail_brightness?: number
  head_texture?: string
  trail_texture?: string
  flash_size?: number
}

/** `[BeamSpear]`, 51 in retail. Every field above is present on every one of them. */
export interface BeamSpear extends BeamAppearance {
  kind: 'spear'
}

/** `[BeamBolt]`, 4 in retail. Carries a middle section the spear does not. */
export interface BeamBolt extends BeamAppearance {
  kind: 'bolt'
  core_length?: number
  sec_core_width?: number
  sec_core_color?: Color
  sec_outter_color?: Color
}

/** Discriminated so a consumer cannot read `sec_core_color` off a spear. */
export type Beam = BeamSpear | BeamBolt

/**
 * `[Texture]` in `effect_shapes.ini` — names the sub-rectangles a texture library provides.
 *
 * Four in retail. `tex_shape` repeats, and the repeats are the point.
 */
export interface TextureShapes extends Unrecognized {
  /** Path to the `.txm`, relative to the data directory. */
  file: string

  /** Shape names within it, in order. */
  tex_shape?: string[]
}

/**
 * One action in a fuse script.
 *
 * Discriminated on `type`, which is the section name folded, so a consumer switching on it gets all
 * twelve retail arms checked at compile time. A thirteenth from a mod arrives as {@link UnknownAction}
 * rather than being dropped.
 *
 * `at_t` is optional because **39 of the 1,960 retail actions carry none** — 38 `start_effect` and
 * the single `make_invincible`.
 */
export interface FuseAction extends Unrecognized {
  type: string

  /**
   * When the action fires.
   *
   * Two values are a **range to pick a moment from**, not a start and an end — see
   * [FX.md](../../docs/FX.md)'s TODO for the evidence and what would confirm it. Arity is kept as
   * read so the round trip does not invent a second number; {@link import('./fuse.js').timeOf}
   * collapses it when a consumer wants one number.
   */
  at_t?: [number] | [number, number]
}

/** `[start_effect]` — 1,353 in retail, the overwhelming majority of all actions. */
export interface StartEffect extends FuseAction {
  type: 'start_effect'

  /** Nickname of an `[Effect]`. */
  effect?: string

  /** Hardpoints to fire it at. Repeats in 129 sections — one effect, many hardpoints. */
  hardpoint?: string[]

  /** Whether the effect follows the part or is left behind in world space. */
  attached?: boolean

  pos_offset?: Triplet
  ori_offset?: Triplet
}

/** `[destroy_group]` — 291 in retail. */
export interface DestroyGroup extends FuseAction {
  type: 'destroy_group'

  /** A `[CollisionGroup]` nickname, or `random`. */
  group_name?: string

  /** What becomes of it. `debris` and `disappear` are the values retail uses. */
  fate?: string
}

/** `[destroy_hp_attachment]` — 163 in retail. */
export interface DestroyHardpointAttachment extends FuseAction {
  type: 'destroy_hp_attachment'

  /** A hardpoint name, or `random`. */
  hardpoint?: string
  fate?: string
}

/** `[destroy_root]` — 37 in retail. Carries nothing but its moment. */
export interface DestroyRoot extends FuseAction {
  type: 'destroy_root'
}

/** `[ignite_fuse]` — 74 in retail. This is what makes fuses a graph rather than a list. */
export interface IgniteFuse extends FuseAction {
  type: 'ignite_fuse'

  /** `[fuse] name` of the script to start. */
  fuse?: string

  /** Where to start it from, if not the beginning. Present on 72 of the 74. */
  fuse_t?: number
}

/** `[damage_group]` — 3 in retail. */
export interface DamageGroup extends FuseAction {
  type: 'damage_group'
  group_name?: string
  damage_type?: string
  hitpoints?: number
}

/** `[damage_root]` — 7 in retail. */
export interface DamageRoot extends FuseAction {
  type: 'damage_root'
  damage_type?: string
  hitpoints?: number
}

/** `[impulse]` — 16 in retail. The push a detonation gives everything nearby. */
export interface Impulse extends FuseAction {
  type: 'impulse'
  hardpoint?: string
  radius?: number
  force?: number
  damage?: number
  pos_offset?: Triplet
}

/** `[start_cam_particles]` — 13 in retail. Particles on the camera rather than on the object. */
export interface StartCameraParticles extends FuseAction {
  type: 'start_cam_particles'
  effect?: string
  pos_offset?: Triplet
  ori_offset?: Triplet
}

/** `[tumble]` — 1 in retail, in `death_comm`. */
export interface Tumble extends FuseAction {
  type: 'tumble'
  ang_drag_scale?: number

  /** Each a two-value range, like `at_t`'s two-value form. */
  turn_throttle_x?: [number, number]
  turn_throttle_y?: [number, number]
  turn_throttle_z?: [number, number]
  throttle?: [number, number]
}

/** `[dump_cargo]` — 1 in retail. */
export interface DumpCargo extends FuseAction {
  type: 'dump_cargo'
  origin_hardpoint?: string
}

/** `[make_invincible]` — 1 in retail, and the only action with no `at_t`. */
export interface MakeInvincible extends FuseAction {
  type: 'make_invincible'
  turn_on?: boolean
}

/** A section inside a fuse script this module has no arm for. Kept whole. */
export interface UnknownAction extends FuseAction {
  type: string
}

/** Every action kind, discriminated by section name. */
export type Action =
  | StartEffect
  | DestroyGroup
  | DestroyHardpointAttachment
  | DestroyRoot
  | IgniteFuse
  | DamageGroup
  | DamageRoot
  | Impulse
  | StartCameraParticles
  | Tumble
  | DumpCargo
  | MakeInvincible
  | UnknownAction

/**
 * `[fuse]` and the run of action sections that follows it.
 *
 * 209 in retail across 17 files, owning 1,960 actions between them, and **no action appears before
 * the first `[fuse]`** — the grouping is total, so a run always has an owner.
 */
export interface Fuse extends Unrecognized {
  /** Always present. Note this is `name`, not `nickname`, unlike every other archetype in the data. */
  name: string

  /**
   * Always present. **Not the script's duration**: 61 of the 1,921 timed actions fire after it, one
   * by a factor of a hundred. See [FX.md](../../docs/FX.md)'s TODO.
   */
  lifetime: number

  /** Whether this is the script a death runs. Present on 105 of the 209. */
  death_fuse?: boolean

  /** Present on exactly one fuse in retail, with four values. */
  lodranges?: number[]

  /** In the order they will fire, which is the order they were written. */
  actions: Action[]
}
