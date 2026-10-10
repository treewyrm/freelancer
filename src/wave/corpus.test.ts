import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import * as corpus from '#/corpus.js'
import BufferView from '#/utility/bufferview.js'
import { isWave, readWave, writeWave } from './wave.js'
import { getDecodedLength, getPlayedRange, readWaveform, writeWaveform } from './waveform.js'
import { readMPEGFrames } from './mpeg.js'
import { MPEGVersion, WaveFormatTag, type Wave, type Waveform } from './types.js'

/**
 * Every waveform in retail: the loose `.wav` files under `AUDIO` and every entry of the 109 voice
 * banks. Every count was measured before the code existed, so a failure means a reader drifted.
 */
describe('retail corpus', { skip: corpus.skip }, () => {
  interface Entry {
    where: string

    /** `banks`, the `AUDIO` subdirectory a loose file is in, or `root` for the four beside them. */
    group: string

    data: Uint8Array
    wave: Wave
    waveform: Waveform
  }

  const groupOf = (path: string): string => {
    const parts = path.split('/')
    return parts.length > 2 ? parts[1]! : 'root'
  }

  const entries: Entry[] = []

  const add = (where: string, group: string, data: Uint8Array) => {
    const wave = readWave(data)
    entries.push({ where, group, data, wave, waveform: readWaveform(wave) })
  }

  for (const { path, data } of corpus.raw('wav')) add(path, groupOf(path), data)

  const banks = corpus.load('utf')
  for (const { path, root } of banks)
    for (const file of root.files) add(`${path}/${file.name}`, 'banks', BufferView.from(file).bytes)

  const tally = (keys: Iterable<string>): Record<string, number> => {
    const counts: Record<string, number> = {}
    for (const key of keys) counts[key] = (counts[key] ?? 0) + 1
    return counts
  }

  const layer3 = entries.filter(
    ({ waveform }) => waveform.encoding.tag === WaveFormatTag.MPEGLayer3,
  )

  it('reads 25,695 waveforms: 1,700 loose and 23,995 in 109 banks', () => {
    assert.equal(banks.length, 109)
    assert.deepEqual(tally(entries.map(({ group }) => group)), {
      root: 4,
      SOUNDS: 568,
      MUSIC: 108,
      MIXES: 21,
      DIALOGUE: 999,
      banks: 23995,
    })
  })

  it('holds a RIFF/WAVE in every bank entry', () => {
    for (const { path, root } of banks)
      for (const file of root.files) assert.ok(isWave(file.data), `${path}/${file.name}`)
  })

  it('writes every waveform back byte for byte', () => {
    for (const { where, data, wave } of entries)
      assert.deepEqual(writeWave(wave).bytes, Uint8Array.from(data), where)
  })

  it('reads every waveform back to itself through the meaning layer', () => {
    for (const { where, waveform } of entries)
      assert.deepEqual(readWaveform(writeWaveform(waveform)), waveform, where)
  })

  it('lays out chunks five ways', () => {
    assert.deepEqual(tally(entries.map(({ wave }) => wave.chunks.map(({ id }) => id).join('+'))), {
      'fmt +fact+trim+data': 25591,
      'fmt +fact+data': 24,
      'fmt +data': 76,
      'fmt +data+LIST': 3,
      'fmt +data+cue +LIST': 1,
    })
  })

  it('pads no odd last chunk inside the RIFF size, and six past it', () => {
    const odd = entries.filter(({ wave }) => wave.chunks.at(-1)!.data.byteLength & 1)

    assert.equal(odd.length, 13092)
    assert.ok(odd.every(({ wave }) => wave.chunks.at(-1)!.id === 'data'))
    assert.ok(entries.every(({ wave }) => !wave.padding))
    assert.deepEqual(
      entries
        .filter(({ wave }) => wave.trailing)
        .map(({ where, wave }) => [where, [...wave.trailing!]])
        .sort(),
      ['cambridge', 'crete', 'failure', 'hamburg', 'kurile', 'kyushu'].map((name) => [
        `AUDIO/MUSIC/music_${name}.wav`,
        [0],
      ]),
    )
  })

  it('encodes 80 as PCM and 25,615 as MPEG Layer-3 with a 12-byte extension', () => {
    const encodings = tally(
      entries.map(({ waveform: { encoding } }) =>
        [
          encoding.tag,
          encoding.channels,
          encoding.sampleRate,
          encoding.averageBytesPerSecond,
          encoding.bitsPerSample,
          encoding.extension?.byteLength ?? '-',
        ].join(' '),
      ),
    )

    assert.deepEqual(encodings, {
      '1 1 22050 44100 16 -': 79,
      '1 1 8000 8000 8 -': 1,
      '85 1 11025 2500 0 12': 18413,
      '85 1 22050 4000 0 12': 6929,
      '85 1 22050 7000 0 12': 105,
      '85 2 22050 8000 0 12': 39,
      '85 2 22050 10000 0 12': 108,
      '85 2 22050 12000 0 12': 21,
    })
  })

  it('declares one MPEGLAYER3WAVEFORMAT throughout, nBlockSize aside', () => {
    const blockSizes: string[] = []

    for (const { where, waveform } of layer3) {
      const extension = waveform.encoding.extension!
      const view = new DataView(extension.buffer, extension.byteOffset, extension.byteLength)

      assert.equal(view.getUint16(0, true), 1, `${where} wID`)
      assert.equal(view.getUint32(2, true), 2, `${where} fdwFlags`)
      assert.equal(view.getUint16(8, true), 1, `${where} nFramesPerBlock`)
      assert.equal(view.getUint16(10, true), 1393, `${where} nCodecDelay`)

      blockSizes.push(String(view.getUint16(6, true)))
    }

    assert.deepEqual(tally(blockSizes), { 1: 25610, 104: 5 })
  })

  it('frames every MP3 contiguously, as MPEG-2 or 2.5 layer III', () => {
    const shapes: string[] = []

    for (const { where, waveform } of layer3) {
      const frames = readMPEGFrames(waveform.data)
      assert.ok(frames.length, where)

      for (let i = 1; i < frames.length; i++)
        assert.equal(frames[i]!.offset, frames[i - 1]!.offset + frames[i - 1]!.length, where)

      const { sampleRate, channels } = waveform.encoding
      assert.ok(
        frames.every(
          (frame) =>
            frame.layer === 3 && frame.sampleRate === sampleRate && frame.channels === channels,
        ),
        where,
      )

      shapes.push(
        [
          ...new Set(
            frames.map(({ version, bitrate }) => `${MPEGVersion[version]} ${bitrate / 1000}`),
          ),
        ]
          .sort()
          .join(' + '),
      )
    }

    // The 11,025 Hz files' "20 kbit/s" is no bitrate MPEG-2.5 has: their frames mix 16 and 24.
    assert.deepEqual(tally(shapes), {
      'MPEG25 16 + MPEG25 24': 18413,
      'MPEG2 32': 6929,
      'MPEG2 56': 105,
      'MPEG2 64': 39,
      'MPEG2 80': 108,
      'MPEG2 96': 21,
    })
  })

  it('wraps five music tracks in ID3 tags, and ends every other stream on a frame', () => {
    const tagged = layer3
      .map(({ where, waveform: { data } }) => {
        const frames = readMPEGFrames(data)
        const end = frames.at(-1)!.offset + frames.at(-1)!.length
        return [where, frames[0]!.offset, data.byteLength - end] as const
      })
      .filter(([, lead, tail]) => lead || tail)
      .sort()

    assert.deepEqual(tagged, [
      ['AUDIO/MUSIC/music_anticipation_light.wav', 1024, 128],
      ['AUDIO/MUSIC/music_anticipation_moref.wav', 1024, 128],
      ['AUDIO/MUSIC/music_anticipation_motiv.wav', 1024, 128],
      ['AUDIO/MUSIC/music_californiaminor.wav', 256, 128],
      ['AUDIO/MUSIC/music_m13_hypergate_scene.wav', 256, 0],
    ])
  })

  it('carries five trim values', () => {
    assert.deepEqual(
      tally(layer3.map(({ group, waveform }) => `${group} ${waveform.trim ?? '-'}`)),
      {
        'banks 1235': 18370,
        'banks 1209': 5625,
        'DIALOGUE 1209': 958,
        'DIALOGUE 1235': 39,
        'DIALOGUE 0': 2,
        'MIXES 1673': 21,
        'MUSIC 1673': 83,
        'MUSIC 0': 1,
        'MUSIC -': 24,
        'SOUNDS 1209': 346,
        'SOUNDS 1235': 34,
        'SOUNDS 1673': 95,
        'SOUNDS 1231': 17,
      },
    )
  })

  it('cuts 25,570 of the MP3s to fact, and finds fact past the end in the other 45', () => {
    const outcomes = layer3.map(({ group, waveform }) => {
      const decoded = getDecodedLength(waveform)!
      const { start, count } = getPlayedRange(waveform)
      const capped = count === waveform.sampleCount

      assert.equal(capped, (waveform.trim ?? 0) + waveform.sampleCount! <= decoded)
      if (!capped) assert.equal(start + count, decoded)

      return `${group} ${capped ? 'capped' : 'whole'}`
    })

    assert.deepEqual(tally(outcomes), {
      'banks capped': 23972,
      'banks whole': 23,
      'DIALOGUE capped': 999,
      'MIXES capped': 21,
      'MUSIC capped': 91,
      'MUSIC whole': 17,
      'SOUNDS capped': 487,
      'SOUNDS whole': 5,
    })
  })

  it('counts both channels in fact on the 17 music tracks it leaves whole', () => {
    for (const { where, group, waveform } of layer3) {
      if (group !== 'MUSIC' || getPlayedRange(waveform).count === waveform.sampleCount) continue

      const ratio = waveform.sampleCount! / getDecodedLength(waveform)!
      assert.ok(ratio > 1.98 && ratio < 2, `${where}: ${ratio}`)
    }
  })

  it('overruns by 6 to 12,900 frames in the other 28', () => {
    const overruns = layer3
      .filter(({ group }) => group !== 'MUSIC')
      .map(
        ({ waveform }) =>
          (waveform.trim ?? 0) + waveform.sampleCount! - getDecodedLength(waveform)!,
      )
      .filter((overrun) => overrun > 0)
      .sort((a, b) => a - b)

    assert.deepEqual(
      overruns,
      [
        6, 7, 8, 9, 9, 14, 16, 17, 19, 19, 19, 19, 21, 21, 21, 21, 21, 21, 519, 1209, 1209, 1209,
        1209, 1209, 1369, 2268, 9497, 12900,
      ],
    )
  })

  it('would hold all of fact in only 498 if nCodecDelay were dropped as well', () => {
    const room = layer3.filter(
      ({ waveform }) =>
        1393 + (waveform.trim ?? 0) + waveform.sampleCount! <= getDecodedLength(waveform)!,
    )
    assert.equal(room.length, 498)
  })
})
