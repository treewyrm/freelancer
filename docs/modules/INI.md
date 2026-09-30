# INI and BINI

A flat sequence of bracketed sections, each holding properties, each holding comma-separated values.
Three encodings — plain text; **BINI**, the compiled binary form; and the **save** form, text under a
positional XOR mask. All three carry the same document, so one model serves them all.

The game has one reader and two parsers behind it. `INI_Reader`, in `common.dll` — built from
`E:\FL\Scratch\Source\Common\Ini.cpp` — reads a 12-byte header, compares it against `BINI`, and sets
a flag; every accessor branches on that flag. The BINI branch walks the mapped file's records in
place, materializing no text, so BINI is a second parser rather than a transport encoding.

- Plain text is accepted anywhere retail ships BINI: a file without the signature falls through to
  the text parser unconditionally. Nothing about the filename or location is consulted.
- The two paths differ in their details, so any parser-behaviour claim here names which encoding it
  was measured on.

The save form is not one of the two branches: it has no `BINI` signature, so it must be unmasked
before reaching that class. Where that happens has not been traced.

Check the signature, never the extension. `formatOf` reports `binary`, `text` or `save`, and `read`
routes on the signature.

Which files the game loads, and in what order, is the consumer's.

## The document model

The interim layer, and what all three encodings parse into. `Document`, `Section` and `Property` are
classes — identity and mutation are the point, as with `utf/`'s `Directory`/`File`.

```
Document
  └─ entries: (Section | Line)[]        ordered; a Line is a verbatim unparsed source line
       └─ sections: Section[]           computed getter, duplicates legal
            ├─ name: string             as authored, not folded
            ├─ comment: string          trailing comment on the section's own line, text-only
            └─ entries: (Property | Line)[]   ordered
                 └─ properties: Property[]    computed getter, duplicates legal and common
                      ├─ name: string
                      ├─ comment: string      trailing same-line comment, text-only
                      └─ values: Value[]      0..255; boolean | number | string
```

A `Line` is `string` — a blank line, a comment-only line, or anything else the text parser did not
interpret, kept in position so a write-back reproduces it. Only text carries them: BINI has no
comment syntax, so a `Line` never appears in a document read from binary, and the binary writer drops
any in a hand-built one.

Four rules the model exists to enforce, each of which a naive `Record<string, string>` breaks:

1. **A document is a sequence of instructions, not a map.** The game applies sections in file order,
   and a later section can depend on an earlier one having run.
2. **Duplicate property names are the normal case.** A duplicate is another item in a list, so the
   parser keeps every one in order.
3. **Duplicate section names are equally normal.**
4. **A property can have zero values.** In text that is a bare name with no `=`, or an `=` with
   nothing after it.

Lookups compare by name, case-folded, never in place — and never by hash, unlike `Directory.getFile`;
only a `nickname` *value* is hashed, via `Document.findByNickname`. `addSection`/`addProperty` always
append rather than find-or-replace.

Because duplicates are normal, name is the wrong handle for an edit:
`deleteProperty`/`deleteSection` take a name and remove every match, which is right for a scalar
field and wrong for one `equip` row out of forty. `Section.removeProperty(property)` and
`Document.removeSection(section)` take the object instead and remove exactly it, reporting whether it
was there; `Section.insertProperty` is `addProperty` placed after the last property of the same name.
All three are structural, and a removal leaves neighbouring `Line`s alone.

Serialization is the class's: `Document.read(bytes)` routes on the signature, `document.write(format)`
emits any of the three. `formatOf` stays a free function because it asks a question about bytes and
there is no document yet when it is asked.

That arrangement costs a module cycle and bundle size — see [The encoding cycle](#the-encoding-cycle).

## Text form

```ini
; a comment
[Section]
property = value1, value2, value3
flag                                 ; no '=' at all — zero values
empty =                              ; '=' and nothing after it — also zero values
```

- `;` begins a comment, to end of line, and is lost on compile to BINI (no comment syntax there — see
  [above](#the-document-model)); the convention for one that must survive that trip is a property
  literally named `comment`. Text→interim→text preserves it.
- A section is commented out by prefixing its **name**, not its line. `[;Display]` is a section whose
  name is `;Display` and which matches nothing. Round-tripping it means treating a section header as
  opaque text.
- A comment-only line, a blank line, or a trailing `; …` survives a text→interim→text round trip in
  position; a *parsed* line's spacing does not — `a=1` and `a = 1` both write back through
  `WriteOptions.spaceAroundAssignment`. Blank-line placement between sections is data (an empty
  `Line` entry), not a writer policy — there is no `spaceBetweenSections` option; a hand-built
  document that wants one carries an explicit `''` entry.
- A section name is opaque text, not an identifier. Retail carries one named `keymap=1.1` and one
  with a space in it.
- Values are untyped in text and cast at query time, so a consumer reading a field must coerce rather
  than switch on the tag.
- Whitespace around names and values is insignificant — but retail pads some numbers with U+00A0
  (`0xA0`), not spaces, so a trimmer that only strips ASCII space and tab leaves one stuck to the
  value.
- `@include` appears once in retail. The reader treats it as a property named `@include` and does not
  follow it. See [TODO](#todo).

## BINI form

Little-endian throughout. A 12-byte header, then sections until the dictionary, then the dictionary.

| Field         | Type   | Notes                                                                  |
| ------------- | ------ | ---------------------------------------------------------------------- |
| `signature`   | uint32 | `0x494E4942` = `BINI`                                                  |
| `version`     | uint32 | **The game never reads it**                                            |
| `namesOffset` | uint32 | byte offset of the dictionary block; also the end of the section block |

There is no section count and no file size — the section block runs until `namesOffset`, so a parser
loops on the cursor rather than a counter.

`INI_Reader::open` validates exactly two things: the signature dword, and `namesOffset < fileLength`
(strictly less). It never looks at `version`, so a file claiming version 7 loads. This reader still
rejects a version other than `1` — our rule, not the game's, on the grounds that a different value
more likely means a misidentified file than a dialect.

**Section** — `nameOffset` uint16, `propertyCount` uint16, then that many properties.

**Property** — `nameOffset` uint16, `valueCount` uint8, then that many values. Three bytes, not four:
there is no padding, and a value is 5 bytes, so nothing in the format is aligned.

**Value** — a `type` uint8 followed by a fixed 4-byte payload read according to it:

| Type    | Tag   | Payload                                                        |
| ------- | ----- | -------------------------------------------------------------- |
| Boolean | `0x0` | byte 0 of the 4; nonzero is true. Bytes 1–3 are never read     |
| Integer | `0x1` | int32                                                          |
| Float   | `0x2` | float32                                                        |
| String  | `0x3` | uint32 offset into the dictionary block                        |

The 5-byte stride is unconditional. The game addresses the *n*-th value of a property as `base + n*5`
before it has looked at any type byte — `get_value_bool` @ `0x6310640` computes
`leal (%edi,%edi,4)`, and `read_value` @ `0x6310279` skips a whole property with `count*5` without
inspecting types. A boolean is 4 payload bytes of which one is meaningful, not a short record. A
writer emitting a 1-byte boolean desynchronizes the game's cursor for the rest of the file.

The type-`0x0` arm is `movb 0x1(%edi), %bl` in `get_value_bool` and `movzbl 0x1(%eax), %edi` in
`get_value_int`: byte 0 of the payload, nonzero is true — not the most significant bit, which is what
the format's usual write-up claims. Emit `01 00 00 00` if you ever emit one.

**Dictionary** — concatenated NUL-terminated ASCII, holding section names, property names and string
values alike, deduplicated by content.

### The uint16/uint32 hazard

Section and property name offsets are `uint16`; string value offsets are `uint32`. A dictionary
larger than 64 KiB can hold string values that are reachable and names that are not, which is why the
convention places all names ahead of all values.

Both are unsigned — the game widens a name offset with `movzwl`, so the full 65,535 is addressable.
Librelancer reads all three uint16 fields as signed, a latent bug in any file whose dictionary passes
32 KiB.

A writer must order the dictionary names-first and throw when the name region passes 64 KiB. No
retail file exercises the hazard, but not by much — see [Corpus](#the-dictionary-ceiling).

### Booleans do not occur, and the writer must never emit one

The boolean encoding is documented but unexercised — the "flag" case it would seem to serve is
instead a zero-value property. The reader must handle type `0x0` since the format defines it, but the
writer should never emit one.

### The compiler preserves nonsense

The BINI compiler emitted whatever the source text held, including lines that are plainly authoring
residue — a half-deleted line or an unclosed comment. All are zero-value properties, all round-trip
fine, and none means anything. The interim layer carries them through untouched: an unrecognized
property is the normal state of a 2003 data file, not a parse failure.
[Corpus](#the-compiler-preserves-nonsense-1) lists them.

## Save form

Text INI under a positional XOR mask. Files carry the extension `.fl` and open with the four ASCII
bytes `FLS1`; everything after is the text form, masked byte by byte. No version field and no
length — the signature is the whole header.

```
pad[i] = (('Gene'[i % 4] + i) % 256) | 0x80        i counted from the start of the body
body[i] ^= pad[i]
```

The pad depends on position and nothing else:

- It is its own inverse, so one routine reads and writes. `./ini/save` is one file for that reason.
- It is obfuscation, not encryption. The sequence repeats every 256 bytes and one known section
  header recovers all of it. The `| 0x80` forces every output byte out of the printable range, so the
  file does not look editable in a text editor.
- Nothing in the file selects the key. `Gene` does not appear as a string in any retail executable.

Under the mask is ordinary text with no dialect of its own. Writing never masks unless asked — a
document does not remember what it was read from, so `document.write('save')` is explicit and the
default stays `binary`.

## How the game reads a value

From `common.dll`. A caller never asks "what type is this value" — there is no such accessor. It asks
for the type it wants, by index, and the reader coerces:

| Accessor           | tag `0x0` bool        | tag `0x1` int32 | tag `0x2` float32                | tag `0x3` string                                  |
| ------------------ | --------------------- | --------------- | -------------------------------- | ------------------------------------------------- |
| `get_value_bool`   | byte 0 ≠ 0            | `!= 0`          | `!= 0.0`                         | `stricmp` vs `true` / `false`, else `atoi() != 0` |
| `get_value_int`    | byte 0, zero-extended | as-is           | `__ftol` (truncates toward zero) | `atoi`                                            |
| `get_value_float`  | byte 0 → `fild`       | `fild`          | as-is                            | `atof`                                            |
| `get_value_string` | `sprintf("%d")`       | `sprintf("%d")` | `sprintf("%g")`                  | pointer into the dictionary                       |

Seven things follow that a reimplementation can get wrong:

1. **Every type is readable as every other type.** There is no type error and no failure return. A
   field authored `int` in some rows and `float` in others costs the game nothing, which is why the
   compiler never normalized it, and why the interim layer keeps the tag as read.
2. **Coercion is asymmetric with the text path.** Text goes through `ParseNumber`/`atof` on the raw
   characters; BINI already holds a float32. A value authored `0.1` is `atof("0.1")` as text and the
   nearest float32 widened as BINI. Close, not identical.
3. **A string coerced to bool is case-insensitive** (`stricmp`) and accepts only `true` and `false`
   by name; anything else falls through to `atoi`, so `yes` is false. The text path is stricter — it
   accepts `true`/`1`/`false`/`0` and pops a `*** ERROR: Invalid bool value` box otherwise. The BINI
   path never complains.
4. **Numbers rendered back to text use `%d` and `%g`**, not a shortest-round-trip formatter. `%g`
   gives six significant digits, so the game's own float→text is lossy. Our text writer must
   round-trip float32 exactly, because our text output is an input to our parser as much as to the
   game's.
5. **Reading past a property's value count is a hard error**, not a default: the game `sprintf`s
   `header [%s] value %s missing parameter %u` and calls `MessageBoxA`. Arity is load-bearing, and a
   writer must not drop trailing values it does not understand.
6. **`is_value_empty` is not "the value is an empty string" on the BINI path** — it is only ever true
   for an out-of-range index. A BINI value is never empty; the text path's version tests the
   substring's first character.
7. **A bare property is one whose value was left out**, not a kind of property of its own. Observed
   in game:

   | In the file                              | The object gets                                    |
   | ---------------------------------------- | -------------------------------------------------- |
   | no property at all                       | whatever the object was constructed with           |
   | `separable`                              | `true`                                             |
   | `separable = true` / `separable = false` | that value, coerced by the table above             |

   A written value is honoured — `separable = false` disables separation exactly as omitting the
   property does. The behaviour is what a reader that pre-seeds a property with a single `true` and
   then overwrites it with whatever values the line carries would produce: the seed survives when
   there are none. That also explains why reading a bare property never pops consequence 5's box.

   Deleting a property is therefore not the same as writing `false`, and nothing in the file records
   the default, so an editor that means `false` should write it.

Two accessors explain what BINI looks like from inside the engine:

- `get_value_string()`, the no-index overload, re-renders the whole property. On the BINI path it
  walks every value of the current property, formats each by the table above, and joins them with
  `", "` into a scratch buffer — producing exactly the text line the property was compiled from. On
  the text path it returns the raw right-hand side as authored. One property at a time into one
  reused buffer, not a file.
- `get_vector()` is three `get_value_float(0..2)`, so a `Vector` property is not a distinct encoding,
  just an arity-3 convention. `value_num`, `get_bool`, `get_indexed_value` and `get_value_ptr` are
  plain aliases of the four accessors above.

Section and property names come back the same way in both paths: on BINI, `get_header_ptr` and
`get_name_ptr` return `dictionaryBase + nameOffset` widened with `movzwl`; on text, a pointer into
the line buffer. `get_num_parameters` is the `valueCount` byte on BINI and a `strchr(',')` count on
text.

### The tag is the token's shape, not the field's type

The tag is decided lexically, once, from what the token looked like in the source text — by the same
classifier the text path uses, so the compiler only froze a decision `INI_Reader` would make again at
load time. It records how a value was written, never how it is read.

`[Zone] attack_ids` is the clean example. It names trade lanes by the `lane_id` declared on another
zone in the same system file. Bretonia, Kusari, Rheinland and the Border Worlds write
`attack_ids = br01_2, br01_4`; Liberty, the Independent Worlds and `intro.ini` write
`attack_ids = 18, 22`, because a bare `18` is what a lane is called there. One field, one meaning,
two tags. `[Object] nickname = 600` in `li04.ini` is the same artifact where a number is impossible
outright — a nickname is hashed on its characters.

So a tag difference at one position is not a shape difference, and the forms a property takes cannot
be enumerated from tags. Read an id through `get_value_string` — `value.toText` here — and both
halves of the universe agree.

The caution runs the other way for numbers. Assume a numeric position is consumed as a float unless
the field cannot hold a fraction, since `get_value_float` widens an int32 with `fild` and costs the
game nothing. A position written int in some rows and float in others is evidence only that it is
*likely* read as a float; never evidence of two forms of the property.

## Case

Names are stored as authored and compared case-folded (see [lookups](#the-document-model)); the
writer emits what was read, so a round trip never normalizes spelling.

## Notes

### The encoding cycle

Each encoding lives in its own submodule and each constructs `Document`/`Section`/`Property` to
return them, so `document.ts` importing the three submodules means those submodules import back into
the module defining the class. It is benign — every reference to `Document` inside them is in a
function body, never at module scope, so the class is initialized long before a reader runs.

The measured price is that `Document` reaches all three encoders, so every path into `./ini` or any
of its subpaths carries all three: importing `./ini/text` alone bundles 15.8 KB where free functions
let it be 6.7 KB. That is the trade for an API matching `Directory`. A consumer who truly needs one
decoder and nothing else should reach for `isBinary` plus the submodule's own `read`.

## API

### `./ini`

| Export      | Kind      |                                                                              |
| ----------- | --------- | ---------------------------------------------------------------------------- |
| `binary`    | namespace | Everything under `./ini/binary`.                                             |
| `Document`  | class     | A whole file: an ordered sequence of sections, duplicates legal.             |
| `Format`    | type      | `'binary' \| 'text' \| 'save'`.                                              |
| `formatOf`  | function  | Detects the encoding of a buffer without parsing it.                         |
| `Line`      | type      | A verbatim source line the parser did not interpret. Text-only.              |
| `Property`  | class     | A named list of values. Zero values is normal and means something.           |
| `save`      | namespace | Everything under `./ini/save`.                                               |
| `Section`   | class     | A named list of properties. The name is opaque text, not an identifier.      |
| `text`      | namespace | Everything under `./ini/text`.                                               |
| `value`     | namespace | Value constructors, predicates and coercions (below).                        |
| `Value`     | type      | One value of one property, tagged rather than a bare primitive.              |
| `ValueOf`   | type      | Narrows `Value` to the arm of a given `type`.                                |
| `ValueType` | type      | Which of the four things a value is.                                         |

**`Document`, `Section` and `Property` are classes**, the same shape as `utf/`'s `Directory` —
`Document.read` routes on the signature and `document.write(format)` emits any of the three, so
nothing at module scope reads or writes a document.

| Class      | Members                                                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `Document` | `read` (static), `write`, `entries`, `sections`, `getSection`, `filterSections`, `addSection`, `insertSection`, `deleteSection`, `removeSection`, `append`, `findByNickname`, `[Symbol.iterator]` |
| `Section`  | `name`, `label`, `comment`, `entries`, `properties`, `getProperty`, `filterProperties`, `getValue`, `getValues`, `hasProperty`, `addProperty`, `insertProperty`, `deleteProperty`, `removeProperty`, `append`, `getNickname` |
| `Property` | `name`, `label`, `comment`, `values`, `coerce`                                                                                              |

`value`: `boolean`, `integer`, `float`, `string`, `from`, `list`, `isBoolean`, `isInteger`,
`isFloat`, `isNumber`, `isString`, `toBoolean`, `toInteger`, `toFloat`, `toText`, `equals`. The
`is*` guards are type predicates, so a value they pass is narrowed to its arm.

`Property.coerce(...types)` reads the values positionally as the requested types, the way the
engine's typed accessors do: `property.coerce('float', 'float', 'float')`.

### `./ini/text`

| Export         | Kind      |                                                                             |
| -------------- | --------- | --------------------------------------------------------------------------- |
| `read`         | function  | Parses text INI into sections. Deliberately forgiving, because the data is. |
| `write`        | function  | Serializes sections as text INI. No quoting or escaping anywhere.           |
| `WriteOptions` | interface | Formatting options for both `write` and `writeSection`.                     |
| `writeSection` | function  | Serializes a single section, for diffing or splicing into a larger file.    |

### `./ini/binary`

The record layout — `SIGNATURE`, `VERSION`, and the four `*_BYTE_LENGTH` sizes — is **not exported**:
`isBinary` is what the signature is good for, the version is what the writer emits, and a caller
never lays out a BINI record. The three `MAX_*` ceilings are here because a hand-built `Document`
can exceed them and `write` throws when it does.

| Export                 | Kind     |                                                                                      |
| ---------------------- | -------- | ------------------------------------------------------------------------------------ |
| `Dictionary`           | class    | The names-and-values block at the end of a BINI. One table, not two.                 |
| `isBinary`             | function | Whether a buffer starts with the `BINI` signature. Check this, not the suffix.       |
| `MAX_NAME_OFFSET`      | const    | Largest offset a name can sit at, since those offsets are `uint16`.                  |
| `MAX_PROPERTIES`       | const    | Largest `propertyCount`.                                                             |
| `MAX_VALUES`           | const    | Largest `valueCount`.                                                                |
| `read`                 | function | Reads a BINI into sections.                                                          |
| `ValueTag`             | type     | `Boolean`/`Integer`/`Float`/`String` — a `const` object and the union of its values. |
| `write`                | function | Writes sections as a BINI, reproducing the original compiler's byte layout.          |

`Dictionary` instance: `byteLength`, `size`, `push(value)`, `toBytes()`.

### `./ini/save`

`SIGNATURE` and `HEADER_BYTE_LENGTH` are module-private for the same reason `./ini/binary`'s are —
`isSave` answers the question, and the header is nothing but the signature.

| Export               | Kind     |                                                                              |
| -------------------- | -------- | ---------------------------------------------------------------------------- |
| `isSave`             | function | Whether a buffer starts with the `FLS1` signature. Check this, not the suffix. |
| `mask`               | function | Applies the mask to a body, and is its own inverse.                          |
| `read`               | function | Reads a masked save into sections.                                           |
| `write`              | function | Writes a document as a masked save.                                          |

## Corpus

Retail `DATA` holds 1,252 `.ini` files: 1,251 BINI and exactly one text (`initialworld.ini`). The
three under `EXE/` — `freelancer.ini`, `dacom.ini`, `dacomsrv.ini` — are text as well, and the two
`.fl` beside them are one masked and one plain.

| | Count |
| --- | --- |
| Sections | 70,250 |
| Distinct section names (case-folded) | 256 |
| Properties | 511,556 |
| Values | 876,034 |
| — of type boolean (`0x0`) | **0** |
| BINI `version` values seen | `1`, in all 1,251 |
| Bytes above `0x7F` in any BINI dictionary | **0** |

The dictionary is ASCII by measurement, unlike the text path, which needs windows-1252 for
`initialworld.ini`'s U+00A0.

`EXE/freelancer.ini`'s `[Data]` block names 97 of the 1,252, and another 58 are opened by names
compiled into `content.dll` and `Freelancer.exe`. At least one file (`FX/fuse_li_battleship.ini`) is
present and named by neither, so it never loads.

### The four document-model rules, measured

| Rule | Evidence |
| --- | --- |
| Duplicate property names are normal | `[Loadout] equip` ×16,074, `[Zone] density_restriction` ×15,316, `[BaseGood] marketgood` ×14,694 |
| Duplicate section names are normal | **156 files** repeat one; `[Base]` ×197 in a single file, `[Object]` ×3,578 across systems |
| A property can have zero values | 1,063 do |
| Names are compared, never hashed | 6 section names and 32 property names are spelled more than one way |

The six multi-spelled section names:

| Folded            | Spellings                                    |
| ----------------- | -------------------------------------------- |
| `explosion`       | `Explosion` ×86, `explosion` ×70             |
| `objlist`         | `ObjList` ×655, `Objlist` ×17                |
| `exclusion zones` | `Exclusion Zones` ×168, `Exclusion zones` ×1 |
| `asteroids`       | `Asteroids` ×208, `asteroids` ×2             |
| `zone`            | `zone` ×5,765, `Zone` ×4                     |
| `archetype`       | `Archetype` ×17, `archetype` ×1              |

### Booleans do not occur

Across 876,034 values in 1,251 files, not one is type `0x0`. The zero-value properties that stand in
for them are 1,063 strong — e.g. `[CollisionGroup] separable` ×456, `[BaseFaction] offers_missions`
×241, `[NewsItem] audio` ×231.

`[CollisionGroup] separable` is written bare 456 times and `= true` 28 times, and `solararch.ini`
writes it both ways — 211 bare and 28 valued, in one file — so neither is an accident and a consumer
must accept either and convert neither. Retail never writes the negative anywhere: 77
`[Solar] destructible = true` and no `false` at all, which fits `separable` defaulting to `false` and
`destructible` to `true`.

Four pairs are written both bare and with a value; three of them (`[Zone] difficulty`,
`[ObjList] breakformation`, `[Trigger] system`) are not booleans at all — their valued form carries a
difficulty number, a placeholder token and a system name.

### The tag records the token, not the field

Across 424,320 string-typed values in the 1,251 BINI files, not one parses as a number.

`[Zone] attack_ids` occurs 806 times across 30 files, and every one resolves, with no dangling id in
either form.

`[Good] price` is authored `int` 812 times and `float` 12 times for the same field. Retail has 14,209
float-typed values with an integral value, which is why dropping the tag costs byte-exactness.

### The dictionary ceiling

| | Value |
| --- | --- |
| Largest dictionary | 64,492 bytes (`AUDIO/story_sounds.ini`) |
| Largest string offset in it | 64,446 |
| Largest *name* offset anywhere | 4,650 (`MISSIONS/pilots_population.ini`) |

The largest dictionary sits about 1 KiB short of the uint16 ceiling. The names region is nowhere near
it — the pressure is all on the value region, which is what the names-first convention protects
against.

### Limits, measured

|                           | Retail maximum | Format maximum                     |
| ------------------------- | -------------- | ---------------------------------- |
| Values in one property    | 25             | 255 (`valueCount` is uint8)        |
| Properties in one section | 3,126          | 65,535 (`propertyCount` is uint16) |
| Property name length      | 49             | unbounded (NUL-terminated)         |
| Dictionary size           | < 64 KiB       | 4 GiB for values, 64 KiB for names |

Value arity is overwhelmingly 1 (355,403 of 511,556 properties). Arity 7 spikes at 15,229 almost
entirely from `marketgood`.

### The compiler preserves nonsense

| File                             | Section                            | Property                                       |
| -------------------------------- | ---------------------------------- | ---------------------------------------------- |
| `UNIVERSE/SYSTEMS/IW01/iw01.ini` | `[Object]`                         | `260800` ×6                                    |
| `MISSIONS/M12/m12.ini`           | `[Trigger]`                        | `system St02` — a space inside a property name |
| `FX/fuse_br_battleship.ini`      | `[start_effect]`                   | `ONLY`                                         |
| `FX/fuse_ku_gunship.ini`         | `[start_effect]`                   | `age_fire`                                     |
| `INTERFACE/BASESIDE/navbar.ini`  | `[BaseFrame]`, `[RoomControl1..7]` | `mesh`, `behavior`, `event` ×14                |

Two more names are not names at all: a `[Effect] :` whose value is a row of `=` signs, and a run of
42 dashes the parser read as a property because a bare line is a property with no values.

### The save files

Retail ships two `.fl`, both in `EXE/`, and only one is masked:

| File                    | Opens with | Contents                                                                                              |
| ----------------------- | ---------- | ------------------------------------------------------------------------------------------------------- |
| `EXE/newplayer.fl`      | `FLS1`     | `[Player]`, `[StoryInfo]`, `[mPlayer]` — 227 properties, the singleplayer start                       |
| `EXE/mpnewcharacter.fl` | `[Player]` | plain text, 89 properties, `%%NAME%%` / `%%MONEY%%` / `%%HOME_BASE%%` placeholders the server fills in |

Check-the-signature applies twice here: once between BINI and text, again between masked and plain
within one extension. `newplayer.fl` carries the U+00A0 column padding `initialworld.ini` does, 12
bytes of it on four `locked_gate` lines.

### Round-trip

| Direction                              | Target                                                                                                                                                                                                 |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BINI → interim → BINI                  | **Byte-exact for all 1,251 files**                                                                                                                                                                     |
| text → interim → text                  | Fixed point over all 1,252; unparsed lines and trailing same-line comments are preserved verbatim, in position; a *parsed* line's original spacing is not — it re-serializes through `WriteOptions` |
| BINI → interim → text → interim → BINI | Byte-exact, since text is the richer encoding                                                                                                                                                          |
| save body → unmasked → save body       | **Byte-exact.** The mask is its own inverse over the exact bytes                                                                                                                                        |
| save → interim → save                  | Fixed point over both `.fl`, with the text direction's losses and no others                                                                                                                            |
| interim → typed → interim              | Fixed point for known sections; unknown properties survive                                                                                                                                             |

**Dictionary ordering is derivable.** The compiler's emission order is exactly: every section name
and property name in first-use order, walking sections in file order and each section's properties in
order; then every string value in first-use order, walking the same way; one global dedup table
shared by names and values, so a string value equal to a name reuses the name's offset. Nothing is
emitted that is not referenced, and there are no gaps between entries.

Re-emitting all 1,251 retail files under that rule reproduces every file byte for byte, so nothing
needs preserving out-of-band. It also means the names-first convention falls out of the two-pass
order — but a writer should still assert it, because it is what keeps name offsets inside uint16.

Two things carry the trip out through text and back:

- **Float formatting.** A float32 must render to text that re-parses to the same float32, which is a
  shortest-round-trip problem, not a fixed-decimals one. The search always keeps a `.`, so none of
  the 14,209 integral floats returns as an integer. The game itself uses `%g` here and is therefore
  lossy; matching the game is the wrong target.
- **A whole number too large for `int32` stays a string** rather than becoming a float, because
  `initialworld.ini` writes `locked_gate = 2926089285`, which is `getObjectId('St01_to_St02_hole')`
  read unsigned. As a float32 it would come back 2,926,089,248 and resolve to nothing.

## TODO

| Question                                                                                                                                                          | Reading taken                                                | Experiment                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Whether the shipped game honours `@include` (`EXE/dacom.ini` opens with `@include FL_Dev.ini`), or whether it was a build-tool directive stripped before shipping | Treat it as a property named `@include` and do not follow it | Add an `@include` to a text INI the game reads and see whether the included content takes effect |

---

[RETAIL.md](../refs/RETAIL.md) · [ENGINE.md](../refs/ENGINE.md) · [SECTIONS.md](../refs/SECTIONS.md) · [THN.md](THN.md)
