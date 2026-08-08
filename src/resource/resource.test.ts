import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import { isImage, read } from './read.js'
import { write, writeSection } from './write.js'
import { readBlock, readStrings, writeStrings, blockOf, slotOf, indexOf } from './strings.js'
import { readCard, readInfocards, writeCard, writeInfocards } from './infocards.js'
import {
  globalIdOf,
  languageOf,
  libraryOf,
  localOf,
  partition,
  readLibrary,
  writeLibrary,
} from './library.js'
import { LANGUAGE_ENGLISH_US, LANGUAGE_NEUTRAL, Type } from './data.js'
import type { Resource } from './types.js'

/**
 * Wraps a `.rsrc` payload in the smallest headers a PE32 needs, so reader tests do not depend on
 * the writer. The section lands at RVA 0x1000, which is also its file offset.
 */
const image = (resource: Uint8Array, { magic = 0x10b } = {}): Uint8Array => {
  const bytes = new Uint8Array(0x1000 + resource.byteLength)
  const view = new DataView(bytes.buffer)

  view.setUint16(0, 0x5a4d, true)
  view.setUint32(0x3c, 0x80, true)

  const pe = 0x80
  view.setUint32(pe, 0x00004550, true)
  view.setUint16(pe + 4, 0x14c, true)
  view.setUint16(pe + 6, 1, true) // one section
  view.setUint16(pe + 20, 224, true)
  view.setUint16(pe + 22, 0x210e, true)

  const optional = pe + 24
  view.setUint16(optional, magic, true)
  view.setUint32(optional + 92, 16, true)
  view.setUint32(optional + 96 + 2 * 8, 0x1000, true) // resource directory RVA
  view.setUint32(optional + 96 + 2 * 8 + 4, resource.byteLength, true)

  const table = optional + 224
  for (const [i, character] of [...'.rsrc'].entries()) bytes[table + i] = character.charCodeAt(0)
  view.setUint32(table + 8, resource.byteLength, true)
  view.setUint32(table + 12, 0x1000, true)
  view.setUint32(table + 16, resource.byteLength, true)
  view.setUint32(table + 20, 0x1000, true)

  bytes.set(resource, 0x1000)

  return bytes
}

/** A three-level directory holding exactly one resource, built by hand. */
const directory = (
  type: number,
  id: number,
  language: number,
  payload: Uint8Array,
  { codePage = 1252 } = {},
): Uint8Array => {
  const bytes = new Uint8Array(0x58 + payload.byteLength)
  const view = new DataView(bytes.buffer)

  const table = (at: number, entryId: number, target: number, subdirectory: boolean): void => {
    view.setUint16(at + 8, 4, true) // version major
    view.setUint16(at + 14, 1, true) // one numbered entry
    view.setUint32(at + 16, entryId, true)
    view.setUint32(at + 20, subdirectory ? 0x80000000 | target : target, true)
  }

  table(0x00, type, 0x18, true)
  table(0x18, id, 0x30, true)
  table(0x30, language, 0x48, false)

  view.setUint32(0x48, 0x1000 + 0x58, true) // an image RVA
  view.setUint32(0x4c, payload.byteLength, true)
  view.setUint32(0x50, codePage, true)
  bytes.set(payload, 0x58)

  return bytes
}

describe('isImage', () => {
  it('recognises a PE and nothing else', () => {
    assert.ok(isImage(image(directory(Type.String, 1, 0x409, new Uint8Array(32)))))
    assert.ok(!isImage(new TextEncoder().encode('[Section]\n')))
    assert.ok(!isImage(new Uint8Array(3)))
  })

  it('rejects an MZ whose e_lfanew reaches no PE signature', () => {
    const bytes = new Uint8Array(0x100)
    new DataView(bytes.buffer).setUint16(0, 0x5a4d, true)
    assert.ok(!isImage(bytes))
  })
})

describe('read', () => {
  it('reads one resource with its type, id, language and code page', () => {
    const payload = Uint8Array.from([1, 2, 3, 4])
    const resources = read(image(directory(Type.Html, 42, 0x409, payload, { codePage: 1252 })))

    assert.equal(resources.length, 1)
    assert.deepEqual(resources[0]!.data, payload)
    assert.partialDeepStrictEqual(resources[0]!, {
      type: Type.Html,
      id: 42,
      language: 0x409,
      codePage: 1252,
    })
  })

  it('returns nothing when the image has no resource directory', () => {
    const bytes = image(new Uint8Array(0))
    new DataView(bytes.buffer).setUint32(0x80 + 24 + 96 + 2 * 8, 0, true)
    assert.deepEqual(read(bytes), [])
  })

  it('refuses anything that is not a PE32', () => {
    assert.throws(() => read(new Uint8Array(64)), TypeError)
    assert.throws(() => read(image(new Uint8Array(0x58), { magic: 0x20b })), TypeError)
  })

  it('refuses a data entry that runs past the end of the image', () => {
    const bytes = image(directory(Type.String, 1, 0x409, new Uint8Array(4)))
    new DataView(bytes.buffer).setUint32(0x1000 + 0x4c, 0x10000, true)
    assert.throws(() => read(bytes), RangeError)
  })

  it('reads a named type, as ebueula.dll carries', () => {
    // A named entry points at a counted UTF-16 string elsewhere in the directory.
    const source = directory(0, 7, 0x409, Uint8Array.from([9]))
    const bytes = new Uint8Array(source.byteLength + 24)
    bytes.set(source)

    const view = new DataView(bytes.buffer)
    const at = source.byteLength
    view.setUint32(0x10, 0x80000000 | at, true) // root entry names its type
    view.setUint16(0x0c, 1, true) // one named
    view.setUint16(0x0e, 0, true) // and no numbered
    view.setUint16(at, 5, true)
    for (const [i, character] of [...'STUFF'].entries())
      view.setUint16(at + 2 + i * 2, character.charCodeAt(0), true)

    assert.equal(read(image(bytes))[0]!.type, 'STUFF')
  })
})

describe('write', () => {
  const resources: Resource[] = [
    { type: Type.Html, id: 9, language: 0x409, codePage: 1252, data: Uint8Array.from([1, 2]) },
    { type: Type.String, id: 1, language: 0x409, codePage: 1252, data: Uint8Array.from([3]) },
    { type: Type.String, id: 1, language: 0x407, codePage: 1252, data: Uint8Array.from([4, 5, 6]) },
  ]

  it('round-trips a resource list', () => {
    const back = read(write(resources))

    assert.equal(back.length, 3)

    for (const resource of resources) {
      const found = back.find(
        ({ type, id, language }) =>
          type === resource.type && id === resource.id && language === resource.language,
      )

      assert.ok(found, `${resource.type}/${resource.id} came back`)
      assert.deepEqual(found.data, resource.data)
      assert.equal(found.codePage, resource.codePage)
    }
  })

  it('writes an image with no entry point and no code', () => {
    const bytes = write(resources)
    const view = new DataView(bytes.buffer)
    const optional = view.getUint32(0x3c, true) + 24

    assert.equal(view.getUint32(optional + 16, true), 0, 'entry point')
    assert.equal(view.getUint32(optional + 4, true), 0, 'size of code')

    // Characteristics sit in the last two bytes of the COFF header, right before the optional one.
    const characteristics = view.getUint16(optional - 2, true)
    assert.ok(characteristics & 0x2000, 'DLL')
    assert.ok(!(characteristics & 0x0001), 'relocations not stripped')
  })

  it('computes a checksum the algorithm agrees with', () => {
    const bytes = write(resources)
    const view = new DataView(bytes.buffer)
    const field = view.getUint32(0x3c, true) + 24 + 64
    const stated = view.getUint32(field, true)

    let sum = 0

    for (let i = 0; i < bytes.byteLength; i += 2) {
      if (i === field || i === field + 2) continue
      sum += view.getUint16(i, true)
      sum = (sum & 0xffff) + (sum >>> 16)
    }

    sum = (sum & 0xffff) + (sum >>> 16)
    assert.equal(stated, (sum + bytes.byteLength) >>> 0)
  })

  it('sorts directory entries, named before numbered', () => {
    const bytes = write([
      { type: 'ZED', id: 2, language: 0, codePage: 0, data: new Uint8Array(1) },
      { type: 10, id: 1, language: 0, codePage: 0, data: new Uint8Array(1) },
      { type: 2, id: 1, language: 0, codePage: 0, data: new Uint8Array(1) },
      { type: 'ABLE', id: 1, language: 0, codePage: 0, data: new Uint8Array(1) },
    ])

    assert.deepEqual(
      read(bytes).map(({ type }) => type),
      ['ABLE', 'ZED', 2, 10],
    )
  })

  it('sorts languages within an entry ascending', () => {
    const back = read(
      write([
        { type: 6, id: 1, language: 0x409, codePage: 0, data: Uint8Array.from([1]) },
        { type: 6, id: 1, language: 0x007, codePage: 0, data: Uint8Array.from([2]) },
      ]),
    )

    assert.deepEqual(
      back.map(({ language }) => language),
      [0x007, 0x409],
    )
  })

  it('refuses two entries for the same type, id and language', () => {
    assert.throws(
      () =>
        write([
          { type: 6, id: 1, language: 0x409, codePage: 0, data: new Uint8Array(1) },
          { type: 6, id: 1, language: 0x409, codePage: 0, data: new Uint8Array(2) },
        ]),
      RangeError,
    )
  })

  it('produces the same bytes from the same input', () => {
    assert.deepEqual(write(resources), write(resources))
  })

  it('aligns every payload to four bytes and fills the gaps with the linker filler', () => {
    const section = writeSection(
      [
        { type: 6, id: 1, language: 0, codePage: 0, data: Uint8Array.from([0xde, 0xad]) },
        { type: 6, id: 2, language: 0, codePage: 0, data: Uint8Array.from([0xbe, 0xef]) },
      ],
      0x1000,
    )

    const bytes = String.fromCharCode(...section)
    const at = bytes.indexOf('Þ­')

    assert.ok(at > 0, 'the first payload is in the section')
    assert.equal(at % 4, 0, 'and starts on a four-byte boundary')

    // Two bytes of payload leave two of filler before the next one.
    assert.equal(bytes.slice(at, at + 6), 'Þ­PA¾ï')
  })
})

describe('strings', () => {
  it('maps an index to its block and slot', () => {
    assert.deepEqual([blockOf(0), slotOf(0)], [1, 0])
    assert.deepEqual([blockOf(15), slotOf(15)], [1, 15])
    assert.deepEqual([blockOf(16), slotOf(16)], [2, 0])
    assert.equal(indexOf(blockOf(4075), slotOf(4075)), 4075)
  })

  it('writes all sixteen slots of a touched block', () => {
    const [resource] = writeStrings(new Map([[0, 'a']]))

    // One counted run of a single unit, then fifteen empty ones.
    assert.equal(resource!.data.byteLength, 2 + 2 + 15 * 2)
    assert.equal(resource!.id, 1)
    assert.equal(resource!.language, LANGUAGE_ENGLISH_US)
  })

  it('round-trips strings, holes and all', () => {
    const strings = new Map([
      [0, 'Object Unknown'],
      [15, 'slot fifteen'],
      [16, 'next block'],
      [4075, 'the last retail id'],
    ])

    assert.deepEqual(readStrings(writeStrings(strings)), strings)
  })

  it('reads a zero-length slot as absent rather than empty', () => {
    const strings = readStrings(writeStrings(new Map([[1, 'second slot']])))

    assert.equal(strings.size, 1)
    assert.ok(!strings.has(0))
  })

  it('counts UTF-16 code units, so a surrogate pair survives', () => {
    const strings = new Map([[0, 'a\u{1f680}b']])
    assert.deepEqual(readStrings(writeStrings(strings)), strings)
  })

  it('refuses a block whose last run overruns its payload', () => {
    const data = Uint8Array.from([0xff, 0x00, 0x41, 0x00])
    assert.throws(() => readBlock(data, 1), RangeError)
  })

  it('refuses a negative or fractional index', () => {
    assert.throws(() => writeStrings(new Map([[-1, 'x']])), RangeError)
    assert.throws(() => writeStrings(new Map([[1.5, 'x']])), RangeError)
  })
})

describe('infocards', () => {
  const card = '<?xml version="1.0" encoding="UTF-16"?><RDL><PUSH/><TEXT>Hi</TEXT><POP/></RDL>'

  it('writes a byte order mark and strips it on read', () => {
    const data = writeCard(card)

    assert.equal(data[0], 0xff)
    assert.equal(data[1], 0xfe)
    assert.equal(readCard(data), card)
  })

  it('reads a payload with no mark as it stands', () => {
    const data = new Uint8Array(4)
    new DataView(data.buffer).setUint16(0, 0x41, true)
    new DataView(data.buffer).setUint16(2, 0x42, true)

    assert.equal(readCard(data), 'AB')
  })

  it('round-trips cards by id', () => {
    const cards = new Map([
      [3, card],
      [1079, '<RDL><TEXT>\u{1f680}</TEXT></RDL>'],
    ])

    assert.deepEqual(readInfocards(writeInfocards(cards)), cards)
  })

  it('refuses a payload that is not whole UTF-16 units', () => {
    assert.throws(() => readCard(new Uint8Array(3)), RangeError)
  })

  it('survives the container', () => {
    const cards = new Map([[3, card]])
    assert.deepEqual(readInfocards(read(write(writeInfocards(cards)))), cards)
  })
})

describe('library', () => {
  it('splits a global id into its library and local parts', () => {
    assert.equal(globalIdOf(0, 12), 12)
    assert.equal(globalIdOf(3, 1000), 197608)
    assert.equal(libraryOf(197608), 3)
    assert.equal(localOf(197608), 1000)
  })

  it('merges libraries into one id space, keeping names and infocards apart', () => {
    const { names, infocards } = readLibrary([
      writeStrings(new Map([[7, 'from resources.dll']])),
      writeInfocards(new Map([[7, 'from infocards.dll']])),
    ])

    assert.equal(names.get(7), 'from resources.dll')
    assert.equal(infocards.get(globalIdOf(1, 7)), 'from infocards.dll')
    assert.ok(!infocards.has(7))
  })

  it('partitions global ids back into per-library maps', () => {
    const libraries = partition(
      new Map([
        [globalIdOf(0, 1), 'a'],
        [globalIdOf(2, 5), 'b'],
      ]),
    )

    assert.equal(libraries.length, 3)
    assert.deepEqual(libraries[0], new Map([[1, 'a']]))
    assert.deepEqual(libraries[1], new Map())
    assert.deepEqual(libraries[2], new Map([[5, 'b']]))
  })

  it('refuses an id past the requested library count', () => {
    assert.throws(() => partition(new Map([[globalIdOf(4, 1), 'a']]), 2), RangeError)
  })
})

describe('languageOf', () => {
  const at = (language: number, type: Type = Type.String): Resource => ({
    type,
    id: 1,
    language,
    codePage: 1252,
    data: new Uint8Array(),
  })

  it('finds the language every content resource shares', () => {
    assert.equal(languageOf([at(0x409), { ...at(0x409), id: 2 }]), 0x409)
  })

  it('ignores the version block, which sits at neutral', () => {
    assert.equal(languageOf([at(LANGUAGE_NEUTRAL, Type.Version), at(0x409)]), 0x409)
  })

  it('gives up when they disagree, rather than picking one', () => {
    assert.equal(languageOf([at(0x409), { ...at(0x411), id: 2 }]), undefined)
  })

  it('has nothing to derive from a library with no content', () => {
    assert.equal(languageOf([at(LANGUAGE_NEUTRAL, Type.Version)]), undefined)
  })
})

/**
 * The carry-through rules, each pinned by the counterexample retail does not supply.
 *
 * Every case here is something the maps cannot represent, so a writer that treats "not a string or
 * a card" as the whole of what to keep deletes it — silently, since the loss is a resource that was
 * never in the map to be missed.
 */
describe('writeLibrary', () => {
  const resource = (over: Partial<Resource> = {}): Resource => ({
    type: Type.String,
    id: 1,
    language: LANGUAGE_ENGLISH_US,
    codePage: 1252,
    data: new Uint8Array(),
    ...over,
  })

  const find = (resources: Resource[], type: Resource['type'], id: Resource['id']) =>
    resources.find((entry) => entry.type === type && entry.id === id)

  it('keeps a resource of a type it does not model', () => {
    const version = resource({ type: Type.Version, data: Uint8Array.of(1, 2, 3) })
    const written = writeLibrary([version], { names: new Map([[0, 'a']]) })

    assert.deepEqual(find(written, Type.Version, 1), version)
  })

  it('keeps a string or card whose entry id is a name, which no reader consumes', () => {
    const named = resource({ id: 'PREPSTUBDATA', data: Uint8Array.of(9) })
    const written = writeLibrary([named], { names: new Map([[0, 'a']]) })

    assert.deepEqual(find(written, Type.String, 'PREPSTUBDATA'), named)
  })

  it('keeps content at a language other than the one being written', () => {
    const other = resource({ language: 0x411, id: 3, data: Uint8Array.of(7) })
    const written = writeLibrary([other], { names: new Map([[0, 'a']]) })

    assert.deepEqual(
      written.find((entry) => entry.language === 0x411),
      other,
    )
  })

  it('keeps a block that was all holes when it was read', () => {
    const [hollow] = writeStrings(new Map([[16, '']]))
    assert.ok(hollow)

    const written = writeLibrary([hollow], { names: new Map([[0, 'a']]) })

    assert.deepEqual(find(written, Type.String, 2), hollow)
    assert.equal(readStrings(written).size, 1)
  })

  /**
   * The other half of the rule above. A block absent from the map because the caller emptied it is
   * not the same thing as one that held nothing to begin with, and carrying it would undo the
   * deletion — so the two are told apart by reading the original, not by its absence from the map.
   */
  it('drops a block the caller emptied, rather than resurrecting it', () => {
    const filled = writeStrings(new Map([[16, 'gone']]))
    const written = writeLibrary(filled, { names: new Map([[0, 'a']]) })

    assert.equal(find(written, Type.String, 2), undefined)
  })

  it('carries each entry’s code page rather than stamping the option across them', () => {
    const original = writeStrings(new Map([[0, 'a']]), { codePage: 932 })
    const written = writeLibrary(original, { names: new Map([[0, 'b']]) })

    assert.equal(find(written, Type.String, 1)?.codePage, 932)
  })

  it('reproduces a list built from strings and cards', () => {
    const names = new Map([[0, 'Object Unknown']])
    const infocards = new Map([[7, '<RDL><PUSH/><POP/></RDL>']])
    const original = [...writeStrings(names), ...writeInfocards(infocards)]

    const written = writeLibrary(original, { names, infocards })

    assert.deepEqual(readStrings(written), names)
    assert.deepEqual(readInfocards(written), infocards)
    assert.deepEqual(writeSection(written, 0x1000), writeSection(original, 0x1000))
  })
})
