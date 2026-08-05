import type { Document, Section } from '#/ini/types.js'
import { from } from '#/ini/value.js'
import { fold } from '#/utility/string.js'
import { field, fields, readSection } from '#/schema/index.js'
import type { Fields, Instruction, Table } from '#/schema/property.js'
import type { Keys, Report } from '#/schema/types.js'
import type {
  AnyBlock,
  AttackPreference,
  Block,
  BuzzHeadTowardBlock,
  BuzzPassByBlock,
  CountermeasureBlock,
  DamageReactionBlock,
  EngineKillBlock,
  EvadeBreakBlock,
  EvadeDodgeBlock,
  FormationBlock,
  GunBlock,
  JobBlock,
  MetaBehavior,
  MineBlock,
  MissileBlock,
  MissileReactionBlock,
  RepairBlock,
  StrafeBlock,
  TrailBlock,
  Weighted,
} from './types.js'

/**
 * The seventeen behaviour blocks, read from one table per kind.
 *
 * The blocks are the reason [MODULES.md](../../docs/MODULES.md) calls this the module to prove the
 * typed layer on: seventeen sections, one repeated shape, 187 fields between them and almost all of
 * them plain numbers. Writing seventeen hand-rolled readers would be seventeen copies of the same
 * three lines, so the field lists are data and one walk runs them.
 *
 * That is **not** a retreat to the runtime schema [SCHEMA.md](../../docs/SCHEMA.md) rejected. The
 * tables below declare nothing but which of four kinds each name is; they infer no types, validate
 * nothing, and the TypeScript types in `./types.ts` are still written by hand and are still the
 * contract. What changed when `#/schema/property.js` arrived is that the field names are now checked
 * against those types — {@link of} takes `keyof T`, so a name that is not a field of the block it is
 * listed under does not compile — and that `unrecognized` is derived from the walk rather than
 * accumulated by hand into a `known: string[]` nothing verified.
 *
 * Three things the tables encode that a reader has to get right:
 *
 * - **The weighted fields are mixed tuples** — `waggle, 0.5` — and repeat, once per option. They are
 *   {@link Fields.each}, not a flat list, because flattening loses which weight went with which name.
 * - **`attack_preference` repeats too**, 262 times over 59 sections, and each repeat is a record of
 *   three differently-typed positions.
 * - **`MB_GotoGuide` is not decoded.** Eight positional values, six sections, one sample each: kept
 *   as raw values so the round trip cannot lose them and no guess is baked in. It is the one field
 *   here with no constructor for its shape, and is written as a plain {@link Instruction} — which is
 *   what that interface is for.
 *
 * Reading is **last-wins** for a singular field, because the game re-runs the instruction. No field
 * on any of these seventeen sections repeats anywhere in retail, so this is a no-op for `./ai` and
 * the corpus suite says so.
 */

/**
 * Instructions for a list of names read the same way.
 *
 * Every one of the 187 fields here is written in the file under its own name, so the table key and
 * the field are the same string and the lists stay lists. `./fx` cannot do this — its actions rename
 * as they read — which is why this lives here rather than in `#/schema`.
 */
const of = <T, K extends Extract<keyof T, string>>(
  names: readonly K[],
  make: (into: K) => Instruction<T>,
): Table<T> => Object.fromEntries(names.map((name) => [name, make(name)]))

/**
 * `name, weight` — one row per occurrence, which is how every style and direction option is written.
 *
 * Flattening these would lose which weight went with which name, so they are one record each rather
 * than one list.
 */
const weighted = <T, K extends Keys<T, readonly Weighted[]>>(
  f: Fields<T>,
  into: K,
): Instruction<T> =>
  f.each<Weighted, K>(
    into,
    (values) => {
      const [name, share] = field.values(values, 'sn')

      // A row with no name is nothing to weight; drop it rather than invent an empty option.
      if (typeof name !== 'string') return undefined

      return { name, ...(typeof share === 'number' && { weight: share }) }
    },
    ({ name, weight }) => (weight === undefined ? [from(name)] : [from(name), from(weight)]),
  )

const gun = fields<GunBlock>()
const GUNBLOCK: Table<GunBlock> = {
  nickname: gun.text('nickname'),
  ...of(
    [
      'gun_fire_interval_time',
      'gun_fire_interval_variance_percent',
      'gun_fire_burst_interval_time',
      'gun_fire_burst_interval_variance_percent',
      'gun_fire_no_burst_interval_time',
      'gun_fire_accuracy_cone_angle',
      'gun_fire_accuracy_power',
      'gun_fire_accuracy_power_npc',
      'gun_range_threshold',
      'gun_range_threshold_variance_percent',
      'gun_target_point_switch_time',
      'auto_turret_interval_time',
      'auto_turret_burst_interval_time',
      'auto_turret_burst_interval_variance_percent',
      'auto_turret_no_burst_interval_time',
    ],
    gun.number,
  ),
  ...of(['fire_style'], gun.text),
}

const job = fields<JobBlock>()
const JOBBLOCK: Table<JobBlock> = {
  nickname: job.text('nickname'),
  ...of(
    [
      'maximum_leader_target_distance',
      'flee_when_hull_damaged_percent',
      'combat_drift_distance',
    ],
    job.number,
  ),
  ...of(
    [
      'wait_for_leader_target',
      'flee_when_leader_flees_style',
      'flee_no_weapons_style',
      'force_attack_formation',
      'allow_player_targeting',
    ],
    job.boolean,
  ),
  ...of(
    [
      'flee_scene_threat_style',
      'scene_toughness_threshold',
      'loot_flee_threshold',
      'loot_preference',
      'attack_subtarget_order',
      'field_targeting',
    ],
    job.text,
  ),
  attack_preference: job.each<AttackPreference, 'attack_preference'>(
    'attack_preference',
    (values) => {
      const [target, weight, flags] = field.values(values, 'sns')

      if (typeof target !== 'string') return undefined

      return {
        target,
        ...(typeof weight === 'number' && { weight }),
        ...(typeof flags === 'string' && { flags }),
      }
    },
    ({ target, weight, flags }) => [
      from(target),
      ...(weight === undefined ? [] : [from(weight)]),
      ...(flags === undefined ? [] : [from(flags)]),
    ],
  ),
}

const dodge = fields<EvadeDodgeBlock>()
const EVADEDODGEBLOCK: Table<EvadeDodgeBlock> = {
  nickname: dodge.text('nickname'),
  ...of(
    [
      'evade_activate_range',
      'evade_dodge_cone_angle',
      'evade_dodge_cone_angle_variance_percent',
      'evade_dodge_interval_time',
      'evade_dodge_interval_time_variance_percent',
      'evade_dodge_time',
      'evade_dodge_distance',
      'evade_dodge_turn_throttle',
      'evade_dodge_slide_throttle',
      'evade_dodge_roll_angle',
      'evade_dodge_waggle_axis_cone_angle',
      'evade_dodge_corkscrew_turn_throttle',
      'evade_dodge_corkscrew_roll_throttle',
    ],
    dodge.number,
  ),
  ...of(['evade_dodge_corkscrew_roll_flip_direction'], dodge.boolean),
  evade_dodge_style_weight: weighted(dodge, 'evade_dodge_style_weight'),
  evade_dodge_direction_weight: weighted(dodge, 'evade_dodge_direction_weight'),
}

const brk = fields<EvadeBreakBlock>()
const EVADEBREAKBLOCK: Table<EvadeBreakBlock> = {
  nickname: brk.text('nickname'),
  ...of(
    [
      'evade_break_time',
      'evade_break_interval_time',
      'evade_break_roll_throttle',
      'evade_break_turn_throttle',
      'evade_break_afterburner_delay',
      'evade_break_afterburner_delay_variance_percent',
      'evade_break_attempt_reverse_time',
      'evade_break_reverse_distance',
    ],
    brk.number,
  ),
  evade_break_style_weight: weighted(brk, 'evade_break_style_weight'),
  evade_break_direction_weight: weighted(brk, 'evade_break_direction_weight'),
}

const toward = fields<BuzzHeadTowardBlock>()
const BUZZHEADTOWARDBLOCK: Table<BuzzHeadTowardBlock> = {
  nickname: toward.text('nickname'),
  ...of(
    [
      'buzz_min_distance_to_head_toward',
      'buzz_min_distance_to_head_toward_variance_percent',
      'buzz_max_time_to_head_away',
      'buzz_head_toward_engine_throttle',
      'buzz_head_toward_turn_throttle',
      'buzz_head_toward_roll_throttle',
      'buzz_dodge_turn_throttle',
      'buzz_dodge_cone_angle',
      'buzz_dodge_cone_angle_variance_percent',
      'buzz_dodge_waggle_axis_cone_angle',
      'buzz_dodge_roll_angle',
      'buzz_dodge_interval_time',
      'buzz_dodge_interval_time_variance_percent',
      'buzz_slide_throttle',
      'buzz_slide_interval_time',
      'buzz_slide_interval_time_variance_percent',
    ],
    toward.number,
  ),
  ...of(['buzz_head_toward_roll_flip_direction'], toward.boolean),
  buzz_head_toward_style_weight: weighted(toward, 'buzz_head_toward_style_weight'),
  buzz_dodge_direction_weight: weighted(toward, 'buzz_dodge_direction_weight'),
}

const pass = fields<BuzzPassByBlock>()
const BUZZPASSBYBLOCK: Table<BuzzPassByBlock> = {
  nickname: pass.text('nickname'),
  ...of(
    [
      'buzz_distance_to_pass_by',
      'buzz_pass_by_time',
      'buzz_break_direction_cone_angle',
      'buzz_break_turn_throttle',
      'buzz_pass_by_roll_throttle',
    ],
    pass.number,
  ),
  ...of(['buzz_drop_bomb_on_pass_by'], pass.boolean),
  buzz_pass_by_style_weight: weighted(pass, 'buzz_pass_by_style_weight'),
  buzz_break_direction_weight: weighted(pass, 'buzz_break_direction_weight'),
}

const missile = fields<MissileBlock>()
const MISSILEBLOCK: Table<MissileBlock> = {
  nickname: missile.text('nickname'),
  ...of(
    [
      'missile_launch_interval_time',
      'missile_launch_interval_variance_percent',
      'missile_launch_range',
      'missile_launch_cone_angle',
    ],
    missile.number,
  ),
  ...of(['missile_launch_allow_out_of_range'], missile.boolean),
}

const reaction = fields<MissileReactionBlock>()
const MISSILEREACTIONBLOCK: Table<MissileReactionBlock> = {
  nickname: reaction.text('nickname'),
  ...of(
    [
      'evade_missile_distance',
      'evade_break_missile_reaction_time',
      'evade_slide_missile_reaction_time',
      'evade_afterburn_missile_reaction_time',
    ],
    reaction.number,
  ),
}

const damage = fields<DamageReactionBlock>()
const DAMAGEREACTIONBLOCK: Table<DamageReactionBlock> = {
  nickname: damage.text('nickname'),
  ...of(
    [
      'evade_break_damage_trigger_percent',
      'evade_dodge_more_damage_trigger_percent',
      'engine_kill_face_damage_trigger_percent',
      'engine_kill_face_damage_trigger_time',
      'roll_damage_trigger_percent',
      'roll_damage_trigger_time',
      'afterburner_damage_trigger_percent',
      'afterburner_damage_trigger_time',
      'brake_reverse_damage_trigger_percent',
      'drop_mines_damage_trigger_percent',
      'drop_mines_damage_trigger_time',
      'fire_guns_damage_trigger_percent',
      'fire_guns_damage_trigger_time',
      'fire_missiles_damage_trigger_percent',
      'fire_missiles_damage_trigger_time',
    ],
    damage.number,
  ),
}

const formation = fields<FormationBlock>()
const FORMATIONBLOCK: Table<FormationBlock> = {
  nickname: formation.text('nickname'),
  ...of(
    [
      'force_attack_formation_active_time',
      'force_attack_formation_unactive_time',
      'break_formation_damage_trigger_percent',
      'break_formation_damage_trigger_time',
      'break_formation_missile_reaction_time',
      'break_apart_formation_missile_reaction_time',
      'break_formation_on_evade_break_time',
      'formation_exit_top_turn_break_away_throttle',
      'formation_exit_roll_outrun_throttle',
      'formation_exit_max_time',
    ],
    formation.number,
  ),
  ...of(['break_apart_formation_on_evade_break'], formation.boolean),
}

const counter = fields<CountermeasureBlock>()
const COUNTERMEASUREBLOCK: Table<CountermeasureBlock> = {
  nickname: counter.text('nickname'),
  ...of(['countermeasure_active_time', 'countermeasure_unactive_time'], counter.number),
}

const trail = fields<TrailBlock>()
const TRAILBLOCK: Table<TrailBlock> = {
  nickname: trail.text('nickname'),
  ...of(
    [
      'trail_distance',
      'trail_lock_cone_angle',
      'trail_break_time',
      'trail_max_turn_throttle',
      'trail_min_no_lock_time',
      'trail_break_roll_throttle',
    ],
    trail.number,
  ),
  ...of(['trail_break_afterburner'], trail.boolean),
}

const strafe = fields<StrafeBlock>()
const STRAFEBLOCK: Table<StrafeBlock> = {
  nickname: strafe.text('nickname'),
  ...of(
    ['strafe_run_away_distance', 'strafe_attack_throttle', 'strafe_turn_throttle'],
    strafe.number,
  ),
}

const kill = fields<EngineKillBlock>()
const ENGINEKILLBLOCK: Table<EngineKillBlock> = {
  nickname: kill.text('nickname'),
  ...of(
    [
      'engine_kill_search_time',
      'engine_kill_face_time',
      'engine_kill_afterburner_time',
      'engine_kill_max_target_distance',
    ],
    kill.number,
  ),
  ...of(['engine_kill_use_afterburner'], kill.boolean),
}

const mine = fields<MineBlock>()
const MINEBLOCK: Table<MineBlock> = {
  nickname: mine.text('nickname'),
  ...of(['mine_launch_interval', 'mine_launch_cone_angle', 'mine_launch_range'], mine.number),
}

const repair = fields<RepairBlock>()
const REPAIRBLOCK: Table<RepairBlock> = {
  nickname: repair.text('nickname'),
  ...of(
    [
      'use_shield_repair_at_damage_percent',
      'use_shield_repair_pre_delay',
      'use_shield_repair_post_delay',
      'use_hull_repair_at_damage_percent',
      'use_hull_repair_pre_delay',
      'use_hull_repair_post_delay',
    ],
    repair.number,
  ),
}

const meta = fields<MetaBehavior>()

/**
 * `MB_GotoGuide`, undecoded.
 *
 * Eight positional values with one sample each is not enough to read, so the values are kept as the
 * primitives they were written as and nothing here claims what any position means. Written by hand
 * because no constructor has this shape — one occurrence, arity as read, types unexamined — and
 * because {@link Instruction} being a plain interface is what makes that possible without adding a
 * constructor no other field wants.
 */
const gotoGuide: Instruction<MetaBehavior> = {
  into: 'MB_GotoGuide',
  read(draft, values) {
    draft.MB_GotoGuide = values.map(({ value }) => value)
    return true
  },
  write(properties, value, name) {
    if (value.MB_GotoGuide) properties.push({ name, values: value.MB_GotoGuide.map(from) })
  },
}

const METABEHAVIOR: Table<MetaBehavior> = {
  nickname: meta.text('nickname'),
  MB_GotoGuide: gotoGuide,
}

/**
 * Section name, folded, to the table that reads it.
 *
 * Each table is written against its own block interface, which is what checks the field names; they
 * are collected here as `Table<Block>` because the dispatch is by a string out of a file and no
 * single type covers all seventeen.
 */
const TABLES = {
  gunblock: GUNBLOCK,
  jobblock: JOBBLOCK,
  evadedodgeblock: EVADEDODGEBLOCK,
  evadebreakblock: EVADEBREAKBLOCK,
  buzzheadtowardblock: BUZZHEADTOWARDBLOCK,
  buzzpassbyblock: BUZZPASSBYBLOCK,
  missileblock: MISSILEBLOCK,
  missilereactionblock: MISSILEREACTIONBLOCK,
  damagereactionblock: DAMAGEREACTIONBLOCK,
  formationblock: FORMATIONBLOCK,
  countermeasureblock: COUNTERMEASUREBLOCK,
  trailblock: TRAILBLOCK,
  strafeblock: STRAFEBLOCK,
  enginekillblock: ENGINEKILLBLOCK,
  mineblock: MINEBLOCK,
  repairblock: REPAIRBLOCK,
  metabehavior: METABEHAVIOR,
} as Readonly<Record<string, Table<Block>>>

/** Every section name this module reads, folded. `[Pilot]` is `pilot.ts`'s. */
export const BLOCK_SECTIONS: readonly string[] = Object.keys(TABLES)

/**
 * Reads one behaviour block.
 *
 * A section name with no table yields an {@link UnknownBlock} with every
 * property in `unrecognized`, which is how a mod's eighteenth block survives.
 *
 * @param section The section.
 * @param report Optional diagnostics — see {@link Report}.
 * @throws RangeError when the section has no `nickname`, since a `[Pilot]` could not name it.
 */
export const readBlock = (section: Section, report?: Report): AnyBlock => {
  const type = fold(section.name)

  const nickname = field.text(section, 'nickname')
  if (nickname === undefined) throw new RangeError(`[${section.name}] has no nickname`)

  const read = readSection<Block>(section, TABLES[type] ?? {}, report)

  return { ...read, type, nickname } as AnyBlock
}

/**
 * Every behaviour block in a document, in file order.
 *
 * Order is kept because it is what the file says, not because anything depends on it — unlike
 * `./fx`'s fuse actions, nothing here is positional. A caller that wants a lookup builds one.
 */
export function* readBlocks(document: Document, report?: Report): Generator<AnyBlock> {
  for (const section of document) if (TABLES[fold(section.name)]) yield readBlock(section, report)
}
