import { deepStrictEqual, ok, strictEqual, throws } from 'node:assert/strict'
import { describe, it } from 'node:test'
import BufferView from '#/utility/bufferview.js'
import { readSurfaceLibrary, writeSurfaceLibrary } from './library.js'
import { readExtent, writeExtent, type Extent } from './extent.js'
import { readPoint, writePoint, type Point } from './point.js'
import { readHull, writeHull, type Hull } from './hull.js'
import { readNode, writeNode } from './node.js'
import { readSurface, getHulls, getNodes, writeSurface, type Surface } from './surface.js'
import { readPart, writePart, type Part } from './part.js'
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

function sampleSurface(root: Node): Surface {
  return {
    massCenter: { x: 1, y: 2, z: 3 },
    rotationInertia: { x: 0.25, y: 0.5, z: 0.75 },
    radius: 4.5,
    surfaceDeviation: 243 / 0xfa,
    points,
    root,
    padding: { x: 0, y: 0, z: 0 },
  }
}

function samplePart(root?: Node): Part {
  const left = node(1, tetrahedron(0x11111111))
  const right = node(2, tetrahedron(0x22222222))

  return {
    id: 0x0badf00d | 0,
    fixed: false,
    hardpoints: [1, 2, 3],
    minimum: { x: -1, y: -2, z: -3 },
    maximum: { x: 4, y: 5, z: 6 },
    ...sampleSurface(root ?? node(3, tetrahedron(0, 5), left, right)),
  }
}

/** A seven node tree, deeper on the left than on the right, with four terminal hulls. */
function deepPart(): Part {
  const leaf = (id: number, radius: number) => node(radius, tetrahedron(id))

  return samplePart(
    node(
      4,
      tetrahedron(0, 5),
      node(2, tetrahedron(0, 5), leaf(0x11111111, 1), leaf(0x22222222, 1)),
      node(3, tetrahedron(0, 5), leaf(0x33333333, 1), leaf(0x44444444, 1)),
    ),
  )
}

/** Blank target for {@link readSurface}, which fills an existing object. */
const emptySurface = (): Surface => ({
  massCenter: { x: 0, y: 0, z: 0 },
  rotationInertia: { x: 0, y: 0, z: 0 },
  radius: 0,
  surfaceDeviation: 0,
  points: [],
  root: { center: { x: 0, y: 0, z: 0 }, radius: 0, boxSizes: { x: 0, y: 0, z: 0 }, padding: 0 },
  padding: { x: 0, y: 0, z: 0 },
})

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

describe('node', () => {
  it('occupies twenty bytes, the sphere ahead of the packed box', () => {
    const view = BufferView.allocate(20)

    writeNode(view, node(2.5))
    strictEqual(view.offset, 20)

    deepStrictEqual([...new Float32Array(view.buffer, 0, 4)], [0.5, 0.25, -0.125, 2.5])
    deepStrictEqual([...new Uint8Array(view.buffer, 16, 4)], [100, 200, 250, 0])
  })

  it('round-trips box sizes that land on a step of 1/250', () => {
    const view = BufferView.allocate(20)
    const value = node(2.5)

    writeNode(view, value)
    view.offset = 0

    // Children are not part of the record, so the reader hands back the node on its own.
    deepStrictEqual(readNode(view), value)
  })

  it('quantises box sizes that do not, to the nearest step', () => {
    const view = BufferView.allocate(20)

    writeNode(view, { ...node(1), boxSizes: { x: 0.5, y: 1, z: 0 } })
    view.offset = 0

    deepStrictEqual(readNode(view).boxSizes, { x: 125 / 0xfa, y: 1, z: 0 })
  })
})

describe('surface block', () => {
  it('states its own size twice, in the chunk and in the IVP header', () => {
    const view = writeSurface(samplePart())
    const size = view.getUint32(0, true)

    strictEqual(size, view.byteLength - Uint32Array.BYTES_PER_ELEMENT)
    strictEqual(view.getUint32(4 + 28, true) >>> 8, size)
  })

  it('packs the surface deviation into the low byte of that same word', () => {
    const view = writeSurface(samplePart())
    strictEqual(view.getUint32(4 + 28, true) & 0xff, 243)
  })

  // The byte is free to run past 250, so the decoded factor is free to exceed one.
  it('round-trips every deviation the byte can hold, including those past 250', () => {
    for (const steps of [0, 1, 243, 250, 251, 255]) {
      const surface = emptySurface()
      readSurface(writeSurface({ ...samplePart(), surfaceDeviation: steps / 0xfa }), surface)

      strictEqual(surface.surfaceDeviation, steps / 0xfa)
    }
  })

  it('rejects a node tree that starts outside the block', () => {
    const view = writeSurface(samplePart())

    // `offset_ledgetree_root`, which the reader bounds against the block size.
    view.setInt32(4 + 32, 0xffff, true)

    throws(() => readSurface(view.rewind(), emptySurface()), RangeError)
  })
})

describe('surface part', () => {
  const chunkCount = (part: Part) => BufferView.from(writePart(part)).getUint32(4, true)

  const firstTag = (part: Part) => BufferView.from(writePart(part)).getString(8, 4)

  it('writes !fxd for a part that is not fixed, and nothing for one that is', () => {
    const part = samplePart()

    strictEqual(firstTag(part), '!fxd')
    strictEqual(chunkCount(part), 4)

    strictEqual(firstTag({ ...part, fixed: true }), 'exts')
    strictEqual(chunkCount({ ...part, fixed: true }), 3)
  })

  it('omits the hpid chunk when a part covers no hardpoints', () => {
    strictEqual(chunkCount({ ...samplePart(), hardpoints: [] }), 3)

    const back = readPart(BufferView.from(writePart({ ...samplePart(), hardpoints: [] })))
    deepStrictEqual(back.hardpoints, [])
  })

  it('rejects an unknown chunk tag rather than desynchronising', () => {
    const view = BufferView.from(writePart({ ...samplePart(), fixed: true }))

    view.setUint32(8, 0x21212121, true)
    throws(() => readPart(view.rewind()), RangeError)
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

  // The writer places a left child immediately after its parent and patches the right child's
  // offset in once it lands, so a tree that is not a single fork is what exercises that.
  it('rebuilds a deeper hierarchy in the same shape', () => {
    const part = deepPart()
    const [back] = readSurfaceLibrary(BufferView.from(writeSurfaceLibrary([part])))
    ok(back)

    // A subtree hull's id is a derived offset, so it stands in as its type.
    const shape = (node: Node): unknown => [
      node.radius,
      node.hull && (node.hull.type === 5 ? 'subtree' : node.hull.id),
      node.left && shape(node.left),
      node.right && shape(node.right),
    ]

    strictEqual([...getNodes(back.root)].length, 7)
    strictEqual([...getHulls(back.root)].filter(({ type }) => type === 4).length, 4)
    deepStrictEqual(shape(back.root), shape(part.root))
  })

  it('keeps several parts apart in one library', () => {
    const parts = [samplePart(), { ...deepPart(), id: 0x1234, fixed: true, hardpoints: [] }]
    const back = readSurfaceLibrary(BufferView.from(writeSurfaceLibrary(parts)))

    strictEqual(back.length, 2)
    deepStrictEqual(
      back.map(({ id, fixed, hardpoints }) => [id, fixed, hardpoints]),
      [
        [0x0badf00d | 0, false, [1, 2, 3]],
        [0x1234, true, []],
      ],
    )
  })

  it('rejects a bad signature', () => {
    throws(() => readSurfaceLibrary(BufferView.allocate(8)), Error)
  })

  it('rejects a version other than 2.0', () => {
    const view = BufferView.from(writeSurfaceLibrary([samplePart()]))

    view.setFloat32(4, 1.0, true)
    throws(() => readSurfaceLibrary(view.rewind()), RangeError)
  })
})
