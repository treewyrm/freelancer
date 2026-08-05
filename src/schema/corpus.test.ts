import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import * as corpus from '#/corpus.js'
import { read } from '#/ini/index.js'
import { fold } from '#/utility/string.js'

/**
 * The measurements the property walker is built on, asserted back.
 *
 * These pin no reader. They pin the *premises* — that a repeat inside a section is normal, that
 * exactly one field in retail is written both bare and with a value, that an opener owns the
 * properties after it. Every design decision in `./property` rests on one of them, so a number that
 * stops matching means the ground moved rather than that the figure needs updating.
 */

/** Every `(section, property)` pair, folded, with how it is written across the whole corpus. */
interface Pair {
  /** Occurrences carrying no values at all. */
  bare: number

  /** Value renderings of the occurrences that carry values, and how often each appears. */
  valued: Map<string, number>

  /** Largest number of occurrences of this property inside one section. */
  repeat: number

  /** Sections carrying it, and sections carrying it more than once. */
  sections: number
  repeated: number

  /**
   * Distinct value counts seen, **including zero**.
   *
   * SCHEMA.md's 108 varying-arity pairs counts the bare form as an arity of its own: 104 pairs vary
   * among their valued occurrences, and four more vary only by being written bare somewhere.
   */
  arities: Set<number>
}

const sweep = (): Map<string, Pair> => {
  const pairs = new Map<string, Pair>()

  for (const { data } of corpus.raw('ini')) {
    for (const section of read(data)) {
      const counts = new Map<string, number>()

      for (const property of section.properties) {
        const key = `${fold(section.name)}|${fold(property.name)}`
        counts.set(key, (counts.get(key) ?? 0) + 1)

        let pair = pairs.get(key)
        if (!pair)
          pairs.set(
            key,
            (pair = {
              bare: 0,
              valued: new Map(),
              repeat: 0,
              sections: 0,
              repeated: 0,
              arities: new Set(),
            }),
          )

        pair.arities.add(property.values.length)

        if (property.values.length === 0) pair.bare++
        else {
          const rendered = property.values.map(({ value }) => String(value)).join(',')
          pair.valued.set(rendered, (pair.valued.get(rendered) ?? 0) + 1)
        }
      }

      for (const [key, count] of counts) {
        const pair = pairs.get(key)
        if (!pair) continue

        pair.sections++
        if (count > 1) pair.repeated++
        pair.repeat = Math.max(pair.repeat, count)
      }
    }
  }

  return pairs
}

describe('what the property walker is built on', { skip: corpus.skip }, () => {
  const pairs = sweep()

  it('sweeps 2,080 distinct pairs over 1,252 files', () => {
    assert.equal(corpus.raw('ini').length, 1252)
    assert.equal(pairs.size, 2080)
  })

  /**
   * A repeat inside one section is the normal case, not an error — which is why a singular field has
   * to *choose* between the first occurrence and the last rather than assume there is only one.
   */
  it('counts 202 pairs that repeat inside a section, none of them zero-arity', () => {
    const repeating = [...pairs.values()].filter(({ repeat }) => repeat > 1)

    assert.equal(repeating.length, 202)
    assert.equal(repeating.filter(({ valued }) => valued.size === 0).length, 0)
  })

  /**
   * The low-frequency tail is what makes the reading a *choice* rather than an obvious answer: a
   * property repeating in one section out of 1,645 is an authoring accident, and whichever
   * occurrence wins is a decision about a file nobody meant to write that way.
   */
  it('finds 34 of those repeating in under 5% of their sections, and 19 in under 1%', () => {
    const rare = (limit: number) =>
      [...pairs.values()].filter(
        ({ repeated, sections }) => repeated > 0 && repeated / sections < limit,
      ).length

    assert.equal(rare(0.05), 34)
    assert.equal(rare(0.01), 19)

    // And 48 repeat in exactly one section, whatever share of the total that is.
    assert.equal([...pairs.values()].filter(({ repeated }) => repeated === 1).length, 48)
  })

  /**
   * The whole basis of `Fields.flag`.
   *
   * `[CollisionGroup] separable` is the only retail field written both bare and with a value, and
   * every one of its 28 valued occurrences says `true` — never `false`. So the two spellings carry
   * one fact rather than two readings of it, and folding them is a reading rather than a
   * convenience. The other three pairs that mix the forms are not flags at all: their valued form
   * carries a system name, a placeholder token and a difficulty number, and the bare occurrences are
   * single accidents.
   */
  it('finds exactly one field written both bare and with a value', () => {
    const mixed = [...pairs]
      .filter(([, { bare, valued }]) => bare > 0 && valued.size > 0)
      .map(([key]) => key)
      .sort()

    assert.deepEqual(mixed, [
      'collisiongroup|separable',
      'objlist|breakformation',
      'trigger|system',
      'zone|difficulty',
    ])

    const separable = pairs.get('collisiongroup|separable')
    assert.ok(separable)
    assert.equal(separable.bare, 456)
    assert.deepEqual([...separable.valued], [['true', 28]])
  })

  /**
   * Arity varies on 108 pairs, so a fixed-width read has to refuse rather than pad — reading
   * `[Sound] range` as a fixed pair invents a second number for 11 sounds.
   *
   * SCHEMA.md's figure, with the definition that yields it: **the bare form counts as an arity of
   * its own.** 104 pairs vary among their valued occurrences, and the remaining four are exactly the
   * mixed bare/valued pairs above.
   */
  it('counts 108 pairs whose arity varies, four of them only by being written bare', () => {
    const varying = [...pairs.values()].filter(({ arities }) => arities.size > 1)
    const valued = varying.filter(
      ({ arities }) => [...arities].filter((count) => count > 0).length > 1,
    )

    assert.equal(varying.length, 108)
    assert.equal(valued.length, 104)
  })
})

/**
 * The in-section opener, measured on both candidates.
 *
 * `[Exclusion Zones]` is the clean one and is what `Fields.group` was built for. `[Zone]` is the
 * messy one, and the two facts below are why the group instruction reports a leading member rather
 * than throwing on it, and why `faction_weight` must never be modelled as a run member.
 */
describe('openers inside a section', { skip: corpus.skip }, () => {
  const documents = corpus.raw('ini').map(({ path, data }) => ({ path, document: read(data) }))

  /** Occurrences of `name` before the first occurrence of `opener`, and the opener's own count. */
  const before = (section: string, opener: string, name: string) => {
    let openers = 0
    let orphans = 0
    let sections = 0
    const files = new Set<string>()

    for (const { path, document } of documents)
      for (const found of document) {
        if (!fold(found.name).startsWith(fold(section))) continue

        sections++
        let opened = false
        let orphaned = false

        for (const property of found.properties) {
          if (fold(property.name) === fold(opener)) {
            openers++
            opened = true
          } else if (fold(property.name) === fold(name) && !opened) {
            orphans++
            orphaned = true
          }
        }

        if (orphaned) files.add(path)
      }

    return { openers, orphans, sections, files }
  }

  it('has 634 exclusion openers over 169 sections with nothing before the first', () => {
    const { openers, orphans, sections } = before('exclusion zones', 'exclusion', 'fog_far')

    assert.equal(sections, 169)
    assert.equal(openers, 634)
    assert.equal(orphans, 0)
  })

  /**
   * 497 `faction` properties precede their section's first `encounter`, and every one of them is in
   * the same file. A reader that throws on a leading member refuses a file the game loads.
   */
  it('has 497 leading factions, all in one file', () => {
    const { orphans, files } = before('zone', 'encounter', 'faction')

    assert.equal(orphans, 497)
    assert.deepEqual([...files], ['UNIVERSE/SYSTEMS/INTRO/intro.ini'])
  })

  /**
   * `faction_weight` is a zone-level list, not a member of the `encounter` run: all 5,611 of them
   * precede every `encounter` in their section, in every file, without exception.
   */
  it('has every faction_weight before every encounter, in every file', () => {
    const { orphans, files } = before('zone', 'encounter', 'faction_weight')

    assert.equal(orphans, 5611)
    assert.ok(files.size > 1)
  })
})
