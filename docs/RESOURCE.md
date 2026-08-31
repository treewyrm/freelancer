# Resource DLLs

Where `ids_name` and `ids_info` go. Every INI in the game carries these numbers and none of them
carries the text: an `ids_name` is a string in a Win32 `RT_STRING` table and an `ids_info` is RDL markup
in an `RT_HTML` resource, both living in a set of DLLs listed by `EXE/freelancer.ini`. Export names are
in [API.md](API.md#resource).

**These DLLs contain no code.** Six of the seven have a null entry point, no imports and no `.text`
section at all — they are PE containers wrapped around a resource directory and nothing else. That is
what makes writing them tractable: the module **emits an image rather than patching one**, and needs to
emit no x86 whatsoever.

They are in **`EXE/`**, beside `freelancer.ini` — not in `DLLS/`, which holds only `BIN/content.dll`,
and that carries a version block and nothing else.

**Reading `[Resources]` is not this module's job.** The consumer parses `freelancer.ini`, prepends
`resources.dll` — which loads first and is not listed anywhere — and hands the paths to `readLibrary`.
The two are kept apart so a resource DLL can be read without an INI parser, and so a mod that reorders
the list is not fighting a constant compiled into this module.

## The id space

A global id is `library * 0x10000 + local`, so the DLL is `id >> 16` and the resource is `id & 0xffff`.
**Nothing in a file records its own index — it is purely positional**, which is why inserting a DLL
anywhere but the end of the `[Resources]` list renumbers everything after it.

The name and infocard spaces are **numerically the same and semantically different** — `ids_name`
196,608 and `ids_info` 196,608 are different resources in the same DLL, and only the field that referred
to one says which was meant. Retail never uses an id for both, but nothing in the format prevents it, so
**the two maps are kept apart rather than merged**.

**More than seven libraries works** — measured, not assumed. See [Corpus](#more-than-seven-libraries).

## The container

An ordinary PE32. The fields that matter, all identical across the seven:

| Field                 | Value                                             |
| --------------------- | ------------------------------------------------- |
| Machine               | `0x14c`, i386                                     |
| Optional header magic | `0x10b`, PE32 — never PE32+                       |
| Characteristics       | `0x210e` — `DLL`, and **`RELOCS_STRIPPED` clear** |
| Subsystem             | `2`, Windows GUI                                  |
| Linker version        | `6.0`                                             |
| Section alignment     | `0x1000`                                          |
| File alignment        | **`0x1000`** — equal to section alignment         |
| `DllCharacteristics`  | `0` — no ASLR, no DEP                             |
| `.reloc`              | present, 8–12 bytes: one empty block              |

Two of those are worth dwelling on.

**File alignment equals section alignment**, which is unusual — `0x200` is the norm — and very
convenient: when the two are equal **a section's file offset *is* its RVA**, and neither reader nor
writer needs any address translation. The writer keeps it for that reason.

**Relocations are not stripped**, and the `.reloc` section holds a single terminator block. A
resource-only image contains no absolute addresses to fix, so the block is empty; but leaving the image
relocatable is what lets the loader rebase it when its preferred base is taken, and stripping
relocations would turn that into a failed `LoadLibrary`. The writer says the same thing in eight bytes.

## The resource directory

Three levels — type → name/id → language — of `IMAGE_RESOURCE_DIRECTORY` tables, ending in
`IMAGE_RESOURCE_DATA_ENTRY` descriptors. **The three levels are flattened deliberately**, and both
required orderings are re-derived on write, which is what lets an unordered list reproduce retail's
`.rsrc` byte for byte.

```
IMAGE_RESOURCE_DIRECTORY        16 bytes   characteristics, timestamp, version, named count, id count
IMAGE_RESOURCE_DIRECTORY_ENTRY   8 bytes   name-or-id, then offset-or-subdirectory
IMAGE_RESOURCE_DATA_ENTRY       16 bytes   RVA, size, code page, reserved
```

Both words of an entry use the high bit as a tag: set on the first means the low 31 bits are the offset
of a counted UTF-16 name rather than an integer id, and set on the second means a subdirectory rather
than a leaf. **Every offset in the directory is relative to the directory's own first byte — except
`IMAGE_RESOURCE_DATA_ENTRY.OffsetToData`, which is an image RVA.** That one field is the classic way to
get this wrong.

Three rules the format enforces and a naive writer will miss:

- **Entries are sorted**: named first, ordinal by upper-cased name, then numbered ascending.
  `FindResource` binary-searches each level, so an unsorted directory does not fail loudly — **it fails
  for some ids and not others**, depending on where the search lands.
- **Payloads are DWORD-aligned.** Every retail data RVA is a multiple of four.
- Alignment gaps are filled with `PADDINGXXPADDING`, cycled from its first byte at each gap. Cosmetic,
  and reproduced anyway.

Retail stamps version `4.0` into every directory table, and zero into characteristics and timestamp.

## `RT_STRING` — every `ids_name`

**A string resource is not a string.** The table is blocked sixteen to an entry: string `index` is in
resource `(index >> 4) + 1` at slot `index & 15`. A block is a bare sequence of sixteen counted UTF-16LE
runs — no terminators, no offsets, no slot numbers — so **it is readable only from the start**, and a
table holding one string still costs a full block.

The count is in **UTF-16 code units**, not characters and not bytes, so an astral-plane character counts
as two. Reading and writing both work in code units, which is also what lets an unpaired surrogate
survive a round trip.

**A hole and an empty string are indistinguishable in the file** — both are a zero-length run — so the
reader reports a zero-length slot as absent rather than as `''`. A block can be holes all the way
through, which decodes to nothing and so leaves no trace in a string map; `writeLibrary` carries such a
block through rather than letting a round trip quietly shrink the file.

## `RT_HTML` — every `ids_info`

Not blocked: **the resource id *is* the infocard's local number**, one card per entry. The payload is
UTF-16LE text — **RDL markup**, which [RDL.md](RDL.md) documents and this module deliberately does not
model: `readCard` hands the text back and `writeCard` takes it, and **the round trip is exact because
nothing in between interprets it.**

Every retail card opens with a byte order mark followed by `<?xml version="1.0" encoding="UTF-16"?>`.
The mark is stripped on read and restored on write, because it belongs to the encoding; the declaration
is left alone, because it is part of the document and it is what the game's RDL parser reads first.

## Language and code page

The reader takes any language and the writer accepts one, defaulting to `0x409`. **The uniformity retail
shows is a measurement, not a rule the module enforces** — localised releases are the obvious unknown,
and `EXE` itself already holds counterexamples.

`languageOf` decides which language a rewrite is *of*. It returns the one language every content
resource shares, and `undefined` when they disagree — because `readLibrary` with no filter merges **per
slot**, so a bilingual library comes back as a union taking the highest LANGID that filled each slot,
and stamping that back onto one language is a quiet corruption. **A consumer that cannot name a single
language should treat the library as read-only rather than pick one.**

## Writing

`write` **mints a resource-only image**: `.rsrc` and `.reloc`, no code, no imports, entry point zero.
The loader skips `DllMain` when there is none, which is exactly how the six `/NOENTRY` libraries already
ship.

The PE checksum is computed — a 16-bit ones-complement sum over the image with the field excluded, plus
the file length. Windows enforces it only for drivers and images loaded into critical processes, so a
wrong one still loads; retail's are all correct, and a file that claims a checksum and has the wrong one
is worse than one that claims none.

**This mints an image rather than rewriting one.** Reading a DLL that has other sections and writing it
back yields its resources in a new resource-only image, not the original with `.rsrc` replaced. For the
six that are already resource-only the distinction does not arise; for `resources.dll` it means the
23-byte `DllMain` stub is gone — see [TODO](#todo).

`inspect` reads the header fields a rewrite costs something in — image base, entry point, section names
— so a consumer can carry the base across and warn about sections `write` will not reproduce, without
parsing a PE header of its own.

### Rewriting a library

`writeStrings` and `writeInfocards` build a resource list from text and know nothing about what was
there before, which is the right shape for minting a library and the wrong one for editing an existing
one: **everything they were not given simply is not in the output.** `writeLibrary` is the editing half
— original list in, new text in, complete list out — and the whole of it is one rule:

> **Carry through exactly what the readers did not consume.**

Not "keep what is not a string or a card". The readers skip more than that, and each thing they skip is
a way for a rewrite to delete a resource silently, since what was never in the map is never missed:

| Skipped by the readers                   | Because                                               |
| ---------------------------------------- | ----------------------------------------------------- |
| A type that is not `RT_STRING`/`RT_HTML` | The version block every library carries               |
| An entry id that is a **name**           | There is no local index to key it by — `PREPSTUBDATA` |
| A resource at another language           | `readStrings`/`readInfocards` filter by LANGID        |
| A string block that is all holes         | It decodes to nothing                                 |

The last one has a partner that is **not** carried: a block the caller emptied. The two are absent from
the new map for opposite reasons, and telling them apart needs the original — all holes when it was
read, or emptied since. Resurrecting the second would undo a deletion.

---

## Corpus

Retail yields **13,121 names and 5,307 infocards** across the seven libraries, and
`src/resource/corpus.test.ts` asserts every figure back through the reader.

| #   | Library                   | Sections | Entry point | Image base  |   `.rsrc` | Strings | Cards | Highest local id |
| --- | ------------------------- | -------: | ----------- | ----------- | --------: | ------: | ----: | ---------------: |
| 0   | `resources.dll`           |        4 | `0x1000`    | `0x6c40000` |   731,876 |   3,873 |     0 |           60,252 |
| 1   | `InfoCards.dll`           |        2 | **`0x0`**   | `0x6720000` |   904,380 |       0 |   886 |            1,079 |
| 2   | `MiscText.dll`            |        3 | **`0x0`**   | `0x6820000` | 2,307,440 |       0 | 3,101 |            3,869 |
| 3   | `NameResources.dll`       |        3 | **`0x0`**   | `0x6af0000` |   291,140 |   7,156 |     0 |       **65,186** |
| 4   | `EquipResources.dll`      |        3 | **`0x0`**   | `0x6630000` |   770,624 |     824 |   824 |            4,611 |
| 5   | `OfferBribeResources.dll` |        3 | **`0x0`**   | `0x6b40000` |   126,124 |   1,268 |     0 |            4,341 |
| 6   | `MiscTextInfo2.dll`       |        2 | **`0x0`**   | `0x6a60000` |   347,744 |       0 |   496 |              496 |

**Only `resources.dll` has code** — a 23-byte `.text` holding a `DllMain` stub, plus a single import.
The other six are `/NOENTRY` images, which is the shape this module writes.

```
8b 44 24 08        mov  eax, [esp+8]              ; fdwReason
48                 dec  eax                       ; DLL_PROCESS_ATTACH?
75 0a              jnz  +10
ff 74 24 04        push [esp+4]                   ; hinstDLL
ff 15 00 20 c4 06  call [0x06c42000]              ; DisableThreadLibraryCalls
6a 01 / 58         push 1 / pop eax               ; return TRUE
c2 0c 00           ret  12
```

A thread-notification optimisation and nothing else.

**The bands are nearly full.** `NameResources.dll` reaches local index 65,186 of a possible 65,535,
leaving 349; `resources.dll` reaches 60,252. A mod adding names has essentially nowhere to put them in
either and needs a library of its own.

### More than seven libraries

Discovery lists **eight** `DLL =` entries, so with `resources.dll` prepended it runs nine libraries
across bands `0x00000`–`0x80000`, with `Discovery.dll` at index 7 and `DsyAddition.dll` at index 8. So
`freelancer.exe` reads the list rather than a fixed-size array. Discovery's two are `NameResources.dll`
copied and refilled — same image base, same 28-byte `.rdata`.

Two more things that mod settles, both of which a careful reading of retail alone would get wrong:

- **A distinct image base is a nicety, not a requirement.** Retail gives each of the seven its own so
  none has to be rebased at load, but Discovery ships three libraries all based at `0x6af0000` and runs.
  The `.reloc` terminator block is what makes that safe, which is also why `write` deliberately leaves
  `RELOCS_STRIPPED` clear.
- **The two-section shape `write` emits is one the game already loads.** `InfoCards.dll` is exactly
  `.rsrc` + `.reloc` with a null entry point, in retail and in Discovery, at index 1. The third section
  the other libraries carry is a 4 KB `.rdata` holding 28 bytes of `IMAGE_DEBUG_DIRECTORY` and nothing
  else.

### Strings and cards

| | Count |
| --- | --- |
| `RT_STRING` blocks | 1,334, **all carrying exactly sixteen slots** |
| String slots | 21,344 |
| — filled | 13,121 |
| — holes (zero-length) | 8,223 |
| All-hole blocks | **141**, all in `OfferBribeResources.dll` |
| `RT_HTML` infocards | 5,307 |
| `RT_VERSION` blocks | 7 |

None of the 1,334 blocks truncates its trailing empties. The 141 vacant blocks are 61% of
`OfferBribeResources.dll`'s 232, from id 88 upward where the mission-offer tables go sparse; carrying
them through is what keeps a rewrite from shrinking that file by 11,280 bytes.

The longest string is **2,133 code units**, a personal-log infocard body sitting in a *name* table.

All 5,307 cards open with the BOM and XML declaration; none is empty and none has an odd byte length.

Every content resource in the seven libraries is **`0x409`** (`LANG_ENGLISH`/`SUBLANG_ENGLISH_US`) with
code page **1252** on the data entry. The only departure is the seven `RT_VERSION` blocks, at neutral
`0x0`. Elsewhere in `EXE`, `imeui.dll` is Japanese (`0x411`) and `zlib.dll` French (`0x40c`).

### Round-trip

| Layer                             | Result                                                      |
| --------------------------------- | ----------------------------------------------------------- |
| image → resources → image         | **Exact** over all 37 DLLs in `EXE`                         |
| resources → `.rsrc` section       | **Byte-identical to retail**, 5 of 7 exactly, 2 as a prefix |
| strings → resources → strings     | Identity over all 13,121                                    |
| infocards → resources → infocards | Identity over all 5,307                                     |
| library → text → library          | **Byte-identical** for all seven, via `writeLibrary`        |

**The middle row is the sharp one.** Rebuilding a retail `.rsrc` from its own resources, at the address
retail loaded it at, reproduces the section byte for byte — layout, ordering, alignment, descriptor RVAs
and filler alike. `resources.dll`, `InfoCards.dll` and `NameResources.dll` match to the last byte.
`MiscText.dll` and `EquipResources.dll` carry 5,184 and 748 further bytes past the last payload — a run
of `PADDINGXXPADDING` then a run of zeroes, 3,792 + 1,392 and 172 + 576 — which is slack the linker left
and which the rebuilt section simply does not have, so it is a strict prefix.

The layout rule that produces this was reproduced rather than invented: every directory table in
breadth-first order, then every data descriptor in the same walk order, then the name strings, then the
payloads. **A structural comparison would pass on a dozen layouts; this one passes on one** — the same
reason the BINI writer reproduces the dictionary order rather than picking its own
([INI.md](INI.md#round-trip)).

Nothing here is Freelancer-specific. All 37 DLLs in `EXE` read and rewrite, including
`serverresources.dll`'s nine resource types and `ebueula.dll`'s **named** type `PREPSTUBDATA` — the
install's only named entry, and the reason an id is modelled as `number | string`.

### Quirks

| Quirk                            | Where                                | Detail                                                              |
| -------------------------------- | ------------------------------------ | --------------------------------------------------------------------- |
| A name table holding an infocard | `resources.dll`                      | The longest "name" is a 2,133-unit personal log, at local 1553       |
| Two libraries nearly full        | `NameResources.dll`, `resources.dll` | Highest local id 65,186 and 60,252 of 65,535                        |
| A named resource type            | `ebueula.dll`                        | `PREPSTUBDATA` — the installer's, not the game's                    |
| Non-English resources in `EXE`   | `imeui.dll`, `zlib.dll`              | `0x411` and `0x40c`; scope any language sweep to the seven libraries |
| Linker slack inside `.rsrc`      | `MiscText.dll`, `EquipResources.dll` | 5,184 and 748 bytes past the last payload, filler then zeroes       |
| `resources.dll` is not listed    | `EXE/freelancer.ini`                 | Index 0 is hardcoded; `[Resources]` starts at index 1                |

---

## TODO

Pending *observation in the running game* rather than pending code. Each is an unread meaning, never an
unread byte — everything listed here already round-trips.

**Whether the game loads a rewritten `resources.dll` with no entry point.** The writer drops the 23-byte
`DllMain` stub, because it mints resource-only images. Reading taken meanwhile: it loads. Six of the
seven libraries already ship with entry point `0x0`, and the loader documents skipping `DllMain` when
there is none, so the stub is doing nothing the others need. The corpus cannot settle it because the
stub's absence is only visible to `LoadLibrary`.
*Experiment*: replace `resources.dll` with a rewritten one and start the game.

**Whether the language must be `0x409`.** All 6,646 content resources are US English, so the corpus
cannot distinguish "the game asks for `0x409`" from "the game asks for whatever is there".
`FindResource`'s documented fallback order would accept a neutral resource, but Freelancer may not use
`FindResource`. Reading taken meanwhile: write `0x409`, which is what retail does, and make it a
parameter rather than a constant.
*Experiment*: write a library at `LANG_NEUTRAL` and see whether its strings resolve in game.

**Whether the code page field is read at all.** Every retail data entry says 1252, and the payloads are
UTF-16 regardless, which makes the field look vestigial. Carried through a round trip rather than
normalised, because a value that is preserved costs nothing and a value that is invented cannot be taken
back.
*Experiment*: change it and observe — expected to be invisible.

---

[RDL.md](RDL.md) · [INI.md](INI.md) · [THN.md](THN.md) · [RETAIL.md](RETAIL.md)
