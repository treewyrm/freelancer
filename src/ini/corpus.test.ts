import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import * as corpus from '#/corpus.js'
import { Document, formatOf, Property, read, Section, value } from './index.js'
import * as binary from './binary/index.js'
import * as save from './save/index.js'
import * as text from './text/index.js'
import { decode } from '#/utility/encoding.js'
import { fold } from '#/utility/string.js'

/**
 * The readers against the retail install.
 *
 * Every count asserted here was measured before the code existed, so a failure means the reader
 * drifted rather than that the number needs updating. Skips itself with a reason when no install
 * is present.
 */
describe('retail corpus', { skip: corpus.skip }, () => {
  const assets = corpus.glob()
  const binaries = assets.filter(({ data }) => binary.isBinary(data))

  it('holds 1,252 INI files, 1,251 of them BINI', () => {
    assert.equal(assets.length, 1252)
    assert.equal(binaries.length, 1251)
  })

  // Check the signature, never the extension: the one text file sits among the binary ones with
  // the same extension in the same tree.
  it('holds exactly one text file, initialworld.ini', () => {
    const plain = assets.filter(({ data }) => formatOf(data) === 'text')

    assert.equal(plain.length, 1)
    assert.match(plain[0]!.path, /initialworld\.ini$/i)
  })

  it('reads every file without throwing', () => {
    for (const { path, data } of assets)
      assert.doesNotThrow(() => read(data), `failed to read ${path}`)
  })

  describe('BINI', () => {
    const documents = binaries.map(({ path, data }) => ({
      path,
      data,
      document: binary.read(data),
    }))

    it('reads 70,250 sections and 511,556 properties', () => {
      let sections = 0
      let properties = 0

      for (const { document } of documents) {
        sections += document.sections.length
        for (const section of document) properties += section.properties.length
      }

      assert.equal(sections, 70250)
      assert.equal(properties, 511556)
    })

    it('reads 876,034 values, none of them boolean', () => {
      const counts = { boolean: 0, integer: 0, float: 0, string: 0 }

      for (const { document } of documents)
        for (const section of document)
          for (const property of section.properties)
            for (const value of property.values) counts[value.type]++

      // The boolean encoding is defined and unexercised. A flag is a property with no values.
      assert.equal(counts.boolean, 0)
      assert.equal(counts.integer, 388571)
      assert.equal(counts.float, 63143)
      assert.equal(counts.string, 424320)
      assert.equal(counts.boolean + counts.integer + counts.float + counts.string, 876034)
    })

    it('holds 1,063 properties with no values', () => {
      let empty = 0

      for (const { document } of documents)
        for (const section of document)
          for (const property of section.properties) if (!property.values.length) empty++

      assert.equal(empty, 1063)
    })

    // The reason the model carries a type tag at all: without it these come back as integers.
    it('holds 14,209 float values whose value is integral', () => {
      let integral = 0

      for (const { document } of documents)
        for (const section of document)
          for (const property of section.properties)
            for (const value of property.values)
              if (value.type === 'float' && Number.isInteger(value.value)) integral++

      assert.equal(integral, 14209)
    })

    // The tag records the shape of the token, not the type of the field. If it carried meaning,
    // some field somewhere would hold a string that looks like a number — none of the 424,320 does.
    it('holds no string value that reads as a number', () => {
      const numeric = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/
      const found: string[] = []

      for (const { path, document } of documents)
        for (const section of document)
          for (const property of section.properties)
            for (const value of property.values)
              if (value.type === 'string' && numeric.test(value.value))
                found.push(`${path} [${section.name}] ${property.name} = ${value.value}`)

      assert.deepEqual(found, [])
    })

    // What that costs a consumer who reads the tag instead of the field: `attack_ids` names a trade
    // lane by the `lane_id` declared on another zone in the same file, and the two halves of the
    // universe write the same id differently — `br01_2` compiles to a string, `18` to an int32.
    // Reading both through `toText` is what makes them one field, and every one of them resolves.
    it('resolves all 806 [Zone] attack_ids against a lane_id in their own file', () => {
      const dangling: string[] = []
      let occurrences = 0
      let files = 0

      for (const { path, document } of documents) {
        const declared = new Set<string>()
        const used: string[] = []

        for (const section of document) {
          if (section.label !== 'zone') continue

          for (const property of section.properties) {
            if (property.label === 'lane_id')
              for (const held of property.values) declared.add(fold(value.toText(held)))

            if (property.label === 'attack_ids') {
              occurrences++
              for (const held of property.values) used.push(value.toText(held))
            }
          }
        }

        if (!used.length) continue
        files++

        for (const id of used)
          if (!declared.has(fold(id))) dangling.push(`${path} attack_ids = ${id}`)
      }

      assert.equal(occurrences, 806)
      assert.equal(files, 30)
      assert.deepEqual(dangling, [])
    })

    // [Zone] property_flags is a bitfield with no table behind it — see ENGINE.md. The names are
    // the community reading and nothing here can check them; what the corpus pins is the extent,
    // and this is the assertion that would catch a twenty-fourth bit. Every bit named there is in
    // range and nothing outside them is ever set.
    it('sets 835 [Zone] property_flags, no bit above 0x400000', () => {
      const bits = new Array<number>(32).fill(0)
      const wrong: string[] = []
      let occurrences = 0

      for (const { path, document } of documents)
        for (const section of document) {
          if (section.label !== 'zone') continue

          for (const property of section.properties) {
            if (property.label !== 'property_flags') continue
            occurrences++

            const [held, ...rest] = property.values

            if (!held || rest.length || held.type !== 'integer') {
              wrong.push(`${path} ${section.getNickname()} = ${property.values.length} values`)
              continue
            }

            const word = value.toInteger(held)

            for (let bit = 0; bit < 32; bit++) if (word & (1 << bit)) bits[bit]!++
          }
        }

      assert.equal(occurrences, 835)
      assert.deepEqual(wrong, [])

      // Positions 0 through 22, in the order ENGINE.md tabulates them.
      assert.deepEqual(
        bits.slice(0, 23),
        [69, 99, 6, 6, 22, 8, 116, 27, 34, 6, 7, 1, 5, 4, 20, 59, 164, 434, 2, 0, 2, 0, 0],
      )

      assert.deepEqual(bits.slice(23), new Array<number>(9).fill(0))
    })

    // Reproducing the compiler's dictionary order is the whole of byte-exactness. Names in
    // first-use order, then values in first-use order, one shared dedup table.
    it('rewrites all 1,251 files byte for byte', () => {
      const differing: string[] = []

      for (const { path, data, document } of documents) {
        const written = binary.write(document)

        if (written.length !== data.length || !written.every((byte, i) => byte === data[i]))
          differing.push(path)
      }

      assert.deepEqual(differing, [])
    })
  })

  // Text is the richer encoding, so the trip out to text and back has to preserve the type tags.
  // The float rendering is what carries it: an integral float printed as 3 would return as an
  // integer and the file would no longer match.
  describe('BINI to text and back', () => {
    it('rewrites all 1,251 files byte for byte', () => {
      const differing: string[] = []

      for (const { path, data } of binaries) {
        const written = binary.write(text.read(text.write(binary.read(data))))

        if (written.length !== data.length || !written.every((byte, i) => byte === data[i]))
          differing.push(path)
      }

      assert.deepEqual(differing, [])
    })
  })

  describe('text', () => {
    const plain = assets.filter(({ data }) => !binary.isBinary(data))

    // The file pads the gap between a value and its comment with U+00A0 rather than spaces, on 53
    // lines. An ASCII-only trim leaves the pad attached to the value.
    it('reads initialworld.ini without leaving a U+00A0 attached to any value', () => {
      const [asset] = plain
      const document = text.read(decode(asset!.data))

      assert.ok(document.sections.length > 0)

      for (const section of document)
        for (const property of section.properties)
          for (const value of property.values)
            if (value.type === 'string')
              assert.doesNotMatch(value.value, /^[\s\u00a0]|[\s\u00a0]$/, section.name)
    })

    // Those padded lines are `locked_gate = <uint32 hash>`, which is why an out-of-int32 whole
    // number stays a string: as a float32 the hash would come back as a different object.
    it('keeps initialworld.ini nickname hashes exact', () => {
      const [asset] = plain
      const document = text.read(decode(asset!.data))
      const gates = document.sections.filter(({ name }) => name.toLowerCase() === 'locked_gates')

      assert.equal(gates.length, 1)

      const values = gates[0]!.properties.flatMap(({ values }) => values)

      assert.ok(values.length > 0)
      for (const value of values)
        assert.match(text.write(new Document(new Section('x', new Property('y', value)))), /\d/)
    })

    it('is a fixed point over every file', () => {
      for (const { path, data } of assets) {
        const once = text.write(read(data))
        assert.equal(text.write(text.read(once)), once, `${path} is not a fixed point`)
      }
    })
  })

  describe(
    'EXE',
    { skip: corpus.glob(corpus.executables).length ? false : 'no EXE directory' },
    () => {
      const assets = corpus.glob(corpus.executables)

      it('holds three files, all of them text', () => {
        assert.equal(assets.length, 3)
        for (const { path, data } of assets) assert.equal(formatOf(data), 'text', path)
      })

      // freelancer.ini carries [;Display] and keymap-style names; dacom.ini opens with @include.
      it('reads them, keeping a section commented out by its name', () => {
        const documents = assets.map(({ data }) => read(data))
        const names = documents.flatMap((document) => document.sections).map(({ name }) => name)

        assert.ok(names.includes(';Display'))
      })

      it('keeps @include as a property rather than following it', () => {
        const dacom = assets.find(({ path }) => /dacom\.ini$/i.test(path))
        const properties = read(dacom!.data).sections.flatMap(({ properties }) => properties)

        assert.ok(properties.some(({ name }) => name.startsWith('@include')))
      })
    },
  )

  describe(
    'saves',
    { skip: corpus.glob(corpus.executables, '**/*.fl').length ? false : 'no EXE directory' },
    () => {
      const assets = corpus.glob(corpus.executables, '**/*.fl')

      // Which is why the signature decides here too. One extension, two encodings, and the plain
      // one is the multiplayer template — the `%%NAME%%` placeholders the server fills in.
      it('holds two files, only newplayer.fl masked', () => {
        assert.equal(assets.length, 2)

        const masked = assets.filter(({ data }) => formatOf(data) === 'save')

        assert.equal(masked.length, 1)
        assert.match(masked[0]!.path, /newplayer\.fl$/i)
      })

      it('reads 4 sections and 316 properties across both', () => {
        let sections = 0
        let properties = 0

        for (const { data } of assets) {
          const document = read(data)
          sections += document.sections.length
          for (const section of document) properties += section.properties.length
        }

        assert.equal(sections, 4)
        assert.equal(properties, 316)
      })

      it('reads newplayer.fl as [Player], [StoryInfo] and [mPlayer]', () => {
        const asset = assets.find(({ path }) => /newplayer\.fl$/i.test(path))

        assert.deepEqual(
          read(asset!.data).sections.map(({ name }) => name),
          ['Player', 'StoryInfo', 'mPlayer'],
        )
      })

      // The mask is not where fidelity can be lost — it is its own inverse over the exact bytes,
      // so unmasking and re-masking the file returns it verbatim, comments and U+00A0 padding and
      // all. Only the trip through the document drops those, which is the text writer's limit.
      it('re-masks newplayer.fl byte for byte', () => {
        const asset = assets.find(({ path }) => /newplayer\.fl$/i.test(path))
        const body = asset!.data.subarray(save.HEADER_BYTE_LENGTH)
        const again = save.mask(save.mask(body))

        assert.equal(again.length, body.length)
        assert.ok(again.every((byte, i) => byte === body[i]))
      })

      it('is a fixed point over both files', () => {
        for (const { path, data } of assets) {
          const once = save.write(read(data))
          assert.deepEqual(save.write(save.read(once)), once, `${path} is not a fixed point`)
        }
      })
    },
  )
})
