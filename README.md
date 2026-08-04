# @treewyrm/ini2json

TypeScript library for reading and writing Freelancer's **INI** data — both the plain-text form and
**BINI**, the compiled binary form that ships in retail `DATA`. Companion to
[`@treewyrm/utf2json`](../utf2json), which covers the UTF binary containers those INIs point at.

The two encodings are two spellings of one document model, so a reader that accepts either plus a
writer that emits either is also a BINI compiler and decompiler.

See [docs/INI.md](docs/INI.md) for the format, the measurements behind every decision here, and how
the game itself reads a value.

## Three layers

On-disk bytes, an interim document model, and typed structures — each convertible to its neighbours
in both directions, and each usable on its own.

```
   INI text  ─┐                                                ┌─ Universe: systems, bases, zones
              ├─▶  Section / Property / Value  ◀──▶  typed  ◀──┼─ Equipment: guns, goods, market
   BINI bytes ─┘         (the interim model)                    ├─ Ships, Solar, Missions, FX, …
                                                                └─ …
```

**The encoding and interim layers are implemented.** The typed layer and the domain modules are
designed but not written; see [docs/SCHEMA.md](docs/SCHEMA.md) and [docs/MODULES.md](docs/MODULES.md).

## Entry points

| Import                       | Contents                                                                      | Documentation                 |
| ---------------------------- | ----------------------------------------------------------------------------- | ----------------------------- |
| `@treewyrm/ini2json`         | `Document`, `Section`, `Property`, `Value`, coercion, lookups, `read`/`write` | [INI.md](docs/INI.md)         |
| `@treewyrm/ini2json/text`    | Text INI parser and serializer                                                | [INI.md](docs/INI.md)         |
| `@treewyrm/ini2json/binary`  | BINI reader and writer                                                        | [INI.md](docs/INI.md)         |
| `@treewyrm/ini2json/utility` | `BufferView`, windows-1252, `getObjectId`, number and name helpers            | [INI.md](docs/INI.md)         |
| _planned_ `./schema`         | The typed-layer machinery: coercion, optionality, ordering                    | [SCHEMA.md](docs/SCHEMA.md)   |
| _planned_ domain modules     | Universe, equipment, ships, solar, missions, FX, audio, interface             | [MODULES.md](docs/MODULES.md) |

`.thn` scene scripts are named as future scope and are **not INI** — retail ships all 1,506 of them
as compiled Lua 3.2. They are a serialization format rather than a program, so a JSON mapping is
close to direct; see [docs/THN.md](docs/THN.md) before assuming otherwise in either direction.

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
import { read } from '@treewyrm/ini2json'
import { readFileSync } from 'node:fs'

const document = read(readFileSync('DATA/EQUIPMENT/goods.ini'))

for (const section of document) console.log(section.name, section.properties.length)
```

### Reading values

A value carries the type the file recorded, and you ask for the type you want. This is how the
engine works — `INI_Reader` has no accessor that asks what type a value _is_ — and the coercions
here follow it, truncation and odd corners included.

```ts
import { findByNickname, getValue, value } from '@treewyrm/ini2json'

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
import { addProperty, addSection, write, value, type Document } from '@treewyrm/ini2json'
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
import { filterProperties, filterSections } from '@treewyrm/ini2json'

for (const loadout of filterSections(document, 'Loadout'))
  for (const equip of filterProperties(loadout, 'equip')) console.log(equip.values)
```

Every lookup folds case and none of them string-compares, because six retail section names and 32
property names are spelled more than one way. Nothing folds a name in place: what was read is what
gets written back.

## Round-trip

| Direction                          | Guarantee                                            |
| ---------------------------------- | ---------------------------------------------------- |
| BINI → model → BINI                | **Byte-exact**, verified over all 1,251 retail files |
| BINI → model → text → model → BINI | **Byte-exact**, same corpus                          |
| text → model → text                | Fixed point; comments and layout are not preserved   |

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

The corpus suite reads a retail install from `$FREELANCER_DATA`, falling back to
`~/Downloads/Freelancer/DATA`, and skips itself with a reason when neither exists. Every count it
asserts was measured before the code existed, so a failure means the reader drifted rather than that
the number needs updating.

## Documentation

| Document                      | Subject                                                               |
| ----------------------------- | --------------------------------------------------------------------- |
| [INI.md](docs/INI.md)         | Both encodings, the shared document model, how the game reads a value |
| [SCHEMA.md](docs/SCHEMA.md)   | Interim → typed: coercion, optionality, references, nicknames         |
| [MODULES.md](docs/MODULES.md) | Every retail section name, and which module would own it              |
| [RETAIL.md](docs/RETAIL.md)   | The corpus, the measurements, the quirks, the open questions          |
| [THN.md](docs/THN.md)         | Why `.thn` is a separate problem, and a smaller one than it looks     |

## Relationship to utf2json

INI data points at UTF containers — `[Ship]` at a `.cmp`, `[VisEffect]` at an `.ale`, `[Sound]` at a
voice bank. The two libraries must agree on `getObjectId`, the hash for INI nicknames, and they do.
Note it is **not** utf2json's `getResourceId`, which is plain CRC32 and belongs to UTF resources;
using that one on a nickname silently fails to match.

## License

MIT
