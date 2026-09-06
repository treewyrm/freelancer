/**
 * Convex hull of a point set, by an incremental QuickHull.
 *
 * Ported from MAXLancer's `GenerateConvexHullQH` (`scripts/ConvexHull.ms`), which extends stock
 * QuickHull in two ways that matter on the boxy, CAD-like geometry a collision hull is built from:
 * a nested 2D QuickHull resolves coplanar tie-clusters instead of picking an arbitrary member of
 * one, and the initial extreme-point search derives its own tolerance at the data's own magnitude.
 * See [SURFACE.md](../../docs/SURFACE.md#convex-hull).
 *
 * Only {@link generateConvexHull} and its two types are public; the rest is the algorithm's own
 * plumbing.
 *
 * Quirks carried over from the original deliberately, flagged again where they occur:
 *
 *  - The nested 2D loop and the 3D main loop select points differently. The 3D loop takes the
 *    globally-farthest point across all active faces each iteration; the 2D loop takes the first
 *    active edge, in ascending index order, that has a usable farthest point.
 *  - Sets are walked in ascending order rather than insertion order, because the original walked
 *    MAXScript BitArrays and several of its tie-breaks depend on that. {@link ascending} is what
 *    that costs; a bitset would make it free, and would be the first thing to reach for if this is
 *    ever pointed at geometry large enough to care.
 *  - Tolerances are compared **absolutely**, not with the magnitude-relative `equal` from
 *    `scalar.ts`. The tolerance is already scaled to the data by {@link getCubeExtremes}, and
 *    scaling it a second time per comparison is not the same thing.
 *
 * Two deviations from the original are fixes rather than ports, both recorded because the next
 * reader will check them against it:
 *
 *  - `GetFacePoints` compares a negative distance against a non-negative running maximum, so every
 *    point below the plane passes the test and it keeps the *last* one in index order rather than
 *    the farthest. {@link getFacePoints} compares magnitudes.
 *  - The original decides what a new point can see by walking `activeFaces`, the faces that still
 *    have a candidate above them. That set says nothing about where a later point lands, and
 *    skipping a face there leaves the point outside a face that stays. Visibility is tested below
 *    against every face still standing. Without it, 68 of the corpus's 5,234 rebuildable hulls come
 *    back dented, one of them by 192% of its own size.
 *
 * Duplicate input points are dropped up front, which the original left as a `TODO`.
 */

import Vector3 from './vector3.js'

/** Three point indices, one per triangle corner, in winding order. */
type Triangle = [a: number, b: number, c: number]

/** Two point indices, a directed edge. */
type Edge = [from: number, to: number]

/** A point flattened onto a plane's local frame. Only what the nested 2D hull needs. */
interface Planar {
  x: number
  y: number
}

/** What a caller decides about a hull. Neither is a fact about the point set. */
export interface ConvexHullOptions {
  /**
   * Stop once the hull reaches this many points, even with points still outside it. Clamped to at
   * least 4 and at most the number of distinct points given.
   *
   * The result is closed either way, but it is then the hull of the points taken so far rather
   * than of the whole set — geometry outside it is geometry a collision hull would not cover.
   */
  maxPoints?: number

  /**
   * Starting tolerance, used only until the extreme-point search derives one at the data's own
   * magnitude. It is what the result falls back to when the data has no magnitude to derive from.
   */
  epsilon?: number
}

/** A convex hull, holding only the points that are on it. */
export interface ConvexHull {
  /** The hull's own points — a subset of the input, with nothing unreferenced. */
  points: Vector3[]

  /**
   * Where each of {@link points} came from in the input list, for carrying attributes across.
   * Coordinate duplicates in the input collapse, and the index kept is the first of them.
   */
  indices: number[]

  /** Triangles indexing {@link points}, wound counter-clockwise seen from outside. */
  triangles: [number, number, number][]
}

// ---------------------------------------------------------------------------
// Set algebra
// ---------------------------------------------------------------------------

function union(a: ReadonlySet<number>, b: ReadonlySet<number>): Set<number> {
  const result = new Set(a)
  for (const x of b) result.add(x)
  return result
}

function difference(a: ReadonlySet<number>, b: ReadonlySet<number>): Set<number> {
  const result = new Set(a)
  for (const x of b) result.delete(x)
  return result
}

function intersection(a: ReadonlySet<number>, b: ReadonlySet<number>): Set<number> {
  const result = new Set<number>()
  for (const x of a) if (b.has(x)) result.add(x)
  return result
}

/**
 * Ascending snapshot of a set. The original walked BitArrays, which iterate in bit-index order,
 * and several of its tie-breaks take the first candidate found — so insertion order would quietly
 * pick a different point.
 */
function ascending(a: ReadonlySet<number>): number[] {
  return [...a].sort((x, y) => x - y)
}

/** Smallest member, or -1 when empty. */
function first(a: ReadonlySet<number>): number {
  let result = -1
  for (const x of a) if (result < 0 || x < result) result = x
  return result
}

// ---------------------------------------------------------------------------
// Plane frame
// ---------------------------------------------------------------------------

/**
 * An orthonormal frame whose implied Z axis is `normal`, for flattening a coplanar cluster.
 *
 * Any consistent tangent will do — the 2D pass returns a partition, not a shape, and
 * {@link generateTriangle} normalizes its own winding — so this only has to be deterministic and
 * free of NaN. It uses the perpendicular-picking idiom of `Quat.fromTo` rather than
 * `Matrix3.lookAt`, which normalizes `cross(up, direction)` with no fallback and so returns NaN
 * for the ±Y sides {@link getCubeExtremes} passes in.
 */
function getBasis(normal: Vector3): { x: Vector3; y: Vector3 } {
  const z = Vector3.normalize(normal)
  const x = Vector3.normalize(Vector3.cross(z, Math.abs(z.x) < 0.9 ? Vector3.x : Vector3.y))

  return { x, y: Vector3.cross(z, x) }
}

/** Expresses a point in a basis's plane, dropping the component along the normal. */
const project = (basis: { x: Vector3; y: Vector3 }, point: Vector3): Planar => ({
  x: Vector3.dot(point, basis.x),
  y: Vector3.dot(point, basis.y),
})

// ---------------------------------------------------------------------------
// Point classification
// ---------------------------------------------------------------------------

/**
 * How a point set falls either side of a face plane or an edge line, with the farthest point and
 * its distance on each side. A point within tolerance of the plane counts as below, so that a hull
 * closes on it rather than extruding towards it forever.
 */
interface PointsMap {
  above: Set<number>
  below: Set<number>

  /** Farthest point index on each side, or -1 when there is none. */
  farthestBelow: number
  farthestAbove: number

  /** Distance to the farthest point on each side, always a non-negative magnitude. */
  heightBelow: number
  heightAbove: number
}

const emptyPointsMap = (): PointsMap => ({
  above: new Set(),
  below: new Set(),
  farthestBelow: -1,
  farthestAbove: -1,
  heightBelow: 0,
  heightAbove: 0,
})

/**
 * Classifies points by which side of the directed line `a → b` they fall on. Ties in perpendicular
 * distance break on the projection parameter along the edge, taking the most outward-projecting
 * point on that side, so a tie resolves to a corner rather than to whichever index came first.
 */
function getEdgePoints(
  edge: Edge,
  vertices: readonly Planar[],
  indices: ReadonlySet<number>,
  epsilon: number,
): PointsMap {
  const result = emptyPointsMap()

  let offsetBelow = Number.MAX_VALUE
  let offsetAbove = -Number.MAX_VALUE

  const a = vertices[edge[0]]!
  const b = vertices[edge[1]]!

  const bd = { x: b.x - a.x, y: b.y - a.y }
  const bdLengthSquared = bd.x * bd.x + bd.y * bd.y

  for (const i of ascending(indices)) {
    const c = vertices[i]!
    const cd = { x: c.x - a.x, y: c.y - a.y }

    /** Which side of the line `c` falls on — the perp-dot product's sign. */
    const cp = bd.x * cd.y - bd.y * cd.x

    /** Position along the edge: 0 at `a`, 1 at `b`. */
    const u = (cd.x * bd.x + cd.y * bd.y) / bdLengthSquared

    // Distance to the foot of the perpendicular rather than |cp| / |bd|. The two agree
    // mathematically and differ in the last bits, and those bits drive the tie-breaks below.
    const px = c.x - (a.x + bd.x * u)
    const py = c.y - (a.y + bd.y * u)
    const d = Math.sqrt(px * px + py * py)

    if (d <= epsilon) {
      result.below.add(i)
    } else if (cp < 0) {
      result.below.add(i)

      if (Math.abs(d - result.heightBelow) <= epsilon) {
        if (u < offsetBelow) {
          result.farthestBelow = i
          offsetBelow = u
        }
      } else if (d > result.heightBelow) {
        result.farthestBelow = i
        result.heightBelow = d
        offsetBelow = u
      }
    } else if (cp > 0) {
      result.above.add(i)

      if (Math.abs(d - result.heightAbove) <= epsilon) {
        if (u > offsetAbove) {
          result.farthestAbove = i
          offsetAbove = u
        }
      } else if (d > result.heightAbove) {
        result.farthestAbove = i
        result.heightAbove = d
        offsetAbove = u
      }
    }
  }

  return result
}

/**
 * Per side of the bounding rectangle, the two points tied at that side's extreme coordinate with
 * the least and greatest coordinate on the other axis — a widest tied pair, not a hull.
 *
 * A run of values each within tolerance of the last never moves the extreme, so a gradual slope
 * can lose the true one. That is the original's behaviour and the tetrahedron search tolerates it.
 */
function getRectangleExtremes(vertices: readonly Planar[], epsilon: number): Set<number> {
  const minimum: Planar = { x: Number.MAX_VALUE, y: Number.MAX_VALUE }
  const maximum: Planar = { x: -Number.MAX_VALUE, y: -Number.MAX_VALUE }

  /** `[left, right, bottom, top]`, each `[least, greatest]` on the other axis; -1 is unset. */
  const extremes: [number, number][] = [
    [-1, -1],
    [-1, -1],
    [-1, -1],
    [-1, -1],
  ]

  /** Widens one side's tied pair. An unset slot takes the point outright. */
  const widen = (side: number, index: number, of: (point: Planar) => number) => {
    const slot = extremes[side]!
    const [lo, hi] = slot
    const value = of(vertices[index]!)

    if (hi < 0 || value > of(vertices[hi]!)) slot[1] = index
    else if (lo < 0 || value < of(vertices[lo]!)) slot[0] = index
  }

  const x = (point: Planar) => point.x
  const y = (point: Planar) => point.y

  for (let v = 0; v < vertices.length; v++) {
    const position = vertices[v]!

    if (Math.abs(position.x - minimum.x) <= epsilon) widen(0, v, y)
    else if (position.x < minimum.x) {
      minimum.x = position.x
      extremes[0] = [v, v]
    }

    if (Math.abs(position.x - maximum.x) <= epsilon) widen(1, v, y)
    else if (position.x > maximum.x) {
      maximum.x = position.x
      extremes[1] = [v, v]
    }

    if (Math.abs(position.y - minimum.y) <= epsilon) widen(2, v, x)
    else if (position.y < minimum.y) {
      minimum.y = position.y
      extremes[2] = [v, v]
    }

    if (Math.abs(position.y - maximum.y) <= epsilon) widen(3, v, x)
    else if (position.y > maximum.y) {
      maximum.y = position.y
      extremes[3] = [v, v]
    }
  }

  const result = new Set<number>()

  for (const [lo, hi] of extremes) {
    if (lo >= 0) result.add(lo)
    if (hi >= 0) result.add(hi)
  }

  return result
}

/**
 * Seed triangle for the 2D hull: the farthest pair among `extremes` is the base edge, and the
 * farthest point off that line is the apex. The apex stays -1 when the extremes are all colinear,
 * and the base stays -1 as well when no two of them are farther apart than the tolerance. The
 * caller handles both.
 *
 * **Mutates `indices`**, removing the corners it consumes — the caller relies on that, which is
 * why the parameter is a `Set` rather than a `ReadonlySet`.
 */
function generateTriangle(
  vertices: readonly Planar[],
  extremes: ReadonlySet<number>,
  indices: Set<number>,
  epsilon: number,
): [number, number, number] {
  let maxDistance = epsilon
  const corners: [number, number, number] = [-1, -1, -1]

  for (const a of ascending(extremes))
    for (const b of ascending(extremes)) {
      if (a === b) continue

      const p = vertices[a]!
      const q = vertices[b]!
      const d = Math.hypot(q.x - p.x, q.y - p.y)

      if (d > maxDistance) {
        maxDistance = d
        corners[0] = a
        corners[1] = b
      }
    }

  if (corners[0] >= 0 && corners[1] >= 0) {
    indices.delete(corners[0])
    indices.delete(corners[1])

    const base = getEdgePoints([corners[0], corners[1]], vertices, indices, epsilon)
    corners[2] = base.heightBelow > base.heightAbove ? base.farthestBelow : base.farthestAbove

    if (corners[2] >= 0) {
      indices.delete(corners[2])

      // Wind the other way, so the apex always ends up on the same side.
      if (base.above.has(corners[2])) [corners[0], corners[2]] = [corners[2], corners[0]]
    }
  }

  return corners
}

/**
 * Runs a 2D QuickHull over a coplanar cluster and returns the points **interior** to it. Both
 * callers only want to know what to discard, never the shape.
 *
 * The degenerate branch — every extreme colinear, or the whole cluster inside one tolerance —
 * is only sound because both callers guarantee a coplanar input. Do not reuse this as a general
 * 2D hull without revisiting that.
 *
 * Returns indices in the **caller's** index space, from both branches: the main branch maps back
 * through `map`, and the degenerate branch maps its corners before subtracting them. This is the
 * one place where a careless edit corrupts results silently rather than throwing.
 */
function getConvexShape(
  vertices: readonly Vector3[],
  indices: ReadonlySet<number>,
  normal: Vector3,
  epsilon: number,
): Set<number> {
  const basis = getBasis(normal)

  /** Local index → the caller's index. */
  const map: number[] = []
  const positions: Planar[] = []

  for (const i of ascending(indices)) {
    map.push(i)
    positions.push(project(basis, vertices[i]!))
  }

  let points = new Set(positions.map((_, i) => i))
  const shape = new Set<number>()

  const extremes = getRectangleExtremes(positions, epsilon)
  const corners = generateTriangle(positions, extremes, points, epsilon)

  if (corners[2] < 0) {
    const [a, b] = corners

    // Colinear: everything but the two line endpoints is interior. With no endpoints either, the
    // whole cluster sits inside one tolerance — one member still has to survive as its boundary,
    // or the caller is left with a tied cluster and no farthest point in it at all.
    const boundary = a >= 0 && b >= 0 ? [map[a]!, map[b]!] : [first(indices)]

    return difference(indices, new Set(boundary))
  }

  let edges = new Set([0, 1, 2])

  const pairs: Edge[] = [
    [corners[0], corners[1]],
    [corners[1], corners[2]],
    [corners[2], corners[0]],
  ]

  const edgePoints = pairs.map((pair) => getEdgePoints(pair, positions, points, epsilon))

  for (const corner of corners) shape.add(corner)

  while (points.size > 0) {
    let inside = new Set(points)
    let t = -1

    for (const p of ascending(edges)) {
      const edge = edgePoints[p]!
      inside = intersection(inside, edge.below)

      // NOTE: the first active edge with a usable farthest point, not the globally farthest one.
      // The 3D loop does take the globally farthest; the asymmetry is the original's.
      if (edge.above.size === 0) edges.delete(p)
      else if (t < 0 && edge.farthestAbove >= 0 && points.has(edge.farthestAbove))
        t = edge.farthestAbove
    }

    points = difference(points, inside)

    if (t < 0) break

    const apex = positions[t]!

    for (const p of ascending(points)) {
      const other = positions[p]!
      if (Math.hypot(apex.x - other.x, apex.y - other.y) <= epsilon) points.delete(p)
    }

    shape.add(t)

    const visible = new Set<number>()
    const starts = new Set<number>()
    const ends = new Set<number>()

    for (const f of ascending(edges))
      if (edgePoints[f]!.above.has(t)) {
        visible.add(f)
        starts.add(pairs[f]![0])
        ends.add(pairs[f]![1])
      }

    // Consecutive visible edges share a vertex that is both an end and a start, so it cancels;
    // what is left is the visible chain's two open ends.
    const from = first(difference(starts, ends))
    const to = first(difference(ends, starts))

    // The polygon is convex by construction, so the visible edges are always an open chain — but
    // rounding on a near-degenerate cluster can leave `t` seeing all of it, and then there are no
    // open ends to cone from. Stop with what the hull has rather than index with -1.
    if (from < 0 || to < 0) break

    for (const pair of [
      [from, t],
      [t, to],
    ] satisfies Edge[]) {
      edges.add(pairs.length)
      pairs.push(pair)
      edgePoints.push(getEdgePoints(pair, positions, points, epsilon))
    }

    edges = difference(edges, visible)
  }

  const result = new Set<number>()
  for (let i = 0; i < positions.length; i++) if (!shape.has(i)) result.add(map[i]!)

  return result
}

/**
 * Classifies points by signed distance to a face's plane. When three or more tie for the farthest
 * distance on a side — a coplanar patch beyond the face, which boxy geometry produces constantly —
 * which of them is a genuine boundary point is settled by a nested 2D hull rather than by index
 * order.
 */
function getFacePoints(
  face: Triangle,
  vertices: readonly Vector3[],
  indices: ReadonlySet<number>,
  epsilon: number,
): PointsMap {
  const origin = vertices[face[0]]!

  const normal = Vector3.normalize(
    Vector3.cross(
      Vector3.subtract(vertices[face[1]]!, origin),
      Vector3.subtract(vertices[face[2]]!, origin),
    ),
  )

  const offset = -Vector3.dot(normal, origin)
  const result = emptyPointsMap()

  let top = new Set<number>()
  let bottom = new Set<number>()

  for (const i of ascending(indices)) {
    const d = Vector3.dot(normal, vertices[i]!) + offset

    if (Math.abs(d) <= epsilon) {
      result.below.add(i)
    } else if (d < 0) {
      result.below.add(i)

      // As a magnitude, the same as the positive side below. The original compares the signed
      // distance against this non-negative running maximum, which every below-side point passes,
      // so it keeps the last point in index order instead of the farthest.
      const ad = -d

      if (Math.abs(ad - result.heightBelow) <= epsilon) {
        bottom.add(i)
      } else if (ad > result.heightBelow) {
        result.heightBelow = ad
        bottom = new Set([i])
      }
    } else {
      result.above.add(i)

      if (Math.abs(d - result.heightAbove) <= epsilon) {
        top.add(i)
      } else if (d > result.heightAbove) {
        result.heightAbove = d
        top = new Set([i])
      }
    }
  }

  /**
   * The tied cluster's first genuine boundary point, by a 2D hull when there is a cluster at all.
   * Both calls narrow against the whole of `indices` rather than against what the other left,
   * which is equivalent: the two clusters are disjoint and the 2D hull returns a subset of what it
   * was handed, so neither discard can reach into the other's cluster.
   */
  const settle = (tied: Set<number>, towards: Vector3): number =>
    tied.size < 3
      ? first(tied)
      : first(
          intersection(tied, difference(indices, getConvexShape(vertices, tied, towards, epsilon))),
        )

  result.farthestBelow = settle(bottom, Vector3.multiplyScalar(normal, -1))
  result.farthestAbove = settle(top, normal)

  return result
}

/**
 * Every point tied at a bounding-box side's extreme coordinate, per side — not one point per axis,
 * which is what stock QuickHull takes and what loses the tetrahedron on symmetric input. A side
 * holding more than two is reduced to its 2D hull boundary first, so a flat cluster does not hand
 * the tetrahedron search hundreds of coplanar candidates.
 *
 * Also derives the tolerance everything downstream uses: one float32 ULP at the data's own
 * magnitude — its distance from the origin, not its size, so a small part modelled far out gets a
 * coarse one. That is the right scale anyway, because a `.sur` stores points as float32 and two
 * points closer than a ULP there are the same point once written.
 *
 * Returns no extremes at all when the box is flat on an axis, since a coplanar set has no
 * tetrahedron in it.
 */
function getCubeExtremes(
  vertices: readonly Vector3[],
  indices: ReadonlySet<number>,
  initial: number,
): { extremes: Set<number>; epsilon: number } {
  const minimum: Vector3 = { x: Number.MAX_VALUE, y: Number.MAX_VALUE, z: Number.MAX_VALUE }
  const maximum: Vector3 = { x: -Number.MAX_VALUE, y: -Number.MAX_VALUE, z: -Number.MAX_VALUE }
  const limits: Vector3 = { x: 0, y: 0, z: 0 }

  /** `[-x, -y, -z, +x, +y, +z]`. */
  const extremes: Set<number>[] = [new Set(), new Set(), new Set(), new Set(), new Set(), new Set()]

  const axes = ['x', 'y', 'z'] as const

  for (let i = 0; i < vertices.length; i++) {
    const position = vertices[i]!

    for (const [axis, name] of axes.entries()) {
      if (Math.abs(position[name] - minimum[name]) <= initial) extremes[axis]!.add(i)
      else if (position[name] < minimum[name]) {
        minimum[name] = position[name]
        extremes[axis] = new Set([i])
      }

      if (Math.abs(position[name] - maximum[name]) <= initial) extremes[axis + 3]!.add(i)
      else if (position[name] > maximum[name]) {
        maximum[name] = position[name]
        extremes[axis + 3] = new Set([i])
      }

      limits[name] = Math.max(limits[name], Math.abs(position[name]))
    }
  }

  // One float32 ULP — 23 mantissa bits — at the data's magnitude. A point set with no magnitude to
  // measure, everything sitting on the origin, leaves nothing to derive from and the caller's
  // tolerance is all there is. The original rounds the exponent where this truncates it, which
  // makes the tolerance at most one ULP rather than the nearest one.
  const derived = 2 ** (Math.floor(Math.log2(Math.max(limits.x, limits.y, limits.z))) - 23)
  const epsilon = derived > 0 && Number.isFinite(derived) ? derived : initial

  const size = Vector3.subtract(maximum, minimum)

  if (!(size.x > epsilon && size.y > epsilon && size.z > epsilon))
    return { extremes: new Set(), epsilon }

  const sides: Vector3[] = [
    { x: -1, y: 0, z: 0 },
    { x: 0, y: -1, z: 0 },
    { x: 0, y: 0, z: -1 },
    Vector3.x,
    Vector3.y,
    Vector3.z,
  ]

  let result = new Set<number>()
  let remaining = new Set(indices)

  for (const [side, tied] of extremes.entries()) {
    if (tied.size <= 2) {
      result = union(result, tied)
      continue
    }

    const discarded = getConvexShape(vertices, tied, sides[side]!, epsilon)

    result = union(result, intersection(tied, difference(remaining, discarded)))
    remaining = difference(remaining, discarded)
  }

  return { extremes: result, epsilon }
}

/**
 * The initial simplex: the farthest pair among `extremes` is the base edge, the farthest point off
 * that line is the third corner, and the farthest point off their plane — either side — is the
 * fourth. Winding is chosen so all four faces end up facing outward.
 *
 * **Mutates `indices`**, removing all four corners, which the caller relies on. Returns nothing
 * when any step finds no point beyond tolerance, which is a colinear, coplanar or coincident set.
 */
function generateTetrahedron(
  vertices: readonly Vector3[],
  extremes: ReadonlySet<number>,
  indices: Set<number>,
  epsilon: number,
): Triangle[] | undefined {
  let maxDistance = epsilon
  const corners: [number, number, number, number] = [-1, -1, -1, -1]

  for (const a of ascending(extremes))
    for (const b of ascending(extremes)) {
      if (a === b) continue

      const d = Vector3.distance(vertices[a]!, vertices[b]!)

      if (d > maxDistance) {
        maxDistance = d
        corners[0] = a
        corners[1] = b
      }
    }

  if (corners[0] < 0 || corners[1] < 0) return
  indices.delete(corners[0])
  indices.delete(corners[1])

  maxDistance = epsilon

  const origin = vertices[corners[0]]!
  const ab = Vector3.subtract(vertices[corners[1]]!, origin)
  const abLength = Vector3.magnitude(ab)

  for (const i of ascending(indices)) {
    const d =
      Vector3.magnitude(Vector3.cross(ab, Vector3.subtract(vertices[i]!, origin))) / abLength

    if (d > maxDistance) {
      maxDistance = d
      corners[2] = i
    }
  }

  if (corners[2] < 0) return
  indices.delete(corners[2])

  const base = getFacePoints([corners[0], corners[1], corners[2]], vertices, indices, epsilon)
  corners[3] = base.heightBelow > base.heightAbove ? base.farthestBelow : base.farthestAbove

  if (corners[3] < 0) return
  indices.delete(corners[3])

  const [x, y, z, w] = corners

  return base.above.has(w)
    ? [
        [z, y, x],
        [w, x, y],
        [w, y, z],
        [w, z, x],
      ]
    : [
        [x, y, z],
        [y, x, w],
        [z, y, w],
        [x, z, w],
      ]
}

/**
 * The four things `createFaces` requires of a hull, checked here so that a failure names the hull
 * rather than a half-edge key: no directed edge wound twice, every one paired with its reverse, no
 * degenerate triangle, and Euler's `V = 2 + F / 2` over the points the faces use.
 *
 * The first and the last are what a reverse-edge check alone misses. Visibility is decided per
 * face by a plane test with no connectivity constraint, so rounding on near-coplanar input can
 * make the visible region pinch at a vertex — two cone triangles then wind the same edge to the
 * apex — or split in two, which closes but has the wrong Euler characteristic.
 *
 * Returns the problem as a clause, or nothing when there is none.
 */
function getDefect(faces: readonly Triangle[], vertices: readonly Vector3[]): string | undefined {
  const edges = new Set<string>()

  for (const [a, b, c] of faces) {
    for (const [from, to] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const key = `${from},${to}`
      if (edges.has(key)) return `half-edge ${key} is wound twice`

      edges.add(key)
    }

    const normal = Vector3.cross(
      Vector3.subtract(vertices[b]!, vertices[a]!),
      Vector3.subtract(vertices[c]!, vertices[a]!),
    )

    if (!Vector3.dot(normal, normal)) return `the triangle on ${a}, ${b} and ${c} has no area`
  }

  for (const key of edges) {
    const [from, to] = key.split(',')
    if (!edges.has(`${to},${from}`)) return `half-edge ${key} closes nothing`
  }

  const used = new Set(faces.flat()).size
  const needed = 2 + faces.length / 2

  if (used !== needed) return `${faces.length} faces need ${needed} points, not ${used}`
}

/**
 * Convex hull of a point set, wound counter-clockwise seen from outside — the winding
 * `createFaces` assumes, so the result drops straight into a `HullGeometry`.
 *
 * The hull holds only the points that are on it. Coordinate duplicates, interior points and points
 * within tolerance of one already taken are all dropped, and the triangles are re-indexed onto what
 * is left. That is what keeps a hull's point count down to what the format can address, and what
 * stops `createPart` from folding a mesh's whole interior into a part's shared point list.
 *
 * Two ways the result can fail to contain every input point, both inherited and neither an error:
 * `maxPoints` stops the loop early, and a face whose farthest point has already been taken can
 * never be chosen again, so an iteration that finds no candidate at all discards what is left.
 * @throws RangeError when fewer than four distinct points are given, when any coordinate is not
 * finite, or when no four of them form a tetrahedron — every point on one plane, line or spot.
 */
export function generateConvexHull(
  source: readonly Vector3[],
  options: ConvexHullOptions = {},
): ConvexHull {
  const { maxPoints = source.length, epsilon: initial = 0.00001 } = options

  if (source.length < 4)
    throw new RangeError(`A convex hull needs at least four points, not ${source.length}`)

  if (!Number.isFinite(maxPoints))
    throw new RangeError(`A point budget of ${maxPoints} is not a count`)

  for (const [index, point] of source.entries())
    if (!Vector3.isFinite(point)) throw new RangeError(`Point ${index} is not finite`)

  // Mesh data repeats a position once per seam it sits on, and three coincident points in one tied
  // cluster leave the nested 2D hull with no pair to build a shape on. The main loop's tolerance
  // cull only fires after a point has been chosen, so duplicates have to go before any of this —
  // which is the one thing the original left as a TODO.
  const seen = new Map<string, number>()
  const origins: number[] = []

  for (const [index, { x, y, z }] of source.entries()) {
    const key = `${x},${y},${z}`
    if (seen.has(key)) continue

    seen.set(key, origins.length)
    origins.push(index)
  }

  const points = origins.map((index) => source[index]!)

  if (points.length < 4)
    throw new RangeError(`A convex hull needs at least four distinct points, not ${points.length}`)

  const budget = Math.max(4, Math.min(Math.trunc(maxPoints), points.length))

  let indices = new Set(points.map((_, i) => i))

  const { extremes, epsilon } = getCubeExtremes(points, indices, initial)

  if (extremes.size === 0)
    throw new RangeError('Every point shares one axis-aligned plane, so there is no tetrahedron')

  const tetrahedron = generateTetrahedron(points, extremes, indices, epsilon)

  if (!tetrahedron)
    throw new RangeError('No four points form a tetrahedron — they share a plane, line or spot')

  const faces = [...tetrahedron]
  const facePoints = faces.map((face) => getFacePoints(face, points, indices, epsilon))

  let active = new Set(faces.map((_, i) => i))
  let discarded = new Set<number>()

  const hull = new Set<number>()
  for (let i = 0; i < points.length; i++) if (!indices.has(i)) hull.add(i)

  while (indices.size > 0 && hull.size < budget) {
    let inside = new Set(indices)
    let t = -1
    let height = 0

    for (const f of ascending(active)) {
      const face = facePoints[f]!
      inside = intersection(inside, face.below)

      if (face.above.size === 0) active.delete(f)
      else if (
        face.farthestAbove >= 0 &&
        face.heightAbove > height &&
        indices.has(face.farthestAbove)
      ) {
        t = face.farthestAbove
        height = face.heightAbove
      }
    }

    // `inside` is the intersection of every active face's below set, and `t` is above at least one
    // of them, so narrowing here can never drop the point about to be extruded to.
    indices = difference(indices, inside)

    if (t < 0) break

    // Consumes `t` itself, so a point that goes no further than here is never offered twice.
    for (const i of ascending(indices))
      if (Vector3.distance(points[t]!, points[i]!) <= epsilon) indices.delete(i)

    /**
     * Every face `t` lies outside the plane of. Tested afresh and without a tolerance rather than
     * read off `PointsMap.above`, which counts a point within tolerance of a plane as below it:
     * a face `t` is all but coplanar with then reads as not visible and cuts the visible region in
     * two, and coning over one half of it is what puts a dent in the hull.
     *
     * Every face still standing is tested, not just the active ones. A face leaves `active` once
     * no remaining candidate is above it, which says nothing about where a later point lands —
     * skipping it there leaves the new point outside a face that stays, which is the same dent.
     */
    const seen = new Set<number>()

    for (const [f, [x, y, z]] of faces.entries()) {
      if (discarded.has(f)) continue

      const a = points[x]!

      const normal = Vector3.cross(Vector3.subtract(points[y]!, a), Vector3.subtract(points[z]!, a))

      if (Vector3.dot(normal, Vector3.subtract(points[t]!, a)) > 0) seen.add(f)
    }

    /**
     * The silhouette of a set of faces: an edge shared by two of them appears once each way and
     * cancels, leaving the boundary between what `t` can see and what it cannot.
     *
     * A cone over that boundary is a manifold only if it is one simple cycle — every vertex
     * leaving it once and entering it once. Anything else means the visible patch is pinched at a
     * vertex or is in two pieces, and there is no cone to build; nothing comes back.
     */
    const horizon = (): Edge[] | undefined => {
      const edges: Edge[] = []

      for (const f of ascending(seen)) {
        const [a, b, c] = faces[f]!
        edges.push([a, b], [b, c], [c, a])
      }

      const present = new Set(edges.map(([a, b]) => `${a},${b}`))
      const border = edges.filter(([a, b]) => !present.has(`${b},${a}`))

      const leaving = new Set(border.map(([a]) => a))
      const entering = new Set(border.map(([, b]) => b))

      return leaving.size === border.length && entering.size === border.length ? border : undefined
    }

    // A hull that is convex always shows one connected disk here, and every one of the corpus's
    // 5,234 rebuildable hulls does. Rounding on a hull that has drifted can still pinch it, and
    // there is no cone to build from that — give the point up rather than emit a face that winds
    // an edge twice. It has already left `indices`, so this cannot spin.
    const border = horizon()

    if (!border) continue

    hull.add(t)

    // `t` was never a face vertex — every point already on the hull left `indices` when it was
    // taken — so the cone cannot collide with a face that is staying.
    for (const [a, b] of border) {
      const face: Triangle = [a, b, t]

      active.add(faces.length)
      faces.push(face)
      facePoints.push(getFacePoints(face, points, indices, epsilon))
    }

    active = difference(active, seen)
    discarded = union(discarded, seen)
  }

  const shell = faces.filter((_, i) => !discarded.has(i))
  const defect = getDefect(shell, points)

  if (defect)
    throw new RangeError(`A hull over ${points.length} points came out malformed: ${defect}`)

  // Only the points the shell uses, in first-referenced order. A corner of the initial tetrahedron
  // can be swallowed by a later one, so the set of points taken is not the set the faces index.
  const order = [...new Set(shell.flat())]
  const remap = new Map(order.map((index, at) => [index, at]))

  return {
    points: order.map((index) => points[index]!),
    indices: order.map((index) => origins[index]!),
    triangles: shell.map((face) => face.map((index) => remap.get(index)!) as Triangle),
  }
}
