import { before, describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import * as corpus from '#/corpus.js'
import { read } from '#/ini/index.js'
import { Directory } from '#/utf/index.js'
import { readAlchemy } from '#/alchemy/index.js'
import { getResourceId } from '#/hash.js'
import { equals as sameName, fold } from '#/utility/string.js'
import Game from '#/game/game.js'
import { readFuses } from './fuse.js'
import { findEffect, readVisEffects } from './viseffect.js'
import type { VisEffect } from './types.js'

/**
 * `./fx` against the retail install.
 *
 * Two things are pinned here that nothing else can pin: which hash `effect_crc` is, and that a fuse
 * script is a run of sections rather than a set of records. Both fail silently when got wrong — a
 * wrong hash resolves to nothing and a flat read yields orphaned actions — so the counts are the
 * only thing that catches a drift.
 */

const ale = new Map<string, string[]>()

describe('VisEffect', { skip: corpus.skip }, () => {
  let visuals: VisEffect[]

  before(async () => {
    const game = await Game.open(corpus.filesystem(), { strings: false })

    visuals = game.effects.visuals

    for (const { alchemy } of visuals) {
      const key = fold(alchemy)
      if (ale.has(key)) continue

      const path = `${game.settings.data}/${alchemy}`
      const root = Directory.read(await game.paths.read(path))

      ale.set(key, readAlchemy(root)?.effects.effects.map(({ name }) => name) ?? [])
    }
  })

  it('finds 1,218 across the eight *_ale.ini files, and nowhere else', () => {
    assert.equal(visuals.length, 1218)
  })

  it('resolves every alchemy path it names', () => {
    assert.deepEqual(
      visuals.filter(({ alchemy }) => !ale.has(fold(alchemy))).map(({ nickname }) => nickname),
      [],
    )
  })

  /**
   * The measurement this module exists for. `effect_crc` is `getResourceId(name, true)` — the
   * case-SENSITIVE hash, the one Alchemy uses inside an `.ale` and the one nothing else in the
   * library defaults to.
   */
  it('matches effect_crc through the case-sensitive hash on 1,210 of them', () => {
    const matched = visuals.filter(({ alchemy, effect_crc }) =>
      findEffect(
        (ale.get(fold(alchemy)) ?? []).map((name) => ({ name })),
        effect_crc,
      ),
    )

    assert.equal(matched.length, 1210)
  })

  /**
   * The folded hash resolves a strict subset and never wins: 1,150 of the 1,210, all of them names
   * already lowercase where the two hashes agree. It misses 60 and gains none.
   *
   * That is what makes the wrong choice hard to notice — it works for 94% of the corpus and fails
   * silently on the rest, resolving to nothing rather than to an error.
   */
  it('resolves a strict subset through the folded hash, losing 60 and gaining none', () => {
    let sensitiveOnly = 0
    let foldedOnly = 0
    let folded = 0

    for (const { alchemy, effect_crc } of visuals) {
      const names = ale.get(fold(alchemy)) ?? []
      const bySensitive = names.some((name) => getResourceId(name, true) === effect_crc)
      const byFolded = names.some((name) => getResourceId(name) === effect_crc)

      if (byFolded) folded++
      if (bySensitive && !byFolded) sensitiveOnly++
      if (byFolded && !bySensitive) foldedOnly++
    }

    assert.equal(folded, 1150)
    assert.equal(sensitiveOnly, 60)
    assert.equal(foldedOnly, 0)
  })

  // The 60 the folded hash loses are exactly the effect names carrying a capital.
  it('loses precisely the mixed-case effect names', () => {
    const mixed = new Set([...ale.values()].flat().filter((name) => name !== fold(name)))

    assert.equal(mixed.size, 60)
  })

  /**
   * The eight that resolve through neither are dead references, like the 20 materials that live
   * outside the asset tree: each names a `…shield01.ale` that defines only `…shield01`.
   */
  it('leaves exactly the eight shield variants unresolved', () => {
    const dead = visuals
      .filter(
        ({ alchemy, effect_crc }) =>
          !findEffect(
            (ale.get(fold(alchemy)) ?? []).map((name) => ({ name })),
            effect_crc,
          ),
      )
      .map(({ nickname }) => nickname)
      .sort()

    assert.deepEqual(dead, [
      'gf_br_shield02',
      'gf_br_shield03',
      'gf_ku_shield02',
      'gf_ku_shield03',
      'gf_li_shield02',
      'gf_li_shield03',
      'gf_rh_shield02',
      'gf_rh_shield03',
    ])
  })

  it('carries 3,818 texture references, every one of which resolves', async () => {
    const game = await Game.open(corpus.filesystem(), { strings: false })
    const references = visuals.flatMap(({ textures }) => textures ?? [])

    assert.equal(references.length, 3818)

    const unresolved: string[] = []

    for (const path of new Set(references.map(fold)))
      if (!(await game.paths.has(`${game.settings.data}/${path}`))) unresolved.push(path)

    assert.deepEqual(unresolved, [])
  })

  it('leaves textures absent on the 20 that name none', () => {
    assert.equal(visuals.filter(({ textures }) => textures === undefined).length, 20)
  })
})

describe('fuse scripts', { skip: corpus.skip }, () => {
  const files = corpus.glob(corpus.root, 'FX/fuse*.ini')
  const all = files.flatMap(({ data }) => [...readFuses(read(data))])

  it('reads 209 scripts over 17 files on disk', () => {
    assert.equal(files.length, 17)
    assert.equal(all.length, 209)
  })

  /**
   * The grouping is total: every action belongs to a script, so `readFuses` never needs an orphan
   * case. It throws rather than dropping if a tree ever disagrees, which is what this asserts.
   */
  it('owns all 1,960 actions, with none before the first [fuse]', () => {
    assert.equal(
      all.reduce((count, { actions }) => count + actions.length, 0),
      1960,
    )

    for (const { data } of files) assert.doesNotThrow(() => [...readFuses(read(data))])
  })

  it('splits into twelve action kinds', () => {
    const kinds = new Map<string, number>()

    for (const { actions } of all)
      for (const { type } of actions) kinds.set(type, (kinds.get(type) ?? 0) + 1)

    assert.deepEqual(Object.fromEntries([...kinds].sort(([a], [b]) => a.localeCompare(b))), {
      damage_group: 3,
      damage_root: 7,
      destroy_group: 291,
      destroy_hp_attachment: 163,
      destroy_root: 37,
      dump_cargo: 1,
      ignite_fuse: 74,
      impulse: 16,
      make_invincible: 1,
      start_cam_particles: 13,
      start_effect: 1353,
      tumble: 1,
    })
  })

  // 39 actions carry no `at_t` at all, so it cannot be required — 38 start_effect and the single
  // make_invincible.
  it('times 1,921 of them, with 17 carrying a two-value range', () => {
    const timed = all.flatMap(({ actions }) => actions.filter(({ at_t }) => at_t !== undefined))

    assert.equal(timed.length, 1921)
    assert.equal(timed.filter(({ at_t }) => at_t?.length === 2).length, 17)
    assert.equal(timed.filter(({ at_t }) => at_t?.length === 1).length, 1904)
  })

  // Every two-value at_t is ascending, which is what makes the min/max reading coherent.
  it('writes every two-value at_t low to high', () => {
    for (const { actions } of all)
      for (const { at_t } of actions)
        if (at_t?.length === 2) assert.ok(at_t[0] <= at_t[1], `${at_t[0]} > ${at_t[1]}`)
  })

  it('identifies a script by name rather than nickname', () => {
    assert.equal(all.filter(({ name }) => name.length > 0).length, 209)
  })

  /**
   * Retail residue this module must not eat: `[start_effect]` carries `ONLY`, `age_fire` and
   * `particles`, and `[destroy_group]` carries `separable`, `dmg_hp` and `dmg_obj`.
   */
  it('keeps the six unrecognized properties retail carries', () => {
    const kept = new Map<string, number>()

    for (const { actions } of all)
      for (const action of actions)
        for (const { name } of action.unrecognized ?? [])
          kept.set(
            `${action.type}.${fold(name)}`,
            (kept.get(`${action.type}.${fold(name)}`) ?? 0) + 1,
          )

    assert.deepEqual(Object.fromEntries([...kept].sort(([a], [b]) => a.localeCompare(b))), {
      'destroy_group.dmg_hp': 1,
      'destroy_group.dmg_obj': 1,
      'destroy_group.separable': 1,
      'start_effect.age_fire': 1,
      'start_effect.only': 1,
      'start_effect.particles': 3,
    })
  })

  /**
   * The whole behavioural surface of reading sequentially rather than by lookup.
   *
   * A singular property that repeats is **last-wins**, because the game re-runs the instruction, and
   * three `[start_effect]` sections in all of retail are where that is visible. Every other repeat in
   * these files — `at_t`, `ori_offset`, `attached` — writes the same value twice, and `hardpoint`
   * accumulates rather than overriding, so nothing else moves.
   *
   * Named here rather than counted, because SCHEMA.md's TODO on this is still open: if observation in
   * game ever says first-wins, these three are what has to change and this is the list.
   */
  it('takes the last of a repeated singular, everywhere one repeats', () => {
    const overridden: string[] = []

    for (const { data, path } of files) {
      const document = read(data)

      // Actions are every section but the openers, in file order — which is the order readFuses
      // yields them in, so the two zip.
      const sections = document.filter(({ name }) => !sameName(name, 'fuse'))
      const actions = [...readFuses(document)].flatMap(({ actions }) => actions)

      assert.equal(sections.length, actions.length)

      for (const [index, section] of sections.entries()) {
        const action = actions[index]
        assert.ok(action)

        for (const name of ['effect', 'pos_offset', 'ori_offset', 'at_t', 'attached'] as const) {
          const repeats = section.properties.filter((property) => sameName(property.name, name))
          if (repeats.length < 2) continue

          const last = repeats.at(-1)?.values.map(({ value }) => String(value)).join()
          const held = Reflect.get(action, name) as unknown
          const read_ = Array.isArray(held) ? held.join() : String(held)

          assert.equal(read_, last, `${path} [${section.name}] ${name}`)

          const first = repeats[0]?.values.map(({ value }) => String(value)).join()
          if (first !== last) overridden.push(`${section.name}.${name}`)
        }
      }
    }

    // Three [start_effect] sections, and nothing else in retail, read differently for it. Every
    // other repeat writes the same value twice. SCHEMA.md's TODO on first-wins vs last-wins is
    // still open, and this is the list of what would have to change if the game says otherwise.
    assert.deepEqual(overridden.sort(), [
      'start_effect.effect',
      'start_effect.effect',
      'start_effect.effect',
      'start_effect.pos_offset',
      'start_effect.pos_offset',
    ])
  })

  /**
   * `FX/fuse_li_battleship.ini` is on disk and absent from `[Data] fuses`, so the game never loads
   * it. A tool that globs the tree counts 209 scripts; the game runs 192. That gap is the whole
   * reason the load list is read rather than the directory.
   */
  it('loads 192 of the 209, because one file is never listed', { skip: corpus.skip }, async () => {
    const game = await Game.open(corpus.filesystem(), { strings: false })

    assert.equal(game.documents.get('fuses')?.length, 16)
    assert.equal(game.effects.fuses.length, 192)
    assert.equal(
      game.effects.fuses.reduce((count, { actions }) => count + actions.length, 0),
      1922,
    )
  })
})

describe('the rest of the effect tables', { skip: corpus.skip }, () => {
  let game: Game

  before(async () => {
    game = await Game.open(corpus.filesystem(), { strings: false })
  })

  it('reads 705 effects, 45 types, 6 LODs, 55 beams and 4 texture libraries', () => {
    const { effects, types, lods, beams, shapes } = game.effects

    assert.equal(effects.length, 705)
    assert.equal(types.length, 45)
    assert.equal(lods.length, 6)
    assert.equal(beams.length, 55)
    assert.equal(shapes.length, 4)
  })

  it('discriminates 51 spears from 4 bolts', () => {
    const { beams } = game.effects

    assert.equal(beams.filter(({ kind }) => kind === 'spear').length, 51)
    assert.equal(beams.filter(({ kind }) => kind === 'bolt').length, 4)
  })

  // The section name does not predict the property set: only `nickname` is on all 705.
  it('leaves effect_type absent on one effect and vis_effect on 45', () => {
    const { effects } = game.effects

    assert.equal(effects.filter(({ effect_type }) => effect_type !== undefined).length, 704)
    assert.equal(effects.filter(({ vis_effect }) => vis_effect !== undefined).length, 660)
  })

  /**
   * One `[Effect]` in `effects_explosion.ini` carries a property named `:` — an author's separator
   * line written without a comment marker. The compiler kept it and so does this.
   */
  it('keeps the one [Effect] property named ":"', () => {
    const residue = game.effects.effects.filter(({ unrecognized }) => unrecognized !== undefined)

    assert.equal(residue.length, 1)
    assert.equal(residue[0]?.nickname, 'gf_explosion_br_battleship_flashbang#3')
    assert.equal(residue[0]?.unrecognized?.[0]?.name, ':')
  })
})
