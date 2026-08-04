import { ok, strictEqual } from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { list, root as data, skip } from '#/corpus.js'
import Directory from './directory.js'
import File from './file.js'
import BufferView from '#/utility/bufferview.js'

const { ENTRY_BYTE_LENGTH: entrySize } = Directory

/**
 * Every UTF container Freelancer ships. `.ini` and `.thn` are text, `.sur` is its own chunked
 * format, and `.wav`/`.bmp` are what they say.
 */
const extensions = ['3db', 'cmp', 'sph', 'dfm', 'vms', 'utf', 'mat', 'txm', 'ale', 'anm']

/**
 * Reads straight from disk rather than through `load`, which caches every tree it parses. This
 * suite walks all 650 MiB of the corpus and reserializes each asset, so it keeps one live at a
 * time instead of holding the lot.
 */
function* assets(): Generator<{ path: string; root: Directory }> {
  for (const path of list(...extensions))
    yield { path, root: Directory.read(readFileSync(join(data, path))) }
}

interface Entry {
  /** Path from the root, which is how an entry is identified rather than by tree offset. */
  path: string

  kind: 'directory' | 'file'

  /** File payload, absent on directories. */
  data?: Uint8Array
}

/** Every entry below a directory, in tree order. */
function* entries(directory: Directory, prefix = ''): Generator<Entry> {
  for (const child of directory.children) {
    const path = `${prefix}\\${child.name}`

    if (child instanceof Directory) {
      yield { path, kind: 'directory' }
      yield* entries(child, path)
    } else yield { path, kind: 'file', data: bytes(child) }
  }
}

const bytes = (file: File) => new Uint8Array(file.buffer, file.byteOffset, file.byteLength)

/**
 * Copy of an output with every timestamp zeroed.
 *
 * Timestamps are not carried through a read: the writer stamps the header and all three fields
 * of every entry with the time of writing, so two writes of the same tree differ wherever the
 * clock moved between them. Everything else is expected to match exactly.
 */
function undated(output: Uint8Array): Uint8Array {
  const copy = Uint8Array.from(output)
  const view = BufferView.from(copy)

  view.offset = Directory.VERSION_BYTE_LENGTH

  const treeOffset = view.readUint32()
  const treeSize = view.readUint32()

  /** Header FILETIME, the last field of the header. */
  copy.fill(0, Directory.VERSION_BYTE_LENGTH + 40, Directory.VERSION_BYTE_LENGTH + 48)

  /** Create, access and modify DOS timestamps, the last three fields of every entry. */
  for (let offset = treeOffset; offset < treeOffset + treeSize; offset += entrySize)
    copy.fill(0, offset + 32, offset + entrySize)

  return copy
}

/** Byte equality through `Buffer.compare`, which is native: this suite compares 1.3 GiB of them. */
const equalBytes = (a?: Uint8Array, b?: Uint8Array): boolean => {
  if (!a || !b) return a === b

  return a.byteLength === b.byteLength && Buffer.compare(a, b) === 0
}

describe('retail asset corpus', { skip }, () => {
  it('finds assets to read', () => {
    const paths = list(...extensions)

    ok(paths.length > 3000, `expected a full DATA tree, found ${paths.length} files`)
  })

  /**
   * The container itself, which every other corpus suite reads its data through. Names are
   * compared exactly: the dictionary shares an entry between identical names only, and folding
   * case there would respell one of the 52 assets holding a pair that differs just in case.
   */
  it('rebuilds every tree entry for entry, payloads included', () => {
    for (const { path, root } of assets()) {
      const restored = Directory.read(root.write())

      strictEqual(restored.name, root.name, `${path}: root name`)

      const before = [...entries(root)]
      const after = [...entries(restored)]

      strictEqual(after.length, before.length, `${path}: entry count`)

      for (const [index, entry] of before.entries()) {
        const other = after[index]!

        strictEqual(other.path, entry.path, `${path}: entry ${index}`)
        strictEqual(other.kind, entry.kind, `${path}: ${entry.path} kind`)
        ok(equalBytes(other.data, entry.data), `${path}: ${entry.path} payload`)
      }
    }
  })

  /** Writing is a fixed point: a tree read back from output reserializes to the same bytes. */
  it('reserializes its own output byte for byte', () => {
    for (const { path, root } of assets()) {
      const first = root.write()
      const second = Directory.read(first).write()

      strictEqual(second.byteLength, first.byteLength, `${path}: output length`)
      ok(equalBytes(undated(second), undated(first)), `${path}: output`)
    }
  })
})
