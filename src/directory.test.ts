import Directory from './directory.js'
import File from './file.js'
import BufferView from './utility/bufferview.js'
import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'

describe('Directory constructor', () => {
  it('defaults to backslash name and empty children', () => {
    const d = new Directory()
    assert.equal(d.name, '\\')
    assert.equal(d.children.length, 0)
  })

  it('stores a custom name', () => {
    const d = new Directory('MyDir')
    assert.equal(d.name, 'MyDir')
  })

  it('accepts pre-populated children', () => {
    const child = new Directory('child')
    const d = new Directory('root', [child])
    assert.equal(d.children.length, 1)
    assert.equal(d.children[0], child)
  })
})

describe('Directory.directories / .files', () => {
  it('returns only Directory children', () => {
    const root = new Directory()
    root.children.push(new Directory('sub'), new File('f.txt'))
    assert.equal(root.directories.length, 1)
    assert.equal(root.directories[0]!.name, 'sub')
  })

  it('returns only File children', () => {
    const root = new Directory()
    root.children.push(new Directory('sub'), new File('f.txt'))
    assert.equal(root.files.length, 1)
    assert.equal(root.files[0]!.name, 'f.txt')
  })
})

describe('Directory.setDirectory', () => {
  it('creates a single-level directory', () => {
    const root = new Directory()
    const sub = root.setDirectory('Sub')
    assert.ok(sub instanceof Directory)
    assert.equal(sub.name, 'Sub')
    assert.equal(root.directories.length, 1)
  })

  it('creates nested directories in one call', () => {
    const root = new Directory()
    const deep = root.setDirectory('A', 'B', 'C')
    assert.ok(deep instanceof Directory)
    assert.equal(deep.name, 'C')
    assert.equal(root.getDirectory('A', 'B', 'C'), deep)
  })

  it('returns an existing directory without duplicating', () => {
    const root = new Directory()
    const first = root.setDirectory('Sub')
    const second = root.setDirectory('Sub')
    assert.equal(first, second)
    assert.equal(root.directories.length, 1)
  })
})

describe('Directory.getDirectory', () => {
  it('finds an existing nested directory', () => {
    const root = new Directory()
    const created = root.setDirectory('A', 'B')
    assert.equal(root.getDirectory('A', 'B'), created)
  })

  it('returns undefined for a missing path segment', () => {
    const root = new Directory()
    root.setDirectory('A')
    assert.equal(root.getDirectory('A', 'B'), undefined)
  })

  it('returns undefined for a fully missing path', () => {
    const root = new Directory()
    assert.equal(root.getDirectory('Missing'), undefined)
  })

  it('returns self when called with no arguments', () => {
    const root = new Directory()
    assert.equal(root.getDirectory(), root)
  })
})

describe('Directory.setFile', () => {
  it('creates a file at the root level', () => {
    const root = new Directory()
    const f = root.setFile('data.bin')
    assert.ok(f instanceof File)
    assert.equal(f.name, 'data.bin')
    assert.equal(root.files.length, 1)
  })

  it('creates intermediate directories as needed', () => {
    const root = new Directory()
    const f = root.setFile('A', 'B', 'data.bin')
    assert.ok(f instanceof File)
    assert.ok(root.getDirectory('A', 'B') instanceof Directory)
  })

  it('returns an existing file without duplicating', () => {
    const root = new Directory()
    const first = root.setFile('data.bin')
    const second = root.setFile('data.bin')
    assert.equal(first, second)
    assert.equal(root.files.length, 1)
  })

  it('throws RangeError when no name is provided', () => {
    const root = new Directory()
    assert.throws(() => root.setFile(), RangeError)
  })
})

describe('Directory.getFile', () => {
  it('finds an existing file', () => {
    const root = new Directory()
    const created = root.setFile('A', 'data.bin')
    assert.equal(root.getFile('A', 'data.bin'), created)
  })

  it('returns undefined when the file is missing', () => {
    const root = new Directory()
    root.setDirectory('A')
    assert.equal(root.getFile('A', 'missing.bin'), undefined)
  })

  it('returns undefined when the parent directory is missing', () => {
    const root = new Directory()
    assert.equal(root.getFile('No', 'data.bin'), undefined)
  })

  it('returns undefined when called with no arguments', () => {
    const root = new Directory()
    assert.equal(root.getFile(), undefined)
  })
})

describe('Directory.delete', () => {
  it('removes a file by name', () => {
    const root = new Directory()
    root.setFile('data.bin')
    root.delete('data.bin')
    assert.equal(root.files.length, 0)
  })

  it('removes a directory', () => {
    const root = new Directory()
    root.setDirectory('Sub')
    root.delete('Sub')
    assert.equal(root.directories.length, 0)
  })

  it('removes a nested entry', () => {
    const root = new Directory()
    root.setFile('A', 'data.bin')
    root.delete('A', 'data.bin')
    assert.equal(root.getDirectory('A')!.files.length, 0)
  })

  it('is case-insensitive', () => {
    const root = new Directory()
    root.setFile('Data.bin')
    root.delete('DATA.BIN')
    assert.equal(root.files.length, 0)
  })

  it('is a no-op for a missing entry', () => {
    const root = new Directory()
    assert.doesNotThrow(() => root.delete('ghost'))
  })

  it('returns this for chaining', () => {
    const root = new Directory()
    assert.equal(root.delete('x'), root)
  })
})

describe('Directory.append', () => {
  it('adds a new child entry', () => {
    const root = new Directory()
    root.append(new File('data.bin'))
    assert.equal(root.files.length, 1)
  })

  it('replaces an existing child with the same name', () => {
    const root = new Directory()
    const original = new File('data.bin')
    original.writeIntegers(1)
    root.append(original)

    const replacement = new File('data.bin')
    replacement.writeIntegers(99)
    root.append(replacement)

    assert.equal(root.files.length, 1)
    assert.deepEqual([...root.files[0]!.readIntegers()], [99])
  })

  it('returns this for chaining', () => {
    const root = new Directory()
    assert.equal(root.append(new File('x')), root)
  })
})

// ===========================================================================
// Directory write → read round-trip
// ===========================================================================

describe('Directory write / read round-trip', () => {
  it('preserves root directory name', () => {
    const root = new Directory('\\')
    const restored = Directory.read(root.write())
    assert.equal(restored.name, '\\')
    assert.equal(restored.children.length, 0)
  })

  it('preserves a single file and its integer data', () => {
    const root = new Directory()
    root.setFile('config').writeIntegers(42, -7)

    const restored = Directory.read(root.write())
    const file = restored.getFile('config')

    assert.ok(file instanceof File)
    assert.deepEqual([...file.readIntegers()], [42, -7])
  })

  it('preserves nested directory structure', () => {
    const root = new Directory()
    root.setDirectory('A', 'B', 'C')

    const restored = Directory.read(root.write())
    assert.ok(restored.getDirectory('A', 'B', 'C') instanceof Directory)
  })

  it('preserves float data in files', () => {
    const root = new Directory()
    root.setFile('mesh', 'vertices').writeFloats(1.0, 2.0, 3.0)

    const restored = Directory.read(root.write())
    const values = [...restored.getFile('mesh', 'vertices')!.readFloats()]

    assert.equal(values.length, 3)
    assert.ok(Math.abs(values[0]! - 1.0) < 1e-6)
    assert.ok(Math.abs(values[1]! - 2.0) < 1e-6)
    assert.ok(Math.abs(values[2]! - 3.0) < 1e-6)
  })

  it('preserves string data in files', () => {
    const root = new Directory()
    root.setFile('names').writeStrings('alpha', 'beta', 'gamma')

    const restored = Directory.read(root.write())
    assert.deepEqual([...restored.getFile('names')!.readStrings()], ['alpha', 'beta', 'gamma'])
  })

  it('handles same entry name in different directories', () => {
    const root = new Directory()
    root.setFile('A', 'data').writeIntegers(1)
    root.setFile('B', 'data').writeIntegers(2)

    const restored = Directory.read(root.write())
    assert.deepEqual([...restored.getFile('A', 'data')!.readIntegers()], [1])
    assert.deepEqual([...restored.getFile('B', 'data')!.readIntegers()], [2])
  })

  it('preserves a complex mixed tree', () => {
    const root = new Directory()
    root
      .setFile('Cmpnd', 'Root', 'Transform')
      .writeFloats(...Array.from({ length: 16 }, (_, i) => i))
    root.setFile('Cmpnd', 'Root', 'Children').writeStrings('Part_1', 'Part_2')
    root.setFile('MultiLevel', 'Level0', 'VMeshData').writeIntegers(1, 2, 3)

    const restored = Directory.read(root.write())

    assert.equal([...restored.getFile('Cmpnd', 'Root', 'Transform')!.readFloats()].length, 16)
    assert.deepEqual(
      [...restored.getFile('Cmpnd', 'Root', 'Children')!.readStrings()],
      ['Part_1', 'Part_2'],
    )
    assert.deepEqual(
      [...restored.getFile('MultiLevel', 'Level0', 'VMeshData')!.readIntegers()],
      [1, 2, 3],
    )
  })
})

// ===========================================================================
// Directory.read error handling
// ===========================================================================

describe('Directory.read error handling', () => {
  it('throws on an invalid signature', () => {
    const view = BufferView.allocate(8)
    view.writeUint32(0xdeadbeef) // wrong signature
    view.writeUint32(0x00000000)
    assert.throws(() => Directory.read(new Uint8Array(view.buffer)), Error)
  })

  it('throws on an invalid version', () => {
    const view = BufferView.allocate(8)
    view.writeUint32(Directory.SIGNATURE)
    view.writeUint32(0x00000000) // wrong version
    assert.throws(() => Directory.read(new Uint8Array(view.buffer)), RangeError)
  })
})

// ===========================================================================
// Header free entry list offset
// ===========================================================================

describe('Directory.read header free offset', () => {
  // The uint32 after treeSize is the head of the free entry list, not the root
  // entry. The root always sits at tree offset 0. Files written by the original
  // Freelancer tools leave a non-zero value here.
  const freeOffsetAt = Directory.VERSION_BYTE_LENGTH + 8

  it('ignores a non-zero free offset and reads the root from tree offset 0', () => {
    const root = new Directory()
    root.setDirectory('Nested').setFile('Payload').writeIntegers(1, 2, 3)

    const buffer = root.write()
    const view = BufferView.from(buffer)

    assert.equal(view.getUint32(freeOffsetAt, true), 0)
    view.setUint32(freeOffsetAt, 0xe8, true) // point at an unrelated tree entry

    const restored = Directory.read(buffer)
    assert.equal(restored.name, '\\')
    assert.deepEqual([...restored.getFile('Nested', 'Payload')!.readIntegers()], [1, 2, 3])
  })

  it('writes zero for the free offset', () => {
    const view = BufferView.from(new Directory().write())
    assert.equal(view.getUint32(freeOffsetAt, true), 0)
  })
})
