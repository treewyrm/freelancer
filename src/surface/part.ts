import BufferView from '../utility/bufferview.js'
import { readExtent, writeExtent, type Extent } from './extent.js'
import { readSurface, writeSurface, type Surface } from './surface.js'

const NOT_FIXED = 0x64786621 // '!fxd'
const EXTENTS = 0x73747865 // 'exts'
const SURFACES = 0x66727573 // 'surf'
const HARDPOINTS = 0x64697068 // 'hpid'

export interface Part extends Extent, Surface {
  id: number
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
    fixed: false,
    hardpoints: [],
    minimum: { x: 0, y: 0, z: 0 },
    maximum: { x: 0, y: 0, z: 0 },
    center: { x: 0, y: 0, z: 0 },
    drag: { x: 0, y: 0, z: 0 },
    radius: 0,
    radiusScale: 1,
    points: [],
    root: {
      center: { x: 0, y: 0, z: 0 },
      radius: 0,
      axis: { x: 0, y: 0, z: 0 },
      unknown: 0,
    },
    unknown: { x: 0, y: 0, z: 0 },
  }

  for (let i = 0, l = view.readUint32(); i < l; i++) {
    switch (view.readUint32()) {
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
    }
  }

  return part
}

export function writePart(part: Part): BufferView {
  const chunks: BufferView[] = [
    BufferView.allocate(Uint32Array.BYTES_PER_ELEMENT).writeInt32(part.id),
  ]

  // Not fixed
  if (!part.fixed)
    chunks.push(BufferView.allocate(Uint32Array.BYTES_PER_ELEMENT).writeUint32(NOT_FIXED))

  // Extents
  chunks.push(
    BufferView.allocate(Uint32Array.BYTES_PER_ELEMENT).writeUint32(EXTENTS),
    writeExtent(part),
  )

  // Hardpoints
  chunks.push(
    BufferView.allocate(Uint32Array.BYTES_PER_ELEMENT).writeUint32(HARDPOINTS),
    writeHardpoints(part.hardpoints),
  )

  // Surfaces
  chunks.push(
    BufferView.allocate(Uint32Array.BYTES_PER_ELEMENT).writeUint32(SURFACES),
    writeSurface(part),
  )

  return BufferView.join(...chunks)
}
