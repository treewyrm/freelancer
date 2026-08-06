# @treewyrm/freelancer

TypeScript library for the data formats of **Freelancer** (Digital Anvil, 2003) — the binary UTF
containers its assets ship in, the INI and BINI files that describe how they are used, the Lua 3.2
scene scripts, and the resource DLLs every name and infocard resolves into.

Isomorphic: it reads and writes bytes and never touches a filesystem or a network. Supplying the
bytes is the consumer's job, which is what lets the same code run in Node, in a browser against the
File System Access API, or in a worker.

Not affiliated with or endorsed by Digital Anvil or Microsoft. "Freelancer" is used to name the game
whose formats these are.

## Three layers

Every format here is read in the same three steps, and each step is usable on its own.

```
   bytes on disk   ◀──▶   interim model   ◀──▶   meaning
   (BufferView)          (classes: identity      (plain data: what the
                          and mutation)           game does with it)
```

- **Binary** — a cursor over bytes. No choices made.
- **Interim** — the document as the file spells it. `Directory` and `File` for UTF, `Section` /
  `Property` / `Value` for INI, `Value` / `Global` for THN, `Resource[]` for a DLL. These are
  classes and records, they are public, and an editor builds one by hand and writes out bytes the
  game reads. Their methods are structural: they know how a tree is shaped, never what a payload
  means.
- **Meaning** — typed structures that interpret the choices the game already made. A rigid model, a
  material, a texture, a scene. Plain data with no methods and no identity.

The library models what the game's data means. It does not decide what an application should do with
it: resolution order, defaults, caches and output conventions belong to the consumer.

## Entry points

| Import                             | Contents                                                                            | Documentation                       |
| ---------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------- |
| `@treewyrm/freelancer`             | `getResourceId`, `getObjectId`, and the lookups built on them                       | [UTF.md](docs/UTF.md#hashing)       |
| `@treewyrm/freelancer/utf`         | `Directory`, `File` — the UTF container                                             | [UTF.md](docs/UTF.md)               |
| `@treewyrm/freelancer/utility`     | `BufferView`, windows-1252, tree, timestamp, number and name helpers                | [UTF.md](docs/UTF.md#utilities)     |
| `@treewyrm/freelancer/math`        | `Vector3`, `Vector4`, `Quat`, `Matrix3`, `Transform`, scalar and keyframe helpers   | —                                   |
| `@treewyrm/freelancer/vmesh`       | VMesh geometry parts and mesh library                                               | [VMESH.md](docs/VMESH.md)           |
| `@treewyrm/freelancer/compound`    | The `Cmpnd` hierarchy shared by rigid and deformable models                         | [COMPOUND.md](docs/COMPOUND.md)     |
| `@treewyrm/freelancer/rigid`       | `.3db` / `.cmp` / `.sph` models: parts, cameras, spheres, material animation        | [RIGID.md](docs/RIGID.md)           |
| `@treewyrm/freelancer/animation`   | Keyframe animation scripts, shared by `.cmp` and `.anm`                             | [ANIMATION.md](docs/ANIMATION.md)   |
| `@treewyrm/freelancer/deformable`  | `.dfm` character models: bones, skinned meshes, detail levels                       | [DEFORMABLE.md](docs/DEFORMABLE.md) |
| `@treewyrm/freelancer/surface`     | `.sur` collision surfaces: parts, hulls, bounding volume hierarchy                  | [SURFACE.md](docs/SURFACE.md)       |
| `@treewyrm/freelancer/texture`     | `Texture library` entries: DDS surfaces, Targa mip chains, animations, cubemaps     | [TEXTURE.md](docs/TEXTURE.md)       |
| `@treewyrm/freelancer/material`    | `Material library` entries: shader type, colours, texture slots                     | [MATERIAL.md](docs/MATERIAL.md)     |
| `@treewyrm/freelancer/alchemy`     | Alchemy particle effects: node library and effect library                           | [ALCHEMY.md](docs/ALCHEMY.md)       |
| `@treewyrm/freelancer/ini`         | `Document`, `Section`, `Property`, `Value`, coercion, lookups, `read` / `write`     | [INI.md](docs/INI.md)               |
| `@treewyrm/freelancer/ini/text`    | Text INI parser and serializer                                                      | [INI.md](docs/INI.md)               |
| `@treewyrm/freelancer/ini/binary`  | BINI reader and writer                                                              | [INI.md](docs/INI.md)               |
| `@treewyrm/freelancer/ini/save`    | `.fl` saves: text under a positional XOR mask                                       | [INI.md](docs/INI.md)               |
| `@treewyrm/freelancer/thn`         | `Document`, `Global`, `Value`, value helpers, `read` / `write`                      | [THN.md](docs/THN.md)               |
| `@treewyrm/freelancer/thn/text`    | Lua source parser and serializer                                                    | [THN.md](docs/THN.md)               |
| `@treewyrm/freelancer/thn/bytecode`| Compiled Lua 3.2 reader, and the opcode table                                       | [THN.md](docs/THN.md)               |
| `@treewyrm/freelancer/thn/scene`   | Entities and events as typed records, and THORN's vocabulary                        | [THORN.md](docs/THORN.md)           |
| `@treewyrm/freelancer/resource`    | Resource DLLs: `read` / `write`, string tables, infocards, the `ids_*` id space     | [RESOURCE.md](docs/RESOURCE.md)     |
| `@treewyrm/freelancer/schema`      | Typed-layer machinery for INI: coercion, optionality, ordering, `readSection`       | —                                    |

Freelancer's voice banks under `DATA/AUDIO` need no module of their own — they are flat UTF
directories of RIFF waveforms, handled with `Directory` and `File` directly. See
[AUDIO.md](docs/AUDIO.md) for how a line is named and how to read and write one.

## Installation

```sh
npm install @treewyrm/freelancer
```

Requires Node.js >= 18.

## Naming is the root export

Freelancer identifies almost everything by a hash of its name, and there are **two** hashes. Picking
the wrong one yields a number rather than an error, which is why they sit together at the root and
nowhere else.

```ts
import { getResourceId, getObjectId } from '@treewyrm/freelancer'

getResourceId('data.solar.starsphere.starsphere_rh05_stars.lod0-102.vms') // UTF resources
getObjectId('li_elite') // INI nicknames
```

Both fold case by default, because the game compares names with `stricmp`. Alchemy is the one place
that does not.

## Reading assets

### UTF containers

```ts
import { Directory, File } from '@treewyrm/freelancer/utf'
import { readFileSync } from 'node:fs'

const root = Directory.read(readFileSync('ship.3db'))

root.getDirectory('MultiLevel', 'Level0', 'VMeshPart')
root.getFile('MultiLevel', 'Level0', 'VMeshPart', 'VMeshData')
```

Building one by hand and writing it out is the same object graph in reverse:

```ts
const root = new Directory()

root.setFile('Cmpnd', 'Root', 'Transform').writeFloats(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)

const bytes = root.write()
```

`File` implements `ArrayBufferView` and carries typed iterators — `readIntegers` / `writeIntegers`,
`readFloats` / `writeFloats`, `readStrings` / `writeStrings` — with the write side chaining.

### Models, characters, collision

```ts
import { Directory } from '@treewyrm/freelancer/utf'
import { readRigidModel } from '@treewyrm/freelancer/rigid'
import { getBoneModel, readDeformableModel } from '@treewyrm/freelancer/deformable'

const ship = readRigidModel(Directory.read(readFileSync('ships/li_fighter.cmp')))

const body = readDeformableModel(Directory.read(readFileSync('characters/bodies/br_darcy_body.dfm')))
const skeleton = getBoneModel(body) // the bone hierarchy, as a Model<Bone> tree
```

`.sur` collision files are a standalone chunked binary rather than a UTF tree, so they take a
`BufferView`:

```ts
import { BufferView } from '@treewyrm/freelancer/utility'
import { readSurfaceLibrary } from '@treewyrm/freelancer/surface'

const parts = readSurfaceLibrary(BufferView.from(readFileSync('ships/li_fighter.sur')))
```

## Reading data

### INI, all three spellings

The signature decides which parser runs, never the extension or the location. Retail `DATA` holds
1,251 BINI files and one text file, all named `.ini`, `EXE/` holds three more text ones, and the two
`.fl` saves beside them are one masked and one plain.

```ts
import { findByNickname, getValue, read, value } from '@treewyrm/freelancer/ini'

const document = read(readFileSync('DATA/EQUIPMENT/goods.ini'))

const good = findByNickname(document, 'commodity_gold')!
const price = getValue(good, 'price')!

value.toFloat(price) // 100
value.toInteger(price) // 100
value.toText(price) // '100'
```

A value carries the type the file recorded, and you ask for the type you want — this is how the
engine works, and the coercions here follow it, truncation and odd corners included. Three worth
knowing, all of them the engine's: a string coerced to a boolean accepts only `true` and `false` by
name (so `yes` is **false**); a float coerced to an integer truncates toward zero; an unparseable
string yields `0` rather than failing, because that is what the game gets.

Writing emits any of the three encodings from the same document:

```ts
import { addProperty, addSection, value, write, type Document } from '@treewyrm/freelancer/ini'

const document: Document = []
const good = addSection(document, 'Good')

addProperty(good, 'nickname', [value.string('commodity_gold')])
addProperty(good, 'price', [value.integer(100)])
addProperty(good, 'separable') // a flag is a property with no values

writeFileSync('goods.ini', write(document, 'binary'))
writeFileSync('goods.txt', write(document, 'text'))
writeFileSync('goods.fl', write(document, 'save')) // FLS1, masked
```

The mask on a `.fl` is obfuscation and nothing more — the pad depends only on a byte's position, so
it is its own inverse and `save.mask` both reads and writes it. A document does not remember what it
was read from, so `'save'` has to be asked for; the default stays `binary`.

**Repeats are lists, not mistakes.** `[Loadout] equip` occurs 16,074 times across retail and 156
files repeat a section name, so every lookup comes in a singular and a plural form and the plural is
usually the honest one. Every lookup folds case and none of them string-compares, because six retail
section names and 32 property names are spelled more than one way — and nothing folds a name in
place, so what was read is what gets written back.

### Scene scripts

A `.thn` is a compiled Lua chunk but not a program: fifteen opcodes across all 1,506 retail scripts,
every one of them pushing a value or building a table, and no branch, call or function anywhere. So
it reads as data, and writes back as Lua source — which the engine loads just as happily, because it
loads scripts with `dofile` and Lua compiles text when the signature is absent.

```ts
import { read, value, write } from '@treewyrm/freelancer/thn'

const script = read(readFileSync('DATA/SCRIPTS/INTRO/intro_waterplanet.thn'))

const duration = value.getGlobal(script, 'duration')
if (duration && value.isNumber(duration)) value.toNumber(duration) // 361.872

writeFileSync('intro_waterplanet.thn', write(script)) // plain-text Lua, and the game runs it
```

**The one thing to get right is that a bare word is not a string.** `type = SCENE` is a read of a
global THORN defines, and writing `type = "SCENE"` hands the engine a string where it wants a
number. Identifiers are their own kind of value for exactly that reason.

`./thn/scene` is the layer above: entities and events as records, discriminated on `type` and
`action`, with THORN's vocabulary resolved. It reads **both** forms retail ships — 355 of the 1,506
scripts carry `type = 9` where the rest carry `type = SCENE` — and both come out the same.

```ts
import * as thn from '@treewyrm/freelancer/thn'
import * as scene from '@treewyrm/freelancer/thn/scene'

const script = scene.read(thn.read(readFileSync('DATA/SCRIPTS/INTRO/intro_waterplanet.thn')))

for (const entity of script.entities)
  if (entity.type === 'CAMERA') entity.cameraprops?.fovh // narrowed; a MARKER has no cameraprops

writeFileSync('out.thn', thn.write(scene.write(script)))
```

It **refuses what it has not measured** — an entity type, event action, enum value or flag bit
outside the vocabulary is an error naming the value, because every alternative is a guess and all
41,250 retail entities resolve without one. And it **keeps what it does not recognise**, in
`unknown`, so a modded script survives a read-modify-write.

### Names and infocards

An `ids_name` or `ids_info` is a number into a set of DLLs, `resources.dll` first and then whatever
`freelancer.ini`'s `[Resources]` block lists. Give `readLibrary` those files in that order:

```ts
import * as resource from '@treewyrm/freelancer/resource'

const library = resource.readLibrary(
  resource.RETAIL_LIBRARIES.map((name) => resource.read(readFileSync(`EXE/${name}`))),
)

library.names.get(196609) // 'New York'
library.infocards.get(65539) // '<?xml version="1.0" encoding="UTF-16"?>…'
```

Writing produces a real DLL — these images carry no code, so there is nothing to link:

```ts
const dll = resource.write([
  ...resource.writeStrings(new Map([[0, 'Nomad Battleship']])),
  ...resource.writeInfocards(new Map([[3, '<RDL><PUSH/><TEXT>…</TEXT><POP/></RDL>']])),
])
```

## Round-trip

Writing is a **fixed point everywhere** — what is written reads back identical and writes again to
the same bytes. Byte-exactness holds where the format permits it:

| Direction                           | Guarantee                                            |
| ----------------------------------- | ---------------------------------------------------- |
| BINI → model → BINI                 | **Byte-exact**, verified over all 1,251 retail files |
| BINI → model → text → model → BINI  | **Byte-exact**, same corpus                          |
| Save body → unmasked → save body    | **Byte-exact**; the mask is its own inverse          |
| THN bytecode → model → text → model | **Exact**, verified over all 1,506 retail scripts    |
| DLL → resources → DLL               | **Exact**, verified over all 37 DLLs in retail `EXE` |
| resources → `.rsrc`                 | **Byte-identical to retail**, 5 libraries of 7       |
| Material library                    | **Byte-exact**, all 7,525 materials                  |
| Deformable models                   | **Byte-exact**, all 204                              |
| Alchemy effects                     | **Byte-exact**, 596 files bar two encoding residues  |
| Texture library                     | 4,447 DDS surfaces, both cubemaps, 629 Targa chains  |

The full table, including what cannot round-trip and why, is in [RETAIL.md](docs/RETAIL.md).

## Testing

```sh
npm test
```

The corpus suites read a retail install from `$FREELANCER_DATA`, falling back to
`~/Downloads/Freelancer/DATA`, and skip themselves with a reason when neither exists. Every count
they assert was measured before the code existed, so a failure means a reader drifted rather than
that the number needs updating. **The rest of the suite never depends on retail data being present.**

## Documentation

Each module has a document carrying its binary layout, the retail measurements behind it, and the
decisions not worth re-litigating.

| Document                             | Subject                                                                      |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| [API.md](docs/API.md)                | Every export of every subpath, and what no barrel re-exports                 |
| [UTF.md](docs/UTF.md)                | The container, `Directory` / `File`, hashing, the utilities                  |
| [VMESH.md](docs/VMESH.md)            | Mesh parts, the `VMeshWire` overlay, the mesh library, LOD levels            |
| [COMPOUND.md](docs/COMPOUND.md)      | The `Cmpnd` hierarchy, constraints, joints, hardpoints                       |
| [RIGID.md](docs/RIGID.md)            | `.3db` / `.cmp` / `.sph`, cameras, spheres, material animation               |
| [ANIMATION.md](docs/ANIMATION.md)    | Keyframe scripts, channel types, the quantized quaternion decode             |
| [SURFACE.md](docs/SURFACE.md)        | `.sur` collision files, and their Ipion Virtual Physics lineage              |
| [TEXTURE.md](docs/TEXTURE.md)        | The four forms a texture entry takes, and cubemaps                           |
| [MATERIAL.md](docs/MATERIAL.md)      | Shader types, colours, texture slots, and why every property is optional     |
| [DEFORMABLE.md](docs/DEFORMABLE.md)  | `.dfm` characters: the bone table, skinned meshes, detail levels             |
| [ALCHEMY.md](docs/ALCHEMY.md)        | `.ale` particle effects, the node library, the case-sensitive hash           |
| [INI.md](docs/INI.md)                | All three encodings, the shared document model, how the game reads a value   |
| [THN.md](docs/THN.md)                | The scene script format, its value domain, and why it is not INI             |
| [THORN.md](docs/THORN.md)            | The scene vocabulary: entities, events, properties, and where each came from |
| [RESOURCE.md](docs/RESOURCE.md)      | The resource DLLs: the PE container, string tables, infocards, the id space  |
| [AUDIO.md](docs/AUDIO.md)            | `DATA/AUDIO` voice banks, which need no module of their own                  |
| [RETAIL.md](docs/RETAIL.md)          | The corpus, the measurements, the quirks, the open questions                 |
| [RENDERER.md](docs/RENDERER.md)      | Mapping these structures onto a WebGL2 renderer                              |
| [PLAN.md](docs/PLAN.md)              | What this library is for, and the invariants it holds to                     |

## Development

```sh
npm run build   # compile TypeScript → dist/ via tsdown
npm test        # Node test runner over src/**/*.test.ts (via tsx, no build step)
```

## License

MIT
