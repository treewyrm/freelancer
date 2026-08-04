import { deepStrictEqual, strictEqual, throws } from 'node:assert/strict'
import { describe, it } from 'node:test'
import Directory from '#/utf/directory.js'
import File from '#/utf/file.js'
import BufferView from '#/utility/bufferview.js'
import { readVMeshWire, writeVMeshWire, type VMeshWire } from './wireframe.js'

/** Canonical wireframe: indices relative to vertexStart, so they begin at 0. */
const sample = (): VMeshWire => ({
  data: {
    meshId: -12345678,
    vertexStart: 222,
    vertexCount: 4, // unique ids: 0, 4, 9, 12
    vertexRange: 13, // canonical: max - min + 1
    indices: Uint16Array.from([0, 4, 4, 9, 9, 12, 12, 0]),
  },
})

const wrap = (wire: VMeshWire) => new Directory('Part', [writeVMeshWire(wire)])

describe('writeVMeshWire', () => {
  it('writes a 16-byte header plus two bytes per index', () => {
    const wire = sample()
    const file = writeVMeshWire(wire).getFile('VWireData')

    strictEqual(file?.byteLength, 16 + wire.data.indices.byteLength)
  })

  it('derives indexCount from the indices array', () => {
    const wire = sample()
    wire.data.indices = Uint16Array.from([0, 1, 1, 2])

    const view = BufferView.from(writeVMeshWire(wire).getFile('VWireData')!)
    view.offset = 12

    strictEqual(view.readUint16(), 4)
  })

  it('names the directory VMeshWire and the file VWireData', () => {
    const directory = writeVMeshWire(sample())

    strictEqual(directory.name, 'VMeshWire')
    strictEqual(directory.getFile('VWireData')?.name, 'VWireData')
  })
})

describe('readVMeshWire', () => {
  it('round-trips every field', () => {
    const wire = sample()

    deepStrictEqual(readVMeshWire(wrap(wire)), wire)
  })

  it('returns undefined when there is no VMeshWire directory', () => {
    strictEqual(readVMeshWire(new Directory('Part')), undefined)
  })

  it('throws when VMeshWire exists without VWireData', () => {
    const parent = new Directory('Part', [new Directory('VMeshWire')])

    throws(() => readVMeshWire(parent), /Missing VWireData/)
  })

  it('throws RangeError when the header size is not 0x10', () => {
    const file = writeVMeshWire(sample()).getFile('VWireData')!
    BufferView.from(file).writeUint32(0x20)

    throws(
      () => readVMeshWire(new Directory('Part', [new Directory('VMeshWire', [file])])),
      RangeError,
    )
  })
})

describe('VWireData vertex fields', () => {
  // vertexStart is a base offset into the mesh vertex buffer, not min(indices):
  // several parts share one wire mesh, each claiming a disjoint slice of it.
  it('preserves a vertexStart unrelated to min(indices)', () => {
    const wire = sample()
    const result = readVMeshWire(wrap(wire))

    strictEqual(Math.min(...wire.data.indices), 0)
    strictEqual(result?.data.vertexStart, 222)
  })

  // Original Digital Anvil exporters write max - min + 1; MAXLancer and LancerEdit
  // write one less. Neither is normalised, so assets round-trip byte-exactly.
  it('preserves a non-canonical vertexRange rather than deriving it', () => {
    const wire = sample()
    const { indices } = wire.data
    const canonical = Math.max(...indices) - Math.min(...indices) + 1

    wire.data.vertexRange = canonical - 1 // MAXLancer convention

    strictEqual(readVMeshWire(wrap(wire))?.data.vertexRange, canonical - 1)
  })

  it('preserves a vertexCount that disagrees with the unique id count', () => {
    const wire = sample()
    wire.data.vertexCount = 99

    strictEqual(new Set(wire.data.indices).size, 4)
    strictEqual(readVMeshWire(wrap(wire))?.data.vertexCount, 99)
  })
})
