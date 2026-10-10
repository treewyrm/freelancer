import { MPEGVersion, type MPEGFrame } from './types.js'

/** kbit/s by bitrate index 1–14, for MPEG-1 layers I, II and III. */
const MPEG1_BITRATES = [
  [32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
  [32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
  [32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
]

/** kbit/s by bitrate index 1–14, for MPEG-2 and 2.5 layer I, then layers II and III. */
const MPEG2_BITRATES = [
  [32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
  [8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
]

const SAMPLE_RATES: Record<number, number[]> = {
  [MPEGVersion.MPEG1]: [44100, 48000, 32000],
  [MPEGVersion.MPEG2]: [22050, 24000, 16000],
  [MPEGVersion.MPEG25]: [11025, 12000, 8000],
}

/** `ID3` and the version, flags and syncsafe size that follow it. */
const ID3_HEADER_BYTE_LENGTH = 10

/** Bytes of an ID3v2 tag at the start of the stream, or 0. */
function id3Length(data: Uint8Array): number {
  if (data.byteLength < ID3_HEADER_BYTE_LENGTH) return 0
  if (data[0] !== 0x49 || data[1] !== 0x44 || data[2] !== 0x33) return 0

  const size =
    ((data[6]! & 0x7f) << 21) |
    ((data[7]! & 0x7f) << 14) |
    ((data[8]! & 0x7f) << 7) |
    (data[9]! & 0x7f)
  const footer = data[5]! & 0x10 ? ID3_HEADER_BYTE_LENGTH : 0

  return ID3_HEADER_BYTE_LENGTH + size + footer
}

/** The frame whose header starts at `offset`, or undefined when there is none there. */
function frameAt(data: Uint8Array, offset: number): MPEGFrame | undefined {
  if (offset + 4 > data.byteLength) return

  const [b0, b1, b2, b3] = [data[offset]!, data[offset + 1]!, data[offset + 2]!, data[offset + 3]!]
  if (b0 !== 0xff || (b1 & 0xe0) !== 0xe0) return

  const versionCode = (b1 >> 3) & 3
  const layerCode = (b1 >> 1) & 3
  const bitrateIndex = b2 >> 4
  const sampleRateIndex = (b2 >> 2) & 3

  if (versionCode === 1 || layerCode === 0 || sampleRateIndex === 3) return

  // Index 0 is free format, whose frame length the header does not give; 15 is reserved.
  if (bitrateIndex === 0 || bitrateIndex === 15) return

  const version = versionCode as MPEGVersion
  const layer = (4 - layerCode) as 1 | 2 | 3
  const mpeg1 = version === MPEGVersion.MPEG1
  const table = mpeg1 ? MPEG1_BITRATES[layer - 1]! : MPEG2_BITRATES[layer === 1 ? 0 : 1]!
  const bitrate = table[bitrateIndex - 1]! * 1000
  const sampleRate = SAMPLE_RATES[version]![sampleRateIndex]!
  const padding = (b2 >> 1) & 1

  const samples = layer === 1 ? 384 : layer === 2 || mpeg1 ? 1152 : 576
  const length =
    layer === 1
      ? (Math.floor((12 * bitrate) / sampleRate) + padding) * 4
      : Math.floor(((samples / 8) * bitrate) / sampleRate) + padding

  return {
    offset,
    length,
    version,
    layer,
    bitrate,
    sampleRate,
    channels: b3 >> 6 === 3 ? 1 : 2,
    samples,
  }
}

/**
 * Reads the frame headers of an MPEG audio stream, in order.
 *
 * An ID3v2 tag at the start is stepped over, as five retail music tracks need. The walk stops at
 * the first place a frame header is not — four of those five end in a 128-byte ID3v1 tag — or at
 * a frame that runs past the end, which no retail stream has. Nothing is decoded: this is what the
 * headers say.
 */
export function readMPEGFrames(data: Uint8Array): MPEGFrame[] {
  const frames: MPEGFrame[] = []

  for (let offset = id3Length(data); ;) {
    const frame = frameAt(data, offset)
    if (!frame || offset + frame.length > data.byteLength) return frames

    frames.push(frame)
    offset += frame.length
  }
}
