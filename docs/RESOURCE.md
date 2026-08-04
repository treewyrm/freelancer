# Resource DLLs

Where `ids_name` and `ids_info` go. Every INI in the game carries these numbers and none of them
carries the text: a `ids_name` is a string in a Win32 `RT_STRING` table and a `ids_info` is RDL
markup in an `RT_HTML` resource, both living in a set of DLLs listed by `EXE/freelancer.ini`.

**These DLLs contain no code.** Six of the seven have a null entry point, no imports and no `.text`
section at all — they are PE containers wrapped around a resource directory and nothing else. That
is what makes writing them tractable: the module emits an image rather than patching one, and needs
to emit no x86 whatsoever.

Every number here was measured from the retail install rather than recalled, and
`src/resource/corpus.test.ts` asserts them back through the reader.

## Where they are and what order they load in

They are in **`EXE/`**, beside `freelancer.ini` — not in `DLLS/`, which holds only
`BIN/content.dll`, and that carries a version block and nothing else.

`resources.dll` loads first and is not listed anywhere; the rest are the `[Resources]` block of
`freelancer.ini`, in the order written there.

| #   | Library                   | Sections | Entry point | Image base  |   `.rsrc` | Strings | Cards | Highest local id |
| --- | ------------------------- | -------: | ----------- | ----------- | --------: | ------: | ----: | ---------------: |
| 0   | `resources.dll`           |        4 | `0x1000`    | `0x6c40000` |   731,876 |   3,873 |     0 |           60,252 |
| 1   | `InfoCards.dll`           |        2 | **`0x0`**   | `0x6720000` |   904,380 |       0 |   886 |            1,079 |
| 2   | `MiscText.dll`            |        3 | **`0x0`**   | `0x6820000` | 2,307,440 |       0 | 3,101 |            3,869 |
| 3   | `NameResources.dll`       |        3 | **`0x0`**   | `0x6af0000` |   291,140 |   7,156 |     0 |       **65,186** |
| 4   | `EquipResources.dll`      |        3 | **`0x0`**   | `0x6630000` |   770,624 |     824 |   824 |            4,611 |
| 5   | `OfferBribeResources.dll` |        3 | **`0x0`**   | `0x6b40000` |   126,124 |   1,268 |     0 |            4,341 |
| 6   | `MiscTextInfo2.dll`       |        2 | **`0x0`**   | `0x6a60000` |   347,744 |       0 |   496 |              496 |

Only `resources.dll` has code — a 23-byte `.text` holding a `DllMain` stub, plus a single import.
The other six are `/NOENTRY` images, which is the shape this module writes.

## The id space

A global id is `library * 0x10000 + local`, so the DLL is `id >> 16` and the resource is
`id & 0xffff`. Nothing in a file records its own index — it is purely positional, which is why
inserting a DLL anywhere but the end of the `[Resources]` list renumbers everything after it.

**The bands are nearly full.** `NameResources.dll` reaches local index 65,186 of a possible 65,535,
leaving 349; `resources.dll` reaches 60,252. A mod adding names has essentially nowhere to put them
in either and needs a library of its own.

The name and infocard spaces are numerically the same and semantically different — `ids_name`
196,608 and `ids_info` 196,608 are different resources in the same DLL, and only the field that
referred to one says which was meant. **Retail never uses an id for both**, measured across all
13,121 names and 5,307 infocards, but nothing in the format prevents it, so the two maps are kept
apart rather than merged.

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
convenient: when the two are equal a section's file offset _is_ its RVA, and neither reader nor
writer needs any address translation. The writer keeps it for that reason.

**Relocations are not stripped**, and the `.reloc` section holds a single terminator block. A
resource-only image contains no absolute addresses to fix, so the block is empty; but leaving the
image relocatable is what lets the loader rebase it when its preferred base is taken, and stripping
relocations would turn that into a failed `LoadLibrary`. The writer says the same thing in eight
bytes.

## The resource directory

Three levels — type → name/id → language — of `IMAGE_RESOURCE_DIRECTORY` tables, ending in
`IMAGE_RESOURCE_DATA_ENTRY` descriptors.

```
IMAGE_RESOURCE_DIRECTORY        16 bytes   characteristics, timestamp, version, named count, id count
IMAGE_RESOURCE_DIRECTORY_ENTRY   8 bytes   name-or-id, then offset-or-subdirectory
IMAGE_RESOURCE_DATA_ENTRY       16 bytes   RVA, size, code page, reserved
```

Both words of an entry use the high bit as a tag: set on the first means the low 31 bits are the
offset of a counted UTF-16 name rather than an integer id, and set on the second means a
subdirectory rather than a leaf. **Every offset in the directory is relative to the directory's own
first byte — except `IMAGE_RESOURCE_DATA_ENTRY.OffsetToData`, which is an image RVA.** That one
field is the classic way to get this wrong.

Three rules the format enforces and a naive writer will miss:

- **Entries are sorted**: named first, ordinal by upper-cased name, then numbered ascending.
  `FindResource` binary-searches each level, so an unsorted directory does not fail loudly — it
  fails for some ids and not others, depending on where the search lands.
- **Payloads are DWORD-aligned.** Every retail data RVA is a multiple of four.
- Alignment gaps are filled with `PADDINGXXPADDING`, cycled from its first byte at each gap.
  Cosmetic, and reproduced anyway — see [round-trip](#round-trip).

Retail stamps version `4.0` into every directory table, and zero into characteristics and timestamp.

## `RT_STRING` — every `ids_name`

**A string resource is not a string.** The table is blocked sixteen to an entry: string `index` is
in resource `(index >> 4) + 1` at slot `index & 15`. A block is a bare sequence of sixteen counted
UTF-16LE runs — no terminators, no offsets, no slot numbers — so it is readable only from the start,
and a table holding one string still costs a full block.

The count is in **UTF-16 code units**, not characters and not bytes, so an astral-plane character
counts as two. Reading and writing both work in code units, which is also what lets an unpaired
surrogate survive a round trip.

All 1,334 retail blocks carry exactly sixteen slots — none truncates its trailing empties — for
21,344 slots of which **13,121 are filled**. The other 8,223 are holes, encoded as zero-length runs.
A hole and an empty string are indistinguishable in the file, so the reader reports a zero-length
slot as absent rather than as `''`.

The longest string is 2,133 code units, a personal-log infocard body sitting in a _name_ table.

## `RT_HTML` — every `ids_info`

Not blocked: the resource id **is** the infocard's local number, one card per entry. The payload is
UTF-16LE text.

All 5,307 in retail open with a byte order mark followed by
`<?xml version="1.0" encoding="UTF-16"?>`. None is empty and none has an odd byte length. The mark
is stripped on read and restored on write, because it belongs to the encoding; the declaration is
left alone, because it is part of the document and it is what the game's RDL parser reads first.

## Language and code page

Every content resource in the seven libraries is **`0x409`**, `LANG_ENGLISH`/`SUBLANG_ENGLISH_US`,
with code page **1252** on the data entry. The only departure is the seven `RT_VERSION` blocks,
which sit at neutral `0x0`.

That uniformity is a measurement, not a rule the module enforces: the reader takes any language and
the writer accepts one, defaulting to `0x409`. Localised retail releases are the obvious unknown,
and `EXE` itself already holds counterexamples — `imeui.dll` is Japanese (`0x411`) and `zlib.dll`
French (`0x40c`).

## Round-trip

| Layer                             | Result                                                      |
| --------------------------------- | ----------------------------------------------------------- |
| image → resources → image         | **Exact** over all 37 DLLs in `EXE`                         |
| resources → `.rsrc` section       | **Byte-identical to retail**, 5 of 7 exactly, 2 as a prefix |
| strings → resources → strings     | Identity over all 13,121                                    |
| infocards → resources → infocards | Identity over all 5,307                                     |

The middle row is the sharp one. Rebuilding a retail `.rsrc` from its own resources, at the address
retail loaded it at, reproduces the section **byte for byte** — layout, ordering, alignment,
descriptor RVAs and filler alike. `resources.dll`, `InfoCards.dll` and `NameResources.dll` match to
the last byte. `MiscText.dll` and `EquipResources.dll` carry 5,184 and 748 further bytes past the
last payload — a run of `PADDINGXXPADDING` then a run of zeroes, 3,792 + 1,392 and 172 + 576 — which
is slack the linker left and which the rebuilt section simply does not have, so it is a strict
prefix.

The layout rule that produces this was reproduced rather than invented: every directory table in
breadth-first order, then every data descriptor in the same walk order, then the name strings, then
the payloads. **A structural comparison would pass on a dozen layouts; this one passes on one**,
which is the same reason the BINI writer reproduces the dictionary order rather than picking its
own ([INI.md](INI.md#round-trip)).

Nothing here is Freelancer-specific. All 37 DLLs in `EXE` read and rewrite, including
`serverresources.dll`'s nine resource types and `ebueula.dll`'s **named** type `PREPSTUBDATA` — the
install's only named entry, and the reason an id is modelled as `number | string`.

## Writing

`write` mints a resource-only image: `.rsrc` and `.reloc`, no code, no imports, entry point zero.
The loader skips `DllMain` when there is none, which is exactly how the six `/NOENTRY` libraries
already ship.

The PE checksum is computed — a 16-bit ones-complement sum over the image with the field excluded,
plus the file length. Windows enforces it only for drivers and images loaded into critical
processes, so a wrong one still loads; retail's are all correct, and a file that claims a checksum
and has the wrong one is worse than one that claims none.

**This mints an image rather than rewriting one.** Reading a DLL that has other sections and writing
it back yields its resources in a new resource-only image, not the original with `.rsrc` replaced.
For the six that are already resource-only the distinction does not arise. For `resources.dll` it
means the `DllMain` stub is gone — safe on the evidence of the other six, and the one claim here
that only the running game can settle.

## Quirks

| Quirk                            | Where                                | Detail                                                               |
| -------------------------------- | ------------------------------------ | -------------------------------------------------------------------- |
| A name table holding an infocard | `resources.dll`                      | The longest "name" is a 2,133-unit personal log, at local 1553       |
| Two libraries nearly full        | `NameResources.dll`, `resources.dll` | Highest local id 65,186 and 60,252 of 65,535                         |
| A named resource type            | `ebueula.dll`                        | `PREPSTUBDATA` — the installer's, not the game's                     |
| Non-English resources in `EXE`   | `imeui.dll`, `zlib.dll`              | `0x411` and `0x40c`; scope any language sweep to the seven libraries |
| Linker slack inside `.rsrc`      | `MiscText.dll`, `EquipResources.dll` | 5,184 and 748 bytes past the last payload, filler then zeroes        |
| `resources.dll` is not listed    | `EXE/freelancer.ini`                 | Index 0 is hardcoded; `[Resources]` starts at index 1                |

## TODO

Pending _observation in the running game_ rather than pending code. Each is an unread meaning, never
an unread byte — everything listed here already round-trips.

**Whether the game loads a rewritten `resources.dll` with no entry point.**
The writer drops the 23-byte `DllMain` stub, because it mints resource-only images. Reading taken
meanwhile: it loads. Six of the seven libraries already ship with entry point `0x0`, and the loader
documents skipping `DllMain` when there is none, so the stub is doing nothing the others need. The
corpus cannot settle it because the stub's absence is only visible to `LoadLibrary`.
_Experiment_: replace `resources.dll` with a rewritten one and start the game.

**Whether an eighth library is honoured.**
`[Resources]` lists six and the executable prepends one. Whether `freelancer.exe` reads the list or
a fixed-size array is not visible in the data, and it decides whether a mod can add a library rather
than having to fit inside `NameResources.dll`'s 349 free ids. Reading taken meanwhile: none — the
module neither assumes nor prevents it, and `partition` will produce as many libraries as it is
asked for.
_Experiment_: add an eighth `DLL =` line and reference an id at `0x70000`.

**Whether the language must be `0x409`.**
All 6,646 content resources are US English, so the corpus cannot distinguish "the game asks for
`0x409`" from "the game asks for whatever is there". `FindResource`'s documented fallback order
would accept a neutral resource, but Freelancer may not use `FindResource`. Reading taken meanwhile:
write `0x409`, which is what retail does, and make it a parameter rather than a constant.
_Experiment_: write a library at `LANG_NEUTRAL` and see whether its strings resolve in game.

**Whether the code page field is read at all.**
Every retail data entry says 1252, and the payloads are UTF-16 regardless, which makes the field
look vestigial. Carried through a round trip rather than normalised, because a value that is
preserved costs nothing and a value that is invented cannot be taken back.
_Experiment_: change it and observe — expected to be invisible.

---

[INI.md](INI.md) · [SCHEMA.md](SCHEMA.md) · [MODULES.md](MODULES.md) · [THN.md](THN.md) ·
[RETAIL.md](RETAIL.md)
