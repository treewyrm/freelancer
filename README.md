# @treewyrm/utf2json

TypeScript library for reading and writing UTF (Universal Tree Format) files — a bespoke binary container format used by the Freelancer PC game (2003).

See [docs/UTF.md](docs/UTF.md) for the binary format specification and API reference.

## Modules

The package ships several entry points:

| Import                          | Contents                                                                    | Documentation                |
| ------------------------------- | ----------------------------------------------------------------------------- | ---------------------------- |
| `@treewyrm/utf2json`            | `Directory`, `File`, hash helpers                                           | [UTF.md](docs/UTF.md)        |
| `@treewyrm/utf2json/utility`    | `BufferView`, tree hierarchy, timestamp and string helpers                  | [UTF.md](docs/UTF.md)        |
| `@treewyrm/utf2json/math`       | `Vector3`, `Vector4`, `Quat`, `Matrix3`, `Transform`, scalar and keyframe helpers | —                       |
| `@treewyrm/utf2json/vmesh`      | VMesh geometry parts and mesh library                                       | [VMESH.md](docs/VMESH.md)    |
| `@treewyrm/utf2json/compound`   | The `Cmpnd` hierarchy shared by rigid and deformable models: parts, constraints, joints, hardpoints | [COMPOUND.md](docs/COMPOUND.md) |
| `@treewyrm/utf2json/rigid`      | Rigid `.3db`/`.cmp`/`.sph` models: parts, cameras, spheres, material animation | [RIGID.md](docs/RIGID.md)  |
| `@treewyrm/utf2json/animation`  | Keyframe animation scripts, shared by `.cmp` and `.anm`                     | [ANIMATION.md](docs/ANIMATION.md) |
| `@treewyrm/utf2json/deformable` | Deformable `.dfm` character models: bones, skinned meshes, detail levels     | [DEFORMABLE.md](docs/DEFORMABLE.md) |
| `@treewyrm/utf2json/surface`    | `.sur` collision surfaces: parts, hulls, bounding volume hierarchy          | [SURFACE.md](docs/SURFACE.md) |
| `@treewyrm/utf2json/texture`    | `Texture library` entries: DDS surfaces, Targa mip chains, animations       | [TEXTURE.md](docs/TEXTURE.md) |
| `@treewyrm/utf2json/material`   | `Material library` entries: shader type, colours, texture slots             | [MATERIAL.md](docs/MATERIAL.md) |
| `@treewyrm/utf2json/alchemy`    | Alchemy particle effects: node library and effect library                   | [ALCHEMY.md](docs/ALCHEMY.md) |

Freelancer's voice banks under `DATA/AUDIO` need no module of their own — they are flat UTF
directories of RIFF waveforms, handled with `Directory` and `File` directly. See
[AUDIO.md](docs/AUDIO.md) for how a line is named and how to read and write one.

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

### Reading a model

```ts
import { Directory } from '@treewyrm/utf2json'
import { readRigidModel } from '@treewyrm/utf2json/rigid'

const model = readRigidModel(Directory.read(readFileSync('ships/li_fighter.cmp')))
```

### Reading a character model

```ts
import { Directory } from '@treewyrm/utf2json'
import { getBoneModel, readDeformableModel } from '@treewyrm/utf2json/deformable'

const model = readDeformableModel(Directory.read(readFileSync('characters/bodies/br_darcy_body.dfm')))
const skeleton = getBoneModel(model) // the bone hierarchy, as a Model<Bone> tree
```

### Reading a collision surface

`.sur` files are a standalone binary rather than a UTF tree:

```ts
import { BufferView } from '@treewyrm/utf2json/utility'
import { readSurfaceLibrary } from '@treewyrm/utf2json/surface'

const parts = readSurfaceLibrary(BufferView.from(readFileSync('ships/li_fighter.sur')))
```

## Development

```sh
npm run build   # compile TypeScript → dist/ via tsdown
npm test        # run the Node test runner over src/**/*.test.ts (via tsx, no build step)
```

## License

MIT
