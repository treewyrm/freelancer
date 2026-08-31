import type { Resource, ResourceId } from './types.js'
import {
  DATA_ALIGNMENT,
  DEFAULT_IMAGE_BASE,
  DIRECTORY_COUNT,
  DIRECTORY_RELOCATION,
  DIRECTORY_RESOURCE,
  DOS_SIGNATURE,
  FILE_ALIGNMENT,
  HEADERS_BYTE_LENGTH,
  IMAGE_CHARACTERISTICS,
  MACHINE_I386,
  OPTIONAL_BYTE_LENGTH,
  OPTIONAL_MAGIC,
  PADDING,
  PE_OFFSET_POINTER,
  PE_SIGNATURE,
  RESOURCE_DATA_BYTE_LENGTH,
  RESOURCE_DIRECTORY_BYTE_LENGTH,
  RESOURCE_ENTRY_BYTE_LENGTH,
  RESOURCE_HIGH_BIT,
  RESOURCE_VERSION_MAJOR,
  RESOURCE_VERSION_MINOR,
  SECTION_ALIGNMENT,
  SECTION_BYTE_LENGTH,
  SECTION_DISCARDABLE_DATA,
  SECTION_READ_DATA,
  SUBSYSTEM_GUI,
} from './data.js'

const align = (value: number, to: number): number => Math.ceil(value / to) * to

/**
 * Orders directory entries the way the loader requires: named first, ordinal by upper-cased name,
 * then numbered ascending.
 *
 * This is not cosmetic. `FindResource` binary-searches each level, so an unsorted directory does
 * not fail loudly — it fails for some ids and not others, depending on where the search lands.
 */
const sortEntries = <T extends { id: ResourceId }>(entries: T[]): T[] => {
  const named = entries.filter(({ id }) => typeof id === 'string')
  const numbered = entries.filter(({ id }) => typeof id === 'number')

  named.sort(({ id: a }, { id: b }) => {
    const left = (a as string).toUpperCase()
    const right = (b as string).toUpperCase()
    return left < right ? -1 : left > right ? 1 : 0
  })

  numbered.sort(({ id: a }, { id: b }) => (a as number) - (b as number))

  return [...named, ...numbered]
}

/** A leaf, with the offsets assigned to it during layout. */
interface Leaf extends Resource {
  descriptor: number
  dataOffset: number
}

/** What both levels of the directory tree share once their names and offsets are laid out. */
interface Node {
  id: ResourceId
  offset: number
  nameOffset: number
}

/** Second level: one resource id, holding a leaf per language. */
interface Entry extends Node {
  languages: Leaf[]
}

/** First level: one resource type, holding its entries. */
interface TypeNode extends Node {
  entries: Entry[]
}

/** Groups the flat list back into the three levels, sorting each. */
const group = (resources: Resource[]): TypeNode[] => {
  const types = new Map<string, { id: ResourceId; entries: Map<string, Entry> }>()
  const key = (id: ResourceId): string => (typeof id === 'string' ? `s${id}` : `n${id}`)

  for (const resource of resources) {
    const typeKey = key(resource.type)
    let type = types.get(typeKey)
    if (!type) types.set(typeKey, (type = { id: resource.type, entries: new Map() }))

    const entryKey = key(resource.id)
    let entry = type.entries.get(entryKey)
    if (!entry)
      type.entries.set(
        entryKey,
        (entry = { id: resource.id, offset: 0, nameOffset: 0, languages: [] }),
      )

    if (entry.languages.some(({ language }) => language === resource.language))
      throw new RangeError(
        `Resource ${String(resource.type)}/${String(resource.id)} has two entries for language ` +
          `0x${resource.language.toString(16)}`,
      )

    entry.languages.push({ ...resource, descriptor: 0, dataOffset: 0 })
  }

  return sortEntries(
    [...types.values()].map(({ id, entries }) => ({
      id,
      offset: 0,
      nameOffset: 0,
      entries: sortEntries([...entries.values()]).map((entry) => ({
        ...entry,
        languages: [...entry.languages].sort((a, b) => a.language - b.language),
      })),
    })),
  )
}

/**
 * Builds the `.rsrc` section.
 *
 * The layout is the linker's, reproduced rather than invented: every directory table in
 * breadth-first order, then every data descriptor in the same walk order, then the name strings,
 * then the payloads DWORD-aligned with the gaps filled from {@link PADDING}. Under that rule the
 * section rebuilt from a retail DLL's own resources is **byte-identical** to the one it was read
 * from, for `resources.dll`, `infocards.dll`, `misctext.dll`, `nameresources.dll` and
 * `equipresources.dll` alike — the two exceptions differ only in trailing filler the linker left
 * past the last payload.
 *
 * Exported because that byte comparison is the sharpest test this module has, and it needs to
 * build a section at the address retail put it rather than at the one {@link write} chooses.
 *
 * @param resources Entries to lay out.
 * @param address RVA the section will be loaded at, which the data descriptors are relative to.
 */
export const writeSection = (resources: Resource[], address: number): Uint8Array => {
  const types = group(resources)
  const directoryLength = (count: number): number =>
    RESOURCE_DIRECTORY_BYTE_LENGTH + count * RESOURCE_ENTRY_BYTE_LENGTH

  let offset = directoryLength(types.length)

  for (const type of types) {
    type.offset = offset
    offset += directoryLength(type.entries.length)
  }

  for (const type of types)
    for (const entry of type.entries) {
      entry.offset = offset
      offset += directoryLength(entry.languages.length)
    }

  const leaves: Leaf[] = []

  for (const type of types)
    for (const entry of type.entries)
      for (const leaf of entry.languages) {
        leaf.descriptor = offset
        offset += RESOURCE_DATA_BYTE_LENGTH
        leaves.push(leaf)
      }

  // Names are interned: the format lets two entries share a string, and deduplicating costs nothing.
  const names = new Map<string, number>()

  const intern = (value: string): number => {
    let at = names.get(value)

    if (at === undefined) {
      names.set(value, (at = offset))
      offset += 2 + value.length * 2
    }

    return at
  }

  for (const type of types) {
    if (typeof type.id === 'string') type.nameOffset = intern(type.id)
    for (const entry of type.entries)
      if (typeof entry.id === 'string') entry.nameOffset = intern(entry.id)
  }

  const gaps: [offset: number, length: number][] = []
  offset = align(offset, DATA_ALIGNMENT)

  for (const leaf of leaves) {
    leaf.dataOffset = offset
    offset += leaf.data.byteLength

    const padded = align(offset, DATA_ALIGNMENT)
    if (padded > offset) gaps.push([offset, padded - offset])
    offset = padded
  }

  const bytes = new Uint8Array(offset)
  const view = new DataView(bytes.buffer)

  const writeDirectory = (at: number, entries: Node[], subdirectory: boolean): void => {
    view.setUint32(at, 0, true) // characteristics, zero in every retail directory
    view.setUint32(at + 4, 0, true) // timestamp, likewise
    view.setUint16(at + 8, RESOURCE_VERSION_MAJOR, true)
    view.setUint16(at + 10, RESOURCE_VERSION_MINOR, true)
    view.setUint16(at + 12, entries.filter(({ id }) => typeof id === 'string').length, true)
    view.setUint16(at + 14, entries.filter(({ id }) => typeof id === 'number').length, true)

    entries.forEach((entry, index) => {
      const slot = at + RESOURCE_DIRECTORY_BYTE_LENGTH + index * RESOURCE_ENTRY_BYTE_LENGTH

      view.setUint32(
        slot,
        typeof entry.id === 'string' ? RESOURCE_HIGH_BIT | entry.nameOffset : entry.id,
        true,
      )

      view.setUint32(slot + 4, subdirectory ? RESOURCE_HIGH_BIT | entry.offset : entry.offset, true)
    })
  }

  writeDirectory(0, types, true)
  for (const type of types) writeDirectory(type.offset, type.entries, true)

  for (const type of types)
    for (const entry of type.entries)
      writeDirectory(
        entry.offset,
        entry.languages.map(({ language, descriptor }) => ({
          id: language,
          offset: descriptor,
          nameOffset: 0,
        })),
        false,
      )

  for (const leaf of leaves) {
    view.setUint32(leaf.descriptor, address + leaf.dataOffset, true) // an image RVA, not relative
    view.setUint32(leaf.descriptor + 4, leaf.data.byteLength, true)
    view.setUint32(leaf.descriptor + 8, leaf.codePage, true)
    view.setUint32(leaf.descriptor + 12, 0, true)
    bytes.set(leaf.data, leaf.dataOffset)
  }

  for (const [name, at] of names) {
    view.setUint16(at, name.length, true)
    for (let i = 0; i < name.length; i++) view.setUint16(at + 2 + i * 2, name.charCodeAt(i), true)
  }

  for (const [at, length] of gaps)
    for (let i = 0; i < length; i++) bytes[at + i] = PADDING.charCodeAt(i % PADDING.length)

  return bytes
}

/** The DOS header's stub program, verbatim from what every MSVC linker of the era emitted. */
const DOS_STUB = Uint8Array.from([
  0x0e, 0x1f, 0xba, 0x0e, 0x00, 0xb4, 0x09, 0xcd, 0x21, 0xb8, 0x01, 0x4c, 0xcd, 0x21, 0x54, 0x68,
  0x69, 0x73, 0x20, 0x70, 0x72, 0x6f, 0x67, 0x72, 0x61, 0x6d, 0x20, 0x63, 0x61, 0x6e, 0x6e, 0x6f,
  0x74, 0x20, 0x62, 0x65, 0x20, 0x72, 0x75, 0x6e, 0x20, 0x69, 0x6e, 0x20, 0x44, 0x4f, 0x53, 0x20,
  0x6d, 0x6f, 0x64, 0x65, 0x2e, 0x0d, 0x0d, 0x0a, 0x24, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
])

/**
 * The PE checksum: a 16-bit ones-complement sum over the image with the field itself excluded, plus
 * the file's length.
 *
 * Windows enforces it only for drivers and images loaded into a critical process, so a resource DLL
 * with a wrong one still loads. Retail's are all correct, and a file that says it is checksummed
 * and is not is worse than one that does not claim it.
 */
const checksum = (bytes: Uint8Array, field: number): number => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let sum = 0

  for (let i = 0; i < bytes.byteLength; i += 2) {
    if (i === field || i === field + 2) continue
    sum += view.getUint16(i, true)
    sum = (sum & 0xffff) + (sum >>> 16)
  }

  sum = (sum & 0xffff) + (sum >>> 16)
  return (sum + bytes.byteLength) >>> 0
}

/** PE header fields the resource data does not determine. Both default to a reproducible image. */
export interface WriteOptions {
  /** Preferred load address. Defaults to {@link DEFAULT_IMAGE_BASE}. */
  imageBase?: number

  /** COFF timestamp. Defaults to zero, so the same input always produces the same bytes. */
  timestamp?: number
}

/**
 * Writes resources as a resource-only DLL.
 *
 * The image has no code and no imports, and its entry point is zero — the loader skips `DllMain`
 * when there is none. That is not a trick: six of the seven DLLs Freelancer loads resources from,
 * `infocards.dll` and `nameresources.dll` among them, already ship exactly this way. Only
 * `resources.dll` carries a 23-byte stub, and dropping it is what makes the other six proof that
 * nothing needs it.
 *
 * **This mints a fresh image rather than rewriting one.** Reading a DLL that has other sections —
 * `resources.dll`'s `.text` and imports — and writing it back yields its resources in a new
 * resource-only image, not the original with its `.rsrc` replaced. For the six that are already
 * resource-only that distinction does not arise; for `resources.dll` it means the stub is gone,
 * which is safe on the evidence above and is the one claim here that only the running game can
 * settle. See the `TODO` in [RESOURCE.md](../../docs/RESOURCE.md).
 *
 * @param resources Entries to write.
 */
export const write = (resources: Resource[], options: WriteOptions = {}): Uint8Array => {
  const { imageBase = DEFAULT_IMAGE_BASE, timestamp = 0 } = options

  const resourceAddress = HEADERS_BYTE_LENGTH
  const resource = writeSection(resources, resourceAddress)
  const resourceRaw = align(resource.byteLength, FILE_ALIGNMENT)

  const relocationAddress = resourceAddress + align(resource.byteLength, SECTION_ALIGNMENT)

  // A single terminator block: the image is relocatable and has nothing to relocate. Retail says
  // the same thing in eight to twelve bytes, and it is what keeps the loader free to rebase.
  const relocation = new Uint8Array(8)
  const relocationRaw = FILE_ALIGNMENT

  const bytes = new Uint8Array(relocationAddress + relocationRaw)
  const view = new DataView(bytes.buffer)

  view.setUint16(0, DOS_SIGNATURE, true)
  view.setUint16(2, 0x90, true) // bytes on the last page
  view.setUint16(4, 3, true) // pages
  view.setUint16(8, 4, true) // header paragraphs
  view.setUint16(12, 0xffff, true) // maximum extra paragraphs
  view.setUint16(24, 0x40, true) // relocation table, which is empty and sits where the stub starts
  view.setUint32(PE_OFFSET_POINTER, 0x80, true)
  bytes.set(DOS_STUB, 0x40)

  const pe = 0x80
  view.setUint32(pe, PE_SIGNATURE, true)

  const coff = pe + 4
  view.setUint16(coff, MACHINE_I386, true)
  view.setUint16(coff + 2, 2, true) // .rsrc and .reloc
  view.setUint32(coff + 4, timestamp, true)
  view.setUint32(coff + 8, 0, true) // symbol table
  view.setUint32(coff + 12, 0, true) // symbols
  view.setUint16(coff + 16, OPTIONAL_BYTE_LENGTH, true)
  view.setUint16(coff + 18, IMAGE_CHARACTERISTICS, true)

  const optional = coff + 20
  view.setUint16(optional, OPTIONAL_MAGIC, true)
  view.setUint8(optional + 2, 6) // linker version, as retail
  view.setUint8(optional + 3, 0)
  view.setUint32(optional + 4, 0, true) // size of code: there is none
  view.setUint32(optional + 8, resourceRaw + relocationRaw, true) // size of initialized data
  view.setUint32(optional + 12, 0, true) // size of uninitialized data
  view.setUint32(optional + 16, 0, true) // entry point: none, so DllMain is never called
  view.setUint32(optional + 20, 0, true) // base of code
  view.setUint32(optional + 24, resourceAddress, true) // base of data
  view.setUint32(optional + 28, imageBase, true)
  view.setUint32(optional + 32, SECTION_ALIGNMENT, true)
  view.setUint32(optional + 36, FILE_ALIGNMENT, true)
  view.setUint16(optional + 40, 4, true) // required OS 4.0
  view.setUint16(optional + 42, 0, true)
  view.setUint16(optional + 44, 0, true) // image version
  view.setUint16(optional + 46, 0, true)
  view.setUint16(optional + 48, 4, true) // subsystem 4.0
  view.setUint16(optional + 50, 0, true)
  view.setUint32(optional + 52, 0, true) // Win32 version, reserved and zero
  view.setUint32(
    optional + 56,
    relocationAddress + align(relocation.byteLength, SECTION_ALIGNMENT),
    true,
  )
  view.setUint32(optional + 60, HEADERS_BYTE_LENGTH, true)
  view.setUint32(optional + 64, 0, true) // checksum, once the rest of the image is in place
  view.setUint16(optional + 68, SUBSYSTEM_GUI, true)
  view.setUint16(optional + 70, 0, true) // DLL characteristics: no ASLR, no DEP, as retail
  view.setUint32(optional + 72, 0x100000, true) // stack reserve
  view.setUint32(optional + 76, 0x1000, true) // stack commit
  view.setUint32(optional + 80, 0x100000, true) // heap reserve
  view.setUint32(optional + 84, 0x1000, true) // heap commit
  view.setUint32(optional + 88, 0, true) // loader flags
  view.setUint32(optional + 92, DIRECTORY_COUNT, true)

  const directories = optional + 96
  view.setUint32(directories + DIRECTORY_RESOURCE * 8, resourceAddress, true)
  view.setUint32(directories + DIRECTORY_RESOURCE * 8 + 4, resource.byteLength, true)
  view.setUint32(directories + DIRECTORY_RELOCATION * 8, relocationAddress, true)
  view.setUint32(directories + DIRECTORY_RELOCATION * 8 + 4, relocation.byteLength, true)

  const table = optional + OPTIONAL_BYTE_LENGTH

  const writeSectionHeader = (
    index: number,
    name: string,
    virtualSize: number,
    virtualAddress: number,
    rawSize: number,
    characteristics: number,
  ): void => {
    const at = table + index * SECTION_BYTE_LENGTH

    for (let i = 0; i < name.length; i++) bytes[at + i] = name.charCodeAt(i)
    view.setUint32(at + 8, virtualSize, true)
    view.setUint32(at + 12, virtualAddress, true)
    view.setUint32(at + 16, rawSize, true)
    view.setUint32(at + 20, virtualAddress, true) // equal alignments make the offset the RVA
    view.setUint32(at + 36, characteristics, true)
  }

  writeSectionHeader(
    0,
    '.rsrc',
    resource.byteLength,
    resourceAddress,
    resourceRaw,
    SECTION_READ_DATA,
  )

  writeSectionHeader(
    1,
    '.reloc',
    relocation.byteLength,
    relocationAddress,
    relocationRaw,
    SECTION_DISCARDABLE_DATA,
  )

  bytes.set(resource, resourceAddress)
  bytes.set(relocation, relocationAddress)

  view.setUint32(optional + 64, checksum(bytes, optional + 64), true)

  return bytes
}
