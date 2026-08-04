# The typed layer

Turning an interim `Document` into structures with real types, and back. The interim layer knows
that `[Good]` holds a property called `price`; this layer knows that a good has a price, that it is
a number, and that `[Good]` in `EQUIPMENT/goods.ini` is the same shape as `[Good]` anywhere else.

Everything here is a design position argued from the retail sweep, not yet code. Counts come from
[RETAIL.md](RETAIL.md).

## What the retail data forces

Four measurements decide most of the design before any API is chosen.

### The value type tag is authoring residue

**266 `(section, property)` pairs carry more than one value-type signature across retail** — the
same field, compiled to different types in different files, because the source text was untyped and
the compiler inferred a type per occurrence:

| Field                      | Signatures                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------ |
| `[Good] price`             | `int` ×812, `float` ×12                                                                    |
| `[Light] bulb_size`        | `float` ×37, `int` ×9                                                                      |
| `[Good] bad_sell_price`    | `float` ×21, `int` ×19                                                                     |
| `[CockpitCamera] znear`    | `int` ×2, `float` ×1                                                                       |
| `[FactionGood] marketgood` | `str,int,int` ×572, `str,str,int` ×54                                                      |
| `[BaseGood] marketgood`    | `str,int,int,int,int,int,int` ×9,066, `str,int,float,int,int,int,int` ×2,226, and two more |

`price = 100` compiles to an int and `price = 100.0` to a float, and the game reads both as a
number. **So the typed layer coerces to the declared type and never switches on the tag.** A schema
field declared `number` accepts `int`, `float`, and a `string` that parses as a number — the last of
which is what the text encoding always produces.

This mirrors the engine rather than merely tolerating it. `INI_Reader` has no "what type is this"
accessor at all: a caller asks for the type it wants by index and gets a coercion, with every tag
readable as every other tag and no failure return. The full matrix is in
[INI.md](INI.md#how-the-game-reads-a-value), and two entries there constrain a schema field's
declared type — a string read as a bool accepts only `true`/`false` by name (so `yes` is **false**),
and a float read as an int truncates toward zero rather than rounding.

The interim layer still keeps the tag as read, because it is needed for byte-exact BINI output. The
typed layer discards it and the writer re-infers on the way out, which is why `typed → interim` is a
fixed point rather than byte-exact. See [INI.md](INI.md#round-trip).

### Arity varies on the same field

**108 pairs vary in how many values they carry**, and the pattern is trailing-optional rather than
alternative forms:

| Field                         | Arities              |
| ----------------------------- | -------------------- |
| `[BaseGood] marketgood`       | 7 ×12,865, 8 ×1,829  |
| `[Gun] lodranges`             | 2 ×53, 4 ×221, 5 ×45 |
| `[Sound] range`               | 1 ×11, 2 ×369        |
| `[Explosion] lifetime`        | 1 ×23, 2 ×133        |
| `[MVoiceProp] supports_roles` | 1, 2, 3 and 7        |
| `[TurretCamera] tether`       | 3 ×31, 4 ×2          |

Two shapes fall out: a **tuple with optional tail** (`marketgood`, `range`, `tether`) and a **list of
unbounded length** (`lodranges`, `supports_roles`). A schema needs both, and a tuple field must
declare which positions are optional rather than assuming a fixed width. Reading `[Sound] range` as
a fixed pair silently invents a second number for 11 sounds.

### Every property is independently optional

Same conclusion as `Material` in utf2json, for the same reason: **the section name does not predict
which properties are present.** No `[Object]` carries every `Object` property; most carry a handful.
So a typed structure models each property as optional, and **a property that was absent stays absent
on write-back** rather than being emitted with a default. Defaults belong to the consumer, not the
serializer — a default written out is a claim about the game's behaviour that the file did not make.

### Repeated properties are lists, and their order matters

`[Loadout] equip` ×16,074, `[Zone] density_restriction` ×15,316, `[BaseGood] marketgood` ×14,694,
`[GF_NPC] rumor` ×7,803. A repeated property is **one field holding an ordered list**, not a value
that overwrites. Which fields repeat is a per-field schema declaration, and getting it wrong is
silent data loss — the last-wins reading looks correct until a base sells one commodity.

## Shape of a schema

The requirement is a declaration that drives reading _and_ writing from one definition, so the two
cannot drift, and that yields a TypeScript type rather than requiring one to be written twice.

```ts
// sketch, not settled
const Base = section('Base', {
  nickname: required(string), // the identity — see below
  system: required(string),
  strid_name: optional(number),
  file: optional(path), // backslash-separated, resolved against DATA
  BGCS_base_run_by: optional(string),
})
```

with field kinds covering what the data actually does:

| Kind     | For                               | Example                        |
| -------- | --------------------------------- | ------------------------------ |
| scalar   | one value                         | `nickname`, `price`            |
| tuple    | fixed positions, optional tail    | `range = 100, 3000`, `tether`  |
| list     | unbounded values on one line      | `lodranges`, `supports_roles`  |
| repeated | the property occurring many times | `equip`, `marketgood`, `rumor` |
| flag     | zero-value property               | `separable`, `offers_missions` |

**Unknown properties are preserved, not dropped and not fatal.** Retail contains properties that are
outright authoring residue (`[Object] 260800`, `[start_effect] ONLY` — see
[INI.md](INI.md#the-compiler-preserves-nonsense)), and a modded install contains fields this library
has never heard of. A typed structure keeps its unrecognized properties in the interim form so a
read-modify-write cycle does not quietly delete a third party's data.

Three questions the sketch above deliberately leaves open, to be settled when the first two domain
modules exist rather than guessed now:

1. Whether schemas are runtime objects that infer their TypeScript type, or hand-written types with
   separate read/write functions per section — the first is less to maintain, the second is more
   readable and matches how utf2json's readers are written today.
2. Whether one schema per section is enough, or whether a section's shape genuinely depends on the
   file it appears in. `[Sound]` is the test case: 1,817 occurrences carry a `nickname` and 23,997
   do not, and the split is by file (voice banks vs sound definitions), not by content.
3. Whether validation is strict (throw on a type mismatch) or lenient (report and continue).
   Leaning lenient with a diagnostics channel, because the corpus is the authority and it contains
   nonsense that the game itself tolerates.

## Identity and nicknames

**108 of the 256 section names always carry a `nickname`; 136 never do; 3 sometimes.** That split is
the useful structural fact in the whole data set:

- **Nicknamed sections are archetypes** — `[Ship]`, `[Gun]`, `[Good]`, `[Zone]`, `[Base]`,
  `[System]`, `[Solar]`, `[Loadout]`, `[Effect]` — referenced by name from elsewhere, and therefore
  the entries that go into a lookup table.
- **Un-nicknamed sections are either singletons** (`[Time]`, `[Hud]`, `[PhySysConsts]`) **or
  positional** (`[Object]` in a system file, `[BaseGood]`, `[Room_Info]`) — meaningful by where they
  are, not by what they are called.
- **The three that vary** are `[Sound]` (1,817 / 23,997), `[Voice]` (109 / 90) and `[TrueType]`
  (21 / 1). Each is a real split to model, not an inconsistency to smooth over.

Cross-references are by nickname string, and the game hashes them with **`getObjectId`** (id32) —
the same function utf2json uses for INI nicknames, and the one that names `DATA/AUDIO` voice files.
`getResourceId` (CRC32) is the _other_ hash and belongs to UTF resources; using it here silently
fails to match. Both already exist in `@treewyrm/utf2json`, which is the argument for depending on
that package rather than restating them:

**Recommendation: depend on `@treewyrm/utf2json`** for `getObjectId`, `getResourceId` and
`BufferView`. BINI needs a little-endian cursor over a buffer and `BufferView` already is one; the
hashes must agree between the two libraries or cross-referencing a UTF asset from an INI breaks.
The alternative — duplicating three files to keep ini2json standalone — trades a dependency for a
correctness risk in the one place the two libraries have to agree.

## Cross-file references

The data is a graph of files, and the reference is a property whose value is a path:

| Property                                 | Occurrences | Points at                                       |
| ---------------------------------------- | ----------- | ----------------------------------------------- |
| `[EncounterParameters] filename`         | 1,163       | encounter scripts                               |
| `[Room] file`                            | 464         | base room definitions                           |
| `[TexturePanels] file`                   | 243         | texture panel libraries                         |
| `[Asteroids] file`                       | 210         | asteroid field definitions                      |
| `[Base] file`                            | 197         | per-base files under `UNIVERSE/SYSTEMS/…/BASES` |
| `[Nebula] file`                          | 60          | nebula definitions                              |
| `[System] file`                          | 53          | per-system files                                |
| `[Ship] cockpit`                         | 40          | cockpit definitions                             |
| `[Trigger] act_AddRTC` / `act_RemoveRTC` | 99          | `.thn` scenes — see [THN.md](THN.md)            |

Paths are **backslash-separated and relative to `DATA`** (`Universe\Systems\Li01\Bases\Li01_01_Base.ini`),
authored with Windows case-insensitivity and therefore frequently disagreeing with the real
filename's case. Resolution needs both separator translation and a case-insensitive lookup, exactly
as utf2json's path lookups fold case through `getResourceId`.

The library should offer resolution as an explicit opt-in step — `readSystem(path)` returning one
file's sections, and a separate resolver that walks the graph — so that reading one file never
implies touching the filesystem for another. `UNIVERSE/universe.ini` is the practical root: it lists
every `[Base]` and `[System]` with its file.

`strid_name` and `ids_info` values are numeric resource IDs into the game's DLLs
(`strid_name = 196766`), not strings in the data. Resolving them means reading PE resource tables,
which is **out of scope** — the typed layer keeps them as numbers and names them clearly.

## Round-trip

The typed layer is a fixed point, not byte-exact — coercion discards the int/float distinction the
BINI encoding recorded. What must hold:

1. `interim → typed → interim` preserves section order, property order within a section, repeated
   property order, and every unrecognized property.
2. `typed → interim → typed` is identity.
3. An absent property stays absent; a zero-value property stays zero-value.

Byte-exactness is the _encoding_ layer's guarantee. A tool that must not perturb bytes edits the
interim document; a tool that wants meaning takes the typed structure and accepts the fixed point.

## TODO

| Question                                                                                                               | Reading taken                   | Experiment                                                                      |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------- |
| Whether the game reads a repeated _scalar_ property as first-wins or last-wins, where the schema says it is not a list | Preserve both; do not choose    | Duplicate a scalar in a text INI the game loads and observe which value applies |
| Whether `[Sound]`'s two shapes are one section the game disambiguates by file, or two sections sharing a name          | Model as two, split by file     | Move a voice-bank `[Sound]` into `sounds.ini` and see whether it loads          |
| Whether trailing values beyond a field's known arity are read or ignored (`[Gun] lodranges` at 5)                      | Keep them; expose the full list | Extend a known field by one value and look for a behaviour change               |

---

[INI.md](INI.md) · [MODULES.md](MODULES.md) · [RETAIL.md](RETAIL.md) · [THN.md](THN.md)
