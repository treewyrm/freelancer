import BufferView from '#/utility/bufferview.js'
import { getResourceId } from '#/hash.js'
import { readArray, readString, writeString } from './misc.js'
import { type Property, PropertyType, readProperty, writeProperty } from './property.js'

const knownNodeTypes = [
  'FxNode',
  'FxCubeEmitter',
  'FxSphereEmitter',
  'FxConeEmitter',
  'FxBasicAppearance',
  'FLDustAppearance',
  'FxOrientedAppearance',
  'FxParticleAppearance',
  'FxMeshAppearance',
  'FxRectAppearance',
  'FxPerpAppearance',
  'FLBeamAppearance',
  'FxRadialField',
  'FxCollideField',
  'FxTurbulenceField',
  'FxAirField',
  'FxGravityField',
  'FLDustField',
  'FLBeamField',
] as const

/** Known alchemy node types. */
export type NodeType = (typeof knownNodeTypes)[number] | (string & {})

/** Alchemy node. Type determines how it is used. */
export interface Node {
  type: NodeType
  properties: Property[]
}

/** Reads alchemy node. */
export function readNode(view: BufferView): Node {
  const type = readString(view)
  const properties: Property[] = []
  let property

  while ((property = readProperty(view))) properties.push(property)
  return { type, properties }
}

/** Writes alchemy node. */
export function writeNode({ type, properties }: Node): BufferView {
  return BufferView.join(
    writeString(type),
    ...properties.map(writeProperty),
    BufferView.allocate(Uint16Array.BYTES_PER_ELEMENT),
  )
}

/** Alchemy node library. */
export interface NodeLibrary {
  version: number
  nodes: Node[]
}

/** Reads node library. */
export function readNodeLibrary(view: BufferView): NodeLibrary {
  const version = view.readFloat32()
  const nodes = readArray(view, readNode, view.readUint32())

  return { version, nodes }
}

/** Writes node library. */
export function writeNodeLibrary({ version, nodes }: NodeLibrary): BufferView {
  const view = BufferView.allocate(Float32Array.BYTES_PER_ELEMENT + Uint32Array.BYTES_PER_ELEMENT)
    .writeFloat32(version)
    .writeUint32(nodes.length)

  return BufferView.concat([view, ...nodes.map(writeNode)])
}

/** Retrieves alchemy node name from property Node_Name. */
export const getNodeName = ({ properties }: Node) => {
  const property = properties.find(({ name }) => name === 'Node_Name')
  if (!property || property.type !== PropertyType.String) return

  return property.value
}

/**
 * Assigns alchemy node name.
 *
 * The property is replaced rather than retyped in place: switching the discriminant on the
 * existing object would leave the previous variant's payload — keyframes, easing, blend modes —
 * attached to something now claiming to be a string, and the writer would emit it.
 */
export const setNodeName = ({ properties }: Node, value: string): void => {
  const property: Property = { name: 'Node_Name', type: PropertyType.String, value }
  const index = properties.findIndex(({ name }) => name === 'Node_Name')

  index >= 0 ? properties.splice(index, 1, property) : properties.push(property)
}

/** Finds node by name. */
export const getNodeByName = (nodes: Node[], name: string) =>
  nodes.find((node) => getNodeName(node) === name)

/** Finds node by CRC. */
export const getNodeByCRC = (nodes: Node[], crc: number) =>
  nodes.find((node) => getResourceId(getNodeName(node) ?? '', true) === crc)
