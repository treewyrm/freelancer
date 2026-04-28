import BufferView from '../utility/bufferview.js'
import type { Face } from './face.js'

export enum HullType {
  Enabled = 4,
  Skip = 5,
}

export interface Hull {
  /**
   * ID/offset.
   * - Model part ID when type is 4.
   * - It may have a id different from the surface part it belongs to.
   * - Offset to node when type is 5.
   */
  id: number

  /** Hull type determines state (4 = enabled, 5 = skip). */
  type: HullType

  /** Hull faces. */
  faces: Face[]

  /** Could be flags or padding bytes. */
  unknown: number
}

const getIndexCount = (faceCount: number): number => (12 + faceCount * 6) / 4

export const getIndices = (faces: Face[]): number[] => [
  ...new Set(faces.flatMap((face) => face.edges)),
]

export function readHull(view: BufferView): Hull {
  const id = view.readUint32()
  const hull = view.readUint32() // Hull header.
  const type = hull & 0xff

  const indexCount = hull >> 8

  const faces: Face[] = new Array(view.readUint16())
  const unknown = view.readUint16()

  let count = 0

  for (let i = 0; i < faces.length; i++) {
    /** Flag (8 bits), opposite face index (12 bits unsigned), face index (12 bits unsigned). */
    const header = view.readUint32()

    /** Face index. */
    const index = header & 0xfff

    const face: Face = (faces[index] = {
      flag: (header >> 24) & 0xff,
      opposite: (header >> 12) & 0xfff,
      edges: [0, 0, 0],
      adjacent: [0, 0, 0],
      state: [false, false, false],
    })

    for (let v = 0; v < 3; v++) {
      face.edges[v] = view.readUint16()

      /** Edge flag (1 bit), offset to opposite side (signed 15-bit integer). */
      let data = view.readUint16()
      face.state[v] = data >> 15 > 0

      data &= 0x7fff

      // This is retarded but it just works, okay?
      const edgeOffset = count + (data >> 14 > 0 ? (data & 0x3fff) | ~0x3fff : data & 0x3fff)
      face.adjacent[v] = Math.ceil(edgeOffset - edgeOffset / 4)

      count++
    }

    count++
  }

  if (getIndexCount(faces.length) !== indexCount) throw new RangeError('Invalid hull index count')

  return { id, type, faces, unknown }
}

export function writeHull(view: BufferView, hull: Hull): void {
  view.writeUint32(hull.id)
  view.writeUint32((getIndexCount(hull.faces.length) << 8) | (hull.type & 0xff))
  view.writeUint16(hull.faces.length)
  view.writeUint16(hull.unknown)

  let count = 0

  for (const [index, face] of hull.faces.entries()) {
    view.writeUint32((index & 0xfff) | ((face.opposite & 0xfff) << 12) | ((face.flag & 0xff) << 24))

    for (let v = 0; v < 3; v++) {
      let edgeOffset = (face.adjacent[v]! - count + face.adjacent[v]! / 3 - count / 3) & 0x7fff
      if (face.state) edgeOffset |= 0x8000 // Set MSB.

      view.writeUint16(face.edges[v]!)
      view.writeUint16(edgeOffset)
      count++
    }
  }
}
