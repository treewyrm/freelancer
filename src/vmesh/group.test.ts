import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import BufferView from '#/utility/bufferview.js'
import { byteLength, readVMeshGroup, writeVMeshGroup, type VMeshGroup } from './group.js'

const sample = (): VMeshGroup => ({
  materialId: -12345678,
  vertexStart: 100,
  vertexEnd: 250,
  elementCount: 300,
  padding: 0,
})

describe('VMeshGroup', () => {
  it('occupies twelve bytes', () => {
    strictEqual(byteLength, 12)
    strictEqual(writeVMeshGroup(sample()).byteLength, 12)
  })

  it('round-trips every field', () => {
    const group = sample()

    deepStrictEqual(readVMeshGroup(writeVMeshGroup(group).rewind()), group)
  })

  it('stores materialId as a signed 32-bit CRC followed by four uint16s', () => {
    const view = writeVMeshGroup(sample())

    strictEqual(view.getInt32(0, true), -12345678)
    deepStrictEqual([...new Uint16Array(view.buffer, 4, 4)], [100, 250, 300, 0])
  })

  it('reads material CRCs with the high bit set as negative', () => {
    const view = BufferView.allocate(byteLength)
    view.setUint32(0, 0xdeadbeef, true)

    strictEqual(readVMeshGroup(view).materialId, 0xdeadbeef | 0)
  })

  it('preserves a non-zero padding field rather than clearing it', () => {
    const group = sample()
    group.padding = 0xbeef

    strictEqual(readVMeshGroup(writeVMeshGroup(group).rewind()).padding, 0xbeef)
  })

  it('advances the view by exactly one record, so groups can be read in sequence', () => {
    const first = sample()
    const second = { ...sample(), materialId: 42, vertexStart: 999 }
    const view = BufferView.join(writeVMeshGroup(first), writeVMeshGroup(second))

    deepStrictEqual(readVMeshGroup(view), first)
    strictEqual(view.offset, byteLength)
    deepStrictEqual(readVMeshGroup(view), second)
    strictEqual(view.byteRemain, 0)
  })
})
