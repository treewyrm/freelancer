/** One RIFF chunk: its four-character id and its payload, without a pad byte. */
export interface Chunk {
  /** Four characters, Latin-1, as stored — `fmt ` keeps its space. */
  id: string

  data: Uint8Array
}

/**
 * A RIFF/WAVE file as its chunks, in file order.
 *
 * Lossless: {@link padding} and {@link trailing} hold the two places bytes can sit outside every
 * chunk, so a file the reader accepts writes back byte for byte.
 */
export interface Wave {
  chunks: Chunk[]

  /**
   * Bytes the RIFF size counts after the last chunk, too few to be another chunk's header. Where a
   * well-formed file keeps an odd last chunk's pad byte. Retail has none.
   */
  padding?: Uint8Array

  /**
   * Bytes past the end the RIFF size declares. Six retail music tracks carry one: the pad byte of
   * an odd `data` chunk, written after the size was taken.
   */
  trailing?: Uint8Array
}

/** `wFormatTag` codes. Retail uses the first and the last. */
export enum WaveFormatTag {
  PCM = 0x0001,
  ADPCM = 0x0002,
  MPEGLayer3 = 0x0055,
}

/** The `fmt ` chunk: `WAVEFORMATEX`, or the 16-byte `PCMWAVEFORMAT` it extends. */
export interface WaveEncoding {
  /** `wFormatTag`, a {@link WaveFormatTag} or any other registered code. */
  tag: number

  channels: number

  /** Sample frames per second. */
  sampleRate: number

  averageBytesPerSecond: number

  /** Bytes per sample frame for PCM; for a codec, the unit its data is cut into. */
  blockAlign: number

  /** 0 for a codec. */
  bitsPerSample: number

  /**
   * The `cbSize` bytes that follow `WAVEFORMATEX` — `MPEGLAYER3WAVEFORMAT` on every retail MP3.
   * Absent when the chunk stops at `PCMWAVEFORMAT`'s 16 bytes; empty when `cbSize` is 0.
   */
  extension?: Uint8Array
}

/**
 * What the game reads from a RIFF/WAVE file: how it is encoded, the payload, and the two counts
 * that cut the decoded sound down to what is heard — see {@link getPlayedRange}.
 */
export interface Waveform {
  encoding: WaveEncoding

  /**
   * `fact`: the most sample frames the game plays. Not always per channel — 17 stereo music tracks
   * count both channels, so their cap lies past the end of the sound and does nothing.
   */
  sampleCount?: number

  /** `trim`: sample frames the game drops from the front of the decoded sound. */
  trim?: number

  /** The `data` chunk: PCM, or the codec's stream as stored. */
  data: Uint8Array
}

/** The two-bit version field's wire codes. 1 is reserved. */
export enum MPEGVersion {
  MPEG25 = 0,
  MPEG2 = 2,
  MPEG1 = 3,
}

/** One MPEG audio frame header, and where the frame lies in the stream. */
export interface MPEGFrame {
  /** Byte offset of the header in the stream it was read from. */
  offset: number

  /** Bytes, header and padding slot included. */
  length: number

  version: MPEGVersion

  layer: 1 | 2 | 3

  /** Bits per second. */
  bitrate: number

  sampleRate: number

  /** 1 for mono; 2 for stereo, joint stereo and dual channel. */
  channels: 1 | 2

  /** Sample frames the frame decodes to: 384, 576 or 1,152. */
  samples: number
}

/** A slice of decoded sample frames. */
export interface SampleRange {
  start: number
  count: number
}
