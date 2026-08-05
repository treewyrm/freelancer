import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import * as path from './path.js'
import Resolver from './resolver.js'
import type { Entry, FileSystem } from './filesystem.js'

describe('path', () => {
  it('translates the separator the data is authored with', () => {
    assert.equal(path.join('Universe\\Systems\\Li01\\Li01.ini'), 'Universe/Systems/Li01/Li01.ini')
  })

  it('accepts either separator, since a consumer will pass the other one', () => {
    assert.equal(path.join('fx/weapons\\weapons_ale.ini'), 'fx/weapons/weapons_ale.ini')
  })

  // `[Data] fonts_dir = fonts\files\` names a directory, and the trailing separator is not a
  // segment with an empty name.
  it('drops a trailing separator', () => {
    assert.deepEqual(path.split('fonts\\files\\'), ['fonts', 'files'])
  })

  it('collapses repeated separators', () => {
    assert.deepEqual(path.split('fx\\\\weapons//beam.txm'), ['fx', 'weapons', 'beam.txm'])
  })

  // `[Freelancer] data path = ..\data` is written relative to EXE, the game's working directory.
  it('resolves the data path the way freelancer.ini writes it', () => {
    assert.equal(path.resolve(path.directoryOf('EXE/freelancer.ini'), '..\\data'), 'data')
  })

  it('folds . away and .. into the segment before it', () => {
    assert.deepEqual(path.split('a/./b/../c'), ['a', 'c'])
  })

  it('throws naming the path when .. climbs above the root', () => {
    assert.throws(() => path.split('EXE/../../data'), RangeError)
  })

  it('splits a root-level file into no directory and a name', () => {
    assert.equal(path.directoryOf('cameras.ini'), '')
    assert.equal(path.nameOf('cameras.ini'), 'cameras.ini')
  })

  it('compares paths the way the game compares names', () => {
    assert.ok(path.equals('missions\\mBases.ini', 'MISSIONS/mbases.ini'))
    assert.ok(!path.equals('missions\\mBases.ini', 'MISSIONS/mbase.ini'))
  })
})

/** A tree in memory, spelled the way retail spells one: uppercase directories, lowercase files. */
const tree: Record<string, Entry[]> = {
  '': [
    { name: 'EXE', directory: true },
    { name: 'DATA', directory: true },
  ],
  EXE: [{ name: 'freelancer.ini', directory: false }],
  DATA: [
    { name: 'MISSIONS', directory: true },
    { name: 'cameras.ini', directory: false },
  ],
  'DATA/MISSIONS': [{ name: 'mbases.ini', directory: false }],
}

const fs: FileSystem = {
  async read(target) {
    return new TextEncoder().encode(target)
  },
  async list(target) {
    const entries = tree[target]
    if (!entries) throw new Error(`No such directory: ${target}`)
    return entries
  },
}

describe('resolver', () => {
  it('finds a path whose every segment disagrees with disk in case', async () => {
    assert.equal(await new Resolver(fs).resolve('missions\\mBases.ini'), undefined)
    assert.equal(
      await new Resolver(fs).resolve('DATA\\missions\\mBases.ini'),
      'DATA/MISSIONS/mbases.ini',
    )
  })

  it('reports absence rather than throwing', async () => {
    assert.equal(await new Resolver(fs).resolve('DATA\\MISSIONS\\nothing.ini'), undefined)
  })

  it('does not walk through a file as if it were a directory', async () => {
    assert.equal(await new Resolver(fs).resolve('DATA/cameras.ini/deeper.ini'), undefined)
  })

  it('says whether the target is a directory', async () => {
    assert.equal((await new Resolver(fs).entryOf('data/missions'))?.directory, true)
    assert.equal((await new Resolver(fs).entryOf('data/cameras.ini'))?.directory, false)
  })

  it('lists one directory once when two paths walk through it', async () => {
    let listed = 0

    const counting: FileSystem = {
      read: fs.read,
      async list(target) {
        listed++
        return fs.list(target)
      },
    }

    const resolver = new Resolver(counting)

    await Promise.all([
      resolver.resolve('DATA/MISSIONS/mbases.ini'),
      resolver.resolve('DATA/cameras.ini'),
    ])

    // root, DATA, DATA/MISSIONS — and neither of the shared two twice.
    assert.equal(listed, 3)
  })

  it('throws naming the path when reading something absent', async () => {
    await assert.rejects(() => new Resolver(fs).read('DATA/nothing.ini'), RangeError)
  })

  it('records a folded collision instead of throwing, keeping the first listed', async () => {
    const colliding: FileSystem = {
      read: fs.read,
      async list() {
        return [
          { name: 'Effects.ini', directory: false },
          { name: 'effects.ini', directory: false },
        ]
      },
    }

    const resolver = new Resolver(colliding)

    assert.equal(await resolver.resolve('EFFECTS.INI'), 'Effects.ini')
    assert.deepEqual(resolver.collisions, [
      { directory: '', folded: 'effects.ini', kept: 'Effects.ini', dropped: 'effects.ini' },
    ])
  })

  /**
   * A tool that writes into the tree needs the directory it wrote to re-listed and nothing else.
   * The growing tree here is what an editor saving one file looks like from the resolver's side.
   */
  describe('invalidation', () => {
    /** The shared tree, plus whatever a test adds to `DATA`. */
    const growing = (extra: Entry[]): { fs: FileSystem; listed: () => number } => {
      let listed = 0

      return {
        listed: () => listed,
        fs: {
          read: fs.read,
          async list(target) {
            listed++
            if (target === 'DATA') return [...(tree['DATA'] ?? []), ...extra]
            return fs.list(target)
          },
        },
      }
    }

    it('sees a file that appeared in a directory it had already indexed', async () => {
      const extra: Entry[] = []
      const { fs: growingFs } = growing(extra)
      const resolver = new Resolver(growingFs)

      assert.equal(await resolver.resolve('DATA/new.ini'), undefined)

      extra.push({ name: 'new.ini', directory: false })
      assert.equal(await resolver.resolve('DATA/new.ini'), undefined, 'still cached')

      resolver.clear('DATA')
      assert.equal(await resolver.resolve('DATA/new.ini'), 'DATA/new.ini')
    })

    it('forgets only the directory named, leaving its siblings cached', async () => {
      const { fs: growingFs, listed } = growing([])
      const resolver = new Resolver(growingFs)

      await resolver.resolve('DATA/MISSIONS/mbases.ini')
      assert.equal(listed(), 3, 'root, DATA, DATA/MISSIONS')

      resolver.clear('DATA/MISSIONS')
      await resolver.resolve('DATA/MISSIONS/mbases.ini')

      // Only DATA/MISSIONS is listed again; root and DATA are still indexed.
      assert.equal(listed(), 4)
    })

    it('matches the directory folded, since every other lookup here folds', async () => {
      const extra: Entry[] = []
      const { fs: growingFs } = growing(extra)
      const resolver = new Resolver(growingFs)

      await resolver.resolve('DATA/cameras.ini')
      extra.push({ name: 'new.ini', directory: false })

      resolver.clear('data')
      assert.equal(await resolver.resolve('DATA/new.ini'), 'DATA/new.ini')
    })

    // A path nobody has listed is exactly what a first write into a fresh directory looks like.
    it('is silent about a directory that indexes nothing', () => {
      assert.doesNotThrow(() => new Resolver(fs).clear('DATA/NOWHERE'))
    })

    it('keeps recorded collisions, which describe what was found rather than what is cached', () => {
      const resolver = new Resolver(fs)

      resolver.clear()
      resolver.clear('DATA')

      assert.deepEqual(resolver.collisions, [])
    })
  })
})
