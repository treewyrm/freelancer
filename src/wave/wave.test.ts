import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import File from '#/utf/file.js'
import { isWave, readWave, writeWave } from './wave.js'
import { getDecodedLength, getPlayedRange, readWaveform, writeWaveform } from './waveform.js'
import { readMPEGFrames } from './mpeg.js'
import { MPEGVersion, WaveFormatTag, type Waveform } from './types.js'

/** A RIFF/WAVE file assembled by hand, so reader tests do not depend on the writer. */
const riff = (body: number[], declared = body.length + 4, trailing: number[] = []): Uint8Array => {
  const bytes = new Uint8Array(12 + body.length + trailing.length)
  const view = new DataView(bytes.buffer)

  bytes.set([0x52, 0x49, 0x46, 0x46], 0)
  view.setUint32(4, declared, true)
  bytes.set([0x57, 0x41, 0x56, 0x45], 8)
  bytes.set(body, 12)
  bytes.set(trailing, 12 + body.length)

  return bytes
}

const chunk = (id: string, data: number[], pad = false): number[] => [
  ...[...id].map((c) => c.charCodeAt(0)),
  data.length & 0xff,
  (data.length >> 8) & 0xff,
  0,
  0,
  ...data,
  ...(pad ? [0] : []),
]

const u32 = (value: number): number[] => [
  value & 0xff,
  (value >> 8) & 0xff,
  (value >> 16) & 0xff,
  value >>> 24,
]

/** Retail's `fmt ` for an 11,025 Hz mono line: `WAVEFORMATEX` and `MPEGLAYER3WAVEFORMAT`. */
const LAYER3_FORMAT = [
  0x55, 0, 1, 0, 0x11, 0x2b, 0, 0, 0xc4, 0x09, 0, 0, 1, 0, 0, 0, 12, 0, 1, 0, 2, 0, 0, 0, 0x82, 0,
  1, 0, 0x71, 0x05,
]

/** An MPEG-2 layer III frame header, 22,050 Hz mono at 32 kbit/s: 104 bytes, 576 samples. */
const frame = (padding = false): number[] => {
  const bytes = new Array<number>(104 + (padding ? 1 : 0)).fill(0)
  bytes.splice(0, 4, 0xff, 0xf3, 0x40 | (padding ? 2 : 0), 0xc0)
  return bytes
}

describe('readWave', () => {
  it('reads chunks in order, with their payloads', () => {
    const wave = readWave(riff([...chunk('fmt ', [1, 2]), ...chunk('data', [3, 4, 5, 6])]))

    assert.deepEqual(
      wave.chunks.map(({ id, data }) => [id, [...data]]),
      [
        ['fmt ', [1, 2]],
        ['data', [3, 4, 5, 6]],
      ],
    )
    assert.equal('padding' in wave, false)
    assert.equal('trailing' in wave, false)
  })

  it('skips the pad byte of an odd chunk that another follows', () => {
    const wave = readWave(riff([...chunk('LIST', [9], true), ...chunk('data', [1, 2])]))
    assert.deepEqual(
      wave.chunks.map(({ id }) => id),
      ['LIST', 'data'],
    )
  })

  it('keeps a counted pad after the last chunk as padding', () => {
    const wave = readWave(riff(chunk('data', [1, 2, 3], true)))
    assert.deepEqual([...wave.padding!], [0])
  })

  it('keeps bytes past the RIFF size as trailing', () => {
    const body = chunk('data', [1, 2, 3])
    const wave = readWave(riff(body, body.length + 4, [0]))
    assert.deepEqual([...wave.trailing!], [0])
    assert.equal('padding' in wave, false)
  })

  it('throws on what is not RIFF/WAVE, and on sizes that run past the end', () => {
    assert.throws(() => readWave(new Uint8Array(12)), TypeError)
    assert.throws(() => readWave(riff(chunk('data', [1, 2]), 100)), RangeError)

    const short = riff(chunk('data', [1, 2]))
    short[16] = 50
    assert.throws(() => readWave(short), RangeError)
  })

  it('reads a voice bank entry as it is, a UTF file', () => {
    const entry = new File('0x817584C9', riff(chunk('data', [1, 2])))

    assert.equal(isWave(entry), true)
    assert.deepEqual([...readWave(entry).chunks[0]!.data], [1, 2])
  })

  it('agrees with isWave', () => {
    assert.equal(isWave(riff(chunk('data', [1]))), true)
    assert.equal(isWave(new Uint8Array([0x52, 0x49, 0x46, 0x46])), false)
    assert.equal(isWave(riff(chunk('data', [1, 2]), 100)), false)
  })
})

describe('writeWave', () => {
  const cases: [string, Uint8Array][] = [
    ['an even file', riff([...chunk('fmt ', [1, 2]), ...chunk('data', [3, 4])])],
    ['an odd last chunk with no pad', riff([...chunk('fmt ', [1, 2]), ...chunk('data', [3])])],
    ['an odd last chunk with a counted pad', riff(chunk('data', [3], true))],
    ['a pad past the RIFF size', riff(chunk('data', [3]), 4 + 9, [0])],
    ['an odd chunk mid-file', riff([...chunk('LIST', [9], true), ...chunk('data', [1, 2])])],
  ]

  for (const [name, bytes] of cases)
    it(`writes ${name} back byte for byte`, () => {
      assert.deepEqual([...writeWave(readWave(bytes)).bytes], [...bytes])
    })

  it('refuses an id that is not four characters', () => {
    assert.throws(() => writeWave({ chunks: [{ id: 'dat', data: new Uint8Array() }] }), RangeError)
  })
})

describe('readWaveform', () => {
  const bytes = riff([
    ...chunk('fmt ', LAYER3_FORMAT),
    ...chunk('fact', u32(15430)),
    ...chunk('trim', u32(1235)),
    ...chunk('data', [0xff, 0xe3]),
  ])

  it('reads the encoding, the counts and the payload', () => {
    const waveform = readWaveform(readWave(bytes))

    assert.equal(waveform.encoding.tag, WaveFormatTag.MPEGLayer3)
    assert.equal(waveform.encoding.channels, 1)
    assert.equal(waveform.encoding.sampleRate, 11025)
    assert.equal(waveform.encoding.averageBytesPerSecond, 2500)
    assert.equal(waveform.encoding.bitsPerSample, 0)
    assert.equal(waveform.encoding.extension?.byteLength, 12)
    assert.equal(waveform.sampleCount, 15430)
    assert.equal(waveform.trim, 1235)
    assert.deepEqual([...waveform.data], [0xff, 0xe3])
  })

  it('writes the same layout back', () => {
    assert.deepEqual([...writeWave(writeWaveform(readWaveform(readWave(bytes)))).bytes], [...bytes])
  })

  it('reads a 16-byte PCM format with no extension', () => {
    const pcm = [1, 0, 1, 0, 0x22, 0x56, 0, 0, 0x44, 0xac, 0, 0, 2, 0, 16, 0]
    const waveform = readWaveform(readWave(riff([...chunk('fmt ', pcm), ...chunk('data', [])])))

    assert.equal('extension' in waveform.encoding, false)
    assert.deepEqual([...writeWaveform(waveform).chunks[0]!.data], pcm)
  })

  it('sees a trim chunk only at four bytes, and a fact chunk from four up', () => {
    const waveform = readWaveform(
      readWave(
        riff([
          ...chunk('fmt ', LAYER3_FORMAT),
          ...chunk('fact', [...u32(7), 0, 0]),
          ...chunk('trim', [...u32(7), 0, 0]),
          ...chunk('data', []),
        ]),
      ),
    )

    assert.equal(waveform.sampleCount, 7)
    assert.equal('trim' in waveform, false)
  })

  it('throws without fmt or data', () => {
    assert.throws(() => readWaveform(readWave(riff(chunk('data', [])))), RangeError)
    assert.throws(() => readWaveform(readWave(riff(chunk('fmt ', LAYER3_FORMAT)))), RangeError)
  })
})

describe('readMPEGFrames', () => {
  it('walks frames by their headers', () => {
    const frames = readMPEGFrames(new Uint8Array([...frame(), ...frame(true), ...frame()]))

    assert.deepEqual(
      frames.map(({ offset, length }) => [offset, length]),
      [
        [0, 104],
        [104, 105],
        [209, 104],
      ],
    )
    assert.deepEqual(
      { ...frames[0]!, offset: 0 },
      {
        offset: 0,
        length: 104,
        version: MPEGVersion.MPEG2,
        layer: 3,
        bitrate: 32000,
        sampleRate: 22050,
        channels: 1,
        samples: 576,
      },
    )
  })

  it('steps over an ID3v2 tag and stops at a cut-short frame', () => {
    const tag = [0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 2, 0, 0]
    const frames = readMPEGFrames(new Uint8Array([...tag, ...frame(), ...frame().slice(0, 50)]))

    assert.deepEqual(
      frames.map(({ offset }) => offset),
      [12],
    )
  })

  it('stops at bytes that are not a frame', () => {
    const tagged = new Uint8Array([...frame(), 0x54, 0x41, 0x47, ...new Array(125).fill(0)])
    assert.equal(readMPEGFrames(tagged).length, 1)
  })
})

describe('getPlayedRange', () => {
  const layer3 = (fields: Partial<Waveform>): Waveform => ({
    encoding: {
      tag: WaveFormatTag.MPEGLayer3,
      channels: 1,
      sampleRate: 22050,
      averageBytesPerSecond: 4000,
      blockAlign: 1,
      bitsPerSample: 0,
    },
    data: new Uint8Array([...frame(), ...frame(), ...frame()]),
    ...fields,
  })

  it('drops trim from the front and caps the rest at fact', () => {
    assert.equal(getDecodedLength(layer3({})), 1728)
    assert.deepEqual(getPlayedRange(layer3({ trim: 1209, sampleCount: 400 })), {
      start: 1209,
      count: 400,
    })
  })

  it('leaves the cap off when fact is past the end', () => {
    assert.deepEqual(getPlayedRange(layer3({ trim: 100, sampleCount: 5000 })), {
      start: 100,
      count: 1628,
    })
  })

  it('skips the trim when it would drop everything, and either step when absent', () => {
    assert.deepEqual(getPlayedRange(layer3({ trim: 1728 })), { start: 0, count: 1728 })
    assert.deepEqual(getPlayedRange(layer3({ trim: 0, sampleCount: 0 })), { start: 0, count: 1728 })
    assert.deepEqual(getPlayedRange(layer3({ sampleCount: 2 ** 32 - 1 })), {
      start: 0,
      count: 1728,
    })
  })

  it('plays PCM whole', () => {
    const pcm: Waveform = {
      encoding: {
        tag: WaveFormatTag.PCM,
        channels: 1,
        sampleRate: 22050,
        averageBytesPerSecond: 44100,
        blockAlign: 2,
        bitsPerSample: 16,
      },
      sampleCount: 2,
      trim: 1,
      data: new Uint8Array(20),
    }

    assert.equal(getDecodedLength(pcm), 10)
    assert.deepEqual(getPlayedRange(pcm), { start: 0, count: 10 })
  })

  it('needs a length for a format the headers do not give one for', () => {
    const adpcm = layer3({})
    adpcm.encoding.tag = WaveFormatTag.ADPCM

    assert.equal(getDecodedLength(adpcm), undefined)
    assert.throws(() => getPlayedRange(adpcm), RangeError)
    assert.deepEqual(getPlayedRange({ ...adpcm, trim: 5 }, 50), { start: 5, count: 45 })
  })
})
