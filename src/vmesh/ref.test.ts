import { deepStrictEqual, strictEqual, throws } from 'node:assert/strict'
import { describe, it } from 'node:test'
import Directory from '../directory.js'
import BufferView from '../utility/bufferview.js'
import { readVMeshRef, writeVMeshRef, type VMeshRef } from './ref.js'
import { readVMeshPart, writeVMeshPart, type VMeshPart } from './part.js'

const sample = (): VMeshRef => ({
  meshId: -12345678,
  vertexStart: 10,
  vertexCount: 20,
  indexStart: 30,
  indexCount: 40,
  groupStart: 1,
  groupCount: 2,
  boundingBox: {
    a: { x: -1, y: -2, z: -3 },
    b: { x: 4, y: 5, z: 6 },
  },
  boundingSphere: {
    center: { x: 0.5, y: 1.5, z: 2.5 },
    radius: 7.25,
  },
})

const wrap = (ref: VMeshRef) => new Directory('VMeshPart', [writeVMeshRef(ref)])

describe('writeVMeshRef', () => {
  it('writes a fixed 60-byte record whose first field is its own size', () => {
    const file = writeVMeshRef(sample())

    strictEqual(file.byteLength, 60)
    strictEqual(BufferView.from(file).readUint32(), 60)
  })

  it('names the file VMeshRef', () => {
    strictEqual(writeVMeshRef(sample()).name, 'VMeshRef')
  })

  it('packs the slice counters as six uint16s after the mesh id', () => {
    const view = BufferView.from(writeVMeshRef(sample()))

    deepStrictEqual([...new Uint16Array(view.buffer, 8, 6)], [10, 20, 30, 40, 1, 2])
  })

  // The corpus confirms this: read as two contiguous vectors, thousands of game
  // refs come out with a minimum greater than their maximum on every axis.
  it('interleaves the bounding box as max, min per axis rather than min then max', () => {
    const view = BufferView.from(writeVMeshRef(sample()))

    deepStrictEqual([...new Float32Array(view.buffer, 20, 6)], [4, -1, 5, -2, 6, -3])
  })

  it('writes the bounding sphere as centre followed by radius', () => {
    const view = BufferView.from(writeVMeshRef(sample()))

    deepStrictEqual([...new Float32Array(view.buffer, 44, 4)], [0.5, 1.5, 2.5, 7.25])
  })
})

describe('readVMeshRef', () => {
  it('round-trips every field', () => {
    const ref = sample()

    deepStrictEqual(readVMeshRef(wrap(ref)), ref)
  })

  it('keeps a negative mesh id signed', () => {
    const ref = sample()
    ref.meshId = 0xdeadbeef | 0

    strictEqual(readVMeshRef(wrap(ref)).meshId, 0xdeadbeef | 0)
  })

  it('throws when the parent has no VMeshRef file', () => {
    throws(() => readVMeshRef(new Directory('VMeshPart')), /Missing VMeshRef/)
  })

  it('throws RangeError when the size field is not 60', () => {
    const file = writeVMeshRef(sample())
    BufferView.from(file).writeUint32(0x40)

    throws(() => readVMeshRef(new Directory('VMeshPart', [file])), RangeError)
  })
})

describe('VMeshPart', () => {
  const part = (): VMeshPart => ({ type: 'vmeshpart', reference: sample() })

  it('round-trips through a VMeshPart directory', () => {
    const value = part()

    deepStrictEqual(readVMeshPart(new Directory('Root', [writeVMeshPart(value)])), value)
  })

  it('names the directory VMeshPart', () => {
    strictEqual(writeVMeshPart(part()).name, 'VMeshPart')
  })

  it('returns undefined when there is no VMeshPart directory', () => {
    strictEqual(readVMeshPart(new Directory('Root')), undefined)
  })

  it('throws when VMeshPart exists without a VMeshRef inside', () => {
    const parent = new Directory('Root', [new Directory('VMeshPart')])

    throws(() => readVMeshPart(parent), /Missing VMeshRef/)
  })
})
