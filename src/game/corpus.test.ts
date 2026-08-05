import { before, describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import * as corpus from '#/corpus.js'
import { fold } from '#/utility/string.js'
import Game from './game.js'
import Resolver from './resolver.js'
import { readEntries, readLibraries } from './config.js'
import { HARDCODED_FILES, UNRESOLVED_FILES } from './hardcoded.js'

/**
 * The manager against the retail install.
 *
 * Every count here was measured before the code existed, so a failure means something drifted
 * rather than that the number needs updating. Skips itself with a reason when no install is present.
 */
describe('retail install', { skip: corpus.skip }, () => {
  let game: Game

  before(async () => {
    game = await Game.open(corpus.filesystem())
  })

  it('resolves the data path freelancer.ini writes as ..\\data', async () => {
    assert.equal(game.settings.data, 'data')
    assert.equal(await game.paths.resolve(game.settings.data), 'DATA')
  })

  it('names initialworld.ini, which [Data] groups then names a second time', () => {
    assert.equal(game.settings.initialWorld, 'InitialWorld.ini')

    const groups = game.entries.filter(({ key }) => fold(key) === 'groups')

    assert.equal(groups.length, 1)
    assert.equal(fold(groups[0]?.path ?? ''), fold(game.settings.initialWorld ?? ''))
  })

  it('walks 99 [Data] properties over 34 distinct keys', () => {
    const entries = [...readEntries(game.config)]

    assert.equal(entries.length, 99)
    assert.equal(new Set(entries.map(({ key }) => fold(key))).size, 34)
    assert.equal(game.entries.length, 99)
  })

  // The file's own comment: "bases has no filename but the key specifies the load order".
  it('treats bases as an order marker, the only [Data] key with no value', () => {
    const markers = game.entries.filter(({ path }) => path === undefined)

    assert.deepEqual(
      markers.map(({ key }) => key.trim()),
      ['bases'],
    )
  })

  // 34 keys, less `bases` which reads nothing and `fonts_dir` which is a directory.
  it('produces a document for every key but the marker and the directory', () => {
    assert.equal(game.documents.size, 32)
    assert.ok(!game.documents.has('bases'))
    assert.ok(!game.documents.has('fonts_dir'))
  })

  it('keeps repeated keys in load order rather than collapsing them', () => {
    assert.equal(game.documents.get('voices')?.length, 18)
    assert.equal(game.documents.get('fuses')?.length, 16)
    assert.equal(game.documents.get('effects')?.length, 12)
    assert.equal(game.documents.get('sounds')?.length, 7)
    assert.equal(game.documents.get('equipment')?.length, 7)
  })

  // Two keys, one file. A reader that deduplicated by path would load it once and mislabel it.
  it('loads fx\\explosions.ini twice, under explosions and under debris', () => {
    const both = game.entries.filter(({ path }) => path && fold(path) === 'fx\\explosions.ini')

    assert.deepEqual(
      both.map(({ key }) => key.trim()),
      ['explosions', 'debris'],
    )
  })

  // Order is load-bearing: "must load solar archetypes before universe. Universe inspects solar
  // OBJECT_TYPE values."
  it('keeps solar ahead of universe, as the file requires', () => {
    const keys = game.entries.map(({ key }) => fold(key))

    assert.ok(keys.indexOf('solar') < keys.indexOf('universe'))
  })

  /**
   * The one dangling reference in `[Data]`: `fonts_dir = fonts\files\` names a directory retail does
   * not ship. `DATA/FONTS` holds `fonts.ini` and `rich_fonts.ini` and nothing else.
   */
  it('reports fonts_dir as the only [Data] entry that does not resolve', () => {
    const failed = game.entries.filter(({ error }) => error !== undefined)

    assert.equal(failed.length, 1)
    assert.equal(failed[0]?.key.trim(), 'fonts_dir')
  })

  it('resolves every other [Data] path', () => {
    const unresolved = game.entries.filter(
      ({ path, resolved, key }) =>
        path !== undefined && resolved === undefined && fold(key) !== 'fonts_dir',
    )

    assert.deepEqual(unresolved, [])
  })
})

describe('resource libraries', { skip: corpus.skip }, () => {
  let game: Game

  before(async () => {
    game = await Game.open(corpus.filesystem())
  })

  // [Resources] lists six. The id space has seven, because resources.dll is compiled into the
  // executable and is library 0.
  it('prepends resources.dll to the six the file lists', async () => {
    const game = await Game.open(corpus.filesystem(), { strings: false })
    const paths = readLibraries(game.config, 'EXE/freelancer.ini')

    assert.equal(paths.length, 7)
    assert.equal(paths[0], 'EXE/resources.dll')
    assert.equal(paths[1], 'EXE/InfoCards.dll')
  })

  it('resolves ids_name 196609 to New York', () => {
    assert.equal(game.library.names.get(196609), 'New York')
  })

  it('reads 13,121 names and 5,307 infocards', () => {
    assert.equal(game.library.names.size, 13121)
    assert.equal(game.library.infocards.size, 5307)
  })

  it('leaves the library empty when strings are not asked for', async () => {
    const bare = await Game.open(corpus.filesystem(), { strings: false })

    assert.equal(bare.library.names.size, 0)
    assert.equal(bare.library.infocards.size, 0)
  })
})

describe('case folding across the whole tree', { skip: corpus.skip }, () => {
  it('folds 8,368 file paths without a single collision', async () => {
    const resolver = new Resolver(corpus.filesystem())
    let files = 0

    const walk = async (path: string): Promise<void> => {
      for (const entry of await resolver.list(path)) {
        const child = path === '' ? entry.name : `${path}/${entry.name}`

        if (entry.directory) await walk(child)
        else files++
      }
    }

    await walk('DATA')

    assert.equal(files, 8368)
    assert.deepEqual(resolver.collisions, [])
  })
})

describe('paths compiled into the binaries', { skip: corpus.skip }, () => {
  let game: Game

  before(async () => {
    game = await Game.open(corpus.filesystem(), { strings: false })
  })

  /**
   * `[Data]` is not the whole load list — the missions, the NPC and faction tables, the random
   * mission data and most of the interface are opened by a name compiled into `content.dll` or
   * `Freelancer.exe`. A tool walking `[Data]` alone reads about half the data.
   */
  it('resolves all 58 hardcoded paths', async () => {
    const missing: string[] = []

    for (const { path } of HARDCODED_FILES)
      if (!(await game.paths.has(`${game.settings.data}/${path}`))) missing.push(path)

    assert.equal(HARDCODED_FILES.length, 58)
    assert.deepEqual(missing, [])
  })

  it('names none of them in [Data], which is the point of the table', () => {
    const listed = new Set(
      game.entries.flatMap(({ path }) =>
        path === undefined ? [] : [fold(path).replaceAll('\\', '/')],
      ),
    )

    const overlap = HARDCODED_FILES.map(({ path }) => fold(path).replaceAll('\\', '/')).filter(
      (path) => listed.has(path),
    )

    assert.deepEqual(overlap, [])
  })

  it('keeps the six known dead references dead', async () => {
    const found: string[] = []

    for (const { path } of UNRESOLVED_FILES)
      if (await game.paths.has(`${game.settings.data}/${path}`)) found.push(path)

    assert.equal(UNRESOLVED_FILES.length, 6)
    assert.deepEqual(found, [])
  })
})
