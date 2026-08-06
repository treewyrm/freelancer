# INI and BINI

Freelancer's configuration data is INI: a flat sequence of bracketed sections, each holding
properties, each holding comma-separated values. It ships in three encodings — plain text; **BINI**,
the compiled binary form the game's tools produce; and the **save** form, which is text under a
positional XOR mask. **All three carry the same document, so one model serves them all**, and a
reader that accepts any plus a writer that emits any is also a BINI compiler and decompiler.

**The game has one reader and two parsers behind it.** `INI_Reader`, in `common.dll` — built from
`E:\FL\Scratch\Source\Common\Ini.cpp` — reads a 12-byte header, compares it against `BINI`, and sets
a flag; every accessor on the class then branches on that flag. The BINI branch walks the mapped
file's records in place. **No text is materialized**, so BINI is a second parser, not merely a
transport encoding. See [How the game reads a value](#how-the-game-reads-a-value).

Two consequences, and they pull in different directions:

- **Plain text is accepted anywhere retail ships BINI**, because a file without the signature falls
  through to the text parser unconditionally. Nothing about the filename or location is consulted.
- **The two paths are not interchangeable in their details.** A behaviour measured on one is not
  automatically a behaviour of the other — see the coercion table below, where the same value
  reaches a caller by a different route in each. Any parser-behaviour claim here or in
  `@treewyrm/freelancer-game`'s `docs/SCHEMA.md` has to name which encoding it was measured on.

The document model above is still what both paths agree on, which is why one model serves both.

The save form is not one of the two `INI_Reader` branches on — it has no `BINI` signature, so by the
time it reaches that class it has to have been unmasked already. Where that happens has not been
traced. See [Save form](#save-form).

Retail `DATA` holds **1,252 `.ini` files: 1,251 BINI and exactly one text** (`initialworld.ini`).
The three under `EXE/` — `freelancer.ini`, `dacom.ini`, `dacomsrv.ini` — are text as well, and the
two `.fl` beside them are one masked and one plain. **Check the signature, never the extension.**

Which of the 1,252 the game actually loads, and in what order, is a separate question this module
does not answer — see `@treewyrm/freelancer-game`'s `docs/GAME.md`. `EXE/freelancer.ini`'s `[Data]` block names 97 of them, and
another 58 are opened by names compiled into `content.dll` and `Freelancer.exe`. At least one file
(`FX/fuse_li_battleship.ini`) is present and named by neither, so it never loads at all.

## The document model

The interim layer, and the thing both encodings parse into:

```
Document
  └─ sections: Section[]              ordered, duplicates legal
       ├─ name: string                as authored, not folded
       └─ properties: Property[]      ordered, duplicates legal and common
            ├─ name: string
            └─ values: Value[]        0..255; boolean | number | string
```

Four rules the model exists to enforce, each of which a naive `Record<string, string>` breaks:

1. **A document is a sequence of instructions, not a map.** The game applies sections in file order,
   and a later section can depend on an earlier one having run.
2. **Duplicate property names are the normal case, not an error.** `[Loadout] equip` repeats
   **16,074** times across retail, `[BaseGood] marketgood` **14,694**, `[Zone] density_restriction`
   **15,316**. A duplicate is another item in a list, so the parser keeps every one in order.
3. **Duplicate section names are equally normal** — **156 files** repeat a section name, and the
   whole universe is built that way (`[Base]` ×197 in one file, `[Object]` ×3,578 across systems).
4. **A property can have zero values.** 1,063 do. In text that is a bare name with no `=`, or an
   `=` with nothing after it.

Names are compared case-insensitively but stored as authored — see [Case](#case) below.

## Text form

```ini
; a comment
[Section]
property = value1, value2, value3
flag                                 ; no '=' at all — zero values
empty =                              ; '=' and nothing after it — also zero values
```

- `;` begins a comment, to end of line. **BINI has no comment syntax**, so comments are lost on
  compile; the convention for a comment that must survive is a property literally named `comment`.
- A section is commented out by prefixing its name, not its line: `EXE/freelancer.ini` carries
  `[;Display]`, which is a section whose name is `;Display` and which therefore matches nothing.
  Round-tripping it means treating a section header as opaque text.
- **A section name is opaque text, not an identifier.** `INTERFACE/keymap.ini` carries a section
  literally named `keymap=1.1` — an `=` inside a section header.
- Values are untyped in text and cast at query time by whatever reads them. This is the reason the
  typed layer coerces rather than switches on a tag; see `@treewyrm/freelancer-game`'s `docs/SCHEMA.md`.
- Whitespace around names and values is insignificant — but `initialworld.ini` pads numbers with
  **U+00A0 (`0xA0`)**, not spaces, so a trimmer that only strips ASCII space and tab leaves a
  non-breaking space stuck to the value. Retail's one text data file is also its one file that needs
  this, which is exactly the kind of thing a corpus test catches and a hand-written test does not.
- `EXE/dacom.ini` opens with `@include FL_Dev.ini`. Whether the shipped game honours `@include` or
  whether it is a build-tool directive is unresolved; see [TODO](#todo).

## BINI form

Little-endian throughout. A 12-byte header, then sections until the dictionary, then the dictionary.

| Field         | Type   | Notes                                                                  |
| ------------- | ------ | ---------------------------------------------------------------------- |
| `signature`   | uint32 | `0x494E4942` = `BINI`                                                  |
| `version`     | uint32 | `1` in all 1,251 retail files; **the game never reads it**             |
| `namesOffset` | uint32 | byte offset of the dictionary block; also the end of the section block |

There is no section count and no file size — **the section block runs until `namesOffset`**, so a
parser loops on the cursor rather than on a counter.

`INI_Reader::open` validates exactly two things: the signature dword, and `namesOffset < fileLength`
(strictly less). It never looks at `version`, so a file claiming version 7 loads. This reader still
rejects a version other than `1`, on the grounds that retail has only ever emitted `1` and a
different value more likely means a misidentified file than a dialect — but it is our rule, not the
game's.

**Section** — `nameOffset` uint16, `propertyCount` uint16, then that many properties.

**Property** — `nameOffset` uint16, `valueCount` uint8, then that many values. Three bytes, not
four: there is no padding, and a value is 5 bytes, so nothing in the format is aligned.

**Value** — a `type` uint8 followed by a fixed 4-byte payload read according to it:

| Type    | Tag   | Payload                                                                    |
| ------- | ----- | -------------------------------------------------------------------------- |
| Boolean | `0x0` | **byte 0 of the 4; nonzero is true.** Bytes 1–3 are never read — see below |
| Integer | `0x1` | int32                                                                      |
| Float   | `0x2` | float32                                                                    |
| String  | `0x3` | uint32 offset into the dictionary block                                    |

**The 5-byte stride is unconditional.** The game addresses the _n_-th value of a property as
`base + n*5` before it has looked at any type byte — `get_value_bool` @ `0x6310640` computes
`leal (%edi,%edi,4)`, and `read_value` @ `0x6310279` skips a whole property with
`count*5` without inspecting types at all. A boolean is 4 payload bytes of which one is meaningful,
not a short record. A writer that emits a 1-byte boolean desynchronizes the game's cursor for the
rest of the file.

**Dictionary** — concatenated NUL-terminated ASCII, holding section names, property names and string
values alike, deduplicated by content. Measured: **not one byte above `0x7F` in any of the 1,251
retail dictionaries**, so ASCII is a measurement here, not the usual assumption. Unlike the text
path, which needs windows-1252 for `initialworld.ini`'s U+00A0.

### The uint16/uint32 hazard

Section and property name offsets are **uint16**; string value offsets are **uint32**. A dictionary
larger than 64 KiB can therefore hold string values that are reachable and names that are not, which
is why the convention is to place all names ahead of all values in the dictionary.

Both are unsigned — the game widens a name offset with `movzwl`, so the full 65,535 is addressable.
Librelancer reads all three uint16 fields as _signed_, which is a latent bug in any file whose
dictionary passes 32 KiB.

No retail file exercises the hazard, but not by much: the largest dictionary is
`AUDIO/story_sounds.ini` at **64,492 bytes**, about 1 KiB short of the ceiling, and its largest
string offset is 64,446. The largest _name_ offset anywhere in retail is 4,650
(`MISSIONS/pilots_population.ini`), so the names region is nowhere near the limit — the pressure is
all on the value region, which is exactly what the names-first convention protects against. A writer
must still order the dictionary names-first and throw when the name region passes 64 KiB, because a
compiler that hits it silently produces a file the game misreads.

### Booleans do not occur

Across **876,034 values in 1,251 files, not one is type `0x0`.** The boolean encoding is documented
but unexercised, and the "flag" case that would seem to call for it is encoded as a property with
**zero values** instead (1,063 of those, e.g. `[CollisionGroup] separable` ×456,
`[BaseFaction] offers_missions` ×241, `[NewsItem] audio` ×231).

So the reader must handle type `0x0` — the format defines it — but **the writer should never emit
one**, because a zero-value property is what the compiler demonstrably produced for that case.

What the payload means is no longer open, though the corpus could never have answered it. The
game's type-`0x0` arm is `movb 0x1(%edi), %bl` in `get_value_bool` and `movzbl 0x1(%eax), %edi` in
`get_value_int`: **byte 0 of the payload, nonzero is true.** Not the most significant bit, which is
what the format's usual write-up claims. Emit `01 00 00 00` if you ever emit one at all.

### The compiler preserves nonsense

The BINI compiler emitted whatever the source text held, including lines that are plainly authoring
residue — a half-deleted line or an unclosed comment:

| File                             | Section                            | Property                                       |
| -------------------------------- | ---------------------------------- | ---------------------------------------------- |
| `UNIVERSE/SYSTEMS/IW01/iw01.ini` | `[Object]`                         | `260800` ×6                                    |
| `MISSIONS/M12/m12.ini`           | `[Trigger]`                        | `system St02` — a space inside a property name |
| `FX/fuse_br_battleship.ini`      | `[start_effect]`                   | `ONLY`                                         |
| `FX/fuse_ku_gunship.ini`         | `[start_effect]`                   | `age_fire`                                     |
| `INTERFACE/BASESIDE/navbar.ini`  | `[BaseFrame]`, `[RoomControl1..7]` | `mesh`, `behavior`, `event` ×14                |

All are zero-value properties, all round-trip fine, and none means anything. **The interim layer
carries them through untouched; the typed layer ignores unknown properties rather than throwing.**
An unrecognized property is the normal state of a 2003 data file, not a parse failure.

## Save form

A third encoding, and the shallowest: **text INI under a positional XOR mask**. Files carry the
extension `.fl` and open with the four ASCII bytes `FLS1`; everything after them is the text form,
masked byte by byte. There is no version field and no length — the signature is the whole header.

```
pad[i] = (('Gene'[i % 4] + i) % 256) | 0x80        i counted from the start of the body
body[i] ^= pad[i]
```

Three things follow from the pad depending on **position and nothing else**:

- It is **its own inverse**, so one routine reads and writes. `./ini/save` is one file for that
  reason.
- It is **obfuscation, not encryption**. The sequence repeats every 256 bytes and one known section
  header recovers all of it. The `| 0x80` is the point of the exercise: it forces every output byte
  out of the printable range, so the file does not look editable in a text editor.
- Nothing in the file selects the key. `Gene` does not appear as a string in any retail executable,
  so where the word came from is unknown.

Retail ships two `.fl`, both in `EXE/`, and **only one of them is masked**:

| File                     | Opens with | Contents                                                                    |
| ------------------------ | ---------- | --------------------------------------------------------------------------- |
| `EXE/newplayer.fl`       | `FLS1`     | `[Player]`, `[StoryInfo]`, `[mPlayer]` — 227 properties, the singleplayer start |
| `EXE/mpnewcharacter.fl`  | `[Player]` | plain text, 89 properties, `%%NAME%%` / `%%MONEY%%` / `%%HOME_BASE%%` placeholders the server fills in |

So **check the signature, never the extension** applies here twice over: once between BINI and text,
and again between masked and plain within one extension. `formatOf` reports `binary`, `text` or
`save`, and `read` routes on the signature without being told which it has.

Under the mask is ordinary text, with no dialect of its own — `newplayer.fl` even carries the
**U+00A0 column padding** that [initialworld.ini](#text-form) does, 12 bytes of it on four
`locked_gate` lines. The text reader takes it verbatim.

**Writing never masks unless asked.** A document does not remember what it was read from, so
`write(document, 'save')` is explicit and the default stays `binary`.

## How the game reads a value

From `common.dll`, since it constrains what the typed layer in `@treewyrm/freelancer-game`'s
`docs/SCHEMA.md` is allowed to do. A caller never asks "what type is this value" — there is no such
accessor. It asks for the type
it wants, by index, and the reader coerces:

| Accessor           | tag `0x0` bool        | tag `0x1` int32 | tag `0x2` float32                | tag `0x3` string                                  |
| ------------------ | --------------------- | --------------- | -------------------------------- | ------------------------------------------------- |
| `get_value_bool`   | byte 0 ≠ 0            | `!= 0`          | `!= 0.0`                         | `stricmp` vs `true` / `false`, else `atoi() != 0` |
| `get_value_int`    | byte 0, zero-extended | as-is           | `__ftol` (truncates toward zero) | `atoi`                                            |
| `get_value_float`  | byte 0 → `fild`       | `fild`          | as-is                            | `atof`                                            |
| `get_value_string` | `sprintf("%d")`       | `sprintf("%d")` | `sprintf("%g")`                  | pointer into the dictionary                       |

Six things follow that a reimplementation can get wrong:

1. **Every type is readable as every other type.** There is no type error and no failure return.
   `[Good] price` being authored `int` 812 times and `float` 12 times costs the game nothing, which
   is why the compiler never normalized it — and why our interim layer must keep the tag as read.
2. **Coercion is asymmetric with the text path.** Text goes through `ParseNumber`/`atof` on the raw
   characters; BINI already holds a float32. A value authored `0.1` is `atof("0.1")` as text and the
   nearest float32 widened as BINI. Close, not identical.
3. **A string coerced to bool is case-insensitive** (`stricmp`) and accepts only `true` and `false`
   by name; anything else falls through to `atoi`, so `yes` is **false**. The text path is stricter
   — it accepts `true`/`1`/`false`/`0` and pops a `*** ERROR: Invalid bool value` box otherwise.
   The BINI path never complains.
4. **Numbers rendered back to text use `%d` and `%g`**, not a shortest-round-trip formatter. `%g`
   gives six significant digits, so the game's own float→text is lossy. That is the game's problem,
   not ours: our text writer must round-trip float32 exactly, because our text output is an input to
   _our_ parser as much as to the game's.
5. **Reading past a property's value count is a hard error**, not a default: the game `sprintf`s
   `header [%s] value %s missing parameter %u` and calls `MessageBoxA`. Arity is therefore load-
   bearing, and a writer must not drop trailing values it does not understand.
6. **`is_value_empty` is not "the value is an empty string" on the BINI path** — it is only ever
   true for an out-of-range index. A BINI value is never empty; the text path's version tests the
   substring's first character. This is the sharpest place where "one document model" leaks.
7. **A flag is read by presence, so `separable` and `separable = true` are the same fact.** This
   follows from 5 rather than being measured directly: reading index 0 of a zero-value property pops
   the error box, and **456 bare `[CollisionGroup] separable` properties load without one**, so the
   game cannot be reading them by value. The sweep agrees from the other side — `separable` is the
   only `(section, property)` pair in retail written both bare and with a value, and every one of its
   28 valued occurrences says `true`, **never `false`**. Three other pairs mix the two forms
   (`[Zone] difficulty`, `[ObjList] breakformation`, `[Trigger] system`) and none of them is a flag:
   their valued form carries a difficulty number, a placeholder token and a system name, and the bare
   occurrences are one-off accidents. Status **inferred** — see the TODO.

Two accessors are worth naming because they explain what BINI _looks_ like from inside the engine:

- **`get_value_string()`, the no-index overload, re-renders the whole property.** On the BINI path
  it walks every value of the current property, formats each by the table above, and joins them with
  `", "` into a scratch buffer — producing exactly the text line the property was compiled from. On
  the text path it returns the raw right-hand side as authored. This per-property, on-demand
  re-rendering is very likely the origin of the belief that the game decompiles BINI to text; it is
  one property at a time into one reused buffer, not a file.
- **`get_vector()` is three `get_value_float(0..2)`**, so a `Vector` property is not a distinct
  encoding, just an arity-3 convention. `value_num`, `get_bool`, `get_indexed_value` and
  `get_value_ptr` are plain aliases of the four accessors above.

Section and property _names_ come back the same way in both paths: on BINI, `get_header_ptr` and
`get_name_ptr` return `dictionaryBase + nameOffset` widened with `movzwl`; on text, a pointer into
the line buffer. `get_num_parameters` is the `valueCount` byte on BINI and a `strchr(',')` count on
text — which is where "a property has 0..255 values" comes from on one side and "however many commas
you typed" on the other.

## Case

Names are compared case-insensitively and stored as authored. Six section names are spelled more
than one way in retail:

| Folded            | Spellings                                    |
| ----------------- | -------------------------------------------- |
| `explosion`       | `Explosion` ×86, `explosion` ×70             |
| `objlist`         | `ObjList` ×655, `Objlist` ×17                |
| `exclusion zones` | `Exclusion Zones` ×168, `Exclusion zones` ×1 |
| `asteroids`       | `Asteroids` ×208, `asteroids` ×2             |
| `zone`            | `zone` ×5,765, `Zone` ×4                     |
| `archetype`       | `Archetype` ×17, `archetype` ×1              |

32 property names are likewise multi-spelled. This is the same situation as `Material library`'s
three spellings in [MATERIAL.md](MATERIAL.md), and gets the same answer: **every lookup folds case, no lookup string-
compares**, and the writer emits what was read so a round-trip does not normalize the spelling.

Note `Exclusion Zones` — a section name with a **space** in it. Names are not identifiers.

## Limits, measured

|                           | Retail maximum | Format maximum                     |
| ------------------------- | -------------- | ---------------------------------- |
| Values in one property    | 25             | 255 (`valueCount` is uint8)        |
| Properties in one section | 3,126          | 65,535 (`propertyCount` is uint16) |
| Property name length      | 49             | unbounded (NUL-terminated)         |
| Dictionary size           | < 64 KiB       | 4 GiB for values, 64 KiB for names |

Value arity is overwhelmingly 1 (355,403 of 511,556 properties). Arity 7 spikes at 15,229 almost
entirely from `marketgood`.

## Round-trip

Two guarantees, as on the asset side: **byte-exactness where it is achievable, and writing as a fixed
point everywhere** — what is written reads back identical and writes again to the same bytes.

| Direction                              | Target                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------ |
| BINI → interim → BINI                  | **Byte-exact for all 1,251 files. Measured, not aspired to** — see below |
| text → interim → text                  | Fixed point; comments and layout are **not** preserved unless modelled   |
| BINI → interim → text → interim → BINI | Byte-exact, since text is the richer encoding                            |
| save body → unmasked → save body       | **Byte-exact.** The mask is its own inverse over the exact bytes         |
| save → interim → save                  | Fixed point over both `.fl`, with the text direction's losses and no others |
| interim → typed → interim              | Fixed point for known sections; unknown properties survive               |

**Dictionary ordering is settled, and it is derivable.** The compiler's emission order is exactly:
every section name and property name in first-use order, walking sections in file order and each
section's properties in order; then every string value in first-use order, walking the same way;
one global dedup table shared by names and values, so a string value that equals a name reuses the
name's offset. Nothing is emitted that is not referenced, and there are no gaps between entries.

Re-emitting all 1,251 retail files under that rule reproduces **every file byte for byte**, so the
order is not an artifact of the compiler's hash table and nothing needs to be preserved out-of-band.
It also means the names-first convention is not a convention at all — it falls out of the two-pass
order — but a writer should still assert it, because it is what keeps name offsets inside uint16.

Remaining obstacles, all in the text direction:

- **Float formatting.** A float32 must render to text that re-parses to the same float32, which is a
  shortest-round-trip problem, not a fixed-decimals one. Note the game itself uses `%g` here and is
  therefore lossy; matching the game is the wrong target.
- **Int vs float authoring.** `[Good] price` is authored `int` 812 times and `float` 12 times for
  the same field. The interim layer must keep the tag as read, because dropping it costs
  byte-exactness even though the typed layer discards it. See `@treewyrm/freelancer-game`'s
  `docs/SCHEMA.md#coercion`.

## TODO

Questions the corpus cannot settle, because the answer is a behaviour of the game or its tools
rather than a byte. The reading taken meanwhile is the one that cannot go visibly wrong.

| Question                                                                                                                                                          | Reading taken                                                | Experiment                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Whether the shipped game honours `@include` (`EXE/dacom.ini` opens with `@include FL_Dev.ini`), or whether it was a build-tool directive stripped before shipping | Treat it as a property named `@include` and do not follow it | Add an `@include` to a text INI the game reads and see whether the included content takes effect |
| Whether a zero-value property is read as **true by presence**, per consequence 7 | Presence is true. Derived from consequence 5 plus the sweep, not observed | Author `separable = false` on a collision group and see whether the group still detaches |

**Closed:** whether the game tolerates text where retail ships BINI. It does — a file without the
`BINI` signature falls through to the text parser unconditionally. Note this is a fallback and not,
as previously recorded here, the only path: BINI is parsed natively by a second parser in the same
class. See [the header](#ini-and-bini).

**Closed:** how a boolean value's payload encodes its truth. **Byte 0, nonzero is true**, and the
payload still occupies 4 bytes because the stride is unconditional. The corpus could not have
answered this — no retail value is type `0x0` — but `get_value_bool` and `get_value_int` in
`common.dll` both read that byte and nothing else. See
[Booleans do not occur](#booleans-do-not-occur). The MSB reading that circulates is wrong.

**Closed:** whether retail's dictionary order is derivable. It is, and reproducing it round-trips
all 1,251 files byte-exactly. See [Round-trip](#round-trip).

---

[RETAIL.md](RETAIL.md) · [THN.md](THN.md) ·
`SCHEMA.md` and `MODULES.md` in `@treewyrm/freelancer-game`
