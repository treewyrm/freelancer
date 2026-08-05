import type { Document, Section } from '#/ini/types.js'
import { equals as sameName, fold } from '#/utility/string.js'
import { boolean, list, number, numbers, rest, text, tuple } from './field.js'
import type { Action, Fuse } from './types.js'

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

/** Shared by every action arm. */
const TIMED = ['at_t']

const readAction = (section: Section): Action => {
  const type = fold(section.name)
  const known = [...TIMED]

  const action = { type } as Action

  const at = numbers(section, 'at_t')

  // Arity as read: one value or two, and never padded to a fixed width.
  if (at && (at.length === 1 || at.length === 2)) action.at_t = at as [number] | [number, number]

  const scalar = (name: string, into: string) => {
    known.push(name)
    const value = text(section, name)
    if (value !== undefined) Reflect.set(action, into, value)
  }

  const numeric = (name: string, into: string) => {
    known.push(name)
    const value = number(section, name)
    if (value !== undefined) Reflect.set(action, into, value)
  }

  const flag = (name: string, into: string) => {
    known.push(name)
    const value = boolean(section, name)
    if (value !== undefined) Reflect.set(action, into, value)
  }

  const triplet = (name: string) => {
    known.push(name)
    const value = tuple(section, name, 3)
    if (value) Reflect.set(action, name, value)
  }

  const pair = (name: string) => {
    known.push(name)
    const value = tuple(section, name, 2)
    if (value) Reflect.set(action, name, value)
  }

  const repeated = (name: string) => {
    known.push(name)
    const value = list(section, name)
    if (value) Reflect.set(action, name, value)
  }

  switch (type) {
    case 'start_effect':
      scalar('effect', 'effect')
      repeated('hardpoint')
      flag('attached', 'attached')
      triplet('pos_offset')
      triplet('ori_offset')
      break

    case 'destroy_group':
      scalar('group_name', 'group_name')
      scalar('fate', 'fate')
      break

    case 'destroy_hp_attachment':
      scalar('hardpoint', 'hardpoint')
      scalar('fate', 'fate')
      break

    case 'destroy_root':
      break

    case 'ignite_fuse':
      scalar('fuse', 'fuse')
      numeric('fuse_t', 'fuse_t')
      break

    case 'damage_group':
      scalar('group_name', 'group_name')
      scalar('damage_type', 'damage_type')
      numeric('hitpoints', 'hitpoints')
      break

    case 'damage_root':
      scalar('damage_type', 'damage_type')
      numeric('hitpoints', 'hitpoints')
      break

    case 'impulse':
      scalar('hardpoint', 'hardpoint')
      numeric('radius', 'radius')
      numeric('force', 'force')
      numeric('damage', 'damage')
      triplet('pos_offset')
      break

    case 'start_cam_particles':
      scalar('effect', 'effect')
      triplet('pos_offset')
      triplet('ori_offset')
      break

    case 'tumble':
      numeric('ang_drag_scale', 'ang_drag_scale')
      pair('turn_throttle_x')
      pair('turn_throttle_y')
      pair('turn_throttle_z')
      pair('throttle')
      break

    case 'dump_cargo':
      scalar('origin_hardpoint', 'origin_hardpoint')
      break

    case 'make_invincible':
      flag('turn_on', 'turn_on')
      break

    // A thirteenth kind from a mod. Everything it carries lands in `unrecognized`.
    default:
      break
  }

  return { ...action, ...rest(section, known) }
}

const readFuse = (section: Section, actions: Section[]): Fuse => {
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
    actions: actions.map(readAction),
    ...rest(section, FUSE),
  }
}

/**
 * Every fuse script in a document, in file order, each with its actions in firing order.
 *
 * @param document Sections of one `fuse*.ini`.
 * @throws RangeError when a section precedes the first `[fuse]`, which no retail file does — the
 * sections would have no owner and silently dropping them is how a mod loses its death sequence.
 */
export function* readFuses(document: Document): Generator<Fuse> {
  let opener: Section | undefined
  let actions: Section[] = []

  for (const section of document) {
    if (!sameName(section.name, OPENER)) {
      if (!opener)
        throw new RangeError(`Section [${section.name}] appears before the first [${OPENER}]`)

      actions.push(section)
      continue
    }

    if (opener) yield readFuse(opener, actions)

    opener = section
    actions = []
  }

  if (opener) yield readFuse(opener, actions)
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
