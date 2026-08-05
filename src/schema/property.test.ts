import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import type { Property, Section, Value } from '#/ini/types.js'
import { read as readText } from '#/ini/text/read.js'
import * as value from '#/ini/value.js'
import { field } from './index.js'
import { fields, readSection, writeSection, type Table } from './property.js'

/**
 * A section from `name = a, b, c` lines, through the real text parser.
 *
 * Hand-building the values would type every one of them as a string and quietly hide whether a
 * reader depends on the tag — which is the thing the typed layer must never do.
 */
const parse = (...lines: string[]): Section => {
  const [section] = readText(['[Test]', ...lines].join('\n'))
  assert.ok(section)
  return section
}

interface Sample {
  nickname?: string
  price?: number
  visible?: boolean
  separable?: boolean
  pos?: [number, number, number]
  lodranges?: number[]
  libraries?: string[]
  rows?: { name: string; weight?: number }[]
  opaque?: Value[][]
  unrecognized?: Property[]
}

const f = fields<Sample>()

const TABLE: Table<Sample> = {
  nickname: f.text('nickname'),
  price: f.number('price'),
  visible: f.boolean('visible'),
  separable: f.flag('separable'),
  pos: f.tuple(3, 'pos'),
  lodranges: f.numbers('lodranges'),
  material_library: f.merge('libraries'),
  weight: f.each(
    'rows',
    (values) => {
      const [name, weight] = field.values(values, 'sn')
      if (typeof name !== 'string') return undefined
      return { name, ...(typeof weight === 'number' && { weight }) }
    },
    ({ name, weight }) => (weight === undefined ? [value.from(name)] : value.list(name, weight)),
  ),
  undecoded: f.raw('opaque'),
}

/** Collects what a read chose not to do, so a test can assert on it. */
const reporter = () => {
  const messages: string[] = []
  return { messages, report: (message: string) => void messages.push(message) }
}

describe('reading a section sequentially', () => {
  it('reads each declared kind', () => {
    const read = readSection(
      parse(
        'nickname = li_elite',
        'price = 100',
        'visible = true',
        'separable',
        'pos = 1, 2, 3',
        'lodranges = 0, 50, 100, 200, 500',
      ),
      TABLE,
    )

    assert.deepEqual(read, {
      nickname: 'li_elite',
      price: 100,
      visible: true,
      separable: true,
      pos: [1, 2, 3],
      lodranges: [0, 50, 100, 200, 500],
    })
  })

  // 202 retail pairs repeat inside one section. The game re-runs the instruction, so the last
  // assignment is the one that stands — three [start_effect] actions differ on this.
  it('takes the last occurrence of a singular field, and says so', () => {
    const { messages, report } = reporter()
    const read = readSection(parse('nickname = first', 'nickname = second'), TABLE, report)

    assert.equal(read.nickname, 'second')
    assert.deepEqual(messages, [])
  })

  it('keeps a property the table does not name, in file order', () => {
    const read = readSection(parse('nickname = a', '260800 = 1', ': = 2', 'price = 3'), TABLE)

    assert.deepEqual(read, {
      nickname: 'a',
      price: 3,
      unrecognized: [
        { name: '260800', values: [value.integer(1)] },
        { name: ':', values: [value.integer(2)] },
      ],
    })
  })

  // A missing '=' makes the value part of the name: [Trigger] has a property named 'system st02'.
  it('keeps a property whose missing separator swallowed its value', () => {
    const read = readSection(parse('system st02'), TABLE)

    assert.deepEqual(read.unrecognized, [{ name: 'system st02', values: [] }])
  })

  it('folds case on lookup and never in place', () => {
    const read = readSection(parse('NickName = a', 'PRICE = 2'), TABLE)

    assert.deepEqual(read, { nickname: 'a', price: 2 })
  })

  it('returns recognized fields in table order, not file order', () => {
    const read = readSection(parse('pos = 1, 2, 3', 'price = 2', 'nickname = a'), TABLE)

    assert.deepEqual(Object.keys(read), ['nickname', 'price', 'pos'])
  })

  // Invariant 4: absence is a missing key, never a present undefined.
  it('leaves an absent field absent', () => {
    const read = readSection(parse('nickname = a'), TABLE)

    assert.equal('price' in read, false)
    assert.equal('unrecognized' in read, false)
  })
})

describe('flag', () => {
  // [CollisionGroup] separable is bare 456 times and '= true' 28 times, never '= false'. Reading
  // index 0 of a zero-value property is a hard error in the game, so presence is the test.
  it('is true bare and true written out', () => {
    assert.equal(readSection(parse('separable'), TABLE).separable, true)
    assert.equal(readSection(parse('separable = true'), TABLE).separable, true)
  })

  it('is false when a value says so', () => {
    assert.equal(readSection(parse('separable = false'), TABLE).separable, false)
  })

  // INI_Reader takes only 'true' and 'false' by name and falls through to atoi otherwise.
  it('is false for yes', () => {
    assert.equal(readSection(parse('separable = yes'), TABLE).separable, false)
  })

  it('writes bare when true and explicit when false', () => {
    assert.deepEqual(writeSection('Test', TABLE, { separable: true }).properties, [
      { name: 'separable', values: [] },
    ])
    assert.deepEqual(writeSection('Test', TABLE, { separable: false }).properties, [
      { name: 'separable', values: [value.string('false')] },
    ])
  })
})

describe('tuple', () => {
  it('reads a property of exactly its width', () => {
    assert.deepEqual(readSection(parse('pos = 1, 2, 3'), TABLE).pos, [1, 2, 3])
  })

  // Reading [Sound] range as a fixed pair invents a second number for 11 sounds.
  it('drops a property of the wrong width and reports it', () => {
    const { messages, report } = reporter()
    const read = readSection(parse('pos = 1, 2'), TABLE, report)

    assert.equal('pos' in read, false)
    assert.deepEqual(messages, ['pos: expected 3 values, found 2'])
  })

  // Consumed means an instruction ran, not that a value came out — otherwise what lands in
  // `unrecognized` depends on whether the data was well formed, and a write-back emits it twice.
  it('still consumes a property of the wrong width', () => {
    const read = readSection(parse('pos = 1, 2'), TABLE)

    assert.equal('unrecognized' in read, false)
  })
})

describe('merge and numbers', () => {
  // [Ship] material_library: one list however it was written.
  it('merge accumulates across occurrences and across values on one line', () => {
    const read = readSection(
      parse('material_library = a.mat', 'material_library = b.mat, c.mat'),
      TABLE,
    )

    assert.deepEqual(read.libraries, ['a.mat', 'b.mat', 'c.mat'])
  })

  it('numbers takes the last occurrence rather than accumulating', () => {
    const read = readSection(parse('lodranges = 1, 2', 'lodranges = 3, 4, 5'), TABLE)

    assert.deepEqual(read.lodranges, [3, 4, 5])
  })

  it('merge writes one property per value', () => {
    const written = writeSection('Test', TABLE, { libraries: ['a.mat', 'b.mat'] })

    assert.deepEqual(written.properties, [
      { name: 'material_library', values: [value.string('a.mat')] },
      { name: 'material_library', values: [value.string('b.mat')] },
    ])
  })
})

describe('each', () => {
  it('yields one row per occurrence, in file order', () => {
    const read = readSection(parse('weight = waggle, 0.5', 'weight = corkscrew, 0.25'), TABLE)

    assert.deepEqual(read.rows, [
      { name: 'waggle', weight: 0.5 },
      { name: 'corkscrew', weight: 0.25 },
    ])
  })

  it('keeps a row whose optional tail is absent', () => {
    assert.deepEqual(readSection(parse('weight = waggle'), TABLE).rows, [{ name: 'waggle' }])
  })

  it('drops a row its mapper cannot read, and reports it', () => {
    const { messages, report } = reporter()
    const read = readSection(parse('weight =', 'weight = waggle, 1'), TABLE, report)

    assert.deepEqual(read.rows, [{ name: 'waggle', weight: 1 }])
    assert.equal(messages.length, 1)
  })
})

describe('raw', () => {
  // MB_GotoGuide is eight positional values with one sample each: kept, not guessed at.
  it('keeps values exactly as read, one array per occurrence', () => {
    const read = readSection(parse('undecoded = 1, two, 3.5'), TABLE)

    assert.deepEqual(read.opaque, [[value.integer(1), value.string('two'), value.float(3.5)]])
  })
})

interface Zones {
  exclusions?: { zone: string; fog_far?: number; shell?: string }[]
  factions?: string[]
  unrecognized?: Property[]
}

const z = fields<Zones>()
const e = fields<NonNullable<Zones['exclusions']>[number]>()

const ZONES: Table<Zones> = {
  ...z.group(
    'exclusion',
    'exclusions',
    (values) => {
      const [zone] = field.values(values, 's')
      return typeof zone === 'string' ? { zone } : undefined
    },
    ({ zone }) => [value.from(zone)],
    {
      fog_far: e.number('fog_far'),
      zone_shell: e.text('shell'),
    },
  ),
  faction: z.merge('factions'),
}

describe('group', () => {
  // [Exclusion Zones]: 169 sections, 634 openers, zero members before the first one. Read flat,
  // which shell belongs to which zone is gone.
  it('gives each opener the properties that follow it', () => {
    const read = readSection(
      parse(
        'exclusion = zone_1',
        'fog_far = 9000',
        'zone_shell = walker.3db',
        'exclusion = zone_3',
        'zone_shell = generic.3db',
      ),
      ZONES,
    )

    assert.deepEqual(read.exclusions, [
      { zone: 'zone_1', fog_far: 9000, shell: 'walker.3db' },
      { zone: 'zone_3', shell: 'generic.3db' },
    ])
  })

  it('opens a row that owns nothing', () => {
    const read = readSection(parse('exclusion = zone_1', 'exclusion = zone_2'), ZONES)

    assert.deepEqual(read.exclusions, [{ zone: 'zone_1' }, { zone: 'zone_2' }])
  })

  // 497 [Zone] faction properties in UNIVERSE/SYSTEMS/INTRO/intro.ini precede every encounter in
  // their section, and the game loads that file — so a leading member cannot throw.
  it('keeps a member with no open row, and reports it', () => {
    const { messages, report } = reporter()
    const read = readSection(parse('fog_far = 9000', 'exclusion = zone_1'), ZONES, report)

    assert.deepEqual(read.exclusions, [{ zone: 'zone_1' }])
    assert.deepEqual(read.unrecognized, [{ name: 'fog_far', values: [value.integer(9000)] }])
    assert.deepEqual(messages, ['fog_far: no open exclusion to attach to'])
  })

  it('writes each row with its own members, restoring the interleave', () => {
    const written = writeSection('Test', ZONES, {
      exclusions: [
        { zone: 'zone_1', fog_far: 9000, shell: 'walker.3db' },
        { zone: 'zone_3', shell: 'generic.3db' },
      ],
    })

    assert.deepEqual(
      written.properties.map(({ name, values }) => [name, values.map(({ value }) => value)]),
      [
        ['exclusion', ['zone_1']],
        ['fog_far', [9000]],
        ['zone_shell', ['walker.3db']],
        ['exclusion', ['zone_3']],
        ['zone_shell', ['generic.3db']],
      ],
    )
  })

  it('round-trips a section that mixes a group with a plain field', () => {
    const section = parse(
      'exclusion = zone_1',
      'fog_far = 9000',
      'faction = li_n_grp',
      'exclusion = zone_2',
    )

    const read = readSection(section, ZONES)
    const again = readSection(writeSection('Test', ZONES, read as Zones), ZONES)

    assert.deepEqual(again, read)
  })
})

describe('writing a section', () => {
  it('emits recognized fields in table order and unrecognized after them', () => {
    const written = writeSection('Test', TABLE, {
      price: 100,
      nickname: 'a',
      unrecognized: [{ name: '260800', values: [] }],
    })

    assert.deepEqual(
      written.properties.map(({ name }) => name),
      ['nickname', 'price', '260800'],
    )
  })

  it('emits nothing for an absent field', () => {
    assert.deepEqual(writeSection('Test', TABLE, { nickname: 'a' }).properties, [
      { name: 'nickname', values: [value.string('a')] },
    ])
  })

  it('is a fixed point over typed to interim and back', () => {
    const read = readSection(
      parse(
        'nickname = li_elite',
        'price = 100',
        'visible = false',
        'separable',
        'pos = 1, 2, 3',
        'material_library = a.mat',
        'material_library = b.mat',
        'weight = waggle, 0.5',
        'undecoded = 1, two',
        'stray = 7',
      ),
      TABLE,
    )

    const again = readSection(writeSection('Test', TABLE, read as Sample), TABLE)

    assert.deepEqual(again, read)
  })
})
