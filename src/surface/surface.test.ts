import { deepStrictEqual, ok, strictEqual, throws } from 'node:assert/strict'
import { describe, it } from 'node:test'
import BufferView from '#/utility/bufferview.js'
import Vector3 from '#/math/vector3.js'
import { readSurfaceLibrary, writeSurfaceLibrary } from './library.js'
import { createBox, getExtent, readExtent, writeExtent, type Extent } from './extent.js'
import { readPoint, writePoint, type Point } from './point.js'
import { createHull, getIndices, HullType, readHull, writeHull, type Hull } from './hull.js'
import { createNode, getNodeExtent, mergeNodes, readNode, writeNode } from './node.js'
import {
  createHierarchy,
  createSurface,
  getHulls,
  getMassProperties,
  getNodes,
  readSurface,
  writeSurface,
  type Surface,
} from './surface.js'
import { createHullGeometry, createPart, readPart, writePart, type Part } from './part.js'
import type { Node } from './node.js'
import { createFaces, type Face, type TriangleIndices } from './face.js'

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

const unit: Extent = { minimum: { x: -1, y: -1, z: -1 }, maximum: { x: 1, y: 1, z: 1 } }

/** A tetrahedron over the four corners of the unit cube that share no face. */
const tetrahedronGeometry = () => ({
  points: [
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 },
    { x: 0, y: 0, z: 1 },
  ],
  triangles: [
    [0, 2, 1],
    [0, 1, 3],
    [0, 3, 2],
    [1, 2, 3],
  ] as TriangleIndices[],
})

describe('extent', () => {
  it('bounds a point set', () => {
    deepStrictEqual(
      getExtent([
        { x: 1, y: -2, z: 3 },
        { x: -4, y: 5, z: -6 },
        { x: 0, y: 0, z: 0 },
      ]),
      {
        minimum: { x: -4, y: -2, z: -6 },
        maximum: { x: 1, y: 5, z: 3 },
      },
    )
  })

  it('reports an empty point set as an inverted extent, which unions cleanly', () => {
    const { minimum, maximum } = getExtent([])

    ok(minimum.x === Infinity && maximum.x === -Infinity)
  })

  it('builds a box whose corners are indexed by axis bit', () => {
    const { points, triangles } = createBox(unit)

    strictEqual(points.length, 8)
    strictEqual(triangles.length, 12)
    deepStrictEqual(points[0], { x: -1, y: -1, z: -1 })
    deepStrictEqual(points[7], { x: 1, y: 1, z: 1 })
    deepStrictEqual(getExtent(points), unit)
  })
})

describe('createFaces', () => {
  it('pairs every half-edge, so opposites is an involution', () => {
    const { points, triangles } = createBox(unit)
    const edges = createFaces(points, triangles).flatMap(({ opposites }) => opposites)

    strictEqual(edges.length, 36)
    for (const [edge, opposite] of edges.entries()) strictEqual(edges[opposite], edge)
  })

  it('winds every box triangle so its normal points out of the box', () => {
    const { points, triangles } = createBox(unit)

    for (const [a, b, c] of triangles.map((triangle) => triangle.map((i) => points[i]!))) {
      const normal = Vector3.cross(Vector3.subtract(b!, a!), Vector3.subtract(c!, a!))

      // The centre is the origin, so a face pointing outward faces away from its own vertices.
      ok(Vector3.dot(normal, a!) > 0)
    }
  })

  it('gives every face a pierce index that is neither itself nor out of range', () => {
    const { points, triangles } = createBox(unit)

    for (const [index, face] of createFaces(points, triangles).entries()) {
      ok(face.pierce !== index)
      ok(face.pierce >= 0 && face.pierce < triangles.length)
    }
  })

  it('handles the flattest hull the corpus has, a triangle sealed against itself', () => {
    const points = [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
    ]

    const faces = createFaces(points, [
      [0, 1, 2],
      [0, 2, 1],
    ])

    deepStrictEqual(
      faces.map(({ pierce }) => pierce),
      [1, 0],
    )
  })

  it('marks the faces and every edge of a hull that only bounds a subtree', () => {
    const { points, triangles } = createBox(unit)

    for (const face of createFaces(points, triangles, true)) {
      strictEqual(face.virtual, true)
      deepStrictEqual(face.virtualEdges, [true, true, true])
    }
  })

  it('refuses an open surface, which leaves an edge with nothing opposite it', () => {
    const { points, triangles } = tetrahedronGeometry()

    throws(() => createFaces(points, triangles.slice(0, 2)), RangeError)
  })

  // Two separate tetrahedra close every edge but reference eight points where a single closed
  // hull of eight faces takes six, and the ledge size the writer encodes assumes six.
  it('refuses a point count Euler does not allow, which the ledge size assumes', () => {
    const { points, triangles } = tetrahedronGeometry()
    const apart = points.map(({ x, y, z }) => ({ x: x + 10, y, z }))

    throws(
      () =>
        createFaces(
          [...points, ...apart],
          [...triangles, ...triangles.map((t) => t.map((i) => i + 4) as TriangleIndices)],
        ),
      RangeError,
    )
  })

  it('refuses a triangle wound the same way twice, and one that is degenerate', () => {
    const { points, triangles } = tetrahedronGeometry()

    throws(() => createFaces(points, [...triangles, triangles[0]!]), RangeError)
    throws(
      () =>
        createFaces(points, [
          [0, 1, 1],
          [0, 1, 2],
          [0, 2, 1],
          [1, 2, 0],
        ]),
      RangeError,
    )
  })

  it('refuses a triangle indexing a point that is not there', () => {
    const { points, triangles } = tetrahedronGeometry()

    throws(() => createFaces(points.slice(0, 3), triangles), RangeError)
  })
})

describe('createHull', () => {
  it('builds a terminal hull that reads back through the writer unchanged', () => {
    const { points, triangles } = createBox(unit)
    const hull = createHull(0x1234, points, triangles)

    strictEqual(hull.id, 0x1234)
    strictEqual(hull.type, HullType.Enabled)
    strictEqual(getIndices(hull.faces).length, 2 + hull.faces.length / 2)

    const view = BufferView.allocate(16 + hull.faces.length * 16)
    writeHull(view, hull)
    view.offset = 0

    deepStrictEqual(readHull(view), hull)
  })

  it('leaves a subtree hull id at zero, since the writer assigns it', () => {
    const { points, triangles } = createBox(unit)

    strictEqual(createHull(0x1234, points, triangles, HullType.Skip).id, 0)
  })
})

describe('node bounds', () => {
  const boxHull = () => {
    const { points, triangles } = createBox(unit)
    return { points, hull: createHull(0, points, triangles) }
  }

  it('centres a leaf on its hull and reaches the corners of it', () => {
    const { points, hull } = boxHull()
    const node = createNode(hull, points)

    deepStrictEqual(node.center, { x: 0, y: 0, z: 0 })
    strictEqual(node.radius, Math.sqrt(3))
    strictEqual(node.padding, 0)
    strictEqual(node.hull, hull)
  })

  it('quantises box sizes to whole steps, stepping past rather than rounding', () => {
    const { points, hull } = boxHull()
    const { boxSizes, radius } = createNode(hull, points)

    for (const axis of ['x', 'y', 'z'] as const) {
      const steps = boxSizes[axis] * 0xfa

      strictEqual(steps, Math.round(steps))
      ok(steps <= 0xff, 'a box size always fits its byte')
      ok(boxSizes[axis] * radius >= 1, 'the quantised box still contains the hull')
    }
  })

  it('unions the quantised boxes of two children rather than their spheres', () => {
    const { points, hull } = boxHull()
    const left = createNode(hull, points)
    const right = { ...left, center: { x: 10, y: 0, z: 0 } }
    const merged = mergeNodes(left, right)

    const bounds = getNodeExtent(merged)

    for (const child of [left, right]) {
      const { minimum, maximum } = getNodeExtent(child)

      ok(minimum.x >= bounds.minimum.x && maximum.x <= bounds.maximum.x)
      ok(minimum.y >= bounds.minimum.y && maximum.y <= bounds.maximum.y)
      ok(minimum.z >= bounds.minimum.z && maximum.z <= bounds.maximum.z)
    }

    strictEqual(merged.left, left)
    strictEqual(merged.right, right)
    strictEqual(merged.hull, undefined)
  })
})

describe('createHierarchy', () => {
  const leaf = (x: number) => {
    const extent = { minimum: { x, y: -1, z: -1 }, maximum: { x: x + 2, y: 1, z: 1 } }
    const { points, triangles } = createBox(extent)

    return createNode(createHull(x, points, triangles), points)
  }

  it('hands back a lone leaf untouched', () => {
    const node = leaf(0)

    strictEqual(createHierarchy([node]), node)
  })

  it('folds leaves into a full binary tree, one terminal hull per leaf', () => {
    const leaves = [leaf(0), leaf(10), leaf(20), leaf(30), leaf(40)]
    const root = createHierarchy(leaves)

    strictEqual([...getNodes(root)].length, leaves.length * 2 - 1)
    strictEqual([...getHulls(root)].length, leaves.length)

    for (const node of getNodes(root))
      if (!node.left && !node.right) ok(node.hull, 'a leaf keeps its hull')
      else ok(!node.hull, 'an inner node is left bare for createPart to fill')
  })

  it('merges the closest pair first, which is what puts neighbours under one node', () => {
    const [a, b, c] = [leaf(0), leaf(3), leaf(100)]
    const root = createHierarchy([a!, c!, b!])

    strictEqual(root.left?.left?.hull?.id, 0)
    strictEqual(root.left?.right?.hull?.id, 3)
    strictEqual(root.right?.hull?.id, 100)
  })

  it('refuses to build a part out of nothing', () => {
    throws(() => createHierarchy([]), RangeError)
  })
})

describe('getMassProperties', () => {
  it('puts the mass centre of a box at its centre and the radius on its corner', () => {
    const extent = { minimum: { x: -1, y: -2, z: -3 }, maximum: { x: 3, y: 4, z: 5 } }
    const { points, triangles } = createBox(extent)
    const { massCenter, radius } = getMassProperties([createHull(0, points, triangles)], points)

    ok(Vector3.equal(massCenter, { x: 1, y: 1, z: 1 }, 1e-6))
    ok(Math.abs(radius - Vector3.magnitude({ x: 2, y: 3, z: 4 })) < 1e-6)
  })

  it('quantises the surface deviation to a whole step the byte can hold', () => {
    const { points, triangles } = createBox(unit)
    const { surfaceDeviation } = getMassProperties([createHull(0, points, triangles)], points)
    const steps = surfaceDeviation * 0xfa

    strictEqual(steps, Math.round(steps))
    ok(steps >= 0 && steps <= 0xff)
  })

  it('reads nothing off a hull that only bounds a subtree', () => {
    const { points, triangles } = createBox(unit)
    const terminal = [createHull(0, points, triangles)]
    const both = [...terminal, createHull(0, points, triangles, HullType.Skip)]

    deepStrictEqual(getMassProperties(both, points), getMassProperties(terminal, points))
  })

  // A flat hull encloses no volume, so IVP falls back to the bounding box and its sphere.
  it('falls back to the geometric centre for a hull with nothing to integrate', () => {
    const points = [
      { x: 0, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
      { x: 0, y: 2, z: 0 },
    ]

    const hull = createHull(0, points, [
      [0, 1, 2],
      [0, 2, 1],
    ])

    const { massCenter, rotationInertia } = getMassProperties([hull], points)

    ok(Vector3.equal(massCenter, { x: 1, y: 1, z: 0 }, 1e-6))
    strictEqual(rotationInertia.x, rotationInertia.y)
    strictEqual(rotationInertia.y, rotationInertia.z)
  })
})

describe('createSurface', () => {
  it('derives the mass properties and takes overrides over them', () => {
    const { points, triangles } = createBox(unit)
    const hull = createHull(0, points, triangles)
    const list = points.map((point) => ({ ...point, clientData: 0 }))
    const root = createNode(hull, list)

    const derived = createSurface(root, list)
    const forced = createSurface(root, list, { rotationInertia: { x: 1, y: 2, z: 3 } })

    ok(derived.radius > 0)
    deepStrictEqual(derived.padding, { x: 0, y: 0, z: 0 })
    deepStrictEqual(forced.rotationInertia, { x: 1, y: 2, z: 3 })
    strictEqual(forced.radius, derived.radius)
  })
})

describe('createPart', () => {
  const box = (id: number, minimum: Vector3, maximum: Vector3) => ({
    id,
    ...createBox({ minimum, maximum }),
  })

  const cube = (id: number, x: number) =>
    box(id, { x: x - 1, y: -1, z: -1 }, { x: x + 1, y: 1, z: 1 })

  it('builds a part out of one box that survives the library round trip', () => {
    const part = createPart(0x0badf00d | 0, [cube(0x1111, 0)])
    const [back] = readSurfaceLibrary(BufferView.from(writeSurfaceLibrary([part])))

    ok(back)
    strictEqual(back.id, 0x0badf00d | 0)
    strictEqual(back.fixed, true)
    deepStrictEqual(back.hardpoints, [])
    strictEqual(back.points.length, 8)
    strictEqual(back.root.hull?.type, HullType.Enabled, 'a single hull sits on the root itself')
    strictEqual(back.root.hull.id, 0x1111)
  })

  it('takes the extent from the collision geometry, not from the bounding boxes it adds', () => {
    const part = createPart(1, [cube(1, 0), cube(2, 10)])

    deepStrictEqual(part.minimum, { x: -1, y: -1, z: -1 })
    deepStrictEqual(part.maximum, { x: 11, y: 1, z: 1 })
  })

  it('hangs a box hull on every inner node, as every retail file does', () => {
    const part = createPart(1, [cube(1, 0), cube(2, 10), cube(3, 20)])

    strictEqual([...getNodes(part.root)].length, 5)
    strictEqual(part.root.hull?.type, HullType.Skip)

    for (const node of getNodes(part.root))
      strictEqual(
        node.hull?.type,
        node.left || node.right ? HullType.Skip : HullType.Enabled,
        'inner nodes bound a subtree, leaves terminate',
      )
  })

  it('leaves inner nodes bare when asked, which IVP also emits', () => {
    const part = createPart(1, [cube(1, 0), cube(2, 10)], { bounds: 'none' })

    strictEqual(part.root.hull, undefined)
    strictEqual(part.points.length, 16, 'no box corners were added')
  })

  it('shares one point list across hulls and indexes every point in it', () => {
    // The two boxes meet on a face, so eight corners become twelve.
    const part = createPart(1, [
      box(1, { x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }),
      box(2, { x: 1, y: 0, z: 0 }, { x: 2, y: 1, z: 1 }),
    ])

    strictEqual(part.points.length, 12 + 8, 'twelve shared corners, plus the root bounding box')

    const used = new Set([...getHulls(part.root)].flatMap(({ faces }) => getIndices(faces)))
    strictEqual(used.size, part.points.length)
  })

  it('carries client data through to the shared point list', () => {
    const { points, triangles } = createBox(unit)
    const part = createPart(1, [
      { id: 1, triangles, points: points.map((point) => ({ ...point, clientData: 0x2a })) },
    ])

    ok(part.points.every(({ clientData }) => clientData === 0x2a))
  })

  it('takes the part flags and the mass property overrides it is given', () => {
    const part = createPart(1, [cube(1, 0)], {
      fixed: false,
      hardpoints: [7, 8],
      rotationInertia: { x: 1, y: 2, z: 3 },
      surfaceDeviation: 0,
    })

    strictEqual(part.fixed, false)
    deepStrictEqual(part.hardpoints, [7, 8])
    deepStrictEqual(part.rotationInertia, { x: 1, y: 2, z: 3 })
    strictEqual(part.surfaceDeviation, 0)
  })

  it('is a fixed point once written, read back and written again', () => {
    const parts = [createPart(1, [cube(1, 0), cube(2, 10), cube(3, 20)])]

    const first = BufferView.from(writeSurfaceLibrary(parts))
    const back = readSurfaceLibrary(first)
    const second = BufferView.from(writeSurfaceLibrary(back))

    deepStrictEqual([...second.bytes], [...first.bytes])
    deepStrictEqual(readSurfaceLibrary(second), back)
  })

  it('encloses every point below a node in that node sphere and box', () => {
    const part = createPart(1, [cube(1, 0), cube(2, 10), cube(3, 20)])

    for (const node of getNodes(part.root)) {
      const { minimum, maximum } = getNodeExtent(node)

      for (const hull of getHulls(node))
        for (const index of getIndices(hull.faces)) {
          const point = part.points[index]!

          ok(Vector3.distance(point, node.center) <= node.radius * 1.0001)
          ok(point.x >= minimum.x - 1e-6 && point.x <= maximum.x + 1e-6)
          ok(point.y >= minimum.y - 1e-6 && point.y <= maximum.y + 1e-6)
          ok(point.z >= minimum.z - 1e-6 && point.z <= maximum.z + 1e-6)
        }
    }
  })
})

describe('createHullGeometry', () => {
  /** A cube's eight corners, each repeated per face meeting there, the way a mesh carries them. */
  const seams = (size: number): Vector3[] => {
    const points: Vector3[] = []

    for (const x of [-size, size])
      for (const y of [-size, size])
        for (const z of [-size, size]) points.push({ x, y, z }, { x, y, z }, { x, y, z })

    return points
  }

  it('hands createFaces something it accepts, which is the whole point of it', () => {
    const { points, triangles } = createHullGeometry(1, seams(1))

    strictEqual(points.length, 8)
    strictEqual(createFaces(points, [...triangles]).length, 12)
  })

  it('stamps the hull id on every point, which is retail’s convention', () => {
    const { points } = createHullGeometry(0x1234, seams(1))

    for (const point of points) strictEqual(point.clientData, 0x1234)
    for (const point of createHullGeometry(0x1234, seams(1), { clientData: 0 }).points)
      strictEqual(point.clientData, 0)
  })

  it('leaves a part holding only the hull, not the cloud it came from', () => {
    // A solid cloud whose shell is a cube: the interior must not reach the part's point list.
    const points = [...seams(1)]

    for (let i = -8; i <= 8; i++)
      for (let j = -8; j <= 8; j++) points.push({ x: i / 10, y: j / 10, z: (i * j) / 100 })

    const part = createPart(1, [createHullGeometry(1, points)])

    strictEqual(part.points.length, 8, 'the eight corners, and a single hull needs no box')

    const used = new Set([...getHulls(part.root)].flatMap(({ faces }) => getIndices(faces)))
    strictEqual(used.size, part.points.length)
  })

  it('builds a part from a point cloud that survives the library round trip', () => {
    const parts = [createPart(9, [createHullGeometry(9, seams(2))])]

    const first = BufferView.from(writeSurfaceLibrary(parts))
    const back = readSurfaceLibrary(first)
    const second = BufferView.from(writeSurfaceLibrary(back))

    deepStrictEqual([...second.bytes], [...first.bytes])

    const [part] = back
    ok(part)
    strictEqual(part.points.length, 8)
    strictEqual(part.root.hull?.id, 9)
    deepStrictEqual(part.minimum, { x: -2, y: -2, z: -2 })
    deepStrictEqual(part.maximum, { x: 2, y: 2, z: 2 })
  })

  it('holds the hull inside what a hull can address, however large the cloud', () => {
    // A hull's face index is twelve bits, so 4,096 faces and 2,050 points is the ceiling. The
    // cloud here is well under it; what matters is that the budget is capped rather than open.
    const { points, triangles } = createHullGeometry(1, seams(1), { maxPoints: 1e6 })

    ok(points.length <= 2050)
    ok([...triangles].length <= 4096)
  })
})
