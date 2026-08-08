import type { Resource, ResourceId } from './types.js'
import BufferView from '#/utility/bufferview.js'
import {
  DIRECTORY_RESOURCE,
  DOS_SIGNATURE,
  OPTIONAL_BYTE_LENGTH,
  OPTIONAL_MAGIC,
  PE_OFFSET_POINTER,
  PE_SIGNATURE,
  RESOURCE_DIRECTORY_BYTE_LENGTH,
  RESOURCE_ENTRY_BYTE_LENGTH,
  RESOURCE_HIGH_BIT,
  SECTION_BYTE_LENGTH,
} from './data.js'

/** Whether a buffer starts with `MZ` and its `e_lfanew` reaches a `PE\0\0`. */
export const isImage = (data: ArrayBufferView | ArrayBufferLike): boolean => {
  const view = BufferView.from(data as ArrayBufferLike)
  if (view.byteLength < PE_OFFSET_POINTER + 4 || view.getUint16(0, true) !== DOS_SIGNATURE)
    return false

  const offset = view.getUint32(PE_OFFSET_POINTER, true)
  return offset + 4 <= view.byteLength && view.getUint32(offset, true) === PE_SIGNATURE
}

/** What an image says about itself, apart from its resources. */
export interface Image {
  /** Preferred load address. Retail gives each library its own so none has to be rebased. */
  imageBase: number

  /** Entry point RVA. Zero in six of the seven libraries — `/NOENTRY`, no `DllMain` to call. */
  entryPoint: number

  /** Section names, in table order. `write` mints `.rsrc` and `.reloc` and nothing else. */
  sections: string[]
}

/**
 * Reads the header fields a caller needs to decide what a rewrite would cost.
 *
 * Separate from {@link read} because they answer different questions and a caller usually wants
 * only one: `read` says what is in the image, this says what the image *is*. It exists so a
 * consumer can carry the image base across a rewrite, and warn about a library whose sections
 * `write` will not reproduce, without parsing a PE header of its own.
 *
 * @throws TypeError on anything that is not a PE32 image.
 */
export const inspect = (data: ArrayBufferView | ArrayBufferLike): Image => {
  const view = BufferView.from(data as ArrayBufferLike)

  if (!isImage(view)) throw new TypeError('Not a PE image')

  const pe = view.getUint32(PE_OFFSET_POINTER, true)
  const coff = pe + 4
  const sectionCount = view.getUint16(coff + 2, true)
  const optionalSize = view.getUint16(coff + 16, true)
  const optional = coff + 20

  if (view.getUint16(optional, true) !== OPTIONAL_MAGIC) throw new TypeError('Not a PE32 image')

  const sections: string[] = []

  for (let i = 0; i < sectionCount; i++) {
    const offset = optional + optionalSize + i * SECTION_BYTE_LENGTH
    sections.push(
      String.fromCharCode(...view.bytes.subarray(offset, offset + 8)).replace(/\0+$/, ''),
    )
  }

  return {
    imageBase: view.getUint32(optional + 28, true),
    entryPoint: view.getUint32(optional + 16, true),
    sections,
  }
}

/** One entry of the section table, as far as mapping an RVA back to a file offset needs it. */
interface Section {
  name: string
  virtualAddress: number
  virtualSize: number
  rawOffset: number
  rawSize: number
}

/**
 * Reads every resource in a Win32 image, flattening the three-level directory.
 *
 * Nothing here is Freelancer-specific: it reads any PE32, and all 37 DLLs in `EXE` come back whole
 * — including `serverresources.dll`'s nine resource types and `ebueula.dll`'s **named** one,
 * `PREPSTUBDATA`, which is why an id is `number | string`. Sorting the tree back out into strings
 * and infocards is `strings.ts` and `infocards.ts`.
 *
 * Order is preserved as the file gives it, which for a well-formed image is already the order the
 * writer would produce: named entries first, then numbered ascending, at each of the three levels.
 *
 * @param data Image bytes.
 * @throws TypeError on anything that is not a PE32 image.
 * @throws RangeError on a directory that points outside the file.
 */
export const read = (data: ArrayBufferView | ArrayBufferLike): Resource[] => {
  const view = BufferView.from(data as ArrayBufferLike)

  if (!isImage(view)) throw new TypeError('Not a PE image')

  const pe = view.getUint32(PE_OFFSET_POINTER, true)
  const coff = pe + 4
  const sectionCount = view.getUint16(coff + 2, true)
  const optionalSize = view.getUint16(coff + 16, true)
  const optional = coff + 20

  // PE32+ differs from PE32 from the image base onwards, which moves every field this reads.
  // Freelancer is 32-bit and so is everything it loads, so this is a refusal rather than a branch.
  if (view.getUint16(optional, true) !== OPTIONAL_MAGIC) throw new TypeError('Not a PE32 image')

  const directoryCount = view.getUint32(optional + 92, true)
  if (DIRECTORY_RESOURCE >= directoryCount) return []

  const address = view.getUint32(optional + 96 + DIRECTORY_RESOURCE * 8, true)
  const size = view.getUint32(optional + 96 + DIRECTORY_RESOURCE * 8 + 4, true)
  if (!address || !size) return []

  const sections: Section[] = []

  for (let i = 0; i < sectionCount; i++) {
    const offset = optional + optionalSize + i * SECTION_BYTE_LENGTH

    sections.push({
      name: String.fromCharCode(...view.bytes.subarray(offset, offset + 8)).replace(/\0+$/, ''),
      virtualSize: view.getUint32(offset + 8, true),
      virtualAddress: view.getUint32(offset + 12, true),
      rawSize: view.getUint32(offset + 16, true),
      rawOffset: view.getUint32(offset + 20, true),
    })
  }

  // A section's virtual size may exceed its raw size (BSS-style tail) or fall short of it (file
  // alignment padding); an RVA is inside the section if it is inside either extent.
  const section = sections.find(
    ({ virtualAddress, virtualSize, rawSize }) =>
      address >= virtualAddress && address < virtualAddress + Math.max(virtualSize, rawSize),
  )

  if (!section)
    throw new RangeError(`Resource directory at RVA 0x${address.toString(16)} is in no section`)

  const toOffset = (rva: number): number => rva - section.virtualAddress + section.rawOffset

  /** Every offset inside the directory is relative to its first byte, not to the section. */
  const base = toOffset(address)

  if (base < 0 || base + size > view.byteLength)
    throw new RangeError(`Resource directory of ${size} bytes runs past the end of the image`)

  /** Reads a counted, unterminated UTF-16LE name at a directory-relative offset. */
  const name = (offset: number): string => {
    const at = base + offset
    if (at + 2 > view.byteLength) throw new RangeError('Resource name is outside the image')

    const length = view.getUint16(at, true)
    let value = ''

    for (let i = 0; i < length; i++)
      value += String.fromCharCode(view.getUint16(at + 2 + i * 2, true))

    return value
  }

  function* listEntries(
    offset: number,
  ): Generator<{ id: ResourceId; target: number; isDirectory: boolean }> {
    if (offset + RESOURCE_DIRECTORY_BYTE_LENGTH > view.byteLength)
      throw new RangeError('Resource directory is outside the image')

    const count = view.getUint16(offset + 12, true) + view.getUint16(offset + 14, true)

    for (let i = 0; i < count; i++) {
      const entry = offset + RESOURCE_DIRECTORY_BYTE_LENGTH + i * RESOURCE_ENTRY_BYTE_LENGTH
      const identity = view.getUint32(entry, true)
      const target = view.getUint32(entry + 4, true)

      yield {
        id: identity & RESOURCE_HIGH_BIT ? name(identity & ~RESOURCE_HIGH_BIT) : identity,
        target: base + (target & ~RESOURCE_HIGH_BIT),
        isDirectory: !!(target & RESOURCE_HIGH_BIT),
      }
    }
  }

  const resources: Resource[] = []

  for (const type of listEntries(base)) {
    if (!type.isDirectory) throw new RangeError(`Resource type ${type.id} is not a directory`)

    for (const entry of listEntries(type.target)) {
      if (!entry.isDirectory)
        throw new RangeError(`Resource ${type.id}/${entry.id} is not a directory`)

      for (const language of listEntries(entry.target)) {
        if (language.isDirectory)
          throw new RangeError(`Resource ${type.id}/${entry.id} nests past the language level`)

        if (typeof language.id !== 'number')
          throw new RangeError(`Resource ${type.id}/${entry.id} has a named language`)

        // The one field in the tree that is an image RVA rather than a directory-relative offset.
        const dataAddress = view.getUint32(language.target, true)
        const dataSize = view.getUint32(language.target + 4, true)
        const at = toOffset(dataAddress)

        if (at < 0 || at + dataSize > view.byteLength)
          throw new RangeError(
            `Resource ${type.id}/${entry.id} data of ${dataSize} bytes runs past the end of the image`,
          )

        resources.push({
          type: type.id,
          id: entry.id,
          language: language.id,
          codePage: view.getUint32(language.target + 8, true),
          data: view.bytes.subarray(at, at + dataSize),
        })
      }
    }
  }

  return resources
}
