import type { Document } from '#/ini/document.js'
import type { Section } from '#/ini/section.js'
import { equals as sameName } from '#/utility/string.js'
import type { Report } from './types.js'

/**
 * Grouping a document into runs — the section-level half of what `./property` does inside a section.
 *
 * A file is a sequence of instructions, and some sections are only meaningful relative to an earlier
 * one. `[fuse]` is the case [FX.md](../../docs/FX.md) found first: **209 openers owning 1,960 action
 * sections, with nothing but position linking them**, so a reader treating sections as independent
 * records reads 1,960 orphans and loses every death sequence in the game.
 *
 * It is not one rule, and the corpus is what says so:
 *
 * - **`[fuse]` owns everything after it** until the next `[fuse]`. Zero actions precede the first
 *   opener, so a run always has an owner and there is no orphan policy to invent.
 * - **`[CollisionGroup]` attaches to the last `[Ship]` or `[Solar]`** — 246 in `shiparch.ini`, 238 in
 *   `solararch.ini`, zero orphans in either. But `shiparch.ini` also holds **157 `[Simple]` sections
 *   interleaved between the ships**, belonging to none of them, and applying `[fuse]`'s rule there
 *   would hand every one of them to whichever ship happened to precede it.
 *
 * So `members` is what separates the two: name it and only those attach, omit it and everything does.
 * Nothing here reads a section — that is the caller's, with `readSection` — because what a run *is*
 * is positional and what its sections *mean* is not.
 */

/** An opener and the sections that belong to it, in file order. */
export interface Run {
  opener: Section
  members: Section[]
}

/** How a member appearing before any opener is treated. */
export interface RunOptions {
  /**
   * Section names that attach to an opener. Every non-opener attaches when this is omitted.
   *
   * Naming them is what lets an unrelated section pass through a run without joining or ending it.
   */
  members?: readonly string[]

  /**
   * What to do with a member that precedes the first opener.
   *
   * `'throw'` is `[fuse]`'s rule, and is right only where the corpus says the case cannot arise:
   * silently dropping a mod's death sequence is worse than refusing the file. `'skip'` reports and
   * continues. Default is `'skip'`.
   */
  orphans?: 'throw' | 'skip'

  report?: Report
}

/**
 * Every run in a document, in file order, each with its members in the order they were written.
 *
 * A section that is neither an opener nor a named member is passed over entirely — it does not join
 * the run, does not end it, and is not reported. A caller that wants those reads them in its own
 * pass, which is what `shiparch.ini`'s `[Simple]` sections need.
 *
 * @param document Sections of one file.
 * @param openers Section names that open a run. Compared folded.
 * @param options See {@link RunOptions}.
 * @throws RangeError under `orphans: 'throw'` when a member precedes the first opener.
 */
export function* runs(
  document: Document,
  openers: readonly string[],
  options: RunOptions = {},
): Generator<Run> {
  const { members, orphans = 'skip', report } = options

  const opens = (section: Section) => openers.some((name) => sameName(section.name, name))
  const joins = (section: Section) =>
    members === undefined || members.some((name) => sameName(section.name, name))

  let opener: Section | undefined
  let run: Section[] = []

  for (const section of document) {
    if (opens(section)) {
      if (opener) yield { opener, members: run }

      opener = section
      run = []
      continue
    }

    if (!joins(section)) continue

    if (!opener) {
      const message = `Section [${section.name}] appears before the first [${openers[0] ?? ''}]`
      if (orphans === 'throw') throw new RangeError(message)

      report?.(message)
      continue
    }

    run.push(section)
  }

  if (opener) yield { opener, members: run }
}
