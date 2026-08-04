# @treewyrm/ini2json

TypeScript library for three of Freelancer's data formats:

- **INI** — both the plain-text form and **BINI**, the compiled binary form that ships in retail
  `DATA`. Two spellings of one document model, so a reader that accepts either plus a writer that
  emits either is also a BINI compiler and decompiler.
- **THN** — the Lua 3.2 scene scripts that drive cutscenes and animated base views, which INI points
  at and nothing else does.
- **Resource DLLs** — where every `ids_name` and `ids_info` in the INI data resolves to text. They
  are Win32 PE images containing no code at all, so they are read and **written** here, not just
  parsed.

Companion to [`@treewyrm/utf2json`](../utf2json), which covers the UTF binary containers this data
points at.

See [docs/INI.md](docs/INI.md), [docs/THN.md](docs/THN.md) and
[docs/RESOURCE.md](docs/RESOURCE.md) for the formats, the measurements behind every decision here,
and how the game itself reads a value.

## Three layers, three times

On-disk bytes, an interim document model, and typed structures — each convertible to its neighbours
in both directions, and each usable on its own. The three formats share the shape and nothing else.

```
   INI text  ─┐                                                ┌─ Universe: systems, bases, zones
              ├─▶  Section / Property / Value  ◀──▶  typed  ◀──┼─ Equipment: guns, goods, market
   BINI bytes ─┘         (the interim model)                    └─ Ships, Solar, Missions, FX, …

   bytecode  ─┐
              ├─▶     Value / Global        ◀──▶  typed  ◀───── Entities and events
   Lua text  ─┘        (the interim model)

   DLL image ───▶      Resource[]            ◀──▶  typed  ◀───── Names and infocards, by global id
                    (the interim model)
```

**The encoding and interim layers are implemented for all three, and the typed layer for THN and for
resources.** INI's is designed and unwritten, in [docs/SCHEMA.md](docs/SCHEMA.md) and
[docs/MODULES.md](docs/MODULES.md). THN's encoding layer is deliberately asymmetric — compiled
scripts are read, and written back as Lua source, which the game loads just as happily. The resource
writer emits a whole DLL, which is possible only because those DLLs contain no code.

## Entry points

| Import                            | Contents                                                                       | Documentation                   |
| --------------------------------- | ------------------------------------------------------------------------------ | ------------------------------- |
| `@treewyrm/ini2json`              | `ini`, `thn` and `resource` as namespaces, for code that handles more than one | —                               |
| `@treewyrm/ini2json/ini`          | `Document`, `Section`, `Property`, `Value`, coercion, lookups, `read`/`write`  | [INI.md](docs/INI.md)           |
| `@treewyrm/ini2json/ini/text`     | Text INI parser and serializer                                                 | [INI.md](docs/INI.md)           |
| `@treewyrm/ini2json/ini/binary`   | BINI reader and writer                                                         | [INI.md](docs/INI.md)           |
| `@treewyrm/ini2json/resource`     | Resource DLLs: `read`/`write`, string tables, infocards, the `ids_*` id space  | [RESOURCE.md](docs/RESOURCE.md) |
| `@treewyrm/ini2json/thn`          | `Document`, `Global`, `Value`, value helpers, `read`/`write`                   | [THN.md](docs/THN.md)           |
| `@treewyrm/ini2json/thn/text`     | Lua source parser and serializer                                               | [THN.md](docs/THN.md)           |
| `@treewyrm/ini2json/thn/bytecode` | Compiled Lua 3.2 reader, and the opcode table                                  | [THN.md](docs/THN.md)           |
| `@treewyrm/ini2json/thn/scene`    | Entities and events as typed records, and THORN's vocabulary                   | [THORN.md](docs/THORN.md)       |
| `@treewyrm/ini2json/utility`      | `BufferView`, windows-1252, `getObjectId`, number and name helpers             | [INI.md](docs/INI.md)           |
| _planned_ `./schema`              | The typed-layer machinery: coercion, optionality, ordering                     | [SCHEMA.md](docs/SCHEMA.md)     |
| _planned_ domain modules          | Universe, equipment, ships, solar, missions, FX, audio, interface              | [MODULES.md](docs/MODULES.md)   |

`ini`, `thn` and `resource` are namespaces rather than a flat export because all three define `read`
and `write`, and those mean different things on each side.

## Installation

```sh
npm install @treewyrm/ini2json
```

Requires Node.js >= 18.

## Usage

### Reading a file

The signature decides which parser runs, never the extension or the location. Retail `DATA` holds
1,251 BINI files and one text file, all named `.ini`, and `EXE/` holds three more text ones.

```ts
import { read } from '@treewyrm/ini2json/ini'
import { readFileSync } from 'node:fs'

const document = read(readFileSync('DATA/EQUIPMENT/goods.ini'))

for (const section of document) console.log(section.name, section.properties.length)
```

### Reading values

A value carries the type the file recorded, and you ask for the type you want. This is how the
engine works — `INI_Reader` has no accessor that asks what type a value _is_ — and the coercions
here follow it, truncation and odd corners included.

```ts
import { findByNickname, getValue, value } from '@treewyrm/ini2json/ini'

const good = findByNickname(document, 'commodity_gold')!
const price = getValue(good, 'price')!

value.toFloat(price) // 100
value.toInteger(price) // 100
value.toText(price) // '100'
```

Three corners worth knowing, all of them the engine's:

- A string coerced to a boolean accepts only `true` and `false` by name, case-insensitively, and
  falls through to `atoi` otherwise — so `yes` is **false**.
- A float coerced to an integer truncates toward zero rather than rounding.
- An unparseable string yields `0` rather than failing, because that is what the game gets.

### Building and writing

```ts
import { addProperty, addSection, write, value, type Document } from '@treewyrm/ini2json/ini'
import { writeFileSync } from 'node:fs'

const document: Document = []
const good = addSection(document, 'Good')

addProperty(good, 'nickname', [value.string('commodity_gold')])
addProperty(good, 'price', [value.integer(100)])
addProperty(good, 'combinable', [value.string('true')])
addProperty(good, 'separable') // a flag is a property with no values

writeFileSync('goods.ini', write(document, 'binary'))
writeFileSync('goods.txt', write(document, 'text'))
```

### Repeats are lists, not mistakes

A document is an ordered sequence of instructions. Repeated section and property names are the
normal case: `[Loadout] equip` occurs 16,074 times across retail, and 156 files repeat a section
name. Every lookup comes in a singular and a plural form, and the plural is usually the honest one.

```ts
import { filterProperties, filterSections } from '@treewyrm/ini2json/ini'

for (const loadout of filterSections(document, 'Loadout'))
  for (const equip of filterProperties(loadout, 'equip')) console.log(equip.values)
```

Every lookup folds case and none of them string-compares, because six retail section names and 32
property names are spelled more than one way. Nothing folds a name in place: what was read is what
gets written back.

### Scene scripts

A `.thn` is a compiled Lua chunk, but it is not a program: fifteen opcodes across all 1,506 retail
scripts, every one of them pushing a value or building a table, and no branch, call or function
anywhere. So it reads as data, and writes back as Lua source — which the engine loads just as
happily, because it loads scripts with `dofile` and Lua compiles text when the signature is absent.

```ts
import { read, write, value } from '@treewyrm/ini2json/thn'
import { readFileSync, writeFileSync } from 'node:fs'

const script = read(readFileSync('DATA/SCRIPTS/INTRO/intro_waterplanet.thn'))

const duration = value.getGlobal(script, 'duration')
if (duration && value.isNumber(duration)) value.toNumber(duration) // 361.872

writeFileSync('intro_waterplanet.thn', write(script)) // plain-text Lua, and the game runs it
```

**The one thing to get right is that a bare word is not a string.** `type = SCENE` is a read of a
global THORN defines, and writing `type = "SCENE"` hands the engine a string where it wants a number.
Identifiers are their own kind of value for exactly that reason, and `Y` and `N` — Lua 3.2 has no
boolean type — are identifiers like any other, so there is no boolean in the model to fold them into.

```ts
value.identifier('SCENE') // type = SCENE
value.string('SCENE') // type = "SCENE"  ← a different file, and a broken one
value.identifier('POSITION', 'ORIENTATION') // flags = POSITION + ORIENTATION
```

Numbers keep the literal they were written as rather than a parsed value, because the constant pool
stores them as decimal ASCII and re-formatting `-0.9999900000000001` yields `-0.99999` — the same
quantity, a different file.

### Scenes, typed

`./thn/scene` is the layer above: entities and events as records, discriminated on `type` and
`action`, with THORN's vocabulary resolved. It reads **both** of the forms retail ships — 355 of the
1,506 scripts carry `type = 9` where the rest carry `type = SCENE` — and both come out the same.

```ts
import * as thn from '@treewyrm/ini2json/thn'
import * as scene from '@treewyrm/ini2json/thn/scene'

const script = scene.read(thn.read(readFileSync('DATA/SCRIPTS/INTRO/intro_waterplanet.thn')))

for (const entity of script.entities) if (entity.type === 'CAMERA') entity.cameraprops?.fovh // narrowed; a MARKER has no cameraprops

writeFileSync('out.thn', thn.write(scene.write(script)))
```

Two things this layer does deliberately. It **refuses what it has not measured** — an entity type,
event action, enum value or flag bit outside the vocabulary is an error naming the value, because
every alternative is a guess and all 41,250 retail entities resolve without one. And it **keeps what
it does not recognise**, in `unknown`, so a modded script survives a read-modify-write.

It is a fixed point, not byte-exact: writing always emits the symbolic form and a canonical key
order. Edit the interim document when the bytes matter. Where each value in the vocabulary came from
— `thorn.dll`, the corpus, or the scripting guide that turned out to be wrong in six places — is in
[docs/THORN.md](docs/THORN.md).

### Names and infocards

An `ids_name` or `ids_info` is a number into a set of DLLs, `resources.dll` first and then whatever
`freelancer.ini`'s `[Resources]` block lists. Give `readLibrary` those files in that order and it
resolves the numbers:

```ts
import { readFileSync } from 'node:fs'
import * as resource from '@treewyrm/ini2json/resource'

const library = resource.readLibrary(
  resource.RETAIL_LIBRARIES.map((name) => resource.read(readFileSync(`EXE/${name}`))),
)

library.names.get(196609) // 'New York'
library.infocards.get(65539) // '<?xml version="1.0" encoding="UTF-16"?>…'
```

Writing goes the other way, and produces a real DLL — these images carry no code, so there is
nothing to link:

```ts
const dll = resource.write([
  ...resource.writeStrings(new Map([[0, 'Nomad Battleship']])),
  ...resource.writeInfocards(new Map([[3, '<RDL><PUSH/><TEXT>…</TEXT><POP/></RDL>']])),
])

writeFileSync('EXE/MyMod.dll', dll)
```

Two traps the module handles so a caller does not have to. A string resource is **not** a string —
the table is blocked sixteen to an entry, and a hole has to be written as a zero-length run or every
slot after it shifts. And directory entries must be **sorted**, because `FindResource` binary-searches
them, so an unsorted directory does not fail outright; it fails for some ids and not others.

## Round-trip

| Direction                           | Guarantee                                            |
| ----------------------------------- | ---------------------------------------------------- |
| BINI → model → BINI                 | **Byte-exact**, verified over all 1,251 retail files |
| BINI → model → text → model → BINI  | **Byte-exact**, same corpus                          |
| text → model → text                 | Fixed point; comments and layout are not preserved   |
| THN bytecode → model → text → model | **Exact**, verified over all 1,506 retail scripts    |
| THN scene → model → scene           | Fixed point; the numeric export form normalises      |
| DLL → resources → DLL               | **Exact**, verified over all 37 DLLs in retail `EXE` |
| resources → `.rsrc`                 | **Byte-identical to retail**, 5 libraries of 7       |

There is no THN bytecode writer, so compiled → compiled is not on that list. It is deferred rather
than ruled out — nothing needs it, since the game reads text — and what it waits on is two undecoded
header fields, recorded in [docs/THN.md](docs/THN.md).

Byte-exactness comes from two places. The dictionary is rebuilt in the original compiler's order —
every section and property name in first-use order, then every string value in first-use order,
sharing one dedup table. And each value keeps the type tag the file recorded, because 14,209 retail
values are floats whose value is integral and would otherwise be written back as integers.

The one thing that does not survive a trip through text is a value of _boolean_ type, since the text
form has no boolean syntax. Retail contains none: a flag is written as a property with no values
(1,063 of those) or as the string `true` (12,699 of those).

## Testing

```sh
npm test
```

The corpus suites read a retail install from `$FREELANCER_DATA`, falling back to
`~/Downloads/Freelancer/DATA`, and skip themselves with a reason when neither exists — one sweep for
the 1,252 INI files, one for the 1,506 scene scripts, and one for the 37 DLLs in `EXE`. Every count
they assert was measured before the code existed, so a failure means the reader drifted rather than
that the number needs updating.

## Documentation

| Document                        | Subject                                                                      |
| ------------------------------- | ---------------------------------------------------------------------------- |
| [INI.md](docs/INI.md)           | Both encodings, the shared document model, how the game reads a value        |
| [SCHEMA.md](docs/SCHEMA.md)     | Interim → typed: coercion, optionality, references, nicknames                |
| [MODULES.md](docs/MODULES.md)   | Every retail section name, and which module would own it                     |
| [RESOURCE.md](docs/RESOURCE.md) | The resource DLLs: the PE container, string tables, infocards, the id space  |
| [RETAIL.md](docs/RETAIL.md)     | The corpus, the measurements, the quirks, the open questions                 |
| [THN.md](docs/THN.md)           | The scene script format, its value domain, and why it is not INI             |
| [THORN.md](docs/THORN.md)       | The scene vocabulary: entities, events, properties, and where each came from |

## Relationship to utf2json

INI data points at UTF containers — `[Ship]` at a `.cmp`, `[VisEffect]` at an `.ale`, `[Sound]` at a
voice bank. The two libraries must agree on `getObjectId`, the hash for INI nicknames, and they do.
Note it is **not** utf2json's `getResourceId`, which is plain CRC32 and belongs to UTF resources;
using that one on a nickname silently fails to match.

## License

MIT
