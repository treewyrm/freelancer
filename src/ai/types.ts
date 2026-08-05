import type { Unrecognized } from '#/schema/types.js'

/**
 * What the pilot data means, as plain records.
 *
 * Transcribed from [DICTIONARY.md](../../docs/DICTIONARY.md#ai), which is the point of that
 * document: every field here has a row there, and every row there that the wiki or the sweep could
 * read has a field here. Where a row says `unread`, the field is still present — the data carries
 * it, so the type carries it, and only the doc comment is empty.
 *
 * The shape of the module is one `[Pilot]` naming seventeen behaviour blocks by nickname, and the
 * blocks are flat records with no nesting and no cross-file references. That is why
 * [MODULES.md](../../docs/MODULES.md) picked it to prove the typed layer on.
 *
 * Four conventions hold across every block, and they are why so many fields are bare `number`:
 *
 * - `_time` is seconds, `_percent` is a fraction of one, `_throttle` is a `0`–`1` control input, and
 *   `_cone_angle` is **degrees** — retail carries `75`, `90` and `180`. Only
 *   `max_angular_velocity` on a munition is radians, and that is not this module.
 * - A `_variance_percent` jitters the `_time` it is named after.
 * - **The int/float tag is residue.** 23 of these fields are int-typed in `pilots_population.ini`
 *   and float-typed in `pilots_story.ini` for the same meaning, so every one is read as a number.
 * - **Booleans are spelled four ways** — `False` ×34, `FALSE` ×14, `True` ×3, `TRUE` ×2 on a typical
 *   field — and never as a BINI boolean. `field.boolean` reads all four; `yes` would read as false,
 *   and nothing here writes `yes`.
 *
 * The seventeen block kinds are a discriminated union on `type`, so a consumer switching on it gets
 * every arm checked at compile time and an eighteenth from a mod arrives as {@link UnknownBlock}
 * rather than being dropped. Same choice `./fx` made for fuse actions, for the same reason.
 */

export type { Unrecognized }

/**
 * A weighted choice, which is how every style and direction option is written.
 *
 * `evade_dodge_style_weight = waggle, 0.5`. The property repeats, once per option, and the weights
 * across one block's repeats are what the pilot picks between.
 */
export interface Weighted {
  /** The option's name — a style (`waggle`, `slide`, `corkscrew`) or a direction (`left`, `up`). */
  name: string

  /** Its share. Not normalized in the data; a consumer that needs a distribution normalizes. */
  weight?: number
}

/**
 * `[Pilot]` — 319 in retail, across `MISSIONS/pilots_population.ini` and `pilots_story.ini`.
 *
 * **Not the 320th.** `CHARACTERS/newcharacter.ini` carries a `[Pilot]` that shares only `nickname`
 * with this one and belongs to the new-character record — see
 * [DICTIONARY.md](../../docs/DICTIONARY.md#one-section-two-shapes-split-by-file). {@link readPilots}
 * yields it too, because a reader cannot tell from the section alone; every field below will be
 * absent and `unrecognized` will hold the six that are really there.
 *
 * Every `*_id` names a block of the matching kind by its `nickname`. `inherit` is on 290 of the 319,
 * which is why most pilots carry almost nothing else.
 */
export interface Pilot extends Unrecognized {
  nickname: string

  /** Another `[Pilot]` to take unset fields from. Present on 290 of 319. */
  inherit?: string

  /** → {@link GunBlock}. Present on 148. */
  gun_id?: string

  /** → {@link JobBlock}. Present on 62. */
  job_id?: string

  /** → {@link EvadeDodgeBlock}. Present on 63. */
  evade_dodge_id?: string

  /** → {@link EvadeBreakBlock}. Present on 38. */
  evade_break_id?: string

  /** → {@link MissileBlock}. Present on 43. */
  missile_id?: string

  /** → {@link MissileReactionBlock}. Present on 17. */
  missile_reaction_id?: string

  /** → {@link BuzzHeadTowardBlock}. Present on 39. */
  buzz_head_toward_id?: string

  /** → {@link BuzzPassByBlock}. Present on 39. */
  buzz_pass_by_id?: string

  /** → {@link TrailBlock}. Present on 20. */
  trail_id?: string

  /** → {@link StrafeBlock}. Present on 20. */
  strafe_id?: string

  /** → {@link EngineKillBlock}. Present on 17. */
  engine_kill_id?: string

  /** → {@link MineBlock}. Present on 20. */
  mine_id?: string

  /** → {@link CountermeasureBlock}. Present on 20. */
  countermeasure_id?: string

  /** → {@link DamageReactionBlock}. Present on 25. */
  damage_reaction_id?: string

  /** → {@link FormationBlock}. Present on 18. */
  formation_id?: string

  /** → {@link RepairBlock}. Present on 17. */
  repair_id?: string
}

/** Shared by every `*Block`. The section name folded, and the nickname a `[Pilot]` names it by. */
export interface Block extends Unrecognized {
  /** Section name, folded — the discriminant. */
  type: string

  /** Always present in retail, on all 17 kinds. */
  nickname: string
}

/** `[GunBlock]` — 99. When and how accurately the pilot shoots, and what its turrets do. */
export interface GunBlock extends Block {
  type: 'gunblock'

  /** Seconds between shots within a burst. `100000` is the idiom for never. */
  gun_fire_interval_time?: number
  gun_fire_interval_variance_percent?: number

  /** Seconds between bursts. */
  gun_fire_burst_interval_time?: number
  gun_fire_burst_interval_variance_percent?: number

  /** Interval used when the weapon does not burst. */
  gun_fire_no_burst_interval_time?: number

  /** Half-angle of the spread a shot is scattered into. `0.5`–`8` degrees in retail. */
  gun_fire_accuracy_cone_angle?: number

  /** Shapes the distribution inside that cone; higher clusters toward the centre. */
  gun_fire_accuracy_power?: number

  /** The same against an NPC rather than the player, and consistently harsher. */
  gun_fire_accuracy_power_npc?: number

  /** Multiple of weapon range within which it opens fire. `1.1` on 94 of 98. */
  gun_range_threshold?: number
  gun_range_threshold_variance_percent?: number

  /** Seconds before re-aiming at a different point on the target. */
  gun_target_point_switch_time?: number

  /** `single` fires one weapon at a time, `multiple` freely. **Retail is `multiple` ×98.** */
  fire_style?: string

  auto_turret_interval_time?: number
  auto_turret_burst_interval_time?: number
  auto_turret_burst_interval_variance_percent?: number
  auto_turret_no_burst_interval_time?: number
}

/** The four threat fields share this vocabulary. Spelled in both cases in retail. */
export type Toughness = 'easiest' | 'easy' | 'equal' | 'hard' | 'hardest'

/** `[JobBlock]` — 59. Whom the pilot follows, when it runs, and what it picks up. */
export interface JobBlock extends Block {
  type: 'jobblock'

  /** Target class, a weight, and a bitfield of conditions. Repeats in 56 of the 59 sections. */
  attack_preference?: AttackPreference[]

  /** Hold fire until the wing leader has picked a target. */
  wait_for_leader_target?: boolean

  /** Metres beyond which the leader's target is ignored. */
  maximum_leader_target_distance?: number

  /** Named `_style` but written `True`/`False` throughout. */
  flee_when_leader_flees_style?: boolean

  /** Hull fraction at which it runs. `0` on 30 of 51 — most pilots never flee on damage. */
  flee_when_hull_damaged_percent?: number

  /** Flee when disarmed. `True` on 49 of 51. */
  flee_no_weapons_style?: boolean

  /** Threat level at which it disengages. Kept as read, not narrowed — a mod may add one. */
  flee_scene_threat_style?: string

  /** Threat level at which it engages at all. */
  scene_toughness_threshold?: string

  /** Threat level at which it breaks off to collect loot. Adds `easiest` to the four. */
  loot_flee_threshold?: string

  /** `lt_none` | `lt_all` | `lt_commodities` | `lt_potions`. */
  loot_preference?: string

  /** `anything` in all 51 retail occurrences. */
  attack_subtarget_order?: string

  /** Whether to fight inside a field. `never` | `always` | `low_density` | `high_density`. */
  field_targeting?: string

  /** Attack while holding formation. */
  force_attack_formation?: boolean

  /** Metres the engagement may wander from where it started. */
  combat_drift_distance?: number

  /** One retail occurrence, and nothing says what it does. */
  allow_player_targeting?: boolean
}

/** One row of `[JobBlock] attack_preference`. 262 rows over 59 sections. */
export interface AttackPreference {
  /** What to attack — a ship class, or `solar`, or `all`. */
  target: string

  /** Its weight against the other rows. */
  weight?: number

  /** A bitfield naming the conditions, written as a symbolic string rather than a number. */
  flags?: string
}

/** `[EvadeDodgeBlock]` — 30. The largest block, and the best documented. */
export interface EvadeDodgeBlock extends Block {
  type: 'evadedodgeblock'

  /** `waggle`, `waggle_random`, `slide`, `corkscrew`. One per block in all 30 retail sections. */
  evade_dodge_style_weight?: Weighted[]

  /** `left`, `right`, `up`, `down`. 64 rows over 25 sections. */
  evade_dodge_direction_weight?: Weighted[]

  /** Metres within which a threat in the cone triggers evasion. Lower is more aggressive. */
  evade_activate_range?: number

  /** The cone that pairs with it, in degrees. */
  evade_dodge_cone_angle?: number
  evade_dodge_cone_angle_variance_percent?: number

  /** Seconds before evasion can be re-entered. */
  evade_dodge_interval_time?: number
  evade_dodge_interval_time_variance_percent?: number

  /** Seconds one evasion lasts at most. */
  evade_dodge_time?: number

  /** Metres of separation that ends it. */
  evade_dodge_distance?: number

  /** `0` makes every evasion a straight line. */
  evade_dodge_turn_throttle?: number

  /** For the `slide` style. */
  evade_dodge_slide_throttle?: number

  /** `0` in all 29 retail occurrences, so nothing here reads its meaning. */
  evade_dodge_roll_angle?: number

  /** `0` in all 29. */
  evade_dodge_waggle_axis_cone_angle?: number

  /** For the `corkscrew` style; `0` flattens it. */
  evade_dodge_corkscrew_turn_throttle?: number
  evade_dodge_corkscrew_roll_throttle?: number

  /** `False` in all 29. */
  evade_dodge_corkscrew_roll_flip_direction?: boolean
}

/** `[EvadeBreakBlock]` — 8. The hard break, as opposed to the dodge. */
export interface EvadeBreakBlock extends Block {
  type: 'evadebreakblock'
  evade_break_style_weight?: Weighted[]
  evade_break_direction_weight?: Weighted[]

  /** `5` in all 8. */
  evade_break_time?: number

  /** `2.5` in all 8. */
  evade_break_interval_time?: number
  evade_break_roll_throttle?: number
  evade_break_turn_throttle?: number
  evade_break_afterburner_delay?: number
  evade_break_afterburner_delay_variance_percent?: number
  evade_break_attempt_reverse_time?: number
  evade_break_reverse_distance?: number
}

/** `[BuzzHeadTowardBlock]` — 17. The approach run, which dodges while it closes. */
export interface BuzzHeadTowardBlock extends Block {
  type: 'buzzheadtowardblock'
  buzz_head_toward_style_weight?: Weighted[]
  buzz_dodge_direction_weight?: Weighted[]

  /** Metres at which the run begins. */
  buzz_min_distance_to_head_toward?: number
  buzz_min_distance_to_head_toward_variance_percent?: number

  /** Seconds spent heading away before turning back. */
  buzz_max_time_to_head_away?: number

  buzz_head_toward_engine_throttle?: number
  buzz_head_toward_turn_throttle?: number
  buzz_head_toward_roll_throttle?: number

  /** `False` in all 4 occurrences. */
  buzz_head_toward_roll_flip_direction?: boolean

  /** Dodging *during* the approach, which is why the dodge fields repeat here. */
  buzz_dodge_turn_throttle?: number
  buzz_dodge_cone_angle?: number
  buzz_dodge_cone_angle_variance_percent?: number

  /** `0` in all 16. */
  buzz_dodge_waggle_axis_cone_angle?: number
  buzz_dodge_roll_angle?: number
  buzz_dodge_interval_time?: number
  buzz_dodge_interval_time_variance_percent?: number

  buzz_slide_throttle?: number
  buzz_slide_interval_time?: number
  buzz_slide_interval_time_variance_percent?: number
}

/** `[BuzzPassByBlock]` — 6. The departure that pairs with the approach. */
export interface BuzzPassByBlock extends Block {
  type: 'buzzpassbyblock'
  buzz_pass_by_style_weight?: Weighted[]
  buzz_break_direction_weight?: Weighted[]

  /** Metres of the closest approach. */
  buzz_distance_to_pass_by?: number

  /** Seconds the pass lasts. */
  buzz_pass_by_time?: number

  /** `90` in all 4 occurrences. */
  buzz_break_direction_cone_angle?: number
  buzz_break_turn_throttle?: number
  buzz_pass_by_roll_throttle?: number

  /** Release a bomb at the closest point. */
  buzz_drop_bomb_on_pass_by?: boolean
}

/** `[MissileBlock]` — 20. */
export interface MissileBlock extends Block {
  type: 'missileblock'
  missile_launch_interval_time?: number
  missile_launch_interval_variance_percent?: number

  /** Metres. `1000` on 14 of 20. */
  missile_launch_range?: number

  /** Degrees off the nose the target must be within. One block uses `180`, which is everywhere. */
  missile_launch_cone_angle?: number

  /** Fire anyway when beyond `missile_launch_range`. */
  missile_launch_allow_out_of_range?: boolean
}

/**
 * `[MissileReactionBlock]` — 3. What the pilot does about an incoming missile.
 *
 * **No wiki page.** The three `_reaction_time` fields name the three evasions it can answer with,
 * which is a reading from the names alone and nothing corroborates it.
 */
export interface MissileReactionBlock extends Block {
  type: 'missilereactionblock'

  /** `1000` in all 3. Metres at which the missile is reacted to. */
  evade_missile_distance?: number
  evade_break_missile_reaction_time?: number
  evade_slide_missile_reaction_time?: number
  evade_afterburn_missile_reaction_time?: number
}

/**
 * `[DamageReactionBlock]` — 5. What to do at what damage level.
 *
 * Uniform: seven `_percent` / `_time` pairs and two lone percentages, and all five sections carry
 * every one. A `_percent` of `1` means "at any damage", which is what seven of them hold, so most of
 * the table is on all the time.
 */
export interface DamageReactionBlock extends Block {
  type: 'damagereactionblock'
  evade_break_damage_trigger_percent?: number
  evade_dodge_more_damage_trigger_percent?: number
  engine_kill_face_damage_trigger_percent?: number
  engine_kill_face_damage_trigger_time?: number
  roll_damage_trigger_percent?: number
  roll_damage_trigger_time?: number
  afterburner_damage_trigger_percent?: number
  afterburner_damage_trigger_time?: number
  brake_reverse_damage_trigger_percent?: number
  drop_mines_damage_trigger_percent?: number
  drop_mines_damage_trigger_time?: number
  fire_guns_damage_trigger_percent?: number
  fire_guns_damage_trigger_time?: number
  fire_missiles_damage_trigger_percent?: number
  fire_missiles_damage_trigger_time?: number
}

/** `[FormationBlock]` — 10. */
export interface FormationBlock extends Block {
  type: 'formationblock'

  /** Seconds formation is held during an attack. */
  force_attack_formation_active_time?: number

  /** Seconds before it can be re-formed. */
  force_attack_formation_unactive_time?: number

  break_formation_damage_trigger_percent?: number
  break_formation_damage_trigger_time?: number
  break_formation_missile_reaction_time?: number

  /** The same, scattering rather than breaking. */
  break_apart_formation_missile_reaction_time?: number

  /** Scatter when any member breaks. */
  break_apart_formation_on_evade_break?: boolean
  break_formation_on_evade_break_time?: number

  formation_exit_top_turn_break_away_throttle?: number
  formation_exit_roll_outrun_throttle?: number

  /** Seconds the exit manoeuvre may take. */
  formation_exit_max_time?: number
}

/** `[CountermeasureBlock]` — 6, a difficulty ladder of `countermeasure_handicap_0..3` plus two. */
export interface CountermeasureBlock extends Block {
  type: 'countermeasureblock'

  /** Seconds countermeasures run. `3` in all 6. */
  countermeasure_active_time?: number

  /** Seconds before they can run again. */
  countermeasure_unactive_time?: number
}

/** `[TrailBlock]` — 4. */
export interface TrailBlock extends Block {
  type: 'trailblock'

  /** Metres kept behind the target. */
  trail_distance?: number

  /** Degrees within which the tail counts as held. `30` in all 4. */
  trail_lock_cone_angle?: number

  /** Seconds before breaking off. `0.5` in all 4. */
  trail_break_time?: number
  trail_max_turn_throttle?: number

  /** Seconds without a lock before giving up. */
  trail_min_no_lock_time?: number
  trail_break_roll_throttle?: number

  /** Afterburn out of the break. */
  trail_break_afterburner?: boolean
}

/** `[StrafeBlock]` — 5. */
export interface StrafeBlock extends Block {
  type: 'strafeblock'

  /** Metres of separation that ends the run. */
  strafe_run_away_distance?: number

  /** `1` in all 5. */
  strafe_attack_throttle?: number

  /** One retail occurrence. */
  strafe_turn_throttle?: number
}

/** `[EngineKillBlock]` — 3. Cut engines, coast, and turn to face. */
export interface EngineKillBlock extends Block {
  type: 'enginekillblock'

  /** Seconds spent drifting while looking. */
  engine_kill_search_time?: number

  /** Seconds spent turning to face. */
  engine_kill_face_time?: number

  /** `False` in all 3. */
  engine_kill_use_afterburner?: boolean
  engine_kill_afterburner_time?: number

  /** Metres beyond which it will not attempt this. */
  engine_kill_max_target_distance?: number
}

/**
 * `[MineBlock]` — 3. **No wiki page.**
 *
 * Note `mine_launch_interval` breaks the module's `_time` convention and carries no suffix.
 */
export interface MineBlock extends Block {
  type: 'mineblock'

  /** Seconds between drops. `10` in all 3. */
  mine_launch_interval?: number

  /** Degrees behind which the pursuer must be. `30` in all 3. */
  mine_launch_cone_angle?: number

  /** Metres. `250` in all 3. */
  mine_launch_range?: number
}

/**
 * `[RepairBlock]` — 6.
 *
 * The nicknames say what the block does — `repair_fighter_never`, `_hull`, `_shield`, `_both` — and
 * the zeroed fields in `repair_fighter_never` are how "never" is authored.
 */
export interface RepairBlock extends Block {
  type: 'repairblock'

  /** Shield fraction at which a battery is used, and the delays either side. */
  use_shield_repair_at_damage_percent?: number
  use_shield_repair_pre_delay?: number
  use_shield_repair_post_delay?: number

  /** Hull fraction at which a kit is used, and the delays either side. */
  use_hull_repair_at_damage_percent?: number
  use_hull_repair_pre_delay?: number
  use_hull_repair_post_delay?: number
}

/**
 * `[MetaBehavior]` — 6, in `MISSIONS/M02`, `M08` and `M10`. **No wiki page.**
 *
 * The one section here that is not a pilot block: a scripted movement a mission hands to a ship.
 * `MB_GotoGuide` is **deliberately not decoded** — eight positional values with one sample each is
 * not enough to read, and a guessed reading would be a value the game could disagree with. It is
 * kept as raw values, and it round-trips either way.
 */
export interface MetaBehavior extends Block {
  type: 'metabehavior'

  /** A target name followed by seven numbers. Undecoded, and kept exactly as read. */
  MB_GotoGuide?: (string | number | boolean)[]
}

/** A section inside a pilot file this module has no arm for. Kept whole. */
export interface UnknownBlock extends Block {
  type: string
}

/** Every block kind, discriminated by section name. */
export type AnyBlock =
  | GunBlock
  | JobBlock
  | EvadeDodgeBlock
  | EvadeBreakBlock
  | BuzzHeadTowardBlock
  | BuzzPassByBlock
  | MissileBlock
  | MissileReactionBlock
  | DamageReactionBlock
  | FormationBlock
  | CountermeasureBlock
  | TrailBlock
  | StrafeBlock
  | EngineKillBlock
  | MineBlock
  | RepairBlock
  | MetaBehavior
  | UnknownBlock
