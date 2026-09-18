# UTF (Universal Tree Format)

Binary container holding a tree of named directories and files. Models, materials, textures,
animations, particle effects and voice banks are UTF trees. `.sur`, INI and the scene scripts are
not.

`Directory` and `File` are the interim layer — public, mutable, what an editor builds a tree with.

## On-disk layout

56-byte header followed by three regions.

| Region               | Contents                                                                       |
| -------------------- | ------------------------------------------------------------------------------ |
| **Header**           | Magic `UTF `, version `0x101`, then the offsets and sizes of the three regions |
| **Tree block**       | Fixed 44-byte entries, linked by sibling and child offsets                     |
| **Dictionary block** | NUL-terminated ASCII entry names, deduplicated                                 |
| **Data block**       | Raw file payloads                                                              |

Region order is not fixed. See [Region order](#region-order).

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

44 bytes per node, directory or file alike.

| Field                  | Type   | Description                                                             |
| ---------------------- | ------ | ----------------------------------------------------------------------- |
| `nextOffset`           | uint32 | Offset to the next sibling entry, relative to the tree block            |
| `nameOffset`           | uint32 | Offset to the entry name in the dictionary block                        |
| `fileAttributes`       | uint32 | Win32 `dwFileAttributes`; `0x10` = directory, `0x80` = file with data   |
| `sharingAttributes`    | uint32 | Unused filesystem sharing bitmask                                       |
| `childOffset`          | uint32 | First child (directories) or data offset (files), relative to its block |
| `dataSizeAllocated`    | uint32 | Allocated byte length in the data block                                 |
| `dataSizeUsed`         | uint32 | Actual byte length of the file payload                                  |
| `dataSizeUncompressed` | uint32 | Uncompressed size; typically equal to `dataSizeUsed`                    |
| `createTime`           | uint32 | DOS creation timestamp                                                  |
| `accessTime`           | uint32 | DOS last-access timestamp                                               |
| `modifyTime`           | uint32 | DOS last-modification timestamp                                         |

## Read and write

- `Directory.read` parses the tree with a BFS queue from the root entry.
- `Directory.write` re-serializes an in-memory tree, rebuilding the dictionary and stamping fresh
  timestamps.
- Path lookups compare names by `getResourceId`, never by string, so `getDirectory`/`getFile` are
  case-insensitive.
- `File` implements `ArrayBufferView` and carries typed iterators for the three payload shapes:
  32-bit integers, 32-bit floats, NUL-separated strings.

## Hashing

Two algorithms. Picking the wrong one yields a number rather than an error. Strings hash as
windows-1252. Both fold case by default;
[ALCHEMY.md](ALCHEMY.md#name-hashing-is-case-sensitive) is the one exception in the library.

**`getResourceId`** — Freelancer CRC32. Standard CRC-32 whose table `dacom.dll` generated with a
*signed* right shift, so the high byte of every entry carries a borrowed sign bit and the low 24 do
not. Generated here rather than transcribed; checked against the table at `0x6330`. Used for
material names, mesh library names, most UTF resource references.

**`getObjectId`** — `id32`. Table generated MSB-first over polynomial `0x00500080`
(x²² + x²⁰ + x⁷); the byte loop consuming it is LSB-first. Neither end is inverted. Result is
byte-reversed, shifted right two, bit 31 forced on. Every object id read as int32 is therefore
negative, bit 30 is always clear, and the id space is 30 bits. Used for object and archetype
nicknames in INI, and for `DATA/AUDIO` entry names.

Hashing lives at the package root, not `./utf` — see
[Hashing is not a utility](#hashing-is-not-a-utility). `crc32.ts` and `id32.ts`, the raw
table-driven functions each wraps, are internal.

## Utilities

`./utility` is what every binary reader here is built on. Nothing is Freelancer-specific except
where noted.

- **`BufferView`** — stateful `DataView` subclass with an internal cursor, little-endian by default.
  The `littleEndian` constructor parameter is what lets THN read big-endian without a second
  implementation.
- **`encoding`** — windows-1252 both ways. Required for `initialworld.ini`'s U+00A0 padding; also
  the encoding hashing uses.
- **`Dictionary`** — accumulates entry names for the UTF names block during serialization.
- **`number`** — C `atoi`/`atof`, shortest-round-trip float32 formatting, and the token classifier
  [INI.md](INI.md#how-the-game-reads-a-value) reproduces the BINI compiler's behaviour from.
- **`string`** — `fold`/`equals` (ASCII only, matching `stricmp`), `trim` including U+00A0, hex
  helpers.
- **`tree`** — generic `Tree<T>` walks, shared by anything shaped `{ children: T[] }`.
- **`timestamp`** — `Date` ↔ DOS timestamps and Windows 64-bit FILETIMEs.
- **`hierarchy`** — generic `assemble`/`flatten`, rebuilding a tree from a flat parent/child table.
- **`chunkview`** — chunked-binary cursor, used by [SURFACE.md](SURFACE.md).

## Notes

### Region order

Nothing in the format orders the regions, and retail authored both arrangements: models write
tree-then-dictionary, the `DATA/AUDIO` voice banks write dictionary-then-tree and over-allocate it.
See [AUDIO.md](../refs/AUDIO.md#corpus).

### The NUL separates strings and is not required after the last one

`readStrings` ends a run at the end of the payload as readily as at a terminator. Exporters exist
that size the payload to the text exactly and the game reads those, so a reader that insists on a
terminator rejects working models. The container gives no help: `dataSizeAllocated` equals
`dataSizeUsed` in every such payload measured. `writeStrings` always emits the terminator, so a
rewrite normalizes the payload and grows it by a byte.

### Hashing is not a utility

The CRC table comes from `dacom.dll`, the byte swap is the game's convention, and case-folding is
the game's behaviour — all three are domain knowledge, which is why hashing does not live in
`utility/`. It is documented here because UTF path lookups are its first consumer.

## API

### `.`

The hash functions. `getResourceId` is UTF-side (mesh names, material names, Alchemy nodes),
`getObjectId` is INI-side (archetypes, system objects).

| Export            | Kind     |                                                                                       |
| ----------------- | -------- | ------------------------------------------------------------------------------------- |
| `filterObjects`   | function | `<T>(items, predicate, value, caseSensitive?): T[]`                                   |
| `filterResources` | function | `<T>(items, predicate, value, caseSensitive?): T[]`                                   |
| `getObject`       | function | Finds object matching key value.                                                      |
| `getObjectId`     | function | Gets object id (archetypes, system objects, etc).                                     |
| `getResource`     | function | Finds resource matching key value.                                                    |
| `getResourceId`   | function | Gets asset/resource id (model parts, material and texture references, alchemy nodes). |
| `Hash`            | type     | A resolved 32-bit id.                                                                 |
| `Hashable`        | type     | What a lookup accepts: a name, an id, or bytes.                                       |
| `Hasher`          | type     | `(item: T) => Hashable` — how a lookup gets a key out of an item.                     |
| `setObject`       | function | Sets object in array (replaces existing object matching key).                         |
| `setResource`     | function | Sets resource in array (replaces existing resource matching key).                     |
| `toBytes`         | function | Converts hashables into bytes, encoding a string as windows-1252.                     |

### `./utility`

| Export             | Kind      |                                                                                         |
| ------------------ | --------- | --------------------------------------------------------------------------------------- |
| `assemble`         | function  | Builds a hierarchy from a flat array, pairing each record to its parent by id.          |
| `atof`             | function  | C `atof`: leading whitespace, then as much of a decimal or exponential float as parses. |
| `atoi`             | function  | C `atoi`: leading whitespace, an optional sign, then digits until the first non-digit.  |
| `BufferView`       | class     | `DataView` with an internal cursor, for reading and writing in sequence.                |
| `ChunkView`        | class     | Cursor over a chunked binary, as `.sur` is. Not a UTF tree and not a `BufferView`.      |
| `classify`         | function  | Classifies a text token the way the BINI compiler did.                                  |
| `encoding`         | namespace | windows-1252 `decode` / `encode` / `byteLengthOf`.                                      |
| `equals`           | function  | Compares two names the way the game compares them.                                      |
| `findTreeElement`  | function  | `<T extends Tree<T>>(root, predicate): T \| undefined`                                  |
| `flatten`          | function  | Walks a hierarchy back into a flat array, the inverse of `assemble`.                    |
| `fold`             | function  | Case-folds ASCII only, which is what `stricmp` does, and so every name lookup.          |
| `formatFloat32`    | function  | Shortest decimal text that reads back as exactly the same `float32`.                    |
| `formatInt32`      | function  | Text that parses back as exactly the same `int32`.                                      |
| `fromDOSTimestamp` | function  | Convert DOS timestamp to `Date`.                                                        |
| `fromFileTime`     | function  | `(value: bigint): Date`                                                                 |
| `INT32_MAX`        | const     | Inclusive upper bound of a BINI integer value.                                          |
| `INT32_MIN`        | const     | Inclusive lower bound of the same.                                                      |
| `isHex`            | function  | `(value: string): boolean`                                                              |
| `isInt32`          | function  | `(value: number): boolean`                                                              |
| `listTreeElements` | function  | `<T extends Tree<T>>(parent): Generator<T>`                                             |
| `listTreePairs`    | function  | `<T extends Tree<T>>(parent): Generator<Parenthesis<T>>`                                |
| `Parenthesis`      | interface | A parent-child pair representing a link in a hierarchy.                                 |
| `parseHex`         | function  | `(value: string): number`                                                               |
| `path`             | namespace | UTF path helpers: `split`, `join`, `resolve`, `directoryOf`, `nameOf`, `equals`.        |
| `reduceTree`       | function  | `<T extends Tree<T>, R>(root, reducer, initial): R`                                     |
| `toDOSTimestamp`   | function  | Convert `Date` to DOS timestamp.                                                        |
| `toFileTime`       | function  | `(date: Date): bigint`                                                                  |
| `toHex`            | function  | `(value, byteLength?, prefix?): string`                                                 |
| `Tree`             | interface | Tree node recursively containing child nodes.                                           |
| `trim`             | function  | `(value: string): string`                                                               |

`BufferView` statics: `allocate(length)`, `concat(views)`, `join(...views)`, `from(string)`.
Instance: cursor state — `offset`, `byteRemain`, `bytes`, `littleEndian`, `rewind()`, `slice()`,
`subarray()`, `findTerminator(offset)` — on top of the whole `DataView` surface, plus paired cursor
accessors (`readUint8`/`writeUint8`, `readInt8`, `readUint16`, `readInt16`, `readUint32`,
`readInt32`, `readBigUint64`, `readBigInt64`, `readFloat32`, `readFloat64`), `readBuffer`/
`writeBuffer`, `getBuffer`/`setBuffer`, `readString`/`writeString`, `getString`/`setString`,
`readStringZ`/`writeStringZ`, `readHex`/`writeHex`.

### `./utf`

| Export      | Kind      |                              |
| ----------- | --------- | ---------------------------- |
| `Directory` | class     | UTF structure directory.     |
| `Entry`     | interface | UTF entry structure.         |
| `File`      | class     | File entry in UTF structure. |
| `Header`    | interface | UTF header structure.        |

**`Directory` statics**

| Member                | Description                                                 |
| --------------------- | ----------------------------------------------------------- |
| `read(bytes)`         | Parses a tree from a `Uint8Array`, BFS from the root entry. |
| `SIGNATURE`           | Header magic (`UTF `, `0x20465455`).                        |
| `VERSION`             | Only valid header version (`0x101`).                        |
| `FILE`                | File attribute bit (`0x80`).                                |
| `DIRECTORY`           | Directory attribute bit (`0x10`).                           |
| `ENTRY_BYTE_LENGTH`   | Byte length of one tree entry (44, `0x2c`).                 |
| `VERSION_BYTE_LENGTH` | Byte length of the version block (`0x8`).                   |
| `HEADER_BYTE_LENGTH`  | Byte length of the header field block (`0x30`).             |

**`Directory` instance**

| Member                  | Description                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| `name`                  | Directory name.                                                                                 |
| `children`              | Directories and files directly under this one.                                                  |
| `directories`           | `children` filtered to subdirectories.                                                          |
| `files`                 | `children` filtered to files.                                                                   |
| `getDirectory(...path)` | Gets the existing directory at path, or `undefined`.                                            |
| `setDirectory(...path)` | Gets the existing directory at path, inserting any missing directories.                         |
| `getFile(...path)`      | Gets the existing file at path, or `undefined`.                                                 |
| `setFile(...path)`      | Gets the existing file at path, inserting it (and any missing directories) empty.               |
| `delete(...path)`       | Deletes the entry at path.                                                                      |
| `append(...values)`     | Appends directories and files, replacing existing entries with matching names.                  |
| `write()`               | Serializes the tree to a `Uint8Array`, rebuilding the dictionary and stamping fresh timestamps. |

Path lookups (`getDirectory`, `setDirectory`, `getFile`, `setFile`, `delete`) compare names by
`getResourceId`, never by string, so they are case-insensitive.

**`File` instance**

| Member                     | Description                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------- |
| `name`                     | File name.                                                                                        |
| `data`                     | Backing payload (`ArrayBufferView`).                                                              |
| `buffer`                   | Underlying `ArrayBuffer`, shared with the tree the file was read from.                            |
| `byteOffset`               | Where the payload starts in `buffer`.                                                             |
| `byteLength`               | Payload size in bytes.                                                                            |
| `readIntegers()`           | Reads the payload as 32-bit signed integers; a non-multiple-of-4 tail reads as 16-bit then 8-bit. |
| `writeIntegers(...values)` | Appends values as 32-bit signed integers.                                                         |
| `readFloats()`             | Reads the payload as 32-bit floats.                                                               |
| `writeFloats(...values)`   | Appends values as 32-bit floats.                                                                  |
| `readStrings()`            | Reads NUL-terminated strings until the payload ends.                                              |
| `writeStrings(...values)`  | Appends values as NUL-terminated strings.                                                         |
| `append(...chunks)`        | Appends buffer views to `data`.                                                                   |

## Corpus

| | Count |
| --- | --- |
| `Object name`/`File name` payloads carrying a trailing NUL | 30,252 of 30,252 |
