# Audio

Voice banks — `.utf` containers under `DATA/AUDIO`, one per speaker, holding one compressed waveform
per line of dialogue. The only `.utf` files in retail `DATA` that are not models.

No module. A bank has no schema past the UTF tree: no header file, no index, no nesting. `Directory`
reads and writes it as-is.

## Layout

```
betaleader.utf (UTF root directory)
  │
  ├─ 0x817584C9 (UTF file) ─── RIFF/WAVE, MPEG Layer-3 payload
  └─ 0xABADF18F (UTF file) ─── RIFF/WAVE, MPEG Layer-3 payload
```

Every bank is a flat root directory whose children are all leaf files. An entry name is the CRC of
the line's message nickname, formatted as `0x` plus eight uppercase hex digits — what `toHex` emits.

## The link from `voices_*.ini`

A bank names nothing. Both halves of the mapping are in the `voices_*.ini` files beside it:

```ini
[Voice]
nickname = betaleader                    ; → AUDIO/betaleader.utf

[Sound]
msg = DX_M01_0330_LPU_BETA_LEADER        ; → entry 0x817584C9
[Sound]
msg = DX_M01_0340_LPU_BETA_LEADER        ; → entry 0xABADF18F
```

The `[Voice]` nickname is the bank's file name; each following `[Sound]` block's `msg` is one entry
in that bank. Nothing else in `DATA/AUDIO` points at a `.utf`.

Some `[Voice]` sections carry no `nickname`, only `extend`, naming the voice they append lines to.
Their `[Sound]` blocks belong to that voice's bank.

## The hash

Entry names use `getObjectId` (`id32`), case-insensitively — not `getResourceId`. `msg` is an INI
nickname, hashed the way archetype and system-object nicknames are.

## Entry order

Ascending by unsigned id. A sort, not authoring residue — see [Corpus](#entry-order-1).

## Waveform payload

Every entry is a complete RIFF file whose `RIFF` size field agrees with the entry's byte length, so
an entry can be dropped on disk as a `.wav` unchanged.

The `fmt ` chunk is 30 bytes: `WAVEFORMATEX` with format tag `0x0055` (`WAVE_FORMAT_MPEGLAYER3`)
and `cbSize` 12, followed by `MPEGLAYER3WAVEFORMAT`. The payload is MPEG Layer-3 in a WAV wrapper,
not PCM.

Chunk layout is `fmt ` + `fact` + `trim` + `data`. `fact` is the standard uncompressed sample count.
`trim` is non-standard, four bytes, and tracks the sample rate.

## Reading a bank

```ts
import { readFile, writeFile } from 'node:fs/promises'
import { getObjectId } from '@treewyrm/freelancer'
import { Directory } from '@treewyrm/freelancer/utf'
import { toHex } from '@treewyrm/freelancer/utility'

const bank = Directory.read(await readFile('DATA/AUDIO/betaleader.utf'))

const line = bank.getFile(toHex(getObjectId('DX_M01_0330_LPU_BETA_LEADER')))
if (line) await writeFile('line.wav', line.data)
```

`getFile` matches entry names by CRC, so it takes the hex string, not the id — passing the number
hashes the number rather than the name it spells. `toHex` bridges the two.

`bank.files` is the whole bank; `File.data` is the RIFF as stored. Nothing recovers the original
nicknames from a bank alone — the hash is one-way.

## Writing a bank

```ts
import { readFile, writeFile } from 'node:fs/promises'
import { getObjectId } from '@treewyrm/freelancer'
import { Directory, File } from '@treewyrm/freelancer/utf'
import { toHex, parseHex } from '@treewyrm/freelancer/utility'

const bank = new Directory()

const setLine = (msg: string, wave: Uint8Array) =>
  bank.append(new File(toHex(getObjectId(msg)), wave))

setLine('DX_M01_0330_LPU_BETA_LEADER', await readFile('0330.wav'))
setLine('DX_M01_0340_LPU_BETA_LEADER', await readFile('0340.wav'))

// Retail stores entries ascending by id.
bank.children.sort((a, b) => parseHex(a.name) - parseHex(b.name))

await writeFile('betaleader.utf', bank.write())
```

`append` replaces an entry whose name hashes the same rather than adding a second one.

Waveforms are stored byte for byte and must already be MP3-in-WAV — writing PCM produces a
well-formed UTF the game will not play. Re-encoding is out of scope;
`ffmpeg -i line.wav -c:a libmp3lame -ar 11025 -ac 1 -b:a 20k -f wav out.wav` gets close but emits
neither the `trim` chunk nor Freelancer's `nCodecDelay`.

## What is not here

- **Resolving a bank to its speaker.** The mapping is in `voices_*.ini`, read by `./ini`; joining
  the two is the consumer's, like every other cross-reference.
- **`AUDIO/MUSIC`, `AUDIO/SOUNDS`, `AUDIO/DIALOGUE`, `AUDIO/MIXES`.** Loose `.wav` files reached by
  `file=` path — see [The loose waveforms](#the-loose-waveforms). `DIALOGUE` shares some speakers'
  names with the banks but its file names hash to nothing in any of them. None need a UTF reader.
- **`[Voice]` and `[Sound]` properties past the mapping** — `attenuation`, `duration`, `priority`,
  `script`, and the `[mVoiceProp]` tables. They describe playback and lip-sync and do not reach into
  the bank.

## Notes

### Carry the RIFF through verbatim

One entry contradicts the otherwise uniform header (`pilot_c_ill_m02a.utf/0x99E5DF04`, see
[Waveform uniformity](#waveform-uniformity)), so rebuild nothing from what the fields should be.
`Directory` does this for free.

## Corpus

**109 banks holding 23,995 waveforms**, each a flat root directory of leaf files named `0x` plus
eight uppercase hex digits.

### The hash

| Hash                            | Entries matched |
| ------------------------------- | --------------- |
| `getObjectId`, case-insensitive | **23,995**      |
| `getObjectId`, case-sensitive   | 0               |
| `getResourceId`, either way     | 0               |

22,823 of the message nicknames contain lowercase, so their folded and unfolded hashes differ, and
the folded one appears in the file.

### The mapping

Twenty-six `voices_*.ini` files carry it, and 90 `[Voice]` sections carry no `nickname`, only
`extend` — 1,131 entries ride on those, 367 in `juni.utf` and 241 in `king.utf`.

With `extend` folded in the mapping is exact in both directions: every one of the 23,995 entries
resolves to a declared `msg`, every declared `msg` has an entry, no two `msg` names in a bank
collide.

### Entry order

Holds in all 109 banks. Order matches `.ini` declaration order in only 12, and those 12 agree with
the sort by coincidence.

### Waveform uniformity

The `RIFF` size field agrees with the entry's byte length in all 23,995, and the chunk layout is
`fmt `+`fact`+`trim`+`data` in all 23,995.

| Field             | Value                                     |
| ----------------- | ----------------------------------------- |
| `nChannels`       | 1 — every line is mono                    |
| `nSamplesPerSec`  | 11,025 (18,369 entries) or 22,050 (5,626) |
| `nAvgBytesPerSec` | 2,500 or 4,000 — 20 kbps and 32 kbps      |
| `wBitsPerSample`  | 0, as the format requires for a codec     |
| `wID`             | 1 (`MPEGLAYER3_ID_MPEG`)                  |
| `fdwFlags`        | 2 (`MPEGLAYER3_FLAG_PADDING_OFF`)         |
| `nCodecDelay`     | 1,393                                     |

`trim` is 1,235 at 11,025 Hz and 1,209 at 22,050 Hz, with one exception:
`pilot_c_ill_m02a.utf/0x99E5DF04` is 22,050 Hz carrying the 11,025 Hz trim value.

### The loose waveforms

Music is the same MP3-in-WAV encoding stored as plain files, reached by path:

```ini
[Sound]
nickname = music_anticipation_light
file = audio\music\music_anticipation_light.wav
type = music
attenuation = -6
streamer = true
```

| Location         | Files | Size   | Encoding                                                                                         |
| ---------------- | ----- | ------ | ------------------------------------------------------------------------------------------------ |
| `AUDIO/MUSIC`    | 108   | 62 MiB | MP3, **stereo** 22,050 Hz, 80 kbps (87) or 96 (21)                                               |
| `AUDIO/SOUNDS`   | 568   | 20 MiB | MP3 mono 32/56 kbps (450), MP3 stereo 64 (39), **PCM** 16-bit mono (76), one 11,025 Hz mono trio |
| `AUDIO/DIALOGUE` | 999   | 12 MiB | MP3 mono, 32 kbps at 22,050 Hz (958) or 20 at 11,025 (41)                                        |
| `AUDIO/MIXES`    | 21    | 15 MiB | MP3 stereo 22,050 Hz, 80 kbps                                                                    |
| `AUDIO/` root    | 4     | 26 KiB | PCM — `null.wav`, `tone.wav`, `2pop01/02.wav`                                                    |

The banks sit at the bottom of the range: mono 20 kbps. The 76 PCM files under `SOUNDS` are the
only uncompressed audio of consequence; the four at the root are test tones and silence.

Two differences from the banks, both in `MUSIC`:

- `trim` is not universal — 84 files carry it, 24 do not (every 96 kbps track plus three 80 kbps
  ones), and `music_bar_li01.wav` carries a `trim` of 0. The `MPEGLAYER3WAVEFORMAT` extension is
  identical throughout, `nCodecDelay` 1,393 included.
- Six tracks carry a pad byte — `music_cambridge`, `music_crete`, `music_failure`, `music_hamburg`,
  `music_kurile`, `music_kyushu` have an odd-length `data` chunk, so the file runs one byte past the
  declared `RIFF` size. RIFF word alignment, not damage.

### Round-trip

All 23,995 payloads survive byte for byte, and writing is a fixed point for all 109 banks. No bank
comes back byte-identical to retail, for two reasons belonging to `Directory`:

- **Repacked smaller.** Retail writes dictionary-before-tree and over-allocates it — 71,648 unused
  dictionary bytes across the corpus. `Directory.write` emits tree-then-dictionary at exact size,
  so all 109 shrink, 153,299 bytes total, about 0.13%.
- **Timestamps regenerated.** `write` stamps the header FILETIME and every entry's three DOS
  timestamps with the current time. Set those aside and the second write reproduces the first
  exactly, in all 109.
