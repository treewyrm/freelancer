import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import * as corpus from '../corpus.js'
import { formatOf, read } from './index.js'
import * as binary from './binary/index.js'
import * as text from './text/index.js'
import { decode } from '../utility/encoding.js'

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
        sections += document.length
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

      assert.ok(document.length > 0)

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
      const gates = document.filter(({ name }) => name.toLowerCase() === 'locked_gates')

      assert.equal(gates.length, 1)

      const values = gates[0]!.properties.flatMap(({ values }) => values)

      assert.ok(values.length > 0)
      for (const value of values)
        assert.match(
          text.write([{ name: 'x', properties: [{ name: 'y', values: [value] }] }]),
          /\d/,
        )
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
        const names = documents.flat().map(({ name }) => name)

        assert.ok(names.includes(';Display'))
      })

      it('keeps @include as a property rather than following it', () => {
        const dacom = assets.find(({ path }) => /dacom\.ini$/i.test(path))
        const properties = read(dacom!.data).flatMap(({ properties }) => properties)

        assert.ok(properties.some(({ name }) => name.startsWith('@include')))
      })
    },
  )
})
