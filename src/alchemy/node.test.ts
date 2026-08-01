import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getResourceId } from '../hash.js'
import BufferView from '../utility/bufferview.js'
import { writeString } from './misc.js'
import {
  getNodeByCRC,
  getNodeByName,
  getNodeName,
  readNode,
  readNodeLibrary,
  setNodeName,
  writeNode,
  writeNodeLibrary,
  type Node,
} from './node.js'
import { PropertyType, writeProperty } from './property.js'

const bytes = ({ buffer, byteOffset, byteLength }: ArrayBufferView) =>
  new Uint8Array(buffer, byteOffset, byteLength)

const named = (name: string, type = 'FxBasicAppearance'): Node => ({
  type,
  properties: [{ name: 'Node_Name', type: PropertyType.String, value: name }],
})

describe('readNode', () => {
  it('reads properties until the terminator', () => {
    const node = readNode(
      BufferView.join(
        writeString('FxSphereEmitter'),
        writeProperty({ name: 'Node_Name', type: PropertyType.String, value: 'emitter' }),
        writeProperty({ name: 'Node_LifeSpan', type: PropertyType.Float, value: 2 }),
        BufferView.allocate(2),
      ),
    )

    strictEqual(node.type, 'FxSphereEmitter')
    deepStrictEqual(
      node.properties.map(({ name }) => name),
      ['Node_Name', 'Node_LifeSpan'],
    )
  })

  it('stops at the terminator rather than running to the end of the buffer', () => {
    const view = BufferView.join(
      writeString('FxNode'),
      BufferView.allocate(2),
      writeString('FxCubeEmitter'),
      BufferView.allocate(2),
    )

    deepStrictEqual(readNode(view), { type: 'FxNode', properties: [] })
    deepStrictEqual(readNode(view), { type: 'FxCubeEmitter', properties: [] })
    strictEqual(view.byteRemain, 0)
  })
})

describe('writeNode', () => {
  it('terminates the property list', () => {
    const view = writeNode({ type: 'FxNode', properties: [] })

    strictEqual(view.byteLength, writeString('FxNode').byteLength + 2)
    deepStrictEqual([...bytes(view).slice(-2)], [0, 0])
  })

  it('round-trips through the reader', () => {
    const node = named('particle', 'FxParticleAppearance')

    node.properties.push({ name: 'BasicApp_FlipTexV', type: PropertyType.Boolean, value: true })
    deepStrictEqual(readNode(writeNode(node)), node)
  })
})

describe('node library', () => {
  const library = { version: Math.fround(1.1), nodes: [named('a'), named('b', 'FxConeEmitter')] }

  it('heads the library with a float version and a node count', () => {
    const view = writeNodeLibrary(library)

    strictEqual(view.readFloat32(), Math.fround(1.1))
    strictEqual(view.readUint32(), 2)
  })

  it('round-trips', () => {
    deepStrictEqual(readNodeLibrary(writeNodeLibrary(library)), library)
  })

  it('reaches a fixed point after one write', () => {
    const first = writeNodeLibrary(library)
    const second = writeNodeLibrary(readNodeLibrary(first.rewind()))

    deepStrictEqual(bytes(second), bytes(first))
  })
})

describe('node names', () => {
  it('reads the name out of the Node_Name property', () => {
    strictEqual(getNodeName(named('emitter')), 'emitter')
  })

  it('reports no name when the property is missing or not a string', () => {
    strictEqual(getNodeName({ type: 'FxNode', properties: [] }), undefined)
    strictEqual(
      getNodeName({
        type: 'FxNode',
        properties: [{ name: 'Node_Name', type: PropertyType.Float, value: 0 }],
      }),
      undefined,
    )
  })

  it('reads the empty name one retail node carries', () => {
    strictEqual(getNodeName(named('')), '')
  })

  it('adds the property when setting a name on a node without one', () => {
    const node: Node = { type: 'FxNode', properties: [] }

    setNodeName(node, 'added')
    deepStrictEqual(node.properties, [
      { name: 'Node_Name', type: PropertyType.String, value: 'added' },
    ])
  })

  it('replaces an existing name in place', () => {
    const node = named('before')

    node.properties.push({ name: 'Node_LifeSpan', type: PropertyType.Float, value: 1 })
    setNodeName(node, 'after')

    strictEqual(getNodeName(node), 'after')
    strictEqual(node.properties.length, 2, 'no second Node_Name')
  })

  it('converts a Node_Name of another type to a string', () => {
    const node: Node = {
      type: 'FxNode',
      properties: [{ name: 'Node_Name', type: PropertyType.Float, value: 0 }],
    }

    setNodeName(node, 'converted')
    deepStrictEqual(node.properties, [
      { name: 'Node_Name', type: PropertyType.String, value: 'converted' },
    ])
  })
})

describe('node lookup', () => {
  const nodes = [named('MixedCase'), named('other')]

  it('finds a node by exact name', () => {
    strictEqual(getNodeByName(nodes, 'MixedCase'), nodes[0])
    strictEqual(getNodeByName(nodes, 'mixedcase'), undefined)
  })

  // Instances reference nodes by a CRC taken with the case left alone; folding it, as the rest
  // of the library does for UTF paths, strands nearly half of the retail references.
  it('finds a node by its case-sensitive CRC', () => {
    strictEqual(getNodeByCRC(nodes, getResourceId('MixedCase', true)), nodes[0])
    strictEqual(getNodeByCRC(nodes, getResourceId('MixedCase', false)), undefined)
  })

  // A node with no name hashes as the empty string, so it shares a CRC with the one retail
  // node whose Node_Name is blank. Harmless: no instance anywhere references that CRC.
  it('treats a missing name as the empty one when hashing', () => {
    const unnamed: Node = { type: 'FxNode', properties: [] }

    strictEqual(getNodeByCRC([unnamed], getResourceId('', true)), unnamed)
    strictEqual(getNodeByCRC(nodes, getResourceId('', true)), undefined, 'named nodes are safe')
  })
})
