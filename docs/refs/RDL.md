# RDL

The markup every `ids_info` resolves to. An infocard is an `RT_HTML` resource holding a small XML
document Freelancer's UI renders as styled text — the other half of [RESOURCE.md](../modules/RESOURCE.md),
which gets the bytes out and stops at the string.

XML that does not describe a document tree. No nesting, no scope: the root holds one flat sequence
of elements, each an instruction to a cursor writing into a paragraph buffer. Styling is state.
There are no closing tags.

No module. `readCard` hands back the text, `writeCard` takes it, and the round trip is exact because
nothing in between interprets it.

## The document

```xml
<?xml version="1.0" encoding="UTF-16"?>
<RDL>
  <PUSH/>
  …
  <POP/>
</RDL>
```

The declaration says UTF-16, matching the payload encoding. Exactly one `PUSH` as the first element
and one `POP` as the last.

Seven element names occur and no others:

| Element        | Meaning                                         |
| -------------- | ----------------------------------------------- |
| `RDL`          | Root                                            |
| `PUSH`         | Start of content                                |
| `POP`          | End of content; anything after it is not read   |
| `TRA`          | Set the current text style                      |
| `TEXT`         | Append a run in the current style               |
| `JUST loc="…"` | Set the alignment for the paragraph being built |
| `PARA`         | Commit the paragraph and start the next         |

Processing model:

```
state: attributes = caller's defaults, alignment = left, paragraph = none

TRA  → attributes = merge(attributes, data, mask, def)
JUST → alignment = loc
TEXT → open the paragraph if needed, giving it `alignment`; append a run in `attributes`
PARA → commit the paragraph; the next TEXT opens a new one
POP  → commit any open paragraph and stop
```

## `JUST` precedes the text it aligns, and persists

`JUST` sets alignment state and is written *before* the paragraph's first `TEXT`:

```xml
<TRA data="1" mask="1" def="-2"/>
<JUST loc="center"/>
<TEXT>BERYLLIUM</TEXT>
<PARA/>
<TRA data="0" mask="1" def="-1"/>
<JUST loc="left"/>
<TEXT> </TEXT>
<PARA/>
```

A reader that applies `JUST` to an already-open paragraph applies it to nothing. Persistence across
`PARA` is an inference — see [Persistence](#persistence) and [TODO](#todo).

`loc` is `left` or `center` in retail; Discovery adds `right`.

## `TRA` merges, and unmasked bits keep their current value

Three terms:

```
next = (current & ~mask) | (data & mask & ~def) | (defaults & mask & def)
```

- bits outside `mask` — keep what they were
- bits in `mask` but not `def` — take from `data`
- bits in `mask` and `def` — take from the caller's defaults

`mask` is never `0xFFFFFFFF` and its commonest value is `1`. The idiom is a bracketed pair around a
run:

```xml
<TRA data="1" mask="1" def="-2"/>   <!-- bold on, nothing else touched -->
<TEXT>…</TEXT>
<TRA data="0" mask="1" def="-1"/>   <!-- bold back to the default -->
```

Without the `current & ~mask` term, turning bold on inside a coloured, sized paragraph resets the
colour and the size to zero.

## Attribute values are signed decimal

`mask="-32"`, not `mask="0xFFFFFFE0"`. Discovery writes a handful in `0x` hex, so a reader must take
both.

## The packed style word

```
bits 31–8   colour, byte-swapped: blue 31–24, green 23–16, red 15–8
bits  7–3   font index (5 bits)
bit     2   underline
bit     1   italic
bit     0   bold
```

The colour is byte-swapped: `0xRRGGBB` is stored as `0xBBGGRR` in the high 24 bits, so
`data="65280"` (`0x0000FF00`) is red, not green.

The font is an index into `DATA/FONTS/rich_fonts.ini`, whose `[TrueType]` section is the table:

| Index | Family           | Points | Index | Family    | Points |
| ----- | ---------------- | ------ | ----- | --------- | ------ |
| 0     | Arial Unicode MS | 22     | 4     | Agency FB | 100    |
| 1     | Agency FB        | 30     | 5     | Agency FB | 24     |
| 2     | Arial Unicode MS | 26     | 6     | Agency FB | 34     |
| 3     | Agency FB        | 38     | 7     | Agency FB | 22     |

The field is five bits wide; the file offers eight entries. The table is game data, not part of RDL.

`rich_fonts.ini`'s `[Style]` section is the named-style table the UI renders a card *in* —
`STYLE_TITLE` is font 3, centred; `STYLE_ERROR` is font 0, red. That is where a caller's defaults
come from.

## The unpacked `TRA`

The same element also accepts named attributes. The two forms are told apart by whether
`data`/`mask`/`def` are all present.

```xml
<TRA color="yellow" font="0" bold="true" italic="false" underline="default"/>
```

Each flag is `true`, `false` or `default`; `color` is `#RRGGBB`, `#RGB`, or one of `white`, `gray`,
`black`, `red`, `green`, `blue`, `yellow`, `aqua`, `fuchsia`. `#RGB` expands by repeating each
nibble, so `#F80` is `#FF8800`.

Retail never uses this form; Discovery does. A writer should prefer the packed form; a reader must
take both.

## Text

`TEXT` content is verbatim, with the usual XML entities — retail uses `&gt;`, `&lt;` and `&amp;`,
Discovery adds `&quot;`.

A whitespace-only run is a deliberate blank line. Discovery also writes genuinely empty `TEXT`
elements, which still open a paragraph and so still carry an alignment.

## Example

```xml
<?xml version="1.0" encoding="UTF-16"?>
<RDL>
  <PUSH/>
  <TRA data="1" mask="1" def="-2"/>
  <JUST loc="center"/>
  <TEXT>BERYLLIUM</TEXT>
  <PARA/>
  <TRA data="0" mask="1" def="-1"/>
  <JUST loc="left"/>
  <TEXT>In its processed metallic form, Beryllium is …</TEXT>
  <PARA/>
  <POP/>
</RDL>
```

Two paragraphs: a bold centred heading, then body text at the default style, left-aligned. Both the
`TRA` and the `JUST` are undone explicitly rather than expiring.

## Notes

### Persistence

An inference, not a certainty — see [TODO](#todo). The evidence is retail's pairing of `center` with
a following `left`, tallied in [Corpus](#just).

### Rendering whitespace

A renderer that collapses whitespace the way HTML does must substitute a non-breaking space for
whitespace-only runs, and must then avoid flattening the non-breaking spaces an author wrote inside
real sentences — retail uses them to hold a double space after a full stop.

## Corpus

Measured across retail's 5,307 infocards and cross-checked against Discovery's 17,439.

|                                                          | Retail           | Discovery  |
| -------------------------------------------------------- | ---------------- | ---------- |
| Cards                                                    | 5,307            | 17,439     |
| — opening with the exact UTF-16 declaration              | all              | all        |
| — with exactly one leading `PUSH` and one trailing `POP` | all              | all        |
| Element names occurring                                  | 7, and no others | the same 7 |
| `TRA` elements                                           | 3,123            | 17,409     |
| — packed form                                            | **3,123**        | 16,445     |
| — named-attribute form                                   | **0**            | 964        |
| `JUST` elements                                          | 1,756            | 10,045     |
| Packed attribute values                                  | 9,369            | 49,335     |
| — written in decimal                                     | **9,369**        | 49,323     |
| — written in `0x` hex                                    | 0                | 12         |

### `JUST`

All 1,756 retail `JUST` elements and all 10,045 of Discovery's precede any `TEXT` in their
paragraph.

Retail writes 898 `center` against 858 `left`. If alignment reset at each `PARA`, writing `left`
again would be redundant. Under persistence those 898 `center` elements cover 1,635 paragraphs.
Discovery adds `right`, 20 times.

### `TRA`

Bracketing counts come in matched pairs: 1,039 and 1,022 for bold, 178 and 177 for bold+underline,
146 and 146 for italic.

Discovery has 2 cards that keep a colour across a `TRA` whose `mask` does not reach the colour bits;
retail has none, so retail alone cannot separate first-term from defaults. The bracketing is the
argument and the 2 cards agree with it.

Retail's 103 colour-setting `TRA`s are 102 red and one blue; Discovery adds grey and others. Retail
and Discovery only ever set font indices 0, 1, 2 and 3 of the eight the file offers.

### Text

Retail holds 3,820 whitespace-only `TEXT` runs against zero empty ones. Discovery writes 287
genuinely empty ones.

## TODO

Pending observation in the running game rather than pending code.

**Whether alignment really persists across `PARA`.** Retail restates `left` after every `center`, so
both readings render all 5,307 cards identically. Reading taken meanwhile: it persists.
*Experiment*: write a card with a `JUST loc="center"` and two paragraphs after it, and look at the
second.

**What `mask` bits above the colour do.** Retail's masks are written as negative decimals reaching
the top of the word — `-32` sets bits 5 through 31 — which only matters if something up there is
live. Reading taken meanwhile: they are colour bits and the sign is how the author's tool spelled
`0xFFFFFFE0`. *Experiment*: set a bit above 31–8 with a mask that reaches it and see whether
anything changes.

**Whether `POP` can be followed by more content.** No card has anything after it, so nothing
distinguishes "stops" from "ends". Reading taken meanwhile: stop, and treat trailing content as
unreachable.

---

[RESOURCE.md](../modules/RESOURCE.md) · [RETAIL.md](RETAIL.md) · [INI.md](../modules/INI.md)
