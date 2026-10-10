import BufferView from '#/utility/bufferview.js'
import { readMPEGFrames } from './mpeg.js'
import {
  WaveFormatTag,
  type Chunk,
  type SampleRange,
  type Wave,
  type WaveEncoding,
  type Waveform,
} from './types.js'

/** `PCMWAVEFORMAT`: everything up to `wBitsPerSample`. */
const PCM_FORMAT_BYTE_LENGTH = 16

/** `WAVEFORMATEX`: `PCMWAVEFORMAT` and `cbSize`. */
const FORMAT_BYTE_LENGTH = 18

/**
 * The last chunk with this id: `soundmanager.dll` walks every chunk and overwrites as it goes.
 * `soundstreamer.dll` stops once it holds `fmt `, `fact` and `data`, which retail never tells apart.
 */
function lastChunk({ chunks }: Wave, id: string): Chunk | undefined {
  for (let i = chunks.length - 1; i >= 0; i--) if (chunks[i]!.id === id) return chunks[i]
}

function readEncoding(data: Uint8Array): WaveEncoding {
  const view = BufferView.from(data)
  const tag = data.byteLength >= 2 ? view.getUint16(0, true) : 0
  const minimum = tag === WaveFormatTag.PCM ? PCM_FORMAT_BYTE_LENGTH : FORMAT_BYTE_LENGTH

  if (data.byteLength < minimum)
    throw new RangeError(`'fmt ' chunk is ${data.byteLength} bytes, format ${tag} needs ${minimum}`)

  const encoding: WaveEncoding = {
    tag,
    channels: view.getUint16(2, true),
    sampleRate: view.getUint32(4, true),
    averageBytesPerSecond: view.getUint32(8, true),
    blockAlign: view.getUint16(12, true),
    bitsPerSample: view.getUint16(14, true),
  }

  if (data.byteLength >= FORMAT_BYTE_LENGTH) {
    const size = view.getUint16(16, true)
    if (FORMAT_BYTE_LENGTH + size > data.byteLength)
      throw new RangeError(`'fmt ' extension of ${size} bytes runs past the chunk`)

    encoding.extension = data.slice(FORMAT_BYTE_LENGTH, FORMAT_BYTE_LENGTH + size)
  }

  return encoding
}

function writeEncoding({
  tag,
  channels,
  sampleRate,
  averageBytesPerSecond,
  blockAlign,
  bitsPerSample,
  extension,
}: WaveEncoding): Uint8Array {
  const view = BufferView.allocate(
    extension ? FORMAT_BYTE_LENGTH + extension.byteLength : PCM_FORMAT_BYTE_LENGTH,
  )

  view.setUint16(0, tag, true)
  view.setUint16(2, channels, true)
  view.setUint32(4, sampleRate, true)
  view.setUint32(8, averageBytesPerSecond, true)
  view.setUint16(12, blockAlign, true)
  view.setUint16(14, bitsPerSample, true)

  if (extension) {
    view.setUint16(16, extension.byteLength, true)
    view.bytes.set(extension, FORMAT_BYTE_LENGTH)
  }

  return view.bytes
}

const uint32 = (value: number): Uint8Array => {
  const view = BufferView.allocate(4)
  view.setUint32(0, value, true)
  return view.bytes
}

/**
 * Reads the chunks the game reads — `fmt `, `data`, `fact` and `trim` — and nothing else.
 *
 * `fact` counts when it is at least four bytes and `trim` only when it is exactly four, the two
 * tests `soundmanager.dll` and `soundstreamer.dll` both make. A chunk failing its test is one the
 * game does not see, so it reads as absent rather than throwing.
 *
 * @throws RangeError when `fmt ` or `data` is missing, or `fmt ` is too short for its format.
 */
export function readWaveform(wave: Wave): Waveform {
  const format = lastChunk(wave, 'fmt ')
  const data = lastChunk(wave, 'data')

  if (!format) throw new RangeError("No 'fmt ' chunk")
  if (!data) throw new RangeError("No 'data' chunk")

  const waveform: Waveform = { encoding: readEncoding(format.data), data: data.data }

  const fact = lastChunk(wave, 'fact')
  if (fact && fact.data.byteLength >= 4)
    waveform.sampleCount = BufferView.from(fact.data).getUint32(0, true)

  const trim = lastChunk(wave, 'trim')
  if (trim && trim.data.byteLength === 4)
    waveform.trim = BufferView.from(trim.data).getUint32(0, true)

  return waveform
}

/** Writes a waveform as retail lays one out: `fmt `, then `fact` and `trim` where present, then `data`. */
export function writeWaveform({ encoding, sampleCount, trim, data }: Waveform): Wave {
  const chunks: Chunk[] = [{ id: 'fmt ', data: writeEncoding(encoding) }]

  if (sampleCount !== undefined) chunks.push({ id: 'fact', data: uint32(sampleCount) })
  if (trim !== undefined) chunks.push({ id: 'trim', data: uint32(trim) })

  chunks.push({ id: 'data', data })

  return { chunks }
}

/**
 * Sample frames the payload decodes to, from its headers alone: PCM by `blockAlign`, MPEG Layer-3
 * by its frames. Undefined for any other format.
 *
 * For MP3 this is what a decoder emits that hands back every frame whole and trims nothing —
 * Chromium's does, and every retail figure in `docs/` assumes the Fraunhofer codec the game
 * decodes through does too.
 */
export function getDecodedLength({ encoding, data }: Waveform): number | undefined {
  switch (encoding.tag) {
    case WaveFormatTag.PCM:
      return encoding.blockAlign ? Math.floor(data.byteLength / encoding.blockAlign) : undefined
    case WaveFormatTag.MPEGLayer3:
      return readMPEGFrames(data).reduce((sum, { samples }) => sum + samples, 0)
    default:
      return undefined
  }
}

/**
 * The slice of the decoded sound the game plays.
 *
 * PCM plays whole. Any other format goes through ACM to PCM, and then: the first `trim` frames are
 * dropped, unless that would drop everything; what is left is cut to `fact` frames, when it is
 * longer. A missing chunk skips its step. `soundmanager.dll` decides this at `0x6ee887e`–`0x6ee88a1`
 * for a sound decoded whole; `soundstreamer.dll` does the same for a streamed MP3 at `0x6ef220b`
 * and `0x6ef2325`.
 *
 * @param decoded Sample frames the payload decodes to; {@link getDecodedLength} when omitted.
 * @throws RangeError when omitted and the format is one whose length the headers do not give.
 */
export function getPlayedRange(
  waveform: Waveform,
  decoded = getDecodedLength(waveform),
): SampleRange {
  if (decoded === undefined)
    throw new RangeError(`Format ${waveform.encoding.tag} has no length to cut`)

  const range: SampleRange = { start: 0, count: decoded }
  if (waveform.encoding.tag === WaveFormatTag.PCM) return range

  // Both counts are tested signed and compared unsigned, so either one at 2³¹ or above does nothing.
  const { trim, sampleCount } = waveform

  if (trim !== undefined && trim > 0 && trim < decoded) {
    range.start = trim
    range.count -= trim
  }

  if (
    sampleCount !== undefined &&
    sampleCount > 0 &&
    sampleCount < 2 ** 31 &&
    range.count > sampleCount
  )
    range.count = sampleCount

  return range
}
