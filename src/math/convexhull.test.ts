import { describe, it } from 'node:test'
import { deepStrictEqual, ok, strictEqual, throws } from 'node:assert/strict'
import { generateConvexHull, type ConvexHull } from './convexhull.js'
import Vector3 from './vector3.js'

/** The eight corners of a cube about the origin. */
const cube = (size = 1): Vector3[] => {
  const points: Vector3[] = []

  for (const x of [-size, size])
    for (const y of [-size, size]) for (const z of [-size, size]) points.push({ x, y, z })

  return points
}

const tetrahedron: Vector3[] = [
  { x: 0, y: 0, z: 0 },
  { x: 1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: 0, y: 0, z: 1 },
]

/** A deterministic point cloud, so a failure is reproducible. */
function* random(count: number, seed = 1): Generator<number> {
  for (let i = 0, value = seed; i < count; i++)
    yield (value = (value * 1103515245 + 12345) % 2147483648) / 2147483648
}

/** `count` points spread over the unit sphere. */
const sphere = (count: number): Vector3[] => {
  const values = [...random(count * 2)]
  const points: Vector3[] = []

  for (let i = 0; i < count; i++) {
    const a = Math.acos(2 * values[i * 2]! - 1)
    const b = values[i * 2 + 1]! * Math.PI * 2

    points.push({ x: Math.sin(a) * Math.cos(b), y: Math.sin(a) * Math.sin(b), z: Math.cos(a) })
  }

  return points
}

/**
 * What `createFaces` demands of a hull, asserted here rather than by importing it — `math` sits
 * below `surface` and may not reach up into it. `surface.test.ts` makes the real call.
 */
const isWellFormed = ({ points, triangles }: ConvexHull) => {
  const edges = new Set<string>()

  for (const [a, b, c] of triangles)
    for (const key of [`${a},${b}`, `${b},${c}`, `${c},${a}`]) {
      ok(!edges.has(key), `half-edge ${key} is wound twice`)
      edges.add(key)
    }

  for (const key of edges) {
    const [from, to] = key.split(',')
    ok(edges.has(`${to},${from}`), `half-edge ${key} closes nothing`)
  }

  const used = new Set(triangles.flat())

  strictEqual(used.size, 2 + triangles.length / 2, "Euler's V = 2 + F / 2")
  strictEqual(used.size, points.length, 'every point is indexed by some triangle')
}

/** How far outside the hull the farthest of `points` lies. Negative when every one is inside. */
const outside = ({ points, triangles }: ConvexHull, against: readonly Vector3[]): number => {
  let worst = -Infinity

  for (const [x, y, z] of triangles) {
    const a = points[x]!

    const normal = Vector3.normalize(
      Vector3.cross(Vector3.subtract(points[y]!, a), Vector3.subtract(points[z]!, a)),
    )

    for (const point of against)
      worst = Math.max(worst, Vector3.dot(normal, Vector3.subtract(point, a)))
  }

  return worst
}

describe('generateConvexHull', () => {
  it('keeps the eight corners of a cube and triangulates them', () => {
    const hull = generateConvexHull(cube())

    strictEqual(hull.points.length, 8)
    strictEqual(hull.triangles.length, 12)
    isWellFormed(hull)
  })

  it('keeps the four corners of a tetrahedron', () => {
    const hull = generateConvexHull(tetrahedron)

    strictEqual(hull.points.length, 4)
    strictEqual(hull.triangles.length, 4)
    isWellFormed(hull)
  })

  it('drops points inside the hull', () => {
    const hull = generateConvexHull([
      ...cube(),
      { x: 0, y: 0, z: 0 },
      { x: 0.5, y: 0.1, z: -0.2 },
      { x: -0.9, y: 0.9, z: 0.9 },
    ])

    strictEqual(hull.points.length, 8)
    strictEqual(hull.triangles.length, 12)
  })

  it('drops the coordinate duplicates mesh data arrives with', () => {
    // A mesh repeats a corner once per seam meeting there, so a cube reaches a hull as 24 points.
    const seams = cube().flatMap((point) => [point, { ...point }, { ...point }])

    strictEqual(seams.length, 24)

    const hull = generateConvexHull(seams)

    strictEqual(hull.points.length, 8)
    strictEqual(hull.triangles.length, 12)
    isWellFormed(hull)
  })

  it('resolves a coplanar tie-cluster rather than keeping the whole patch', () => {
    // Five points across each face of a cube, so every face plane ties a nine-point cluster —
    // the case the nested 2D hull exists for, and the one a stock QuickHull picks blindly from.
    const points: Vector3[] = []

    for (const axis of [0, 1, 2])
      for (const side of [-1, 1])
        for (let i = -1; i <= 1; i++)
          for (let j = -1; j <= 1; j++) {
            const value = [0, 0, 0]

            value[axis] = side
            value[(axis + 1) % 3] = i
            value[(axis + 2) % 3] = j

            points.push({ x: value[0]!, y: value[1]!, z: value[2]! })
          }

    const hull = generateConvexHull(points)

    strictEqual(hull.points.length, 8, 'only the corners are on the hull')
    strictEqual(hull.triangles.length, 12)
    isWellFormed(hull)
  })

  it('contains every point it was given', () => {
    const points = sphere(500)
    const hull = generateConvexHull(points)

    isWellFormed(hull)
    ok(outside(hull, points) < 1e-12, 'no point lies outside a face plane')
  })

  it('winds every triangle so its normal points away from the hull', () => {
    const points = sphere(200)
    const { points: hull, triangles } = generateConvexHull(points)

    // The sphere is centred on the origin, so an outward face faces away from its own corners.
    for (const [x, y, z] of triangles) {
      const a = hull[x]!

      const normal = Vector3.cross(Vector3.subtract(hull[y]!, a), Vector3.subtract(hull[z]!, a))

      ok(Vector3.dot(normal, a) > 0)
    }
  })

  it('says where each of its points came from', () => {
    const points = [...cube(), { x: 0, y: 0, z: 0 }]
    const { points: hull, indices } = generateConvexHull(points)

    strictEqual(indices.length, hull.length)
    for (const [at, index] of indices.entries()) deepStrictEqual(hull[at], points[index])
  })

  it('stops at the point budget and still closes', () => {
    const points = sphere(500)
    const hull = generateConvexHull(points, { maxPoints: 20 })

    strictEqual(hull.points.length, 20)
    isWellFormed(hull)

    // The budget buys a smaller hull, not a broken one — it just no longer contains everything.
    ok(outside(hull, points) > 0)
  })

  it('takes the whole hull rather than a budget below a tetrahedron', () => {
    strictEqual(generateConvexHull(cube(), { maxPoints: 1 }).points.length, 4)
  })

  it('holds up on a solid cloud, keeping only its shell', () => {
    const values = [...random(3000)]
    const points: Vector3[] = []

    for (let i = 0; i < 1000; i++)
      points.push({
        x: values[i * 3]! * 2 - 1,
        y: values[i * 3 + 1]! * 2 - 1,
        z: values[i * 3 + 2]! * 2 - 1,
      })

    const hull = generateConvexHull(points)

    isWellFormed(hull)
    ok(hull.points.length < points.length / 4, 'the interior is gone')
    ok(outside(hull, points) < 1e-12)
  })

  it('derives a tolerance at the data’s own magnitude, so a distant model still works', () => {
    const hull = generateConvexHull(
      cube().map(({ x, y, z }) => ({ x: x + 1e4, y: y + 1e4, z: z + 1e4 })),
    )

    strictEqual(hull.points.length, 8)
    strictEqual(hull.triangles.length, 12)
  })

  it('works on a model small enough that a fixed tolerance would swallow it', () => {
    const hull = generateConvexHull(cube(1e-4))

    strictEqual(hull.points.length, 8)
    strictEqual(hull.triangles.length, 12)
  })

  it('refuses fewer than four points', () => {
    throws(() => generateConvexHull(tetrahedron.slice(0, 3)), {
      name: 'RangeError',
      message: 'A convex hull needs at least four points, not 3',
    })
  })

  it('refuses four points that are the same point', () => {
    throws(() => generateConvexHull([0, 1, 2, 3].map(() => ({ x: 1, y: 1, z: 1 }))), {
      name: 'RangeError',
      message: 'A convex hull needs at least four distinct points, not 1',
    })
  })

  it('refuses a coplanar set, naming the plane when it is axis-aligned', () => {
    throws(() => generateConvexHull([...cube()].map(({ x, y }) => ({ x, y, z: 0 }))), {
      name: 'RangeError',
      message: /axis-aligned plane/,
    })
  })

  it('refuses a coplanar set that is not axis-aligned', () => {
    const points: Vector3[] = []
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) points.push({ x: i, y: j, z: i + j })

    throws(() => generateConvexHull(points), {
      name: 'RangeError',
      message: /No four points form a tetrahedron/,
    })
  })

  it('refuses a colinear set', () => {
    throws(() => generateConvexHull([0, 1, 2, 3].map((i) => ({ x: i, y: i, z: i }))), {
      name: 'RangeError',
      message: /No four points form a tetrahedron/,
    })
  })

  it('refuses a coordinate that is not finite', () => {
    throws(() => generateConvexHull([...tetrahedron.slice(0, 3), { x: 0, y: 0, z: NaN }]), {
      name: 'RangeError',
      message: 'Point 3 is not finite',
    })

    throws(() => generateConvexHull([...tetrahedron.slice(0, 3), { x: 0, y: 0, z: Infinity }]), {
      name: 'RangeError',
      message: 'Point 3 is not finite',
    })
  })

  it('refuses a budget that is not a count, rather than returning the bare tetrahedron', () => {
    throws(() => generateConvexHull(cube(), { maxPoints: NaN }), {
      name: 'RangeError',
      message: 'A point budget of NaN is not a count',
    })
  })
})
