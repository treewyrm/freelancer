/**
 * Pilots: what an NPC does in a fight, and the blocks that spell it out.
 *
 * The second domain module over INI, and the first written from
 * [DICTIONARY.md](../../docs/DICTIONARY.md) rather than from the files. That is the whole point of
 * that document — `types.ts` here is a transcription of its `./ai` tables, and where the two
 * disagree the dictionary was wrong and gets fixed.
 *
 * `MISSIONS/pilots_population.ini` and `pilots_story.ini` hold all of it but `[MetaBehavior]`, which
 * is in three story mission files. **319 `[Pilot]` sections naming 17 kinds of block**, no nesting,
 * no cross-file references and no positional ownership — which is why
 * [MODULES.md](../../docs/MODULES.md) picked it to prove the typed layer on, and why building it
 * settled SCHEMA.md's last open design question.
 *
 * **What it settled.** SCHEMA.md said the coercion helpers move to `./schema` when a second domain
 * module wants them. This is that module, so they moved — and Invariant 2 made it mandatory rather
 * than tidy, since `./ai` importing `#/fx/field.js` would be one domain module reaching into
 * another's meaning layer. Two helpers were added on the way, both general: `field.values` for a
 * mixed tuple (`waggle, 0.5`) and `field.rows` for a repeated property whose repeats are separate
 * records rather than one list. The dictionary shows dozens of fields in each shape across the
 * eleven modules still to come, so neither is `./ai`'s own.
 *
 * Two things the counts do not show, both of which a reader gets wrong by default:
 *
 * - **`[Pilot]` is two sections sharing a name.** 319 are pilots; the one in
 *   `CHARACTERS/newcharacter.ini` is the new-character record and shares only `nickname`. It is not
 *   filtered here — see {@link isBehaviour} and `pilot.ts`.
 * - **`inherit` is on 290 of the 319**, so most pilots carry nothing but a name and a parent.
 *   Reading a pilot's behaviour without walking that chain reads almost nothing;
 *   {@link inheritanceOf} walks it and deliberately does not merge, because which field wins is the
 *   consumer's call.
 *
 * See [AI.md](../../docs/AI.md).
 */

export * from './types.js'
export * from './pilot.js'
export * from './block.js'
