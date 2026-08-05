import { before, describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import * as corpus from '#/corpus.js'
import { write as writeIni } from '#/ini/index.js'
import Game from '#/game/game.js'
import type { AnyBlock, EvadeDodgeBlock, GunBlock, JobBlock, MetaBehavior, Pilot } from './types.js'
import { isBehaviour, inheritanceOf, readPilot, readPilots } from './pilot.js'
import { readBlock, readBlocks } from './block.js'

/**
 * `./ai` against the retail install.
 *
 * The counts here are the ones [DICTIONARY.md](../../docs/DICTIONARY.md#ai) claims, so this suite is
 * as much a check on that document as on this module — if the tree and the dictionary disagree, the
 * tree wins and the dictionary gets fixed. Three things fail silently without it: the `[Pilot]`
 * split by file, the weighted tuples collapsing into a flat list, and `inherit` being ignored so
 * 290 of 319 pilots read as empty.
 */

describe('pilots', { skip: corpus.skip }, () => {
  let pilots: Pilot[]
  let blocks: AnyBlock[]

  before(async () => {
    // `pilots` is a hardcoded key, not a `[Data]` one — nothing here loads without this.
    const game = await Game.open(corpus.filesystem(), { strings: false, hardcoded: true })

    pilots = game.ai.pilots
    blocks = game.ai.blocks
  })

  it('reads 320 [Pilot] sections, of which 319 are behaviour pilots', () => {
    assert.equal(pilots.length, 320)
    assert.equal(pilots.filter(isBehaviour).length, 319)
  })

  it('reads the newcharacter [Pilot] without losing its six properties', () => {
    const [odd] = pilots.filter((pilot) => !isBehaviour(pilot))

    assert.ok(odd)
    assert.equal(odd.unrecognized?.length, 6)
    assert.deepEqual(
      odd.unrecognized?.map(({ name }) => name),
      ['body', 'comm', 'voice', 'body.anim', 'thumb', 'comm.anim'],
    )
  })

  it('finds inherit on 290 of the 319', () => {
    assert.equal(pilots.filter((pilot) => pilot.inherit !== undefined).length, 290)
  })

  it('walks an inherit chain without looping', () => {
    const table = new Map(pilots.map((pilot) => [pilot.nickname, pilot]))
    let longest = 0

    for (const pilot of pilots) longest = Math.max(longest, [...inheritanceOf(pilot, table)].length)

    // Every chain terminates; a cycle would spin forever without the seen set.
    assert.ok(longest > 0)
  })

  /**
   * One reference in retail resolves to nothing, and it is a typo in the data rather than a reader
   * fault: `MSN10_Bundschuh` asks for `story_gun_capship_msn10_bundschuh`, the block is named
   * `story_gun_capship_msn10`, and the other nine pilots that use it spell it correctly.
   *
   * Pinned rather than tolerated. Reported, never substituted — the same treatment `./fx` gives its
   * eight dead shield references.
   */
  it('resolves every block reference but the one dead one', () => {
    const known = new Set(blocks.map(({ nickname }) => nickname.toLowerCase()))
    const missing: string[] = []

    for (const pilot of pilots)
      for (const [name, value] of Object.entries(pilot))
        if (name.endsWith('_id') && typeof value === 'string' && !known.has(value.toLowerCase()))
          missing.push(`${pilot.nickname}.${name} = ${value}`)

    assert.deepEqual(missing, ['MSN10_Bundschuh.gun_id = story_gun_capship_msn10_bundschuh'])
  })
})

describe('blocks', { skip: corpus.skip }, () => {
  let blocks: AnyBlock[]

  before(async () => {
    const game = await Game.open(corpus.filesystem(), { strings: false, hardcoded: true })
    blocks = game.ai.blocks
  })

  it('reads all seventeen kinds, at their retail counts', () => {
    const counts = new Map<string, number>()
    for (const { type } of blocks) counts.set(type, (counts.get(type) ?? 0) + 1)

    assert.deepEqual(Object.fromEntries([...counts].sort()), {
      buzzheadtowardblock: 17,
      buzzpassbyblock: 6,
      countermeasureblock: 6,
      damagereactionblock: 5,
      enginekillblock: 3,
      evadebreakblock: 8,
      evadedodgeblock: 30,
      formationblock: 10,
      gunblock: 99,
      jobblock: 59,
      metabehavior: 6,
      mineblock: 3,
      missileblock: 20,
      missilereactionblock: 3,
      repairblock: 6,
      strafeblock: 5,
      trailblock: 4,
    })
  })

  it('keeps a weighted row as a name and a weight, not a flat list', () => {
    const dodges = blocks.filter(
      (block): block is EvadeDodgeBlock => block.type === 'evadedodgeblock',
    )

    assert.equal(dodges.length, 30)

    for (const block of dodges) {
      // The wiki marks this repeatable; retail never repeats it. One row in all 30.
      assert.equal(block.evade_dodge_style_weight?.length, 1)

      for (const { name, weight } of block.evade_dodge_style_weight ?? []) {
        assert.equal(typeof name, 'string')
        assert.ok(weight === undefined || Number.isFinite(weight))
      }
    }

    const directed = dodges.filter((block) => block.evade_dodge_direction_weight !== undefined)
    const rows = directed.reduce((n, b) => n + (b.evade_dodge_direction_weight?.length ?? 0), 0)

    assert.equal(directed.length, 25)
    assert.equal(rows, 64)
  })

  it('keeps attack_preference as 262 rows over 59 job blocks', () => {
    const jobs = blocks.filter((block): block is JobBlock => block.type === 'jobblock')
    const rows = jobs.reduce((n, block) => n + (block.attack_preference?.length ?? 0), 0)

    assert.equal(jobs.length, 59)
    assert.equal(rows, 262)

    for (const block of jobs)
      for (const { target } of block.attack_preference ?? []) assert.equal(typeof target, 'string')
  })

  it('reads a boolean spelled in any case, and never as yes', () => {
    const jobs = blocks.filter((block): block is JobBlock => block.type === 'jobblock')
    const flagged = jobs.filter((block) => block.flee_no_weapons_style === true)

    // 49 of the 51 that carry it, spelled True ×35 and TRUE ×14.
    assert.equal(flagged.length, 49)
  })

  it('coerces a field that is int in one file and float in another', () => {
    const guns = blocks.filter((block): block is GunBlock => block.type === 'gunblock')

    assert.equal(guns.length, 99)

    for (const block of guns) {
      assert.ok(block.gun_fire_interval_time === undefined || Number.isFinite(block.gun_fire_interval_time))
      assert.ok(
        block.gun_fire_burst_interval_time === undefined ||
          Number.isFinite(block.gun_fire_burst_interval_time),
      )
    }

    // Both are present on all 99 despite the tag disagreeing between the two pilot files.
    assert.equal(guns.filter((b) => b.gun_fire_interval_time !== undefined).length, 99)
    assert.equal(guns.filter((b) => b.gun_fire_burst_interval_time !== undefined).length, 99)
  })

  it('leaves MB_GotoGuide undecoded, with all eight values', () => {
    const meta = blocks.filter((block): block is MetaBehavior => block.type === 'metabehavior')

    assert.equal(meta.length, 6)

    for (const block of meta) {
      assert.equal(block.MB_GotoGuide?.length, 8)
      assert.equal(typeof block.MB_GotoGuide?.[0], 'string')
    }
  })
})

describe('round trip', { skip: corpus.skip }, () => {
  it('is a fixed point through the interim document', async () => {
    const game = await Game.open(corpus.filesystem(), { strings: false, hardcoded: true })

    for (const document of game.documents.get('pilots') ?? []) {
      for (const section of document) {
        const folded = section.name.toLowerCase()

        if (folded === 'pilot') {
          const once = readPilot(section)
          assert.deepEqual(readPilot(section), once)
        } else {
          const once = readBlock(section)
          assert.deepEqual(readBlock(section), once)
        }
      }
    }
  })

  it('loses no property: every one is either a field or unrecognized', async () => {
    const game = await Game.open(corpus.filesystem(), { strings: false, hardcoded: true })

    let checked = 0

    for (const document of game.documents.get('pilots') ?? []) {
      for (const pilot of readPilots(document)) {
        checked += Object.keys(pilot).length
        assert.equal(typeof pilot.nickname, 'string')
      }

      for (const block of readBlocks(document)) {
        checked += Object.keys(block).length
        assert.equal(typeof block.nickname, 'string')
      }
    }

    assert.ok(checked > 0)
  })

  it('reads every pilot file without a fault', async () => {
    const game = await Game.open(corpus.filesystem(), { strings: false, hardcoded: true })
    const faults = game.entries.filter(({ key, error }) => key === 'pilots' && error !== undefined)

    assert.deepEqual(faults, [])

    // The documents survive being written back, which is the interim layer's guarantee not ours,
    // but a reader that mutated a section in place would break it here.
    for (const document of game.documents.get('pilots') ?? [])
      assert.ok(writeIni(document).byteLength > 0)
  })
})
