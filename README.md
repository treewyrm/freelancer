# @treewyrm/utf2json

TypeScript library for reading and writing UTF (Universal Tree Format) files — a bespoke binary container format used by the Freelancer PC game (2003).

See [docs/UTF.md](docs/UTF.md) for the binary format specification and API reference.

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

## Development

```sh
npm run build   # compile TypeScript → dist/
npm test        # build + run Node test runner
```

## License

MIT
