# RDL

The markup every `ids_info` resolves to. An infocard is an `RT_HTML` resource holding a small XML
document that Freelancer's UI renders as styled text — the other half of
[RESOURCE.md](RESOURCE.md), which gets the bytes out and stops at the string.

**It is XML that does not describe a document tree.** There is no nesting and no scope: the root
holds one flat sequence of elements, and each is an instruction to a cursor writing into a paragraph
buffer. Styling is *state* — set it, and every run after it is styled that way until something sets
it again. A parser that expects `<b>…</b>` will look for a closing tag that does not exist.

**This library does not model RDL.** `readCard` hands back the text and `writeCard` takes it, and
the round trip is exact because nothing in between interprets it. This document exists because the
meaning is still ours to record, the same way [AUDIO.md](AUDIO.md) records a format with no module —
and because the obvious reading of two of these rules is wrong, in ways the corpus catches and a
specification would not.

Every count here was measured across retail's **5,307** infocards and cross-checked against
Discovery's **17,439**, by `freelancer-editor`'s `npm run rdl`.

## The document

```xml
<?xml version="1.0" encoding="UTF-16"?>
<RDL>
  <PUSH/>
  …
  <POP/>
</RDL>
```

All 5,307 retail cards and all 17,439 of Discovery's open with that exact declaration — **UTF-16**,
matching the payload encoding, which is what the game's parser reads first. All of them have exactly
one `PUSH` as the first element and one `POP` as the last.

Seven element names occur and no others:

| Element                  | Meaning                                                              |
| ------------------------ | -------------------------------------------------------------------- |
| `RDL`                    | Root                                                                 |
| `PUSH`                   | Start of content                                                     |
| `POP`                    | End of content; anything after it is not read                        |
| `TRA`                    | Set the current text style                                           |
| `TEXT`                   | Append a run in the current style                                    |
| `JUST loc="…"`           | Set the alignment for the paragraph being built                      |
| `PARA`                   | Commit the paragraph and start the next                              |

The processing model is four lines:

```
state: attributes = caller's defaults, alignment = left, paragraph = none

TRA  → attributes = merge(attributes, data, mask, def)
JUST → alignment = loc
TEXT → open the paragraph if needed, giving it `alignment`; append a run in `attributes`
PARA → commit the paragraph; the next TEXT opens a new one
POP  → commit any open paragraph and stop
```

## Two rules whose obvious reading is wrong

Both are here because implementing the plain-language description produces something that passes
inspection and silently loses content on every retail card.

### `JUST` precedes the text it aligns, and persists

Not "sets the alignment of the current paragraph". It sets alignment **state**, and it is written
*before* the paragraph's first `TEXT`:

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

**Every one of retail's 1,756 `JUST` elements and Discovery's 10,045 comes before any `TEXT` in its
paragraph** — not most, all. A reader that applies `JUST` to an already-open paragraph therefore
applies it to nothing and drops the alignment of the entire corpus, which is exactly what the
editor's converter did until this was measured.

That it *persists* rather than resetting per paragraph is an inference, and the evidence is the
pairing: retail writes 898 `center` against 858 `left`. If alignment reset at each `PARA`, writing
`left` again would be redundant — it is written because it is undoing the `center` before it. Under
persistence those 898 `center` elements cover 1,635 paragraphs. The two readings render every
retail card identically, because retail always restates, so this is the reading that explains the
data rather than one the data forces.

`loc` is `left` or `center` in retail; Discovery adds `right`, 20 times.

### `TRA` merges, and unmasked bits keep their current value

The resolution is three terms, not two:

```
next = (current & ~mask) | (data & mask & ~def) | (defaults & mask & def)
```

- bits outside `mask` — **keep what they were**
- bits in `mask` but not `def` — take them from `data`
- bits in `mask` and `def` — take them from the caller's defaults

Dropping the first term is the natural mistake, and retail makes it fatal: `mask` is **never
`0xFFFFFFFF`**. Its commonest value is `1`. The idiom is a bracketed pair around a run —

```xml
<TRA data="1" mask="1" def="-2"/>   <!-- bold on, nothing else touched -->
<TEXT>…</TEXT>
<TRA data="0" mask="1" def="-1"/>   <!-- bold back to the default -->
```

— and the counts come in matched pairs, which is what says they are brackets: 1,039 and 1,022 for
bold, 178 and 177 for bold+underline, 146 and 146 for italic. Without the `current & ~mask` term,
turning bold on inside a coloured, sized paragraph would reset the colour and the size to zero.

Discovery has 2 cards that keep a colour across a `TRA` whose `mask` does not reach the colour bits;
retail has none, so retail alone cannot quite settle first-term-versus-defaults. The bracketing is
the argument, and the 2 cards agree with it.

### Attribute values are signed decimal

`mask="-32"`, not `mask="0xFFFFFFE0"`. All 9,369 packed values in retail are decimal, and negative
numbers are how a mask with the high bits set is written. Discovery writes 12 of its 49,335 in
`0x` hex, so a reader must take both.

## The packed style word

```
bits 31–8   colour, byte-swapped: blue 31–24, green 23–16, red 15–8
bits  7–3   font index (5 bits)
bit     2   underline
bit     1   italic
bit     0   bold
```

**The colour is byte-swapped.** `0xRRGGBB` is stored as `0xBBGGRR` in the high 24 bits, so
`data="65280"` (`0x0000FF00`) is red, not green. Retail's 103 colour-setting `TRA`s are 102 red and
one blue; Discovery adds grey and a handful of others.

The font is an index into **`DATA/FONTS/rich_fonts.ini`**, whose `[TrueType]` section is the table:

| Index | Family           | Points | Index | Family     | Points |
| ----- | ---------------- | ------ | ----- | ---------- | ------ |
| 0     | Arial Unicode MS | 22     | 4     | Agency FB  | 100    |
| 1     | Agency FB        | 30     | 5     | Agency FB  | 24     |
| 2     | Arial Unicode MS | 26     | 6     | Agency FB  | 34     |
| 3     | Agency FB        | 38     | 7     | Agency FB  | 22     |

So the table is **game data, not part of RDL** — a card carries an index and the install decides
what it means, which is a consumer's business exactly like the load order is. The field is five bits
wide and the file offers eight entries; retail and Discovery only ever set 0, 1, 2 and 3.

`rich_fonts.ini`'s other section, `[Style]`, is the named-style table the UI renders a card *in* —
`STYLE_TITLE` is font 3, centred; `STYLE_ERROR` is font 0, red. That is where a caller's defaults
come from, which is why the merge above has a defaults term at all.

## The unpacked `TRA`

The same element also accepts named attributes, and the two forms are told apart by whether
`data`/`mask`/`def` are all present:

```xml
<TRA color="yellow" font="0" bold="true" italic="false" underline="default"/>
```

Each flag is `true`, `false` or `default`; `color` is `#RRGGBB`, `#RGB`, or one of `white`, `gray`,
`black`, `red`, `green`, `blue`, `yellow`, `aqua`, `fuchsia`. `#RGB` expands by repeating each
nibble, so `#F80` is `#FF8800`.

**Retail never uses this form** — all 3,123 of its `TRA`s are packed. Discovery uses it 964 times
against 16,445 packed, which is what says the engine accepts it rather than it being a convention of
some tool. A writer should prefer the packed form; a reader must take both.

## Text

`TEXT` content is verbatim, with the usual XML entities — retail uses `&gt;`, `&lt;` and `&amp;`,
Discovery adds `&quot;`.

**A whitespace-only run is a deliberate blank line**, and there are 3,820 of them in retail against
zero empty ones. Discovery writes 287 genuinely empty `TEXT` elements, which still open a paragraph
and so still carry an alignment — an empty run is not nothing.

A renderer that collapses whitespace the way HTML does has to substitute a non-breaking space for
those, and must then be careful not to flatten the non-breaking spaces an author wrote inside real
sentences; retail uses them to hold a double space after a full stop.

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
`TRA` and the `JUST` are undone explicitly rather than expiring — that is the whole shape of the
format in one card.

## TODO

Pending _observation in the running game_ rather than pending code.

**Whether alignment really persists across `PARA`.**
Retail restates `left` after every `center`, so both readings render all 5,307 cards identically and
the corpus cannot separate them. Reading taken meanwhile: it persists, because restating is
otherwise unexplained and because `TRA` — the format's other state — plainly does.
_Experiment_: write a card with a `JUST loc="center"` and two paragraphs after it, and look at the
second.

**What `mask` bits above the colour do.**
The word has 32 bits and this accounts for all of them, yet retail's masks are written as negative
decimals reaching the top of the word — `-32` sets bits 5 through 31 — which only matters if
something up there is live. Reading taken meanwhile: they are colour bits and the sign is just how
the author's tool spelled `0xFFFFFFE0`.
_Experiment_: set a bit above 31–8 with a mask that reaches it and see whether anything changes.

**Whether `POP` can be followed by more content.**
Processing stops there in every reader, and no card has anything after it, so nothing distinguishes
"stops" from "ends". Reading taken meanwhile: stop, and treat trailing content as unreachable.

---

[RESOURCE.md](RESOURCE.md) · [RETAIL.md](RETAIL.md) · [INI.md](INI.md)
