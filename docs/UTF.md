# UTF (Universal Tree Format)

Binary container format used by Freelancer (2003) to store a hierarchical tree of named directories and files inside a single binary blob.

## On-disk layout

A UTF file consists of a fixed header followed by three data regions:

| Region               | Description                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Header**           | Magic signature (`UTF `, version `0x101`), followed by offsets and sizes for the three data regions           |
| **Tree block**       | Fixed-size 44-byte entries describing the directory/file hierarchy; nodes are linked by sibling/child offsets |
| **Dictionary block** | NUL-terminated ASCII entry names, deduplicated by CRC32                                                       |
| **Data block**       | Raw file payloads                                                                                             |

## Header

The header is 56 bytes: an 8-byte version block followed by a 48-byte field block.

| Field                | Type   | Description                                                       |
| -------------------- | ------ | ----------------------------------------------------------------- |
| `signature`          | uint32 | Magic bytes `UTF ` (`0x20465455`); must match exactly             |
| `version`            | uint32 | Format version; only `0x101` is valid                             |
| `treeOffset`         | uint32 | Byte offset to the tree block                                     |
| `treeSize`           | uint32 | Byte size of the tree block                                       |
| `entryOffset`        | uint32 | Offset of the root entry within the tree block                    |
| `entrySize`          | uint32 | Byte size of one entry; must be 44 (`0x2c`)                       |
| `namesOffset`        | uint32 | Byte offset to the dictionary block                               |
| `namesSizeAllocated` | uint32 | Allocated byte size of the dictionary block                       |
| `namesSizeUsed`      | uint32 | Used byte size of the dictionary block (≤ `namesSizeAllocated`)   |
| `dataOffset`         | uint32 | Byte offset to the data block                                     |
| `unusedOffset`       | uint32 | Offset to extra data (unused)                                     |
| `unusedSize`         | uint32 | Size of extra data (unused)                                       |
| `filetime`           | uint64 | Windows 64-bit FILETIME (file creation time)                      |

## Tree entries

Each tree entry is 44 bytes and encodes one node (directory or file):

| Field                  | Type   | Description                                                             |
| ---------------------- | ------ | ----------------------------------------------------------------------- |
| `nextOffset`           | uint32 | Offset to next sibling entry relative to tree block                     |
| `nameOffset`           | uint32 | Offset to entry name in dictionary block                                |
| `fileAttributes`       | uint32 | Win32 `dwFileAttributes`; `0x10` = directory, `0x80` = file with data  |
| `sharingAttributes`    | uint32 | Unused filesystem sharing bitmask                                       |
| `childOffset`          | uint32 | First child (directories) or data offset (files) relative to block base |
| `dataSizeAllocated`    | uint32 | Allocated byte length in data block                                     |
| `dataSizeUsed`         | uint32 | Actual byte length of file payload                                      |
| `dataSizeUncompressed` | uint32 | Uncompressed size; typically equal to `dataSizeUsed`                   |
| `createTime`           | uint32 | DOS creation timestamp                                                  |
| `accessTime`           | uint32 | DOS last-access timestamp                                               |
| `modifyTime`           | uint32 | DOS last-modification timestamp                                         |

## Parsing

`Directory.read(view)` parses the binary using a BFS queue starting from the root tree entry. `Directory.write()` re-serializes the in-memory tree back to binary. Both operate on `BufferView`, an internal stateful `DataView` subclass with sequential read/write methods and little-endian default.

Path lookups (`getDirectory`, `getFile`) compare entry names via `getResourceId` (Freelancer CRC32) for case-insensitive matching.

## API

### `Directory`

| Member                  | Description                                                       |
| ----------------------- | ----------------------------------------------------------------- |
| `static read(input)`    | Parses a UTF binary from a `Uint8Array`; returns root `Directory` |
| `write()`               | Serializes the tree to a `Uint8Array`                             |
| `getDirectory(...path)` | Finds a nested directory by path segments                         |
| `setDirectory(...path)` | Finds or creates a nested directory                               |
| `getFile(...path)`      | Finds a file by path (last segment is filename)                   |
| `setFile(...path)`      | Finds or creates a file                                           |
| `delete(...path)`       | Removes all entries matching the path                             |
| `append(...entries)`    | Inserts or replaces children by name                              |
| `directories`           | Filtered list of child `Directory` instances                      |
| `files`                 | Filtered list of child `File` instances                           |

### `File`

| Member                     | Description                                                            |
| -------------------------- | ---------------------------------------------------------------------- |
| `readIntegers()`           | Iterator of signed integers (32/16/8-bit depending on remaining bytes) |
| `writeIntegers(...values)` | Appends values as 32-bit signed integers                               |
| `readFloats()`             | Iterator of 32-bit floats                                              |
| `writeFloats(...values)`   | Appends values as 32-bit floats                                        |
| `readStrings()`            | Iterator of NUL-terminated strings                                     |
| `writeStrings(...values)`  | Appends NUL-separated strings                                          |
| `append(...views)`         | Appends raw `ArrayBufferView` data                                     |

## Hashing (`@treewyrm/utf2json`)

Hash helpers are exported from the package root alongside `Directory` and `File`.

```ts
import {
  getResourceId,
  getObjectId,
  getResource,
  getObject,
  filterResources,
  filterObjects,
} from '@treewyrm/utf2json'
```

| Export                                     | Description                                       |
| ------------------------------------------ | ------------------------------------------------- |
| `getResourceId(value, caseSensitive?)`     | CRC32 hash (materials, mesh names, UTF resources) |
| `getObjectId(value, caseSensitive?)`       | id32 hash (object nicknames, INI references)      |
| `getResource(items, predicate, value)`     | Finds array entry by CRC32 key                    |
| `getObject(items, predicate, value)`       | Finds array entry by id32 key                     |
| `filterResources(items, predicate, value)` | Generator — yields all entries matching a CRC32 key |
| `filterObjects(items, predicate, value)`   | Generator — yields all entries matching an id32 key  |

`Hashable` (`number | string | ArrayBufferView | ArrayBufferLike`), `Hasher<T>`, and `Hash` are the supporting types in `hash.ts`.

### Hash functions

Two hash algorithms match Freelancer's internal conventions:

- **`getResourceId`** — Freelancer CRC32 (table extracted from `dacom.dll`). Used for material names, mesh library names, and most UTF resource references.
- **`getObjectId`** — A byte-swapped CRC32 variant (`id32`). Used for object/archetype nicknames typically found in INI files.

Both accept `number | string | ArrayBufferView | ArrayBufferLike` and default to case-insensitive matching.

## Utilities (`@treewyrm/utf2json/utility`)

```ts
import {
  BufferView,
  type Compound,
  listCompoundElements,
  toDOSTimestamp,
  fromDOSTimestamp,
  toFileTime,
  fromFileTime,
  toHex,
  isHex,
  parseHex,
} from '@treewyrm/utf2json/utility'
```

### `BufferView`

A stateful `DataView` subclass with an internal offset pointer, little-endian by default. Every binary reader and writer in the package operates on it.

| Member                                | Description                                                     |
| ------------------------------------- | ----------------------------------------------------------------- |
| `static allocate(length)`             | Creates a view over a new zeroed buffer                          |
| `static join(...views)`               | Concatenates views into a single new view                        |
| `static from(view \| string)`         | Wraps an existing `ArrayBufferView`, or encodes a string         |
| `offset` / `rewind()` / `byteRemain`  | Cursor position, reset to zero, bytes left                       |
| `slice(begin?, end?)` / `subarray(start?, end?)` | Copying / non-copying sub-views                       |
| `read*` / `write*`                    | Sequential accessors (`readUint32`, `writeFloat32`, …) that advance the cursor |
| `get*` / `set*`                       | Absolute accessors at an explicit offset                         |
| `readString(length)` / `writeString(value)` | Fixed-length string                                        |
| `readStringZ()` / `writeStringZ(value)` | NUL-terminated string                                          |
| `readHex(length)` / `writeHex(value)` | Hex-string form of raw bytes                                     |
| `readBuffer(target)` / `writeBuffer(source)` | Raw block copy                                             |

Write methods chain.

### Compound hierarchies

`Compound<T>` (`{ children: T[] }`) is the shape shared by tree-structured records such as `Model` in the [model](MODEL.md) module.

| Export                                    | Description                                              |
| ----------------------------------------- | ---------------------------------------------------------- |
| `listCompoundElements(parent)`            | Generator — depth-first walk including `parent` itself    |
| `listCompoundPairs(parent)`               | Generator — yields `{ parent, child }` links              |
| `findCompoundElement(root, predicate)`    | First element matching a predicate                        |
| `reduceCompount(root, reducer, initial)`  | Folds the tree, passing `(accumulator, child, parent)`    |
| `Parenthesis<T>`                          | The `{ parent, child }` pair type                         |

### Timestamps and strings

| Export                               | Description                                 |
| ------------------------------------ | --------------------------------------------- |
| `toDOSTimestamp(date)`               | `Date` → 32-bit DOS timestamp                |
| `fromDOSTimestamp(value)`            | 32-bit DOS timestamp → `Date`                |
| `toFileTime(date)`                   | `Date` → Windows 64-bit FILETIME (`bigint`)  |
| `fromFileTime(value)`                | Windows FILETIME → `Date`                    |
| `toHex(value, byteLength?, prefix?)` | Number to hex string                         |
| `isHex(value)`                       | Tests for `0x…` hex string                   |
| `parseHex(value)`                    | Parses `0x…` hex string                      |
