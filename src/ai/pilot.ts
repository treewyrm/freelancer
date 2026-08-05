import type { Document, Section } from '#/ini/types.js'
import { filterSections } from '#/ini/section.js'
import { field, fields, readSection } from '#/schema/index.js'
import type { Report } from '#/schema/types.js'
import type { Pilot } from './types.js'

/**
 * `[Pilot]` — the record that names one of each behaviour block.
 *
 * Every field but `nickname` is a nickname of a block, and every one is optional: 290 of the 319
 * pilots carry `inherit` and little else, taking the rest from the pilot they name. Resolution is
 * the consumer's — this yields what the file says and does not follow `inherit`, because how deep to
 * follow it and what to do about a cycle are policy (Invariant 6). {@link inheritanceOf} exists so a
 * consumer does not have to rediscover the chain.
 *
 * **`CHARACTERS/newcharacter.ini` also has a `[Pilot]`**, and it is a different section sharing the
 * name: `body`, `comm`, `voice`, `body.anim`, `thumb`, `comm.anim`, sharing only `nickname` with
 * this one. See [DICTIONARY.md](../../docs/DICTIONARY.md#one-section-two-shapes-split-by-file). It
 * is not filtered out here, because the section alone does not say which file it came from and
 * guessing from the property set would be a policy. It reads as a `Pilot` with every block field
 * absent and its six real properties in `unrecognized`, which round-trips exactly and is easy for a
 * caller to recognize — {@link isBehaviour} is that test.
 */

/** The seventeen block references, in the order this module writes them back. */
const BLOCKS = [
  'gun_id',
  'job_id',
  'evade_dodge_id',
  'evade_break_id',
  'missile_id',
  'missile_reaction_id',
  'buzz_head_toward_id',
  'buzz_pass_by_id',
  'trail_id',
  'strafe_id',
  'engine_kill_id',
  'mine_id',
  'countermeasure_id',
  'damage_reaction_id',
  'formation_id',
  'repair_id',
] as const

const f = fields<Pilot>()

/**
 * Every field this reads, and the order it writes them back in.
 *
 * All eighteen are one value of text, so the table is the field list with a constructor applied —
 * and unlike the `KNOWN` array it replaces, a name that is not a field of {@link Pilot} does not
 * compile, and what is left over is derived from the walk rather than kept in step by hand.
 */
const TABLE = Object.fromEntries(
  ['nickname', 'inherit', ...BLOCKS].map((name) => [name, f.text(name as 'nickname')]),
)

/**
 * Reads one `[Pilot]`.
 *
 * @param section The section.
 * @param report Optional diagnostics — see {@link Report}.
 * @throws RangeError when the section has no `nickname`, since nothing could reference it.
 */
export const readPilot = (section: Section, report?: Report): Pilot => {
  const nickname = field.text(section, 'nickname')
  if (nickname === undefined) throw new RangeError('[Pilot] has no nickname')

  return { ...readSection<Pilot>(section, TABLE, report), nickname }
}

/** Every `[Pilot]` in a document, in file order. */
export function* readPilots(document: Document, report?: Report): Generator<Pilot> {
  for (const section of filterSections(document, 'Pilot')) yield readPilot(section, report)
}

/**
 * Whether a `[Pilot]` is a behaviour pilot rather than the new-character record.
 *
 * True when it names any block or inherits from another pilot — which every one of the 319 in
 * `MISSIONS/pilots_*.ini` does, and the one in `CHARACTERS/newcharacter.ini` does not.
 */
export const isBehaviour = (pilot: Pilot): boolean =>
  pilot.inherit !== undefined || BLOCKS.some((name) => pilot[name] !== undefined)

/**
 * The `inherit` chain from a pilot outward, nearest first, stopping at a cycle or a dead reference.
 *
 * Resolution *policy* stays with the consumer — this only walks. Which field wins when two pilots in
 * the chain set it is the caller's to decide, and the chain is yielded rather than merged for that
 * reason.
 *
 * @param pilot Where to start. Not yielded.
 * @param pilots Every pilot by nickname, folded however the caller folds.
 */
export function* inheritanceOf(
  pilot: Pilot,
  pilots: ReadonlyMap<string, Pilot>,
): Generator<Pilot> {
  const seen = new Set<Pilot>([pilot])

  let current = pilot.inherit === undefined ? undefined : pilots.get(pilot.inherit)

  while (current !== undefined && !seen.has(current)) {
    seen.add(current)
    yield current
    current = current.inherit === undefined ? undefined : pilots.get(current.inherit)
  }
}
