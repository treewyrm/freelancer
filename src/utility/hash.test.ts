import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import { getObjectId } from './hash.js'

describe('getObjectId', () => {
  // These must equal utf2json's getObjectId for the same input, or a cross-file reference resolves
  // in one library and not the other.
  it('matches known nickname hashes', () => {
    assert.equal(getObjectId('li_elite'), -1220103865)
    assert.equal(getObjectId('commodity_gold'), -1428760757)
    assert.equal(getObjectId('Li01'), -2086171057)
  })

  it('folds case', () => {
    assert.equal(getObjectId('Li01'), getObjectId('li01'))
    assert.equal(getObjectId('LI_ELITE'), getObjectId('li_elite'))
  })

  it('distinguishes case when told to', () => {
    assert.notEqual(getObjectId('Li01', true), getObjectId('li01', true))
  })

  /**
   * initialworld.ini writes `locked_gate = 2926089285 ;St01_to_St02_hole`, and 2,926,089,285 is
   * this hash read as unsigned. That is what those values are, and why one has to stay exact: as a
   * float32 it would come back 2,926,089,248 and resolve to nothing.
   */
  it('is the value initialworld.ini stores unsigned', () => {
    assert.equal(getObjectId('St01_to_St02_hole') >>> 0, 2926089285)
  })

  it('always sets the high bit, as the algorithm does', () => {
    for (const nickname of ['a', 'li_elite', '', 'zone_li01_to_li02'])
      assert.ok((getObjectId(nickname) & 0x80000000) !== 0)
  })
})
