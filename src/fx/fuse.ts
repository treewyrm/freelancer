import type { Document, Section } from '#/ini/types.js'
import { from, toFloat } from '#/ini/value.js'
import { fold } from '#/utility/string.js'
import { runs } from '#/schema/document.js'
import { boolean, number, numbers, rest, text } from '#/schema/field.js'
import { fields, readSection, type Instruction, type Table } from '#/schema/property.js'
import type { Report } from '#/schema/types.js'
import type {
  Action,
  DamageGroup,
  DamageRoot,
  DestroyGroup,
  DestroyHardpointAttachment,
  DumpCargo,
  Fuse,
  IgniteFuse,
  Impulse,
  MakeInvincible,
  StartCameraParticles,
  StartEffect,
  Tumble,
} from './types.js'

/**
 * Fuse scripts — the one thing in this data that is a sequence rather than a record.
 *
 * A fuse is what runs when something is damaged or destroyed: effects start at hardpoints, groups
 * and attachments come off, an impulse pushes the debris, and another fuse may be lit partway
 * through. It is written as **a `[fuse]` section followed by a run of action sections, one per
 * event, until the next `[fuse]`**. Nothing links them but position — no nickname, no index, no
 * count — so a reader that treats sections as independent records reads 1,960 orphaned actions and
 * loses every script in the game.
 *
 * The corpus says the grouping is total and safe to rely on. Across the 17 `FX/fuse*.ini` files:
 * **209 `[fuse]` sections, 1,960 actions, and zero actions before the first `[fuse]`.** A run always
 * has an owner, so there is no orphan case to invent a policy for.
 *
 * Two things a naive reading gets wrong, both measured:
 *
 * - **`at_t` is not universal.** 1,921 of the 1,960 actions carry one; 38 `[start_effect]` and the
 *   single `[make_invincible]` do not. Making it required invents a zero for 39 events.
 * - **`at_t` is not always one number.** 17 actions carry two, and the second is not an end time —
 *   see the TODO in [FX.md](../../docs/FX.md). Arity is kept exactly as read, so the round trip
 *   cannot invent or drop a value, and {@link timeOf} is how a consumer collapses it.
 *
 * `[fuse]` also identifies itself by **`name`**, where every other archetype in the data uses
 * `nickname`. `getNickname` already takes the property name as a parameter, so nothing new is needed
 * — but a lookup that assumes `nickname` finds no fuses at all.
 *
 * This module is a generator over the document rather than an index, because order *is* the meaning
 * here. A caller that wants a lookup builds one from what this yields; a caller handed a lookup
 * cannot get the order back.
 */

/** Section name that opens a script. Lowercase in all 209 retail occurrences. */
const OPENER = 'fuse'

const FUSE = ['name', 'lifetime', 'death_fuse', 'lodranges']

/**
 * `at_t`, shared by every arm.
 *
 * Written by hand rather than as `numbers`, because the field is a **one-or-two** union and anything
 * else is not it: three retail actions carry a third value, and widening the type to `number[]` to
 * hold them would make every consumer check a length the type had already promised. A wrong arity is
 * reported and left out, and `unrecognized` still does not claim it — the property was read.
 */
const at_t: Instruction<Action> = {
  into: 'at_t',
  read(draft, values, report) {
    const at = values.map(toFloat)

    if (at.length !== 1 && at.length !== 2) {
      report?.(`at_t: expected 1 or 2 values, found ${at.length}`)
      return true
    }

    draft.at_t = at as [number] | [number, number]
    return true
  },
  write(properties, value, name) {
    if (value.at_t) properties.push({ name, values: value.at_t.map(from) })
  },
}

const start = fields<StartEffect>()
const group = fields<DestroyGroup>()
const attachment = fields<DestroyHardpointAttachment>()
const ignite = fields<IgniteFuse>()
const damageGroup = fields<DamageGroup>()
const damageRoot = fields<DamageRoot>()
const impulse = fields<Impulse>()
const camera = fields<StartCameraParticles>()
const tumble = fields<Tumble>()
const cargo = fields<DumpCargo>()
const invincible = fields<MakeInvincible>()

/**
 * One table per action kind, keyed by the folded section name.
 *
 * The twelve arms of a `switch` that used to build six closures per section and push every name it
 * touched onto a `known: string[]`. The field names are checked against the interfaces in
 * `./types.ts` now, and what the reader did not take is derived from the walk.
 *
 * A thirteenth kind from a mod finds no table: everything it carries lands in `unrecognized`.
 */
const TABLES = {
  start_effect: {
    effect: start.text('effect'),
    hardpoint: start.merge('hardpoint'),
    attached: start.boolean('attached'),
    pos_offset: start.tuple(3, 'pos_offset'),
    ori_offset: start.tuple(3, 'ori_offset'),
  } satisfies Table<StartEffect>,

  destroy_group: {
    group_name: group.text('group_name'),
    fate: group.text('fate'),
  } satisfies Table<DestroyGroup>,

  destroy_hp_attachment: {
    hardpoint: attachment.text('hardpoint'),
    fate: attachment.text('fate'),
  } satisfies Table<DestroyHardpointAttachment>,

  destroy_root: {},

  ignite_fuse: {
    fuse: ignite.text('fuse'),
    fuse_t: ignite.number('fuse_t'),
  } satisfies Table<IgniteFuse>,

  damage_group: {
    group_name: damageGroup.text('group_name'),
    damage_type: damageGroup.text('damage_type'),
    hitpoints: damageGroup.number('hitpoints'),
  } satisfies Table<DamageGroup>,

  damage_root: {
    damage_type: damageRoot.text('damage_type'),
    hitpoints: damageRoot.number('hitpoints'),
  } satisfies Table<DamageRoot>,

  impulse: {
    hardpoint: impulse.text('hardpoint'),
    radius: impulse.number('radius'),
    force: impulse.number('force'),
    damage: impulse.number('damage'),
    pos_offset: impulse.tuple(3, 'pos_offset'),
  } satisfies Table<Impulse>,

  start_cam_particles: {
    effect: camera.text('effect'),
    pos_offset: camera.tuple(3, 'pos_offset'),
    ori_offset: camera.tuple(3, 'ori_offset'),
  } satisfies Table<StartCameraParticles>,

  tumble: {
    ang_drag_scale: tumble.number('ang_drag_scale'),
    turn_throttle_x: tumble.tuple(2, 'turn_throttle_x'),
    turn_throttle_y: tumble.tuple(2, 'turn_throttle_y'),
    turn_throttle_z: tumble.tuple(2, 'turn_throttle_z'),
    throttle: tumble.tuple(2, 'throttle'),
  } satisfies Table<Tumble>,

  dump_cargo: {
    origin_hardpoint: cargo.text('origin_hardpoint'),
  } satisfies Table<DumpCargo>,

  make_invincible: {
    turn_on: invincible.boolean('turn_on'),
  } satisfies Table<MakeInvincible>,
} as Readonly<Record<string, Table<Action>>>

const readAction = (section: Section, report?: Report): Action => {
  const type = fold(section.name)
  const table: Table<Action> = { at_t, ...TABLES[type] }

  return { ...readSection<Action>(section, table, report), type } as Action
}

const readFuse = (section: Section, actions: Section[], report?: Report): Fuse => {
  const name = text(section, 'name')
  if (name === undefined) throw new RangeError('[fuse] has no name')

  const lifetime = number(section, 'lifetime')
  if (lifetime === undefined) throw new RangeError(`[fuse] '${name}' has no lifetime`)

  const death_fuse = boolean(section, 'death_fuse')
  const lodranges = numbers(section, 'lodranges')

  return {
    name,
    lifetime,
    ...(death_fuse !== undefined && { death_fuse }),
    ...(lodranges && { lodranges }),
    actions: actions.map((action) => readAction(action, report)),
    ...rest(section, FUSE),
  }
}

/**
 * Every fuse script in a document, in file order, each with its actions in firing order.
 *
 * @param document Sections of one `fuse*.ini`.
 * @param report Optional diagnostics — see {@link Report}.
 * @throws RangeError when a section precedes the first `[fuse]`, which no retail file does — the
 * sections would have no owner and silently dropping them is how a mod loses its death sequence.
 */
export function* readFuses(document: Document, report?: Report): Generator<Fuse> {
  for (const { opener, members } of runs(document, [OPENER], { orphans: 'throw' }))
    yield readFuse(opener, members, report)
}

/**
 * The moment an action fires, collapsing a two-value `at_t` to one number.
 *
 * The two-value form is a range the game picks a moment from, so collapsing it needs a choice this
 * library will not make on a consumer's behalf — Invariant 5, and a viewer that scrubs a timeline
 * needs the choice to be reproducible rather than fresh on every frame. Hence the injected picker.
 *
 * @param action Action to time.
 * @param pick Chooses within an inclusive range. Pass `(min, max) => min` for the earliest moment,
 * or a seeded generator to reproduce a sequence.
 * @returns The moment, or `undefined` for the 39 retail actions that carry no `at_t`.
 */
export const timeOf = (
  action: Action,
  pick: (min: number, max: number) => number,
): number | undefined => {
  const at = action.at_t
  if (!at) return undefined

  const [min, max] = at
  return max === undefined ? min : pick(min, max)
}
