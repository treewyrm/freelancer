# RDL

The markup every `ids_info` resolves to. An infocard is an `RT_HTML` resource holding a small XML
document Freelancer's UI renders as styled text — the other half of [RESOURCE.md](../modules/RESOURCE.md),
which gets the bytes out and stops at the string.

XML read as a stream of instructions, not as a tree. The reader turns each element into a node in
one flat list, whatever it is nested in; a layout pass then walks the list with a cursor, a current
style and a current alignment. Styling is state. Only `TEXT` needs its closing tag.

No module. `readCard` hands back the text, `writeCard` takes it, and the round trip is exact because
nothing in between interprets it.

## Where it lives

Everything below is read out of `EXE/common.dll` (image base `0x06260000`, source file
`Common\RichDisplayList.cpp`), which exports the whole engine: the reader, a node class per
instruction, the layout pass and a GDI renderer. The executable only calls into it. Discovery ships
a `Common.dll` whose colour parser, font handling and merge are byte-identical at shifted addresses.

- **`XMLReader::read_buffer`** (`0x632aad0`) hands the buffer to MSXML 3's SAX reader
  (`SAXXMLReader`) as a UTF-16 string. `startElement` (`0x632aed0`) does all the work;
  `endElement` (`0x632bc80`) matters only for `TEXT`; `characters` (`0x632bd10`) collects text.
  There is no error handler: a malformed card makes `read_buffer` return false, keeping whatever
  nodes it had added before the error.
- **`LayoutRichText`** (`0x63264c0`) word-wraps the list into lines and decides alignment.
- **`DeviceTRC::execute_text`** (`0x63280d0`) draws a run with GDI — a `0x0A0A0A` drop shadow, then
  the text.
- **`XMLWriter::write_buffer`** (`0x632bf60`) is a stub that returns false. The engine reads this
  markup and never writes it.

## The document

```xml
<?xml version="1.0" encoding="UTF-16"?>
<RDL>
  <PUSH/>
  …
  <POP/>
</RDL>
```

The declaration says UTF-16, matching the payload encoding. Retail wraps every card in one `PUSH`
and one `POP`; that is authoring convention, not structure (see [`PUSH` and `POP`](#push-and-pop-set-the-defaults)).

The reader knows nine element names. Retail uses seven:

| Element  | Attributes                                                                  | Node              | Retail |
| -------- | --------------------------------------------------------------------------- | ----------------- | ------ |
| `RDL`    | —                                                                           | none; ignored     | yes    |
| `TRA`    | `data` `mask` `def` `color` `font` `bold` `italic` `underline`              | `TRANode`         | yes    |
| `TEXT`   | —                                                                           | `TextNode`        | yes    |
| `PARA`   | —                                                                           | `ParagraphNode`   | yes    |
| `JUST`   | `loc`                                                                       | `JustifyNode`     | yes    |
| `PUSH`   | —                                                                           | `AttribStackNode` | yes    |
| `POP`    | —                                                                           | `AttribStackNode` | yes    |
| `POS`    | `h` `v` `relH` `relV`                                                       | `PositionNode`    | **no** |
| `STYLE`  | `id` (`name` is read and ignored)                                           | `StyleNode`       | **no** |

Any other element or attribute is skipped without a warning. The root is not checked: `RDL` does
nothing, and a card rooted in anything else reads the same.

Processing model:

```
reader:  one node per element, appended in document order; text only between <TEXT> and </TEXT>

layout:  attributes = caller's current style, defaults = caller's defaults, alignment = left
  TRA   → attributes = merge(attributes, data, mask, def)
  PUSH  → push attributes onto the defaults stack
  POP   → pop the defaults stack
  JUST  → alignment = loc
  TEXT  → append a run in `attributes` to the line, wrapping it when it overflows
  POS   → move the cursor
  STYLE → splice the registered style's nodes in here
  PARA  → emit the line and start the next

  every line is emitted with the alignment current at the moment it is emitted
```

## Names match by prefix

Every element, attribute and keyword value is compared with `wcsncmp(name, KEY, length of name)`,
case-sensitively, in a fixed order — so any prefix of a known name matches the first key it
prefixes. `<P/>` is `PARA`, `<PU/>` is `PUSH`, `d="…"` on a `TRA` is `def` (checked before `data`),
and an empty keyword value equals every keyword. Nothing in retail or Discovery relies on it, but a
reader that matches exactly will disagree with the game on a card that does.

## Text

`TEXT` becomes an empty run when it opens. The parser's `characters` callbacks append to that run
until `</TEXT>`, and only while the last node in the list is still that run. Text anywhere else is
dropped, and so is text inside a `TEXT` after a child element: in `<TEXT>a<PARA/>b</TEXT>` the `b` is
lost. A `TEXT` opened inside another `TEXT` is ignored.

Because a real XML parser is underneath, every entity it knows works — retail uses `&gt;`, `&lt;` and
`&amp;`, Discovery adds `&quot;` — along with numeric character references and CDATA. Whitespace
inside `TEXT` is kept exactly as written.

A whitespace-only run is a deliberate blank line. Discovery also writes genuinely empty `TEXT`
elements; each is still a node, just a zero-width one.

## `TRA` merges, and unmasked bits keep their current value

`TRANode::Execute` (`0x6328540`), exactly:

```
next = (current & ~mask) | (mask & ((data & ~def) | (defaults & def)))
```

- bits outside `mask` — keep what they were
- bits in `mask` but not `def` — take from `data`
- bits in `mask` and `def` — take from the defaults (see [`PUSH` and `POP`](#push-and-pop-set-the-defaults))

The reader stores `data & mask`, so `data` bits outside `mask` never survive. `mask` is never
`0xFFFFFFFF` in retail and its commonest value is `1`. The idiom is a bracketed pair around a run:

```xml
<TRA data="1" mask="1" def="-2"/>   <!-- bold on, nothing else touched -->
<TEXT>…</TEXT>
<TRA data="0" mask="1" def="-1"/>   <!-- bold back to the default -->
```

Without the `current & ~mask` term, turning bold on inside a coloured, sized paragraph would reset
the colour and the font to zero.

## Attribute values are signed decimal

`mask="-32"`, not `mask="4294967264"`. `data`, `mask`, `def` and `STYLE id` are read with `wcstol`
base 10, which clamps anything above `0x7FFFFFFF` to `0x7FFFFFFF` — so a word with bit 31 set **must**
be written negative. The sign is how the value survives the parser, not a hint that anything else is
there.

A value longer than two characters that starts with a lowercase `0x` is read with `wcstoul` base 16
instead. Discovery writes a handful that way. `0X` is not recognised: it parses as decimal `0`.

## The packed style word

```
bits 31–8   colour, a Windows COLORREF: blue 31–24, green 23–16, red 15–8
bits  7–3   font index (5 bits)
bit     2   underline
bit     1   italic
bit     0   bold
```

The renderer confirms the split. It indexes a table of 256 GDI fonts with the whole low byte —
every font × bold × italic × underline combination is a separate font — and passes
`word >> 8` to `SetTextColor` as-is. There are no bits above the colour.

The colour is byte-swapped from how it is usually written: `0xRRGGBB` is stored as `0xBBGGRR` in the
high 24 bits, so `data="65280"` (`0x0000FF00`) is red, not green.

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

## The named attributes

`TRA` also takes the style bits by name. There is no separate form: every attribute on the element
is applied in document order to the same three words, `data`, `mask` and `def`, which start at zero.
`data`, `mask` and `def` each overwrite their whole word; the named attributes set bits in `data` and
`mask` (and, for `default`, in `def`). So `<TRA bold="true" mask="0"/>` does nothing, and
`<TRA mask="0" bold="true"/>` turns bold on.

```xml
<TRA color="red" bold="true" italic="default"/>
```

| Attribute   | Bits  | Values                                                                               |
| ----------- | ----- | ------------------------------------------------------------------------------------ |
| `bold`      | 0     | `true`, `false`, `default`; anything else warns and reads `false`                    |
| `italic`    | 1     | same                                                                                 |
| `underline` | 2     | same                                                                                 |
| `font`      | 3–7   | a number, **1-based** — `font="1"` is index 0; or `default`                          |
| `color`     | 8–31  | `#RRGGBB`, a colour name, a number, or `default`                                     |

`default` sets the attribute's bits in both `mask` and `def`, so it takes them from the defaults.
`true`, `false`, a font and a colour set the bits in `mask` and `data` and leave `def` alone — an
earlier `def` on the same element that covers them still wins.

**`font`** stores *n* − 1 (`0x632b30b`), so `font="0"` wraps to index 31.

**`color`** takes one of four shapes:

- **`#RRGGBB`** — exactly six digits after the `#`; any other length warns "Invalid color name in
  RDLX file. Assuming white." and gives white. `#RGB` is not supported. Each byte is read with its
  two digits **swapped** (`0x632b15b`): `#RRGGBB` means red = second digit × 16 + first, and so on,
  so `#804020` is `#084002` and `#00bf00` is `#00fb00`. A non-hex character reads as 0.
- **A name**, from the table below — the game's UI palette, not CSS colours.
- **A number**, when the value starts with a digit: *n* − 1, as the raw `0xBBGGRR` field. `color="1"`
  is black and `color="0"` wraps to white.
- **`default`**.

| Name      | Colour    | Also `rich_fonts.ini`'s                              |
| --------- | --------- | ---------------------------------------------------- |
| `gray`    | `#808080` |                                                      |
| `blue`    | `#4848E0` |                                                      |
| `green`   | `#3BBF1D` | `STYLE_PRIVATE`                                      |
| `aqua`    | `#87C3E0` | `STYLE_DIALOG` and the other dialog styles           |
| `red`     | `#BF1D1D` | `STYLE_ERROR`                                        |
| `fuchsia` | `#8800C2` |                                                      |
| `yellow`  | `#F5EA52` | `STYLE_LOCTABLE_SELECT`, `STYLE_SMALL_HEADER_ACTIVE` |
| `white`   | `#FFFFFF` | `STYLE_CONSOLE`                                      |

Matched in that order (names at `0x63ec9ac`, values at `0x63ec98c`), so `g` is `gray`. There is no
`black`; an unknown name warns and gives white.

Retail never uses the named form; Discovery does. A writer should prefer the packed form; a reader
must take both.

## `PUSH` and `POP` set the defaults

`PUSH` and `POP` are one class, `AttribStackNode` (`0x6329380`), with an operation code:

| Code | Element | Does                                                                      |
| ---- | ------- | ------------------------------------------------------------------------- |
| 0    | `PUSH`  | push the *current* attributes onto the defaults stack                     |
| 1    | `POP`   | pop the defaults stack                                                    |
| 2    | —       | empty the defaults stack; nothing in the XML reaches it                   |

The defaults a `def` bit restores are the top of that stack, or the caller's defaults while it is
empty. So retail's leading `PUSH` pins "the style the card started in" as the target of every
`def="-1"`, and the trailing `POP` hands the stack back as it found it.

Neither delimits content: nodes after `POP` are read and drawn like any others. A `POP` on an empty
stack unlinks and frees the list's own sentinel — memory corruption, not an error — so a writer must
keep them balanced.

## `JUST` is read when a line is emitted

`JustifyNode` does nothing when executed. `LayoutRichText` keeps the alignment in one local variable
set to left when layout starts and written only by a `JUST`, and reads it each time it emits a line —
at a `PARA`, at a wrap, and at the end of the list. Left places the line at the origin, centre at half
the leftover width, right at all of it.

Two consequences:

- **Alignment persists across `PARA`.** It changes only when another `JUST` changes it.
- **Where a `JUST` sits inside a paragraph matters only relative to wraps.** A `JUST` after a
  paragraph's text still aligns the lines not yet emitted, including the line that `PARA` ends.

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

`loc` is decided by its first character alone (`0x632ba05`): `c` or `C` is centre, `r` or `R` is
right, and anything else — including `justify` — is left. Retail writes `left` and `center`;
Discovery adds `right`.

## `PARA`

Ends the line being built, which layout then emits. It measures as the current font's cell height
(`0x6329710`), so a `PARA` with no text before it still produces a blank line of that height.

## `POS`

Moves the cursor (`0x6329610`). `h` and `v` are whole numbers — decimal only, with no `0x` form —
stored as floats. `relH="true"` and `relV="true"` make each one an offset from the current position
rather than an absolute position.

In layout a relative `h` measures as that many units of width, so it acts as a horizontal advance
that wraps like a word. An absolute position measures as nothing, and layout places every run it
emits at a position it computed itself, so an absolute `POS` inside laid-out text has no effect on
where the text lands.

## `STYLE`

Calls up a style registered in code. `id` is a 16-bit key into `StyleCollection`, a map from key to a
node list; layout splices that list in where the `StyleNode` stands, and an unknown key gives an empty
list. `name` is compared and then discarded.

The executable registers the keys — 28 attribute-only styles and one full list at `0x468c20` in the
unprotected build (see [ENGINE.md](ENGINE.md#the-executable-is-securom-wrapped)), one more list at
`0x57e924` — under keys like `0xd5ec` and `0x73f7`, with attributes filled in at run time.
`server.dll` constructs `StyleNode`s too. No infocard names one.

## Beyond the XML

`common.dll` has node classes no element produces: `ImageNode`, `ClipNode`, `RDLRefNode` (another
list, spliced in during layout like a style), `TextPtrNode` (a run over borrowed text) and `NullNode`,
plus `AttribStackNode`'s code 2. The executable constructs the first four directly.

There is also a binary encoding of the same list. `BinaryRDLReader::read_buffer` (`0x632a3f0`) reads
records headed by a `u32` type and a `u32` length:

| Type | Node            | Payload                               |
| ---- | --------------- | ------------------------------------- |
| 1    | `TRANode`       | attributes, mask — no `def`           |
| 2    | `TextNode`      | text                                  |
| 3    | —               | rejected                              |
| 4    | `PositionNode`  | flags, two floats                     |
| 5    | `ParagraphNode` | —                                     |
| 6    | `StyleNode`     | 16-bit key                            |

No `JUST`, `PUSH` or `POP`. `server.dll` writes it with `BinaryRDLWriter`; no infocard uses it — all
5,307 open with the XML declaration.

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

Two paragraphs: a bold centred heading, then body text in the card's starting style, left-aligned.
The second `TRA` restores bold from the defaults the `PUSH` pinned; the second `JUST` is needed
because the first one persists.

## Notes

### Rendering whitespace

A renderer that collapses whitespace the way HTML does must substitute a non-breaking space for
whitespace-only runs, and must then avoid flattening the non-breaking spaces an author wrote inside
real sentences — retail uses them to hold a double space after a full stop.

### Closed questions

Three questions this document once left open for in-game observation are settled by
`common.dll`: alignment persists across `PARA` ([`JUST`](#just-is-read-when-a-line-is-emitted)),
there are no live bits above the colour — negative masks are forced by `wcstol`
([signed decimal](#attribute-values-are-signed-decimal)) — and content after `POP` is drawn
([`PUSH` and `POP`](#push-and-pop-set-the-defaults)).

## Corpus

Measured across retail's 5,307 infocards and cross-checked against Discovery's 17,439.

|                                                          | Retail           | Discovery  |
| -------------------------------------------------------- | ---------------- | ---------- |
| Cards                                                    | 5,307            | 17,439     |
| — opening with the exact UTF-16 declaration              | all              | all        |
| — with exactly one leading `PUSH` and one trailing `POP` | all              | all        |
| Element names occurring, of the nine the reader knows    | 7, and no others | the same 7 |
| `TRA` elements                                           | 3,123            | 17,409     |
| — packed form                                            | **3,123**        | 16,445     |
| — named-attribute form                                   | **0**            | 964        |
| `JUST` elements                                          | 1,756            | 10,045     |
| Packed attribute values                                  | 9,369            | 49,335     |
| — written in decimal                                     | **9,369**        | 49,323     |
| — written in `0x` hex                                    | 0                | 12         |

Neither corpus uses `POS` or `STYLE`.

### `JUST`

All 1,756 retail `JUST` elements and all 10,045 of Discovery's precede any `TEXT` in their
paragraph, so the rule that a later `JUST` still aligns the paragraph never comes into play.

Retail writes 898 `center` against 858 `left` — restating `left` after every `center`, which
persistence requires. Those 898 `center` elements cover 1,635 paragraphs. Discovery adds `right`, 20
times.

### `TRA`

Bracketing counts come in matched pairs: 1,039 and 1,022 for bold, 178 and 177 for bold+underline,
146 and 146 for italic.

Discovery has 2 cards that keep a colour across a `TRA` whose `mask` does not reach the colour bits,
which is the `current & ~mask` term at work.

Retail's 103 colour-setting `TRA`s are 102 red and one blue; Discovery adds grey and others. Retail
and Discovery only ever set font indices 0, 1, 2 and 3 of the eight the file offers, and Discovery
never uses the named `font`.

Discovery's `#RRGGBB` colours are `#ff0000`, `#00ff00` and `#00bf00`. The first two read the same
with their digits swapped; `#00bf00` is drawn as `#00fb00`.

### Text

Retail holds 3,820 whitespace-only `TEXT` runs against zero empty ones. Discovery writes 287
genuinely empty ones.

---

[RESOURCE.md](../modules/RESOURCE.md) · [RETAIL.md](RETAIL.md) · [INI.md](../modules/INI.md) · [ENGINE.md](ENGINE.md)
