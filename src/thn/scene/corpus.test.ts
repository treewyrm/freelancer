import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import * as corpus from '#/corpus.js'
import { read as readDocument } from '#/thn/index.js'
import { read } from './read.js'
import { write } from './write.js'
import { ENTITY_TYPES, EVENT_TYPES } from './data.js'
import type { Document, Value } from '#/thn/types.js'
import type { Entity, Event, Script } from './types.js'

/**
 * The typed layer against the retail install.
 *
 * Every count here was measured before the code existed and is written down in
 * [THORN.md](../../../docs/THORN.md) beside the evidence for it, so a failure means the reader
 * drifted rather than that the number needs updating. Skips itself when no install is present.
 */
describe('retail scenes, typed', { skip: corpus.skip }, () => {
  const assets = corpus.glob(corpus.root, '**/*.thn')
  const scripts = new Map<string, Script>()

  /**
   * The whole claim of this layer in one assertion: **both export forms read**, and every entity
   * type, event action, axis, flag bit, light type, fog mode and `Y`/`N` in 1,506 scripts resolves
   * to a name. A value this library has not measured is an error, not a pass-through, so this
   * failing anywhere means the vocabulary is short.
   */
  it('reads every one of the 1,506 scripts', () => {
    assert.equal(assets.length, 1506)

    for (const { path, data } of assets) scripts.set(path, read(readDocument(data)))

    assert.equal(scripts.size, 1506)
  })

  const all = <T>(of: (script: Script) => T[]): T[] => [...scripts.values()].flatMap(of)

  it('holds 41,250 entities and 50,785 events', () => {
    assert.equal(all<Entity>((script) => script.entities).length, 41250)
    assert.equal(all<Event>((script) => script.events).length, 50785)
  })

  const tally = (names: string[]): Map<string, number> => {
    const counts = new Map<string, number>()
    for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1)
    return counts
  }

  it('resolves the ten entity types retail uses, and needs no eleventh', () => {
    const counts = tally(all((script) => script.entities).map(({ type }) => type))

    assert.deepEqual(
      Object.fromEntries([...counts].sort()),
      {
        CAMERA: 10590,
        COMPOUND: 3823,
        DEFORMABLE: 1887,
        LIGHT: 3671,
        MARKER: 11404,
        MONITOR: 1071,
        MOTION_PATH: 939,
        PSYS: 1515,
        SCENE: 1505,
        SOUND: 4845,
      },
      'an entity type count changed, or a type outside the vocabulary appeared',
    )

    // Every name the table carries is exercised, so none of the ten is there on a guess.
    assert.deepEqual([...counts.keys()].sort(), Object.keys(ENTITY_TYPES).sort())
  })

  it('resolves the fifteen event actions retail uses', () => {
    const counts = tally(all((script) => script.events).map(({ action }) => action))

    assert.deepEqual(Object.fromEntries([...counts].sort()), {
      ATTACH_ENTITY: 7027,
      CONNECT_HARDPOINTS: 112,
      SET_CAMERA: 3270,
      START_AUDIO_PROP_ANIM: 2970,
      START_CAMERA_PROP_ANIM: 112,
      START_FLR_HEIGHT_ANIM: 97,
      START_FOG_PROP_ANIM: 263,
      START_IK: 4825,
      START_LIGHT_PROP_ANIM: 1070,
      START_MOTION: 13543,
      START_PATH_ANIMATION: 1794,
      START_PSYS: 2276,
      START_PSYS_PROP_ANIM: 718,
      START_SOUND: 6160,
      START_SPATIAL_PROP_ANIM: 6548,
    })

    assert.deepEqual([...counts.keys()].sort(), Object.keys(EVENT_TYPES).sort())
  })

  /**
   * The 355 numeric-form scripts and the 1,151 symbolic ones land on the same vocabulary. Split by
   * whether the *bytes* were numeric, and both sides must use the same entity types — this is what
   * "two authoring tools, not two categories" means once the enums are resolved.
   */
  it('reads the numeric form into the same vocabulary as the symbolic one', () => {
    const numeric = new Set<string>()

    for (const { path, data } of assets) {
      const document = readDocument(data)
      const entities = document.find(({ name }) => name === 'entities')?.value

      if (entities?.type !== 'table') continue

      const first = entities.array[0] ?? entities.entries[0]?.value
      if (first?.type !== 'table') continue

      const type = first.entries.find(
        ({ key }) => key.type === 'string' && key.value === 'type',
      )?.value

      if (type?.type === 'number') numeric.add(path)
    }

    assert.equal(numeric.size, 355)

    const typesIn = (paths: string[]) =>
      new Set(paths.flatMap((path) => scripts.get(path)!.entities.map(({ type }) => type)))

    const inNumeric = typesIn([...numeric])
    const inSymbolic = typesIn([...scripts.keys()].filter((path) => !numeric.has(path)))

    for (const type of inNumeric)
      assert.ok(inSymbolic.has(type), `${type} only in the numeric form`)
  })

  /**
   * `typed → interim → typed` is an identity, over every retail script. The other direction is only
   * a fixed point — the typed layer emits a canonical key order and always the symbolic form — which
   * is why the assertion runs this way round. Byte-exactness belongs to the encoding layer, and
   * [`../corpus.test.ts`](../corpus.test.ts) is where it is pinned.
   */
  it('round-trips every script back through the interim model', () => {
    for (const [path, script] of scripts) assert.deepEqual(read(write(script)), script, path)
  })

  /**
   * Nothing in retail lands in `unknown`. The escape hatch exists for mods, and this measures that
   * the vocabulary covers the shipped data completely rather than merely mostly — `template_id`,
   * which is in none of the game's binaries, is typed rather than swept in here.
   */
  it('leaves nothing unrecognised in any of the 1,506', () => {
    const keys = new Set<string>()

    for (const script of scripts.values()) {
      for (const entity of script.entities) for (const key in entity.unknown) keys.add(key)
      for (const event of script.events) for (const key in event.unknown) keys.add(key)
    }

    assert.deepEqual([...keys], [])
  })

  // The one script with no scene descriptor. Stated because "every scene has exactly one" is the
  // obvious invariant to assume, and it is wrong by one file.
  it('finds one script with no SCENE entity and none with two', () => {
    const counts = [...scripts].map(
      ([path, script]) =>
        [path, script.entities.filter(({ type }) => type === 'SCENE').length] as const,
    )

    assert.deepEqual(
      counts.filter(([, n]) => n !== 1),
      [['SCRIPTS/BASES/st_03b_cityscape_hardpoint_01.thn', 0]],
    )
  })

  // Bit 2 is `SPATIAL` on a sound and `LIT_AMBIENT` on anything that renders. The decode is only
  // decidable because the two never share an entity type, and this is that measurement.
  it('never puts SPATIAL and LIT_AMBIENT on the same entity type', () => {
    const types = new Map<string, Set<string>>()

    for (const entity of all((script) => script.entities))
      for (const flag of ('flags' in entity && entity.flags) || []) {
        let seen = types.get(flag)
        if (!seen) types.set(flag, (seen = new Set()))
        seen.add(entity.type)
      }

    assert.deepEqual([...(types.get('SPATIAL') ?? [])], ['SOUND'])
    assert.deepEqual([...(types.get('LIT_AMBIENT') ?? [])].sort(), [
      'COMPOUND',
      'DEFORMABLE',
      'PSYS',
    ])
  })

  /**
   * `userprops` is Freelancer's, not THORN's — none of its keys is in `thorn.dll`. Two of them are
   * in no game binary in any casing and therefore do nothing at all, which is the kind of thing only
   * a count makes visible.
   */
  it('carries 3,426 inert Priority keys and 22 misspelled No_Fog ones', () => {
    const counts = tally(
      all((script) => script.entities).flatMap((entity) => Object.keys(entity.userprops ?? {})),
    )

    assert.equal(counts.get('Priority'), 3426)
    assert.equal(counts.get('No_Fog'), 22)
    assert.equal(counts.get('category'), 10496)
  })

  /**
   * `pathprops` in the shape the union claims: 936 oriented paths, every one of them `OPEN` and
   * every one of them an even run of position/orientation pairs, and 3 `NULL` paths carrying no
   * `path_data` at all. A path that did not alternate would fail in {@link read} before it got here.
   */
  it('holds 936 oriented paths of 3,151 keyframes and 3 with no path', () => {
    const paths = all((script) => script.entities).flatMap((entity) =>
      entity.type === 'MOTION_PATH' && entity.pathprops ? [entity.pathprops] : [],
    )

    assert.equal(paths.length, 939)
    assert.deepEqual(Object.fromEntries(tally(paths.map(({ path_type }) => path_type))), {
      CV_CROrientationSplinePath: 936,
      NULL: 3,
    })

    const oriented = paths.filter((props) => props.path_type === 'CV_CROrientationSplinePath')

    assert.deepEqual([...new Set(oriented.map(({ flag }) => flag))], ['OPEN'])
    assert.equal(
      oriented.reduce((total, { points }) => total + points.length, 0),
      3151,
    )
  })

  /**
   * **`path_data` survives being parsed.** It is a string in the file — a flag token and a run of
   * `{%f,%f,%f}, ` tuples — so decomposing it into points is only safe if formatting them back
   * reproduces the bytes, down to the six decimals and the five `-0.000000` components `toFixed`
   * would otherwise silently flatten. Compared against the interim document, which is the file.
   */
  it('writes every path_data back byte for byte', () => {
    const strings = (document: Document): string[] => {
      const found: string[] = []

      const walk = (v: Value, key?: string): void => {
        if (v.type === 'string') {
          if (key === 'path_data') found.push(v.value)
        } else if (v.type === 'table') {
          for (const item of v.array) walk(item)
          for (const { key: k, value } of v.entries)
            walk(value, k.type === 'string' ? k.value : undefined)
        }
      }

      for (const { name, value } of document) walk(value, name)
      return found
    }

    let compared = 0

    for (const { path, data } of assets) {
      const before = strings(readDocument(data))
      if (!before.length) continue

      assert.deepEqual(strings(write(scripts.get(path)!)), before, path)
      compared += before.length
    }

    assert.equal(compared, 936)
  })

  // Every retail curve is four numbers per row, which is what lets `points` be a tuple type.
  it('holds 4,845 parameter curves of 13,297 four-number rows', () => {
    let curves = 0
    let rows = 0

    for (const event of all<Event>((script) => script.events)) {
      if (!event.param_curve) continue
      curves++
      rows += event.param_curve.points?.length ?? 0
    }

    assert.equal(curves, 4845)
    assert.equal(rows, 13297)
  })
})
