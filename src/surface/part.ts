import BufferView from '#/utility/bufferview.js'
import { readExtent, writeExtent, type Extent } from './extent.js'
import { readSurface, writeSurface, type Surface } from './surface.js'

const NOT_FIXED = 0x64786621 // '!fxd'
const EXTENTS = 0x73747865 // 'exts'
const SURFACES = 0x66727573 // 'surf'
const HARDPOINTS = 0x64697068 // 'hpid'

export interface Part extends Extent, Surface {
  id: number

  /** Part is welded to the root. False when the `!fxd` chunk is present. */
  fixed: boolean

  hardpoints: number[]
}

function* readHardpoints(view: BufferView) {
  for (let i = 0, l = view.readUint32(); i < l; i++) yield view.readInt32()
}

function writeHardpoints(hardpoints: number[]) {
  const view = BufferView.allocate(
    Uint32Array.BYTES_PER_ELEMENT + hardpoints.length * Int32Array.BYTES_PER_ELEMENT,
  )
  view.writeUint32(hardpoints.length)
  for (const id of hardpoints) view.writeInt32(id)
  return view
}

export function readPart(view: BufferView): Part {
  const part: Part = {
    id: view.readInt32(),
    fixed: true,
    hardpoints: [],
    minimum: { x: 0, y: 0, z: 0 },
    maximum: { x: 0, y: 0, z: 0 },
    massCenter: { x: 0, y: 0, z: 0 },
    rotationInertia: { x: 0, y: 0, z: 0 },
    radius: 0,
    surfaceDeviation: 1,
    points: [],
    root: {
      center: { x: 0, y: 0, z: 0 },
      radius: 0,
      boxSizes: { x: 0, y: 0, z: 0 },
      padding: 0,
    },
    padding: { x: 0, y: 0, z: 0 },
  }

  for (let i = 0, l = view.readUint32(); i < l; i++) {
    const tag = view.readUint32()

    switch (tag) {
      case NOT_FIXED:
        part.fixed = false
        break
      case EXTENTS:
        readExtent(view, part)
        break
      case SURFACES:
        readSurface(view, part)
        break
      case HARDPOINTS:
        part.hardpoints.push(...readHardpoints(view))
        break

      // Chunk payloads are not length-prefixed at the tag level, so an unrecognized tag cannot
      // be skipped — carrying on would silently desynchronize the rest of the file.
      default:
        throw new RangeError(`Unknown surface part chunk 0x${tag.toString(16).padStart(8, '0')}`)
    }
  }

  return part
}

const tag = (value: number): BufferView =>
  BufferView.allocate(Uint32Array.BYTES_PER_ELEMENT).writeUint32(value)

/** Chunks are written in the order Freelancer emits them: `!fxd`, `exts`, `surf`, `hpid`. */
export function writePart(part: Part): BufferView {
  const chunks: BufferView[][] = []

  if (!part.fixed) chunks.push([tag(NOT_FIXED)])

  chunks.push([tag(EXTENTS), writeExtent(part)], [tag(SURFACES), writeSurface(part)])

  if (part.hardpoints.length) chunks.push([tag(HARDPOINTS), writeHardpoints(part.hardpoints)])

  return BufferView.join(
    BufferView.allocate(Uint32Array.BYTES_PER_ELEMENT * 2)
      .writeInt32(part.id)
      .writeUint32(chunks.length),
    ...chunks.flat(),
  )
}
