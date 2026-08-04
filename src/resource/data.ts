/**
 * PE32 and resource directory layout constants. Little-endian throughout.
 *
 * A resource DLL is an ordinary Win32 image whose payload is entirely in its `.rsrc` section: a
 * three-level tree of type → name → language, ending in descriptors that point at the bytes. The
 * constants here are split between the ones the format fixes and the ones **retail happens to
 * use**, which are marked as such — the reader accepts anything valid, and the writer reproduces
 * what Freelancer's own linker emitted.
 *
 * Every value was measured from `EXE/*.dll` in the retail install rather than recalled.
 */

/** `MZ`, read as a little-endian `uint16`. */
export const DOS_SIGNATURE = 0x5a4d

/** `PE\0\0`, read as a little-endian `uint32`. */
export const PE_SIGNATURE = 0x00004550

/** Offset of `e_lfanew`, the DOS header's pointer to the PE header. */
export const PE_OFFSET_POINTER = 0x3c

/** `IMAGE_NT_OPTIONAL_HDR32_MAGIC`. Freelancer is 32-bit, so PE32+ is not a thing this reads. */
export const OPTIONAL_MAGIC = 0x10b

/** `IMAGE_FILE_MACHINE_I386`. */
export const MACHINE_I386 = 0x14c

/**
 * `EXECUTABLE_IMAGE | LINE_NUMS_STRIPPED | LOCAL_SYMS_STRIPPED | 32BIT_MACHINE | DLL`.
 *
 * Note `RELOCS_STRIPPED` (0x1) is **not** set, in retail or here. A resource-only image contains no
 * absolute addresses to fix, but leaving it relocatable is what lets the loader rebase it when its
 * preferred base is occupied; stripping relocations turns that into a failed `LoadLibrary`.
 */
export const IMAGE_CHARACTERISTICS = 0x210e

/** `IMAGE_SUBSYSTEM_WINDOWS_GUI`, as retail. */
export const SUBSYSTEM_GUI = 2

/** Size of the PE32 optional header, and so the offset from it to the section table. */
export const OPTIONAL_BYTE_LENGTH = 224

/** Data directory slots, and the index of the two this module touches. */
export const DIRECTORY_COUNT = 16
export const DIRECTORY_RESOURCE = 2
export const DIRECTORY_RELOCATION = 5

/** `IMAGE_SECTION_HEADER`. */
export const SECTION_BYTE_LENGTH = 40

/** `CNT_INITIALIZED_DATA | MEM_READ`, the characteristics retail gives `.rsrc`. */
export const SECTION_READ_DATA = 0x40000040

/** The same plus `MEM_DISCARDABLE`, which is what `.reloc` carries. */
export const SECTION_DISCARDABLE_DATA = 0x42000040

/**
 * Section and file alignment.
 *
 * **Retail sets both to 0x1000**, in every one of the eleven resource-bearing images. That is
 * unusual — a file alignment of 0x200 is the norm — and it is worth keeping, because when the two
 * are equal a section's file offset equals its RVA and the writer needs no address translation at
 * all.
 */
export const SECTION_ALIGNMENT = 0x1000
export const FILE_ALIGNMENT = 0x1000

/** Bytes reserved for the headers, which is also where the first section starts. */
export const HEADERS_BYTE_LENGTH = 0x1000

/** `IMAGE_RESOURCE_DIRECTORY`: characteristics, timestamp, version, and the two entry counts. */
export const RESOURCE_DIRECTORY_BYTE_LENGTH = 16

/** `IMAGE_RESOURCE_DIRECTORY_ENTRY`: name-or-id, then offset-or-subdirectory. */
export const RESOURCE_ENTRY_BYTE_LENGTH = 8

/** `IMAGE_RESOURCE_DATA_ENTRY`: RVA, size, code page, reserved. */
export const RESOURCE_DATA_BYTE_LENGTH = 16

/**
 * High bit of a directory entry's first word marks a name rather than an id, and of its second word
 * a subdirectory rather than a leaf.
 */
export const RESOURCE_HIGH_BIT = 0x80000000

/** Version stamped into every resource directory table. Retail carries 4.0; nothing reads it. */
export const RESOURCE_VERSION_MAJOR = 4
export const RESOURCE_VERSION_MINOR = 0

/** Resource payloads are DWORD-aligned. Measured: every retail data RVA is a multiple of four. */
export const DATA_ALIGNMENT = 4

/**
 * The linker's alignment filler, cycled from its first byte at the start of each gap.
 *
 * Cosmetic — nothing reads it — but reproducing it is what makes a rewritten `.rsrc` byte-identical
 * to retail's rather than merely equivalent, and a byte comparison is a far sharper test than a
 * structural one.
 */
export const PADDING = 'PADDINGXXPADDING'

/** Resource types, by their Win32 `RT_*` numbers. */
export const Type = {
  /** `RT_STRING`. String tables, blocked sixteen to an entry. Holds every `ids_name`. */
  String: 6,

  /** `RT_VERSION`. The version block every retail DLL carries and Freelancer never reads. */
  Version: 16,

  /** `RT_HTML`. Infocards, one per entry. Holds every `ids_info`. */
  Html: 23,
} as const

export type Type = (typeof Type)[keyof typeof Type]

/**
 * Strings per `RT_STRING` block. Fixed by the format: a string's resource id is
 * `(index >> 4) + 1` and its slot is `index & 15`, so a table is addressed sixteen at a time
 * whether or not the neighbours exist.
 */
export const STRING_BLOCK_LENGTH = 16

/**
 * Ids each library contributes before the next one begins.
 *
 * A global `ids_name` or `ids_info` is `index * 0x10000 + local`, so the DLL is `id >> 16` and the
 * resource is `id & 0xffff`.
 *
 * **The band is not roomy.** `NameResources.dll` reaches local index 65,186 of a possible 65,535 —
 * 349 free — and `resources.dll` reaches 60,252. A mod adding names to either has almost nowhere to
 * put them and needs a library of its own, which is why the range is a constant worth naming rather
 * than a shift written inline.
 */
export const LIBRARY_ID_RANGE = 0x10000

/**
 * Language of every content resource in retail: `LANG_ENGLISH`/`SUBLANG_ENGLISH_US`.
 *
 * Only the `RT_VERSION` blocks depart from it, sitting at neutral `0x0`. Localised releases are the
 * obvious unknown, so this is a default and never an assumption — readers take any language and the
 * writer accepts one.
 */
export const LANGUAGE_ENGLISH_US = 0x409

/** Neutral language, `LANG_NEUTRAL`/`SUBLANG_NEUTRAL`. */
export const LANGUAGE_NEUTRAL = 0x0

/** Code page on every retail data entry. Read by nothing, and carried so a rewrite preserves it. */
export const CODE_PAGE_WINDOWS_1252 = 1252

/**
 * Default image base for a written DLL.
 *
 * Retail gives each of its resource DLLs a distinct base (`0x6720000`, `0x6af0000`, …) to avoid
 * load-time rebasing. Since the image carries no absolute addresses, the value is a hint the loader
 * may ignore, and the conventional DLL default is used unless one is supplied.
 */
export const DEFAULT_IMAGE_BASE = 0x10000000
