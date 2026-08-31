# UTF (Universal Tree Format)

The binary container Freelancer (2003) stores a hierarchical tree of named directories and files in.
Models, materials, textures, animations, particle effects and voice banks are all UTF trees; `.sur`
collision files, INI and the scene scripts are not.

`Directory` and `File` are the interim layer for it — public, mutable, and what an editor builds a
tree with. The names of every export are in [API.md](API.md#utf).

## On-disk layout

A fixed 56-byte header followed by three regions:

| Region               | Contents                                                                       |
| -------------------- | ------------------------------------------------------------------------------ |
| **Header**           | Magic `UTF `, version `0x101`, then the offsets and sizes of the three regions |
| **Tree block**       | Fixed 44-byte entries, linked by sibling and child offsets                     |
| **Dictionary block** | NUL-terminated ASCII entry names, deduplicated                                 |
| **Data block**       | Raw file payloads                                                              |

Nothing in the format orders the regions, and retail authored both arrangements: models write
tree-then-dictionary, the `DATA/AUDIO` voice banks write dictionary-then-tree and over-allocate it.
See [AUDIO.md](AUDIO.md#corpus).

## Header

Eight bytes of version block, then a 48-byte field block.

| Field                | Type   | Description                                                     |
| -------------------- | ------ | --------------------------------------------------------------- |
| `signature`          | uint32 | `UTF ` (`0x20465455`); must match exactly                       |
| `version`            | uint32 | Only `0x101` is valid                                           |
| `treeOffset`         | uint32 | Byte offset to the tree block                                   |
| `treeSize`           | uint32 | Byte size of the tree block                                     |
| `entryOffset`        | uint32 | Offset of the root entry within the tree block                  |
| `entrySize`          | uint32 | Byte size of one entry; must be 44 (`0x2c`)                     |
| `namesOffset`        | uint32 | Byte offset to the dictionary block                             |
| `namesSizeAllocated` | uint32 | Allocated byte size of the dictionary block                     |
| `namesSizeUsed`      | uint32 | Used byte size of the dictionary block (≤ `namesSizeAllocated`) |
| `dataOffset`         | uint32 | Byte offset to the data block                                   |
| `unusedOffset`       | uint32 | Offset to extra data (unused)                                   |
| `unusedSize`         | uint32 | Size of extra data (unused)                                     |
| `filetime`           | uint64 | Windows 64-bit FILETIME (file creation time)                    |

## Tree entries

44 bytes per node, directory or file alike:

| Field                  | Type   | Description                                                             |
| ---------------------- | ------ | ------------------------------------------------------------------------- |
| `nextOffset`           | uint32 | Offset to the next sibling entry, relative to the tree block             |
| `nameOffset`           | uint32 | Offset to the entry name in the dictionary block                        |
| `fileAttributes`       | uint32 | Win32 `dwFileAttributes`; `0x10` = directory, `0x80` = file with data    |
| `sharingAttributes`    | uint32 | Unused filesystem sharing bitmask                                       |
| `childOffset`          | uint32 | First child (directories) or data offset (files), relative to its block |
| `dataSizeAllocated`    | uint32 | Allocated byte length in the data block                                 |
| `dataSizeUsed`         | uint32 | Actual byte length of the file payload                                  |
| `dataSizeUncompressed` | uint32 | Uncompressed size; typically equal to `dataSizeUsed`                    |
| `createTime`           | uint32 | DOS creation timestamp                                                  |
| `accessTime`           | uint32 | DOS last-access timestamp                                               |
| `modifyTime`           | uint32 | DOS last-modification timestamp                                         |

`Directory.read` parses the tree with a BFS queue from the root entry; `Directory.write`
re-serializes an in-memory tree, rebuilding the dictionary and stamping fresh timestamps.

**Path lookups compare names by `getResourceId`, never by string**, so `getDirectory`/`getFile` are
case-insensitive the way the game's own lookups are — which is what a format spelling
`Material library` three different ways requires. `File` implements `ArrayBufferView` and carries
typed iterators over its payload for the three shapes a UTF leaf takes: 32-bit integers, 32-bit
floats, and NUL-separated strings.

## Hashing

Hashing is the package root rather than part of `./utf`: an `.ale` names a node the way a `.cmp`
names a mesh, and an INI names an archetype a different way, so it belongs to no one format. It is
**domain knowledge, not utility** — the table comes from `dacom.dll`, the byte swap is the game's
convention, and case-folding is the game's behaviour. It is documented here because UTF path lookups
are its first consumer.

Two algorithms, and picking the wrong one yields a number rather than an error:

- **`getResourceId`** — Freelancer CRC32. A standard CRC-32 whose table `dacom.dll` generated with a
  *signed* right shift, so the high byte of every entry carries a borrowed sign bit and the low 24 do
  not. Generated here rather than transcribed, and checked against the table at `0x6330`. Used for
  material names, mesh library names, and most UTF resource references.
- **`getObjectId`** — `id32`, which is **not `getResourceId` with a byte swap**. Its table is
  generated MSB-first over the polynomial `0x00500080` (x²² + x²⁰ + x⁷) where `getResourceId`'s is
  LSB-first over `0xEDB88320`; the byte loop consuming it is LSB-first in both, so here generation
  and consumption disagree about direction. Neither end is inverted. The result is byte-reversed,
  shifted right two, and has bit 31 forced on — so every object id read as int32 is negative, bit 30
  is always clear, and the id space is 30 bits rather than 32. Used for object and archetype
  nicknames in INI files, and for `DATA/AUDIO` entry names.

Strings hash as **windows-1252**, which is what the game hashed. Both fold case by default;
[ALCHEMY.md](ALCHEMY.md#name-hashing-is-case-sensitive) is the one place in the library that does
not.

## Utilities

`./utility` is what every binary reader here is built on. None of it is Freelancer-specific except
where noted.

- **`BufferView`** — a stateful `DataView` subclass with an internal cursor, little-endian by
  default. The `littleEndian` constructor parameter is what lets THN read big-endian without a
  second implementation.
- **`encoding`** — windows-1252 both ways. Needed for `initialworld.ini`'s U+00A0 padding, and it is
  the encoding hashing uses.
- **`Dictionary`** — accumulates entry names for the UTF names block during serialization.
- **`number`** — C `atoi`/`atof`, shortest-round-trip float32 formatting, and the text token
  classifier [INI.md](INI.md#how-the-game-reads-a-value) reproduces the BINI compiler's behaviour
  from.
- **`string`** — `fold`/`equals` (ASCII only, which is what `stricmp` does), `trim` including
  U+00A0, and hex helpers.
- **`tree`** — generic `Tree<T>` walks, shared by anything shaped `{ children: T[] }`.
- **`timestamp`** — `Date` ↔ DOS timestamps and Windows 64-bit FILETIMEs, which is what the header
  and every tree entry carry.
- **`hierarchy`** — generic `assemble`/`flatten`, used to rebuild a tree from a flat parent/child
  table.
- **`chunkview`** — a chunked-binary cursor, used by [SURFACE.md](SURFACE.md).
