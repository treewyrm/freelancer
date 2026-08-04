import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import * as corpus from '../corpus.js'
import { isImage, read } from './read.js'
import { write, writeSection } from './write.js'
import { readStrings, writeStrings } from './strings.js'
import { readInfocards, writeInfocards } from './infocards.js'
import { globalIdOf, readLibrary, RETAIL_LIBRARIES } from './library.js'
import { CODE_PAGE_WINDOWS_1252, LANGUAGE_ENGLISH_US, LANGUAGE_NEUTRAL, Type } from './data.js'

/**
 * The reader and writer against the retail install.
 *
 * Every count here was measured before the code existed, so a failure means the reader drifted
 * rather than that the number needs updating. Skips itself with a reason when no install is
 * present — and unlike the INI and THN sweeps this one reads `EXE`, not `DATA`.
 *
 * The measured counts are scoped to the seven libraries Freelancer loads, never to whatever `EXE`
 * happens to contain, so dropping an FLHook or a mod DLL beside them does not fail the suite.
 */
describe('retail corpus', { skip: corpus.skip }, () => {
  const images = corpus
    .load(corpus.executables, '*.dll')
    .filter(({ data }) => isImage(data))
    .map(({ path, data }) => ({ path, data, resources: read(data) }))

  const named = (name: string) =>
    images.find(({ path }) => path.toLowerCase() === name.toLowerCase())

  /** Both sides as plain arrays: the corpus hands out `Buffer`s, and prototypes differ. */
  const bytes = (value: Uint8Array): Uint8Array => Uint8Array.from(value)

  const libraries = RETAIL_LIBRARIES.map((name) => {
    const image = named(name)
    assert.ok(image, `${name} is present in EXE`)
    return image
  })

  it('reads every DLL in EXE without throwing', () => {
    assert.ok(images.length >= RETAIL_LIBRARIES.length, `${images.length} images in EXE`)

    for (const { path, data } of images)
      assert.doesNotThrow(() => read(data), `failed to read ${path}`)
  })

  describe('resource shape', () => {
    it('holds 6,653 resources across the seven libraries: 1,334 blocks and 5,307 cards', () => {
      let total = 0
      let blocks = 0
      let cards = 0

      for (const { resources } of libraries)
        for (const { type } of resources) {
          total++
          if (type === Type.String) blocks++
          if (type === Type.Html) cards++
        }

      assert.equal(total, 6653)
      assert.equal(blocks, 1334)
      assert.equal(cards, 5307)
    })

    it('gives every content resource US English and code page 1252', () => {
      for (const { path, resources } of libraries)
        for (const { type, language, codePage } of resources) {
          if (type !== Type.String && type !== Type.Html) continue

          assert.equal(language, LANGUAGE_ENGLISH_US, `${path} language`)
          assert.equal(codePage, CODE_PAGE_WINDOWS_1252, `${path} code page`)
        }
    })

    it('uses the neutral language for the seven version blocks and nothing else', () => {
      let neutral = 0

      for (const { path, resources } of libraries)
        for (const { type, language } of resources)
          if (language === LANGUAGE_NEUTRAL) {
            assert.equal(type, Type.Version, `${path} has a neutral non-version resource`)
            neutral++
          }

      assert.equal(neutral, RETAIL_LIBRARIES.length)
    })

    // Neither is Freelancer's, and both are why the reader models an id as `number | string` and
    // takes any language rather than assuming US English.
    it('reads ebueula.dll’s named type and imeui.dll’s Japanese resources', () => {
      assert.ok(named('ebueula.dll')?.resources.some(({ type }) => type === 'PREPSTUBDATA'))

      // Its content is Japanese; only the version block falls back to neutral, as everywhere.
      assert.ok(named('imeui.dll')?.resources.some(({ language }) => language === 0x411))
    })
  })

  describe('string tables', () => {
    it('writes all sixteen slots in every block, 13,121 of 21,344 filled', () => {
      let slots = 0
      let filled = 0

      for (const { path, resources } of libraries)
        for (const { type, data } of resources) {
          if (type !== Type.String) continue

          const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
          let offset = 0
          let count = 0

          while (offset + 2 <= data.byteLength) {
            const length = view.getUint16(offset, true)
            offset += 2 + length * 2
            count++
            if (length > 0) filled++
          }

          assert.equal(count, 16, `${path} block is not sixteen slots`)
          slots += count
        }

      assert.equal(slots, 21344)
      assert.equal(filled, 13121)
    })

    it('reads 3,873 strings from resources.dll and 7,156 from nameresources.dll', () => {
      assert.equal(readStrings(named('resources.dll')!.resources).size, 3873)
      assert.equal(readStrings(named('nameresources.dll')!.resources).size, 7156)
    })
  })

  describe('infocards', () => {
    it('opens all 5,307 with the same XML declaration', () => {
      const declaration = '<?xml version="1.0" encoding="UTF-16"?>'
      let cards = 0

      for (const { path, resources } of libraries)
        for (const card of readInfocards(resources).values()) {
          assert.ok(card.startsWith(declaration), `${path} card without a declaration`)
          cards++
        }

      assert.equal(cards, 5307)
    })

    it('reads 3,101 from misctext.dll and 886 from infocards.dll', () => {
      assert.equal(readInfocards(named('misctext.dll')!.resources).size, 3101)
      assert.equal(readInfocards(named('infocards.dll')!.resources).size, 886)
    })
  })

  describe('round trip', () => {
    /** Identity of every resource, as one comparable string. */
    const shape = (resources: ReturnType<typeof read>) =>
      resources
        .map(
          ({ type, id, language, codePage, data }) =>
            `${String(type)}/${String(id)}/${language}/${codePage}/${data.byteLength}`,
        )
        .join('\n')

    it('reads back everything it writes, for every DLL in EXE', () => {
      for (const { path, resources } of images) {
        const back = read(write(resources))

        assert.equal(shape(back), shape(resources), `${path} shape`)

        for (const [index, resource] of resources.entries())
          assert.deepEqual(
            bytes(back[index]!.data),
            bytes(resource.data),
            `${path} payload ${index}`,
          )
      }
    })

    /**
     * The sharp one: rebuilding a retail `.rsrc` from its own resources reproduces it **byte for
     * byte** at the address it was loaded at. Five of the seven are exact to the last byte;
     * `misctext.dll` and `equipresources.dll` carry 5,184 and 748 further bytes of filler the
     * linker left past the last payload, so the rebuilt section is a strict prefix of the original.
     *
     * A structural comparison would pass on a dozen layouts. This one passes on one.
     */
    it('rebuilds every library’s .rsrc byte for byte', () => {
      for (const { path, data, resources } of libraries) {
        const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
        const pe = view.getUint32(0x3c, true)
        const table = pe + 24 + view.getUint16(pe + 20, true)

        let section
        for (let i = 0; i < view.getUint16(pe + 6, true); i++) {
          const at = table + i * 40

          if (String.fromCharCode(...data.subarray(at, at + 5)) === '.rsrc')
            section = {
              address: view.getUint32(at + 12, true),
              offset: view.getUint32(at + 20, true),
              size: view.getUint32(at + 8, true),
            }
        }

        assert.ok(section, `${path} has a .rsrc`)

        const original = data.subarray(section.offset, section.offset + section.size)
        const rebuilt = writeSection(resources, section.address)

        assert.ok(rebuilt.byteLength <= original.byteLength, `${path} grew`)
        assert.deepEqual(rebuilt, bytes(original.subarray(0, rebuilt.byteLength)), `${path} bytes`)

        // Whatever the original carries past the rebuilt section is a run of the linker's filler
        // and then a run of zeroes — 3,792 and 1,392 bytes in misctext.dll, 172 and 576 in
        // equipresources.dll, and nothing at all in the other five.
        const tail = original.subarray(rebuilt.byteLength)
        const zeroes = tail.findIndex((byte) => byte === 0)
        const filler = zeroes === -1 ? tail.length : zeroes

        for (const [index, byte] of tail.entries())
          assert.ok(
            index < filler ? 'PADINGX'.includes(String.fromCharCode(byte)) : byte === 0,
            `${path} tail byte ${index} is neither filler nor padding`,
          )
      }
    })

    it('round-trips strings and infocards through the container', () => {
      for (const { path, resources } of libraries) {
        const strings = readStrings(resources)
        const cards = readInfocards(resources)

        assert.deepEqual(
          readStrings(read(write(writeStrings(strings)))),
          strings,
          `${path} strings`,
        )
        assert.deepEqual(readInfocards(read(write(writeInfocards(cards)))), cards, `${path} cards`)
      }
    })
  })

  describe('library', () => {
    const library = readLibrary(libraries.map(({ resources }) => resources))

    it('resolves 13,121 names and 5,307 infocards across the seven libraries', () => {
      assert.equal(library.names.size, 13121)
      assert.equal(library.infocards.size, 5307)
    })

    it('places each library in its own band, resources.dll bare at index zero', () => {
      assert.equal(library.names.get(0), 'Object Unknown')
      assert.equal(library.names.get(globalIdOf(3, 1)), 'New York')
    })

    /**
     * The two spaces are numerically the same and semantically not, so nothing stops an id being
     * both a name and an infocard. Retail never does it — which makes keeping the maps apart a
     * choice the corpus permits rather than one it forces, and worth pinning before someone merges
     * them and finds out on a mod.
     */
    it('never uses one id for both a name and an infocard, though it could', () => {
      const shared = [...library.names.keys()].filter((id) => library.infocards.has(id))
      assert.deepEqual(shared, [])
    })

    /** Two libraries have all but exhausted their 0x10000 band. */
    it('reaches local index 65,186 in nameresources.dll, 349 short of the band', () => {
      assert.equal(Math.max(...readStrings(named('nameresources.dll')!.resources).keys()), 65186)
      assert.equal(Math.max(...readStrings(named('resources.dll')!.resources).keys()), 60252)
    })
  })
})
