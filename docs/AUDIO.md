# Audio

Freelancer's voice lines are shipped as **voice banks** — `.utf` containers under `DATA/AUDIO`, one
per speaker, holding one compressed waveform per line of dialogue. The 109 banks are the only
`.utf` files in retail `DATA` that are not models, and they carry **23,995 waveforms** between them.

There is no module for this. A bank has no schema past the UTF tree itself: no header file, no
index, no nesting. `Directory` reads and writes it as-is, and the two things worth knowing — how an
entry name is derived, and what order entries go in — are a hash call and a sort. Both are covered
in [Examples](#examples) below.

## Architecture

```
betaleader.utf (UTF root directory)
  │
  ├─ 0x817584C9 (UTF file) ─── RIFF/WAVE, MPEG Layer-3 payload
  └─ 0xABADF18F (UTF file) ─── RIFF/WAVE, MPEG Layer-3 payload
```

That is the whole format. Every one of the 109 banks is a flat root directory whose children are
all leaf files — **no bank contains a subdirectory**, and no entry holds anything but a RIFF.

An entry name is the CRC of the line's message nickname, formatted as `0x` plus eight uppercase hex
digits. All 23,995 are in that exact form, which is what `toHex` emits.

## The link from `voices_*.ini`

A bank names nothing. Both halves of the mapping live in the twenty-six `voices_*.ini` files beside
it, and they are BINI — reading them is [out of scope](#what-is-not-here) for this library.

```ini
[Voice]
nickname = betaleader                    ; → AUDIO/betaleader.utf

[Sound]
msg = DX_M01_0330_LPU_BETA_LEADER        ; → entry 0x817584C9
[Sound]
msg = DX_M01_0340_LPU_BETA_LEADER        ; → entry 0xABADF18F
```

The `[Voice]` nickname is the bank's file name; each following `[Sound]` block's `msg` is one entry
in that bank. Nothing else in `DATA/AUDIO` points at a `.utf` — `sounds.ini` and its siblings
(`gf_sounds`, `engine_sounds`, `interface_sounds`, `story_sounds`, `ambience_sounds`, `music`) all
carry `file=` paths to loose `.wav`s and reference no bank at all.

One wrinkle in the traversal: **90 `[Voice]` sections carry no `nickname`, only `extend`**, naming
the voice they append lines to. Their `[Sound]` blocks belong to that voice's bank. Attributing
them to nothing leaves 1,131 entries looking unaccounted for — 367 of them in `juni.utf`, 241 in
`king.utf`.

With `extend` folded in, the mapping is **exact in both directions**: every one of the 23,995
entries resolves to a declared `msg`, every declared `msg` has an entry, and no two `msg` names in
a bank collide.

## The hash

Entry names use **`getObjectId`** — `id32`, the byte-swapped CRC32 — **case-insensitively**. Not
`getResourceId`, which is what the rest of the UTF library uses for resource references. That fits
what the name is: `msg` is an INI nickname, hashed the way archetype and system-object nicknames
are, not a resource reference inside a UTF tree.

Measured across all 109 banks:

| Hash                             | Entries matched |
| -------------------------------- | --------------- |
| `getObjectId`, case-insensitive  | **23,995**      |
| `getObjectId`, case-sensitive    | 0               |
| `getResourceId`, either way      | 0               |

Case-insensitivity is settled rather than assumed. **22,823 of the message nicknames contain
lowercase**, so their folded and unfolded hashes differ, and it is the folded one that appears in
the file. Every entry matching under folding and none matching without it leaves no ambiguity.

This is the ordinary convention — `getObjectId` and `getResourceId` both default to folding case.
Alchemy remains the one module that hashes case-sensitively.

## Entry order

Entries are stored **ascending by unsigned id in all 109 banks**. This is a sort, not authoring
residue: the order matches the `.ini` declaration order in only 12 of them, and those 12 are
consistent with the sort by coincidence.

Write a bank sorted, and reordering `[Sound]` blocks in the INI produces no diff.

## Waveform payload

Every entry is a complete RIFF file, and its `RIFF` size field agrees with the entry's byte length
in all 23,995 — so an entry can be dropped on disk as a `.wav` unchanged, and any decoder that
reads MP3-in-WAV will play it.

The `fmt ` chunk is 30 bytes: `WAVEFORMATEX` with format tag **`0x0055`** (`WAVE_FORMAT_MPEGLAYER3`)
and `cbSize` 12, followed by the `MPEGLAYER3WAVEFORMAT` extension. So the payload is MPEG Layer-3
audio in a WAV wrapper, not PCM. Uniform across the corpus:

| Field              | Value                                        |
| ------------------ | -------------------------------------------- |
| `nChannels`        | 1 — every line is mono                       |
| `nSamplesPerSec`   | 11,025 (18,369 entries) or 22,050 (5,626)    |
| `nAvgBytesPerSec`  | 2,500 or 4,000 — 20 kbps and 32 kbps         |
| `wBitsPerSample`   | 0, as the format requires for a codec        |
| `wID`              | 1 (`MPEGLAYER3_ID_MPEG`)                     |
| `fdwFlags`         | 2 (`MPEGLAYER3_FLAG_PADDING_OFF`)            |
| `nCodecDelay`      | 1,393                                        |

Chunk layout is `fmt ` + `fact` + `trim` + `data` in all 23,995 — never a different set, never a
different order. `fact` is the standard uncompressed sample count and varies per line. `trim` is
non-standard, four bytes, and takes one of two values that otherwise track the sample rate: 1,235
at 11,025 Hz and 1,209 at 22,050 Hz.

Otherwise, with one exception. **`pilot_c_ill_m02a.utf/0x99E5DF04` is 22,050 Hz carrying the
11,025 Hz trim value** — the sole entry where the two disagree. It is the reason to carry the RIFF
through verbatim rather than rebuild the header from what you think the fields should be, which is
what the examples below do and what `Directory` does for free.

## Music, and the rest of the loose waveforms

The banks are the exception, not the rule. **Music is the same MP3-in-WAV encoding stored as plain
files** — 108 of them in `AUDIO/MUSIC`, 62 MiB, no container and no hashing. `music.ini` reaches
them by path:

```ini
[Sound]
nickname = music_anticipation_light
file = audio\music\music_anticipation_light.wav
type = music
attenuation = -6
streamer = true
```

That is how `sounds.ini`, `gf_sounds.ini`, `engine_sounds.ini`, `interface_sounds.ini`,
`ambience_sounds.ini`, `story_sounds.ini` and `music.ini` all work — a nickname, a path, and
playback settings. Only `voices_*.ini` addresses audio by hash, and only voice lines live in a
container. Nothing outside `AUDIO/*.utf` needs this library at all.

What the loose files hold:

| Location          | Files | Size    | Encoding                                        |
| ----------------- | ----- | ------- | ----------------------------------------------- |
| `AUDIO/MUSIC`     | 108   | 62 MiB  | MP3, **stereo** 22,050 Hz, 80 kbps (87) or 96 (21) |
| `AUDIO/SOUNDS`    | 568   | 20 MiB  | MP3 mono 32/56 kbps (450), MP3 stereo 64 (39), **PCM** 16-bit mono (76), one 11,025 Hz mono trio |
| `AUDIO/DIALOGUE`  | 999   | 12 MiB  | MP3 mono, 32 kbps at 22,050 Hz (958) or 20 at 11,025 (41) |
| `AUDIO/MIXES`     | 21    | 15 MiB  | MP3 stereo 22,050 Hz, 80 kbps                   |
| `AUDIO/` root     | 4     | 26 KiB  | PCM — `null.wav`, `tone.wav`, `2pop01/02.wav`   |

So MP3-in-WAV is the house format everywhere, at four bitrates picked per role, and the banks sit
at the bottom of that range: mono 20 kbps, the cheapest thing in the game. The 76 PCM files under
`SOUNDS` are the only uncompressed audio of consequence, and the four at the root are test tones
and silence.

Two differences from the banks, both in `MUSIC`:

- **The `trim` chunk is not universal.** Music is `fmt `+`fact`+`trim`+`data` in 84 files and
  `fmt `+`fact`+`data` in 24 — every 96 kbps track plus three 80 kbps ones, with
  `music_bar_li01.wav` carrying a `trim` of 0. The banks have it in all 23,995. The
  `MPEGLAYER3WAVEFORMAT` extension is identical throughout, `nCodecDelay` of 1,393 included, so
  whatever wrote `trim` was a step in the pipeline rather than part of the format.
- **Six tracks carry a pad byte** — `music_cambridge`, `music_crete`, `music_failure`,
  `music_hamburg`, `music_kurile` and `music_kyushu` have an odd-length `data` chunk, so the file
  runs one byte past what the `RIFF` size field declares. That is RIFF word alignment behaving
  correctly, not damage; every other file in `AUDIO` happens to land even.

## Round trip

Reading all 109 banks and writing them back preserves **every one of the 23,995 payloads byte for
byte**, and writing is a fixed point for all 109 — but **no bank comes back byte-identical to
retail**, and both reasons belong to `Directory`, not to anything about audio:

- **The container is repacked smaller.** Retail lays these out with the dictionary *before* the
  tree and over-allocates it — 71,648 bytes of dictionary are allocated and never used across the
  corpus. `Directory.write` emits tree-then-dictionary at exactly the size needed, so all 109 shrink,
  by 153,299 bytes in total, about 0.13%.
- **Timestamps are regenerated.** `write` stamps the header FILETIME and every entry's three DOS
  timestamps with the current time rather than carrying what was read. Set those aside and the
  second write reproduces the first exactly, in all 109.

So a bank is safe to edit and rewrite — nothing about the audio is lost — but do not expect the
byte-exact reproduction the model and material modules pin.

## Examples

### Reading a bank

```ts
import { readFile, writeFile } from 'node:fs/promises'
import { getObjectId } from '@treewyrm/freelancer'
import { Directory } from '@treewyrm/freelancer/utf'
import { toHex } from '@treewyrm/freelancer/utility'

const bank = Directory.read(await readFile('DATA/AUDIO/betaleader.utf'))

// Look a line up by the message nickname `voices_mission01.ini` declares.
const line = bank.getFile(toHex(getObjectId('DX_M01_0330_LPU_BETA_LEADER')))
if (line) await writeFile('line.wav', line.data)
```

`getFile` matches entry names by CRC, so it wants the **hex string**, not the id — passing the
number hashes the number rather than the name it spells and finds nothing. `toHex` bridges the two.

Entries are files, so `bank.files` is the whole bank, and `File.data` is the RIFF as stored:

```ts
for (const line of bank.files) await writeFile(`${line.name}.wav`, line.data)
```

Nothing recovers the original nicknames from a bank alone — the hash is one-way. Read them from
`voices_*.ini`, or keep a side table:

```ts
const nicknames = ['DX_M01_0330_LPU_BETA_LEADER', 'DX_M01_0340_LPU_BETA_LEADER']

const named = new Map(
  nicknames
    .map((msg) => [msg, bank.getFile(toHex(getObjectId(msg)))] as const)
    .filter(([, line]) => line !== undefined),
)
```

### Writing a bank

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

`append` replaces an entry whose name hashes the same rather than adding a second one, so calling
`setLine` twice for one nickname updates the line instead of leaving an unreachable duplicate
behind.

The `.wav` files handed to `setLine` are stored byte for byte, and must already be MP3-in-WAV in
the shape described above — writing PCM produces a well-formed UTF that the game will not play.
Re-encoding is out of scope here; `ffmpeg -i line.wav -c:a libmp3lame -ar 11025 -ac 1 -b:a 20k -f wav out.wav`
gets close, though it emits neither the `trim` chunk nor Freelancer's `nCodecDelay`.

## What is not here

**Reading `voices_*.ini`.** They are BINI, and BINI is out of scope for this library — it handles
UTF containers and `.sur`. Resolving a bank to its speaker, or an entry to its line, needs an INI
reader alongside.

**`AUDIO/MUSIC`, `AUDIO/SOUNDS`, `AUDIO/DIALOGUE`, `AUDIO/MIXES`.** Loose `.wav` files reached by
`file=` path, described [above](#music-and-the-rest-of-the-loose-waveforms). `DIALOGUE` in
particular is forty folders that share some speakers' names with the banks, but its file names hash
to nothing in any of them — separate assets that merely sit next door. None of these need a UTF
reader.

**The `[Voice]` and `[Sound]` properties past the mapping** — `attenuation`, `duration`,
`priority`, `script`, and the `[mVoiceProp]` gender and role tables. They describe playback and
lip-sync, and none of them reach into the bank.
