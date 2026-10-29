# Wave

RIFF/WAVE files — every sound the game plays. The loose `.wav` files under `DATA/AUDIO`, and every
entry of a voice bank ([AUDIO.md](../refs/AUDIO.md)), are this one format: MPEG Layer-3 in a WAV
wrapper, or PCM.

The module reads a file into its chunks and back byte for byte, reads the four chunks the game
reads, walks the MPEG frame headers, and says which slice of the decoded sound the game plays.
**It does not decode.** Turning MP3 into samples is the consumer's — a browser's `decodeAudioData`
takes every retail file whole.

## Layout

```
RIFF  <size>  WAVE
  fmt   30 bytes  WAVEFORMATEX + MPEGLAYER3WAVEFORMAT   (16 bytes on PCM)
  fact   4 bytes  sample frames to play
  trim   4 bytes  sample frames to drop from the front  (non-standard)
  data   …        the MP3 stream, or PCM
```

Chunks are an id of four Latin-1 characters, a `uint32` length, and the payload. The RIFF spec pads
an odd payload to an even length; retail pads only between chunks, and the only odd chunk it has is
the last one. `readWave` keeps that exact:

- An odd chunk's pad byte is skipped when another chunk follows it.
- Bytes the RIFF size counts after the last chunk are `Wave.padding`. Retail has none.
- Bytes past the end the RIFF size declares are `Wave.trailing`. Six music tracks carry one, the pad
  of their odd `data` chunk, written after the size was taken.

`writeWave` is the inverse: it pads every odd chunk but the last, and counts `padding` but not
`trailing`.

## The `fmt ` chunk

`WaveEncoding` is `WAVEFORMATEX`. A PCM chunk may stop at `PCMWAVEFORMAT`'s 16 bytes, and every
retail PCM file does; then `extension` is absent. Otherwise the `cbSize` bytes after the 18 are
`extension` — on every retail MP3, the twelve bytes of `MPEGLAYER3WAVEFORMAT`:

| Field             | Retail                                                        |
| ----------------- | ------------------------------------------------------------- |
| `wID`             | 1 (`MPEGLAYER3_ID_MPEG`)                                      |
| `fdwFlags`        | 2 (`MPEGLAYER3_FLAG_PADDING_OFF`)                             |
| `nBlockSize`      | 1, or 104 in five files — not the frame length either way    |
| `nFramesPerBlock` | 1                                                             |
| `nCodecDelay`     | 1,393                                                         |

None of the five is read by `soundmanager.dll` or `soundstreamer.dll`, which hand the whole chunk to
ACM. Whether the Fraunhofer codec behind ACM reads `nCodecDelay` is not settled here. If it dropped
1,393 frames ahead of `trim`, only 498 of the 25,615 MP3s would still hold all of `fact`.

What the two DLLs require of the chunk is less than the format allows. `soundmanager.dll` checks
`RIFF` and `WAVE` (`0x6ee8a2b`); both refuse a file with no `fmt ` or no `data`, and a `fmt ` under
18 bytes unless it is PCM, where `soundmanager.dll` takes 14 bytes and `soundstreamer.dll` 16
(`0x6ee8ab4`–`0x6ee8adc`, `0x6ef1705`–`0x6ef175d`). On PCM `soundmanager.dll` reads only
`nChannels`, `wBitsPerSample` and the low 16 bits of `nSamplesPerSec`, and works the block alignment
out itself (`0x6ee8b2b`–`0x6ee8b58`); a 14-byte PCM `fmt ` leaves `wBitsPerSample` outside the chunk,
so it is read from whatever follows.

## `fact` and `trim`

`fact` is the standard chunk: the uncompressed length in sample frames. `trim` is Freelancer's own.

The two DLLs walk the chunk list differently. `soundmanager.dll` walks all of it and keeps the last
chunk of each id. `soundstreamer.dll` (`0x6ef1690`) stops as soon as it holds `fmt `, `fact` and
`data`, so a `trim` after those three is never seen — retail always puts it before `data`. **Neither
walker skips a pad byte** (`0x6ee8a99`, `0x6ef16e0`): an odd chunk with another after it throws both
off, which is why retail pads nothing between chunks. Both accept the two counts the same way:

| Chunk  | Counts when   | Missing means |
| ------ | ------------- | ------------- |
| `fact` | 4 bytes or more | no cap        |
| `trim` | exactly 4 bytes | no skip       |

`readWaveform` makes the same tests and keeps the last of each id, as `soundmanager.dll` does, so a
chunk the game would not see reads as absent rather than throwing.

`fact` is not always per channel. Seventeen stereo music tracks count both channels, which puts the
cap past the end of the sound, where it does nothing.

## What the game plays

**The decoded sound, less `trim` frames from the front, cut to `fact` frames.** In order:

1. PCM plays whole — `fact` and `trim` are not consulted. Anything else is converted to PCM through
   ACM in one call.
2. The first `trim` frames are dropped, unless that would drop all of them.
3. What is left is cut to `fact` frames, if it is longer.

`soundmanager.dll` does this for a sound it decodes whole, at `0x6ee887e`–`0x6ee88a1`, inside the
decode at `0x6ee86c0`; the chunk walk feeding it is at `0x6ee8a50`, and PCM branches off at
`0x6ee8b22`. `soundstreamer.dll` — music, `streamer = true` — keeps both counts per stream: the skip
is armed at `0x6ef220b` whenever an MP3's read position is back at the start of `data`, so a loop
skips again, and the cap is at `0x6ef2325`. Both counts are tested signed and compared unsigned, so
either at 2³¹ or above does nothing.

`getPlayedRange(waveform, decoded)` returns that slice as `{ start, count }` in sample frames. In
Web Audio it is the whole of playback:

```ts
import { readWave, readWaveform, getPlayedRange } from '@treewyrm/freelancer/wave'

const waveform = readWaveform(readWave(bytes))
const rate = waveform.encoding.sampleRate

// Decoded at the file's own rate, so the buffer's length counts the frames `trim` and `fact` do.
const decoder = new OfflineAudioContext(1, 1, rate)
const buffer = await decoder.decodeAudioData(bytes.slice().buffer)
const { start, count } = getPlayedRange(waveform, buffer.length)

const source = new AudioBufferSourceNode(context, { buffer })
source.connect(context.destination)
source.start(0, start / rate, count / rate)
```

A live `AudioContext` decodes to the output device's rate instead, which puts `buffer.length` in
the wrong unit. Passing the decoder's own length is the safe form. Without it, `getDecodedLength` stands in: PCM by
`blockAlign`, MP3 by its frames, nothing for any other format.

## The MPEG stream

`readMPEGFrames` walks frame headers and decodes nothing. It steps over an ID3v2 tag at the start
and stops at the first place a header is not, or at a frame that runs past the end. A frame decodes
to 1,152 sample frames on MPEG-1 layer II and III, 576 on MPEG-2 and 2.5 layer III, 384 on layer I.

Retail is MPEG-2 layer III at 22,050 Hz and MPEG-2.5 layer III at 11,025 Hz. The 11,025 Hz files'
"20 kbit/s" is no bitrate MPEG-2.5 has — `nAvgBytesPerSec` is the average of frames at 16 and 24.

`getDecodedLength` assumes a decoder that hands back every frame whole and trims nothing. Chromium's
does: an 11,025 Hz bank line of 31 frames decodes to 17,856 frames, against a `fact` of 15,430 and a
`trim` of 1,235.

## Notes

### Decode first, then cut

`fact` and `trim` count frames of ACM's output, not of the stream. A consumer that decodes with
anything else is taking that the two decoders agree on where the first frame starts. Nothing in the
data contradicts that — `trim` + `fact` fits the frame count in 25,570 of 25,615 — but nothing
proves it either. A disagreement would shift a line by a few hundred frames at most, tens of
milliseconds at its front: inaudible on its own, and the size a lip-sync would notice.

### `trim` tracks the encoder, not the sample rate

It takes five values, and 1,235 and 1,209 both appear at each rate — see
[Trim values](#trim-values). Carry it through; never derive it.

## API

### `./wave`

| Export             | Kind      |                                                                                       |
| ------------------ | --------- | ------------------------------------------------------------------------------------- |
| `Chunk`            | interface | One RIFF chunk: its four-character id and its payload, without a pad byte.            |
| `getDecodedLength` | function  | Sample frames the payload decodes to, from its headers: PCM and MPEG Layer-3.         |
| `getPlayedRange`   | function  | The slice of the decoded sound the game plays: past `trim`, at most `fact`.           |
| `isWave`           | function  | Whether `readWave` accepts the bytes.                                                 |
| `MPEGFrame`        | interface | One MPEG audio frame header, and where the frame lies in the stream.                  |
| `MPEGVersion`      | enum      | The two-bit version field's wire codes.                                               |
| `readMPEGFrames`   | function  | `(data: Uint8Array): MPEGFrame[]` — the frame headers of an MPEG audio stream.        |
| `readWave`         | function  | `(source): Wave` — a RIFF/WAVE file into its chunks, copying each payload.            |
| `readWaveform`     | function  | `(wave: Wave): Waveform` — the four chunks the game reads.                            |
| `SampleRange`      | interface | A slice of decoded sample frames, as `start` and `count`.                             |
| `Wave`             | interface | A RIFF/WAVE file as its chunks, with any bytes outside them, losslessly.              |
| `WaveEncoding`     | interface | The `fmt ` chunk: `WAVEFORMATEX`, or the 16-byte `PCMWAVEFORMAT` it extends.          |
| `Waveform`         | interface | What the game reads: the encoding, `fact`, `trim` and the `data` payload.             |
| `WaveFormatTag`    | enum      | `wFormatTag` codes: PCM, ADPCM, MPEG Layer-3.                                         |
| `writeWave`        | function  | `(wave: Wave): BufferView` — a RIFF/WAVE file, byte for byte what `readWave` read.    |
| `writeWaveform`    | function  | `(waveform: Waveform): Wave` — `fmt `, `fact`, `trim`, `data`, in retail's order.     |

## Corpus

**25,695 waveforms**: 1,700 loose files under `AUDIO` and the 23,995 entries of 109 voice banks.

| Location         | Files  |
| ---------------- | ------ |
| Voice banks      | 23,995 |
| `AUDIO/DIALOGUE` | 999    |
| `AUDIO/SOUNDS`   | 568    |
| `AUDIO/MUSIC`    | 108    |
| `AUDIO/MIXES`    | 21     |
| `AUDIO/` root    | 4      |

No other UTF container in `DATA` holds a RIFF payload.

### Round-trip

`readWave` → `writeWave` is **byte-exact for all 25,695**, the six trailing pad bytes included.
`readWaveform` → `writeWaveform` → `readWaveform` is a fixed point for all of them.

### Chunk layout

| Layout                      | Files  |
| --------------------------- | ------ |
| `fmt `+`fact`+`trim`+`data` | 25,591 |
| `fmt `+`data`               | 76     |
| `fmt `+`fact`+`data`        | 24     |
| `fmt `+`data`+`LIST`        | 3      |
| `fmt `+`data`+`cue `+`LIST` | 1      |

13,092 end in an odd `data` chunk. 13,086 have no pad byte at all; the other six —
`music_cambridge`, `music_crete`, `music_failure`, `music_hamburg`, `music_kurile`,
`music_kyushu` — have one past the RIFF size.

### Encodings

| Format | Channels | Rate   | `nAvgBytesPerSec`   | Files  |
| ------ | -------- | ------ | ------------------- | ------ |
| MP3    | mono     | 11,025 | 2,500 (16/24 kbit)  | 18,413 |
| MP3    | mono     | 22,050 | 4,000 (32 kbit)     | 6,929  |
| MP3    | mono     | 22,050 | 7,000 (56 kbit)     | 105    |
| MP3    | stereo   | 22,050 | 8,000 (64 kbit)     | 39     |
| MP3    | stereo   | 22,050 | 10,000 (80 kbit)    | 108    |
| MP3    | stereo   | 22,050 | 12,000 (96 kbit)    | 21     |
| PCM    | mono     | 22,050 | 16-bit              | 79     |
| PCM    | mono     | 8,000  | 8-bit               | 1      |

Every MP3 is layer III with contiguous frames, at the rate and channel count `fmt ` declares. Five
music tracks are wrapped in ID3 tags — an ID3v2 tag at the head of `data` in all five, an ID3v1 tag
at the tail of four:

| Track                        | ID3v2 | ID3v1 |
| ---------------------------- | ----- | ----- |
| `music_anticipation_light`   | 1,024 | 128   |
| `music_anticipation_moref`   | 1,024 | 128   |
| `music_anticipation_motiv`   | 1,024 | 128   |
| `music_californiaminor`      | 256   | 128   |
| `music_m13_hypergate_scene`  | 256   | —     |

Every other stream begins and ends on a frame.

### Trim values

| Location    | 0 | 1,209 | 1,231 | 1,235  | 1,673 | none |
| ----------- | - | ----- | ----- | ------ | ----- | ---- |
| Voice banks |   | 5,625 |       | 18,370 |       |      |
| `DIALOGUE`  | 2 | 958   |       | 39     |       |      |
| `SOUNDS`    |   | 346   | 17    | 34     | 95    |      |
| `MUSIC`     | 1 |       |       |        | 83    | 24   |
| `MIXES`     |   |       |       |        | 21    |      |

The one 22,050 Hz bank entry at 1,235 is `pilot_c_ill_m02a.utf/0x99E5DF04`.

### The cut

With every frame decoded whole, `trim` + `fact` fits inside the decoded length in **25,570 of the
25,615 MP3s**, and the game's slice ends at exactly `fact`. In the other 45 `fact` lies past the end
and the sound plays to its last frame:

| Location    | Cut to `fact` | Plays to the end |
| ----------- | ------------- | ---------------- |
| Voice banks | 23,972        | 23               |
| `DIALOGUE`  | 999           |                  |
| `SOUNDS`    | 487           | 5                |
| `MUSIC`     | 91            | 17               |
| `MIXES`     | 21            |                  |

The 17 music tracks are the ones whose `fact` counts both channels, between 1.98 and 2 times the
decoded length. The other 28 overrun by 6 to 21 frames in 18 files, by exactly their `trim` of
1,209 in five — a `fact` equal to the whole decoded length — and by 519 to 12,900 in the last five.

## TODO

### Where a scene's `start_time` lands against `trim`

`START_SOUND` can start a wave part-way in: `start_time` is integer milliseconds (`thorn.dll`
`0x6f26085`), and the game adds the time since the event fired before handing it on
(`Freelancer.exe` `0x4574d0`). How the sound manager turns that into a buffer position is not read,
so neither is whether it counts from the first decoded frame or from the first frame past `trim`.
*Experiment*: start one bank line at `start_time` 0 and at its `trim` in milliseconds and compare
the onsets.
