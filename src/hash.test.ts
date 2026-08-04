import { deepStrictEqual, notStrictEqual, ok, strictEqual, throws } from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  filterObjects,
  filterResources,
  getObject,
  getObjectId,
  getResource,
  getResourceId,
  setObject,
  setResource,
  toBytes,
} from './hash.js'

/**
 * Ground truth from retail rather than from this implementation: the `VMeshRef` in
 * `SOLAR/STARSPHERE/starsphere_rh05_stars.3db` points at its mesh by resource id, and the
 * `VMeshLibrary` in the same file holds that mesh under this name.
 */
const mesh = {
  name: 'data.solar.starsphere.starsphere_rh05_stars.lod0-102.vms',
  id: 14236761,
}

interface Named {
  name: string
}

const named = (...names: string[]): Named[] => names.map((name) => ({ name }))

const byName = ({ name }: Named) => name

describe('getResourceId', () => {
  it('hashes a name to the id retail references it by', () => {
    strictEqual(getResourceId(mesh.name), mesh.id)
  })

  it('folds case by default', () => {
    strictEqual(getResourceId(mesh.name.toUpperCase()), mesh.id)
    strictEqual(getResourceId('Root'), getResourceId('rOOt'))
  })

  it('distinguishes case when asked', () => {
    notStrictEqual(getResourceId(mesh.name.toUpperCase(), true), mesh.id)
    strictEqual(getResourceId(mesh.name, true), mesh.id)
  })

  // Folding ors in 0x20 for bytes 0x41 to 0x5a only. `@` and `[` sit either side of that range,
  // as do the digits and the already-lower-case letters, and none of them may move.
  it('leaves bytes outside A-Z alone when folding', () => {
    strictEqual(getResourceId('@[`{0-9_.'), getResourceId('@[`{0-9_.', true))
    strictEqual(getResourceId('lod0-102.vms'), getResourceId('lod0-102.vms', true))
  })

  it('passes a number through as a signed 32-bit integer', () => {
    strictEqual(getResourceId(mesh.id), mesh.id)
    strictEqual(getResourceId(0xffffffff), -1)
    strictEqual(getResourceId(-1), -1)
  })

  it('hashes bytes the same as the string they spell', () => {
    const bytes = new TextEncoder().encode(mesh.name)

    strictEqual(getResourceId(bytes), mesh.id)
    strictEqual(getResourceId(bytes.buffer), mesh.id)
  })

  it('hashes the empty string', () => {
    strictEqual(getResourceId(''), getResourceId(new Uint8Array()))
  })
})

describe('getObjectId', () => {
  it('is not the resource id of the same name', () => {
    notStrictEqual(getObjectId(mesh.name), getResourceId(mesh.name))
  })

  it('matches known nickname hashes', () => {
    strictEqual(getObjectId('li_elite'), -1220103865)
    strictEqual(getObjectId('commodity_gold'), -1428760757)
    strictEqual(getObjectId('Li01'), -2086171057)
  })

  /**
   * `initialworld.ini` writes `locked_gate = 2926089285 ;St01_to_St02_hole`, and 2,926,089,285 is
   * this hash read as unsigned. That is what those values are, and why one has to stay exact: as a
   * float32 it would come back 2,926,089,248 and resolve to nothing.
   */
  it('is the value initialworld.ini stores unsigned', () => {
    strictEqual(getObjectId('St01_to_St02_hole') >>> 0, 2926089285)
  })

  // id32 ors in 0x80000000, so every object id read back as int32 is negative.
  it('always sets the high bit', () => {
    for (const name of ['li_elite', 'Li01_01_base', 'rh_fighter', ''])
      ok(getObjectId(name) < 0, `${name} produced a non-negative id`)
  })

  it('folds case by default and distinguishes it when asked', () => {
    strictEqual(getObjectId('Li01_01_base'), getObjectId('li01_01_BASE'))
    notStrictEqual(getObjectId('Li01_01_base', true), getObjectId('li01_01_BASE', true))
  })

  it('passes a number through as a signed 32-bit integer', () => {
    strictEqual(getObjectId(0xffffffff), -1)
  })
})

describe('toBytes', () => {
  it('encodes a string', () => {
    deepStrictEqual([...toBytes('AB')], [0x41, 0x42])
  })

  it('reads a view without copying past its bounds', () => {
    const bytes = Uint8Array.of(1, 2, 3, 4, 5)

    deepStrictEqual([...toBytes(bytes.subarray(1, 3))], [2, 3])
  })

  it('reads a whole ArrayBuffer', () => {
    deepStrictEqual([...toBytes(Uint8Array.of(7, 8).buffer)], [7, 8])
  })

  // windows-1252, not UTF-8. The two agree on ASCII and nothing in retail is anything else, but
  // where they disagree the game's byte is the one that hashed.
  it('encodes a high character as the single byte windows-1252 gives it', () => {
    deepStrictEqual([...toBytes('é')], [0xe9])
  })

  it('rejects a character windows-1252 cannot carry', () => {
    throws(() => toBytes('中'), RangeError)
  })

  it('rejects anything else', () => {
    throws(() => toBytes({} as never), TypeError)
  })
})

describe('getResource', () => {
  it('finds an entry by name, ignoring case', () => {
    const items = named('Alpha', 'Beta')

    strictEqual(getResource(items, byName, 'beta'), items[1])
  })

  it('finds an entry by the hash of its name', () => {
    const items = named(mesh.name)

    strictEqual(getResource(items, byName, mesh.id), items[0])
  })

  it('returns undefined when nothing matches', () => {
    strictEqual(getResource(named('Alpha'), byName, 'Gamma'), undefined)
  })

  it('returns the first of several matches', () => {
    const items = named('Alpha', 'ALPHA')

    strictEqual(getResource(items, byName, 'alpha'), items[0])
  })

  it('honours case when asked', () => {
    const items = named('Alpha', 'ALPHA')

    strictEqual(getResource(items, byName, 'ALPHA', true), items[1])
  })
})

describe('filterResources', () => {
  it('returns every match', () => {
    const items = named('Alpha', 'Beta', 'ALPHA')

    deepStrictEqual(filterResources(items, byName, 'alpha'), [items[0], items[2]])
  })

  it('returns an empty array when nothing matches', () => {
    deepStrictEqual(filterResources(named('Alpha'), byName, 'Gamma'), [])
  })
})

describe('setResource', () => {
  it('appends an entry whose name is not present', () => {
    const items = named('Alpha')
    const value = { name: 'Beta' }

    setResource(items, byName, value)
    deepStrictEqual(items, [{ name: 'Alpha' }, value])
  })

  it('replaces the entry matching the name, in place', () => {
    const items = named('Alpha', 'Beta', 'Gamma')
    const value = { name: 'BETA' }

    setResource(items, byName, value)
    strictEqual(items.length, 3)
    strictEqual(items[1], value)
  })

  it('replaces only the first match', () => {
    const items = named('Alpha', 'Alpha')
    const value = { name: 'Alpha' }

    setResource(items, byName, value)
    strictEqual(items.length, 2)
    strictEqual(items[0], value)
  })
})

describe('getObject', () => {
  it('finds an entry by nickname, ignoring case', () => {
    const items = named('Li01_01_base', 'Rh02_02_base')

    strictEqual(getObject(items, byName, 'rh02_02_base'), items[1])
  })

  it('finds an entry by the hash of its nickname', () => {
    const items = named('li_elite')

    strictEqual(getObject(items, byName, getObjectId('li_elite')), items[0])
  })

  // The two id kinds are different hashes; a resource id must not find an object.
  it('does not match a resource id', () => {
    const items = named('li_elite')

    strictEqual(getObject(items, byName, getResourceId('li_elite')), undefined)
  })
})

describe('filterObjects', () => {
  it('returns every match', () => {
    const items = named('li_elite', 'rh_elite', 'LI_ELITE')

    deepStrictEqual(filterObjects(items, byName, 'li_elite'), [items[0], items[2]])
  })
})

describe('setObject', () => {
  /**
   * Regression: this hashed the incoming value with `getObjectId` but scanned the array with
   * `getResourceId`, so the two never agreed and every call appended.
   */
  it('replaces the entry matching the nickname, in place', () => {
    const items = named('li_elite', 'rh_elite')
    const value = { name: 'LI_ELITE' }

    setObject(items, byName, value)
    strictEqual(items.length, 2)
    strictEqual(items[0], value)
  })

  it('appends an entry whose nickname is not present', () => {
    const items = named('li_elite')
    const value = { name: 'rh_elite' }

    setObject(items, byName, value)
    deepStrictEqual(items, [{ name: 'li_elite' }, value])
  })

  it('honours case when asked', () => {
    const items = named('li_elite')
    const value = { name: 'LI_ELITE' }

    setObject(items, byName, value, true)
    deepStrictEqual(items, [{ name: 'li_elite' }, value])
  })
})
