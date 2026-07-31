import { deepStrictEqual, ok, strictEqual, throws } from 'node:assert/strict'
import { describe, it } from 'node:test'
import BufferView from '../utility/bufferview.js'
import { readSurfaceLibrary, writeSurfaceLibrary } from './library.js'
import { readExtent, writeExtent, type Extent } from './extent.js'
import { readPoint, writePoint, type Point } from './point.js'
import { readHull, writeHull, type Hull } from './hull.js'
import { getHulls, getNodes, type Surface } from './surface.js'
import type { Part } from './part.js'
import type { Node } from './node.js'
import type { Face } from './face.js'

const face = (
  pierce: number,
  points: [number, number, number],
  opposites: [number, number, number],
): Face => ({
  material: 0,
  virtual: false,
  pierce,
  points,
  opposites,
  virtualEdges: [false, false, false],
})

/**
 * A tetrahedron: four points, four faces. Each entry of `opposites` is the flat
 * `face * 3 + edge` index of the opposing half-edge, so every entry pairs with exactly one other.
 */
function tetrahedron(id: number, type: 4 | 5 = 4): Hull {
  return {
    id,
    type,
    reserved: 0,
    faces: [
      face(0, [0, 1, 2], [11, 6, 3]),
      face(1, [0, 2, 3], [2, 9, 7]),
      face(2, [0, 3, 1], [8, 10, 0]),
      face(3, [1, 3, 2], [5, 4, 1]),
    ],
  }
}

const points: Point[] = [
  { x: 0, y: 0, z: 0, clientData: 0 },
  { x: 1, y: 0, z: 0, clientData: 7 },
  { x: 0, y: 1, z: 0, clientData: 0 },
  { x: 0, y: 0, z: 1, clientData: -3 },
]

const node = (radius: number, hull?: Hull, left?: Node, right?: Node): Node => ({
  center: { x: 0.5, y: 0.25, z: -0.125 },
  radius,
  boxSizes: { x: 100 / 0xfa, y: 200 / 0xfa, z: 250 / 0xfa },
  padding: 0,
  // Omitted rather than set to undefined, matching what the reader produces.
  ...(hull ? { hull } : {}),
  ...(left ? { left } : {}),
  ...(right ? { right } : {}),
})

function samplePart(): Part {
  const left = node(1, tetrahedron(0x11111111))
  const right = node(2, tetrahedron(0x22222222))

  const surface: Surface = {
    massCenter: { x: 1, y: 2, z: 3 },
    rotationInertia: { x: 0.25, y: 0.5, z: 0.75 },
    radius: 4.5,
    surfaceDeviation: 243 / 0xfa,
    points,
    root: node(3, tetrahedron(0, 5), left, right),
    padding: { x: 0, y: 0, z: 0 },
  }

  return {
    id: 0x0badf00d | 0,
    fixed: false,
    hardpoints: [1, 2, 3],
    minimum: { x: -1, y: -2, z: -3 },
    maximum: { x: 4, y: 5, z: 6 },
    ...surface,
  }
}

describe('extent', () => {
  it('stores minimum and maximum as contiguous vectors', () => {
    const extent: Extent = { minimum: { x: 1, y: 2, z: 3 }, maximum: { x: 4, y: 5, z: 6 } }

    deepStrictEqual([...new Float32Array(writeExtent(extent).buffer)], [1, 2, 3, 4, 5, 6])

    const back: Extent = { minimum: { x: 0, y: 0, z: 0 }, maximum: { x: 0, y: 0, z: 0 } }
    readExtent(writeExtent(extent).rewind(), back)
    deepStrictEqual(back, extent)
  })
})

describe('point', () => {
  it('stores coordinates first and client data last', () => {
    const point: Point = { x: 1.5, y: -2.5, z: 0.25, clientData: 0x2a }
    const view = BufferView.allocate(16)

    writePoint(view, point)
    deepStrictEqual([...new Float32Array(view.buffer, 0, 3)], [1.5, -2.5, 0.25])
    strictEqual(new Int32Array(view.buffer, 12, 1)[0], 0x2a)

    view.offset = 0
    deepStrictEqual(readPoint(view), point)
  })
})

describe('hull', () => {
  it('round-trips faces, edges and adjacency', () => {
    const hull = tetrahedron(0x1234)
    const view = BufferView.allocate(16 + hull.faces.length * 16)

    writeHull(view, hull)
    strictEqual(view.offset, view.byteLength - 4, 'hull header is 12 bytes plus 16 per face')

    view.offset = 0
    deepStrictEqual(readHull(view), hull)
  })

  it('preserves the virtual flags, which sit either side of the material index', () => {
    const hull = tetrahedron(0, 5)
    for (const item of hull.faces) {
      item.material = 0x7f
      item.virtual = true
      item.virtualEdges = [true, true, true]
    }

    const view = BufferView.allocate(16 + hull.faces.length * 16)
    writeHull(view, hull)
    view.offset = 0

    deepStrictEqual(readHull(view), hull)
  })

  it('rejects a mismatched index count', () => {
    const hull = tetrahedron(0)
    const view = BufferView.allocate(16 + hull.faces.length * 16)

    writeHull(view, hull)
    view.setUint32(4, (99 << 8) | hull.type, true)
    view.offset = 0

    throws(() => readHull(view), RangeError)
  })
})

describe('surface library', () => {
  it('preserves part data through write and read', () => {
    const parts = [samplePart()]
    const back = readSurfaceLibrary(BufferView.from(writeSurfaceLibrary(parts)))

    // A type 5 hull's id is an offset back to its owning node, so the writer assigns it.
    for (const part of [...parts, ...back])
      for (const hull of getHulls(part.root)) if (hull.type === 5) hull.id = 0

    deepStrictEqual(back, parts)
  })

  it('is stable once derived offsets have been assigned', () => {
    const once = readSurfaceLibrary(BufferView.from(writeSurfaceLibrary([samplePart()])))
    const twice = readSurfaceLibrary(BufferView.from(writeSurfaceLibrary(once)))

    deepStrictEqual(twice, once)
  })

  it('points a subtree hull back at the node that owns it', () => {
    const [back] = readSurfaceLibrary(BufferView.from(writeSurfaceLibrary([samplePart()])))
    ok(back?.root.hull)

    strictEqual(back.root.hull.type, 5)
    ok(back.root.hull.id !== 0, 'offset back to the owning node is filled in')
  })

  it('preserves a fixed part, which carries no !fxd chunk', () => {
    const part = samplePart()
    part.fixed = true

    const [back] = readSurfaceLibrary(BufferView.from(writeSurfaceLibrary([part])))
    strictEqual(back?.fixed, true)
  })

  it('keeps the bounding volume hierarchy intact', () => {
    const part = samplePart()
    const [back] = readSurfaceLibrary(BufferView.from(writeSurfaceLibrary([part])))
    ok(back)

    strictEqual([...getNodes(back.root)].length, [...getNodes(part.root)].length)

    const terminal = (root: Node) =>
      [...getHulls(root)].filter(({ type }) => type === 4).map(({ id }) => id)

    deepStrictEqual(terminal(back.root), terminal(part.root))
  })

  it('rejects a bad signature', () => {
    throws(() => readSurfaceLibrary(BufferView.allocate(8)), Error)
  })
})
