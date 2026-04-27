# @treewyrm/utf2json

TypeScript library for reading and writing UTF (Universal Tree Format) files — a bespoke binary container format used by the Freelancer PC game (2003).

See [docs/UTF.md](docs/UTF.md) for the binary format specification.

## Installation

```sh
npm install @treewyrm/utf2json
```

Requires Node.js >= 18.

## Usage

### Reading a UTF file

```ts
import { Directory } from '@treewyrm/utf2json'
import { readFileSync } from 'node:fs'

const bytes = readFileSync('ship.3db')
const root = Directory.read(bytes)

// Navigate the tree
const vmeshDir = root.getDirectory('MultiLevel', 'Level0', 'VMeshPart')
const meshFile = root.getFile('MultiLevel', 'Level0', 'VMeshPart', 'VMeshData')
```

### Writing a UTF file

```ts
import { Directory, File } from '@treewyrm/utf2json'

const root = new Directory()

// Create nested directory and file
const file = root.setFile('Cmpnd', 'Root', 'Transform')
file.writeFloats(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)

// Serialize to binary
const output = root.write()
```

### Working with files

`File` implements `ArrayBufferView` and provides typed read/write helpers:

```ts
const f = new File('data')

// Write
f.writeIntegers(1, 2, 3)
f.writeFloats(1.0, 2.0, 3.0)
f.writeStrings('alpha', 'beta') // NUL-separated

// Read (iterators)
for (const n of f.readIntegers()) console.log(n)
for (const x of f.readFloats()) console.log(x)
for (const s of f.readStrings()) console.log(s)

// Chain writes
f.writeFloats(0.5, 1.5).writeIntegers(42)

// Append raw data
f.append(someUint8Array)
```

### Directory traversal

```ts
// Get (returns undefined if missing)
const dir = root.getDirectory('A', 'B', 'C')
const file = root.getFile('A', 'B', 'C', 'data')

// Get or create
const dir2 = root.setDirectory('A', 'B', 'C')
const file2 = root.setFile('A', 'B', 'C', 'data')

// Delete
root.delete('A', 'B', 'C')

// Replace/append children (replaces existing by name)
root.append(new Directory('NewDir'), new File('newfile'))

// Filtered children
const subdirs = root.directories // Directory[]
const files = root.files // File[]
```

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

## Utilities export (`@treewyrm/utf/utils`)

```ts
import {
  toDOSTimestamp,
  fromDOSTimestamp,
  toFileTime,
  fromFileTime,
  toHex,
  isHex,
  parseHex,
  getResourceId,
  getObjectId,
  getResource,
  getObject,
  type Hash,
} from '@treewyrm/utf2json/utils'
```

| Export                                 | Description                                       |
| -------------------------------------- | ------------------------------------------------- |
| `toDOSTimestamp(date)`                 | `Date` → 32-bit DOS timestamp                     |
| `fromDOSTimestamp(value)`              | 32-bit DOS timestamp → `Date`                     |
| `toFileTime(date)`                     | `Date` → Windows 64-bit FILETIME (`bigint`)       |
| `fromFileTime(value)`                  | Windows FILETIME → `Date`                         |
| `toHex(value, byteLength?, prefix?)`   | Number to hex string                              |
| `isHex(value)`                         | Tests for `0x…` hex string                        |
| `parseHex(value)`                      | Parses `0x…` hex string                           |
| `getResourceId(value, caseSensitive?)` | CRC32 hash (materials, mesh names, UTF resources) |
| `getObjectId(value, caseSensitive?)`   | id32 hash (object nicknames, INI references)      |
| `getResource(items, predicate, value)` | Finds array entry by CRC32 key                    |
| `getObject(items, predicate, value)`   | Finds array entry by id32 key                     |

### Hash functions

Two hash algorithms match Freelancer's internal conventions:

- **`getResourceId`** — Freelancer CRC32 (table extracted from `dacom.dll`). Used for material names, mesh library names, and most UTF resource references.
- **`getObjectId`** — A byte-swapped CRC32 variant (`id32`). Used for object/archetype nicknames typically found in INI files.

Both accept `number | string | ArrayBufferView | ArrayBufferLike` and default to case-insensitive matching.

## Development

```sh
npm run build   # compile TypeScript → dist/
npm test        # build + run Node test runner
```

## License

MIT
