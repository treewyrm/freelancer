import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import type { Document } from '#/ini/types.js'
import { runs } from './document.js'

/** A document from section names alone — what a run is made of is position, not content. */
const document = (...names: string[]): Document =>
  names.map((name) => ({ name, properties: [] }))

/** `opener: member, member` per run, which is the whole shape under test. */
const shape = (document: Document, openers: string[], options?: Parameters<typeof runs>[2]) =>
  [...runs(document, openers, options)].map(
    ({ opener, members }) => `${opener.name}: ${members.map(({ name }) => name).join(', ')}`,
  )

describe('runs owning everything after an opener', () => {
  // [fuse]: 209 openers, 1,960 actions, nothing but position linking them.
  it('gives each opener every section until the next one', () => {
    assert.deepEqual(
      shape(document('fuse', 'start_effect', 'impulse', 'fuse', 'destroy_group'), ['fuse']),
      ['fuse: start_effect, impulse', 'fuse: destroy_group'],
    )
  })

  it('yields an opener that owns nothing', () => {
    assert.deepEqual(shape(document('fuse', 'fuse', 'impulse'), ['fuse']), [
      'fuse: ',
      'fuse: impulse',
    ])
  })

  it('yields nothing for a document with no opener', () => {
    assert.deepEqual(shape(document(), ['fuse']), [])
    assert.deepEqual(shape(document('impulse'), ['fuse']), [])
  })

  it('folds case on the opener name', () => {
    assert.deepEqual(shape(document('Fuse', 'impulse'), ['fuse']), ['Fuse: impulse'])
  })

  it('opens on any of several names', () => {
    assert.deepEqual(
      shape(document('Ship', 'CollisionGroup', 'Solar', 'CollisionGroup'), ['Ship', 'Solar']),
      ['Ship: CollisionGroup', 'Solar: CollisionGroup'],
    )
  })
})

describe('a member before the first opener', () => {
  // No retail action precedes a [fuse], so the case cannot arise and refusing beats dropping a
  // mod's death sequence silently.
  it('throws when asked to', () => {
    assert.throws(
      () => shape(document('impulse', 'fuse'), ['fuse'], { orphans: 'throw' }),
      /Section \[impulse\] appears before the first \[fuse\]/,
    )
  })

  it('is skipped and reported otherwise', () => {
    const messages: string[] = []
    const shaped = shape(document('impulse', 'fuse', 'destroy_root'), ['fuse'], {
      report: (message) => void messages.push(message),
    })

    assert.deepEqual(shaped, ['fuse: destroy_root'])
    assert.equal(messages.length, 1)
  })
})

describe('runs with named members', () => {
  // shiparch.ini holds 246 [CollisionGroup] owned by a [Ship] and 157 [Simple] owned by none.
  it('passes an unnamed section through without joining or ending the run', () => {
    assert.deepEqual(
      shape(
        document('Ship', 'CollisionGroup', 'Simple', 'CollisionGroup', 'Ship', 'CollisionGroup'),
        ['Ship'],
        { members: ['CollisionGroup'] },
      ),
      ['Ship: CollisionGroup, CollisionGroup', 'Ship: CollisionGroup'],
    )
  })

  it('does not report an unnamed section before the first opener', () => {
    const messages: string[] = []
    const shaped = shape(document('Simple', 'Ship', 'CollisionGroup'), ['Ship'], {
      members: ['CollisionGroup'],
      report: (message) => void messages.push(message),
    })

    assert.deepEqual(shaped, ['Ship: CollisionGroup'])
    assert.deepEqual(messages, [])
  })

  it('still refuses a named member before the first opener', () => {
    assert.throws(
      () =>
        shape(document('CollisionGroup', 'Ship'), ['Ship'], {
          members: ['CollisionGroup'],
          orphans: 'throw',
        }),
      /appears before the first \[Ship\]/,
    )
  })
})
