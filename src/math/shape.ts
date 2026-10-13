import Quat from './quat.js'
import Vector3 from './vector3.js'

/** Solid sphere. It has no orientation. */
export interface SphereShape {
  type: 'sphere'
  center: Vector3
  radius: number
}

/** Solid ellipsoid with its semi-axes along the local axes. */
export interface EllipsoidShape {
  type: 'ellipsoid'
  center: Vector3
  orientation: Quat
  radii: Vector3
}

/** Solid box with its full edge lengths along the local axes. */
export interface BoxShape {
  type: 'box'
  center: Vector3
  orientation: Quat
  size: Vector3
}

/** Solid cylinder about the local y axis, `height` being the full length. */
export interface CylinderShape {
  type: 'cylinder'
  center: Vector3
  orientation: Quat
  radius: number
  height: number
}

/**
 * The solid between two coaxial cylinders about the local y axis: `radius` is the outer one,
 * `innerRadius` the hole, `height` the full length. Assumes `0 ≤ innerRadius ≤ radius`.
 */
export interface RingShape {
  type: 'ring'
  center: Vector3
  orientation: Quat
  radius: number
  innerRadius: number
  height: number
}

/** A solid in world space. Orientations are unit quaternions; dimensions are non-negative. */
type Shape = SphereShape | EllipsoidShape | BoxShape | CylinderShape | RingShape

/** Relative tolerance on every comparison, so that a shape touching the outer one from inside fits. */
const TOLERANCE = 1e-9

const within = (value: number, limit: number): boolean =>
  value <= limit + TOLERANCE * Math.max(1, Math.abs(limit))

/** A shape's frame: its centre and its local axes in world space. */
interface Frame {
  center: Vector3
  x: Vector3
  y: Vector3
  z: Vector3
}

const frameOf = (shape: Shape): Frame => {
  if (shape.type === 'sphere')
    return { center: shape.center, x: Vector3.x, y: Vector3.y, z: Vector3.z }

  const { center, orientation } = shape
  return {
    center,
    x: Quat.transform(Vector3.x, orientation),
    y: Quat.transform(Vector3.y, orientation),
    z: Quat.transform(Vector3.z, orientation),
  }
}

/**
 * An affine ball `{ center + axes · u : |u| ≤ 1 }`, the axes being the images of the unit vectors.
 * A point, a disc, a sphere or an ellipsoid, in any frame and under any linear map.
 */
interface Ball {
  center: Vector3
  axes: [Vector3, Vector3, Vector3]
}

const ZERO_AXES = (): Ball['axes'] => [Vector3.zero, Vector3.zero, Vector3.zero]

/**
 * Balls whose convex hull is the shape's. A convex outer contains a shape exactly when it contains
 * the hull, and the hull's extreme points all lie on these balls, so every test below runs on them.
 * A ring's hull is its outer cylinder.
 */
const ballsOf = (shape: Shape): Ball[] => {
  const { center, x, y, z } = frameOf(shape)
  const scale = Vector3.multiplyScalar

  switch (shape.type) {
    case 'sphere': {
      const r = shape.radius
      return [{ center, axes: [scale(x, r), scale(y, r), scale(z, r)] }]
    }
    case 'ellipsoid': {
      const { radii } = shape
      return [{ center, axes: [scale(x, radii.x), scale(y, radii.y), scale(z, radii.z)] }]
    }
    case 'box': {
      const balls: Ball[] = []
      for (const sx of [-0.5, 0.5])
        for (const sy of [-0.5, 0.5])
          for (const sz of [-0.5, 0.5]) {
            const corner = Vector3.add(
              center,
              Vector3.add(
                scale(x, sx * shape.size.x),
                Vector3.add(scale(y, sy * shape.size.y), scale(z, sz * shape.size.z)),
              ),
            )
            balls.push({ center: corner, axes: ZERO_AXES() })
          }
      return balls
    }
    case 'cylinder':
    case 'ring': {
      const r = shape.radius
      const h = shape.height / 2
      const axes: Ball['axes'] = [scale(x, r), Vector3.zero, scale(z, r)]
      return [
        { center: Vector3.add(center, scale(y, h)), axes },
        { center: Vector3.subtract(center, scale(y, h)), axes },
      ]
    }
  }
}

/** Applies `p ↦ m · (p − origin)` to a ball, `m` given by its rows. */
const mapBall = (
  ball: Ball,
  rows: [Vector3, Vector3, Vector3],
  origin: Vector3 = Vector3.zero,
): Ball => {
  const apply = (v: Vector3): Vector3 => ({
    x: Vector3.dot(rows[0], v),
    y: Vector3.dot(rows[1], v),
    z: Vector3.dot(rows[2], v),
  })
  const [a, b, c] = ball.axes

  return {
    center: apply(Vector3.subtract(ball.center, origin)),
    axes: [apply(a), apply(b), apply(c)],
  }
}

/** `Lᵀ · d`, where `L` has the ball's axes as columns. */
const project = ({ axes: [a, b, c] }: Ball, d: Vector3): Vector3 => ({
  x: Vector3.dot(a, d),
  y: Vector3.dot(b, d),
  z: Vector3.dot(c, d),
})

/** How far the ball reaches along `d`: the largest `p · d` over its points. */
const supportValue = (ball: Ball, d: Vector3): number =>
  Vector3.dot(ball.center, d) + Vector3.magnitude(project(ball, d))

/** The point of the ball that reaches furthest along `d`. */
const supportPoint = (ball: Ball, d: Vector3): Vector3 => {
  const u = project(ball, d)
  const length = Vector3.magnitude(u)
  if (length === 0) return ball.center

  const [a, b, c] = ball.axes
  const { x, y, z } = Vector3.divideScalar(u, length)
  return Vector3.add(
    ball.center,
    Vector3.add(
      Vector3.multiplyScalar(a, x),
      Vector3.add(Vector3.multiplyScalar(b, y), Vector3.multiplyScalar(c, z)),
    ),
  )
}

/** Eigenvalues and unit eigenvectors of a symmetric 3x3 matrix, by cyclic Jacobi rotations. */
const eigen = (m: number[][]): { values: number[]; vectors: number[][] } => {
  const a = m.map((row) => [...row])
  const v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ]
  const at = (i: number, j: number): number => a[i]![j]!

  for (let sweep = 0; sweep < 64; sweep++) {
    const off = at(0, 1) ** 2 + at(0, 2) ** 2 + at(1, 2) ** 2
    const diagonal = at(0, 0) ** 2 + at(1, 1) ** 2 + at(2, 2) ** 2
    if (off <= 1e-30 * diagonal || off === 0) break

    for (const [p, q] of [
      [0, 1],
      [0, 2],
      [1, 2],
    ] as const) {
      const apq = at(p, q)
      if (apq === 0) continue

      const theta = (at(q, q) - at(p, p)) / (2 * apq)
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1))
      const c = 1 / Math.sqrt(t * t + 1)
      const s = t * c

      for (let k = 0; k < 3; k++) {
        const akp = at(k, p)
        const akq = at(k, q)
        a[k]![p] = c * akp - s * akq
        a[k]![q] = s * akp + c * akq
      }
      for (let k = 0; k < 3; k++) {
        const apk = at(p, k)
        const aqk = at(q, k)
        a[p]![k] = c * apk - s * aqk
        a[q]![k] = s * apk + c * aqk
      }
      for (let k = 0; k < 3; k++) {
        const vkp = v[k]![p]!
        const vkq = v[k]![q]!
        v[k]![p] = c * vkp - s * vkq
        v[k]![q] = s * vkp + c * vkq
      }
    }
  }

  return {
    values: [at(0, 0), at(1, 1), at(2, 2)],
    vectors: [0, 1, 2].map((k) => [v[0]![k]!, v[1]![k]!, v[2]![k]!]),
  }
}

/**
 * The largest `|p|²` over the ball's points: maximising `|q + L·u|²` on `|u| ≤ 1`.
 *
 * By trust-region duality the maximum is `min over μ ≥ λmax of g(μ) = μ + |q|² + Σ βᵢ² / (μ − λᵢ)`,
 * with `λ` the eigenvalues of `LᵀL` and `β` the components of `Lᵀq` in its eigenbasis. `g` is convex,
 * its slope `1 − Σ βᵢ² / (μ − λᵢ)²` crosses zero once in `[λmax, λmax + |β|]`, and bisection finds it.
 * Every `g(μ)` is an upper bound, so the answer never errs towards "fits".
 */
const farthest = (ball: Ball): number => {
  const { center: q, axes } = ball
  const qq = Vector3.dot(q, q)
  const gram = axes.map((a) => axes.map((b) => Vector3.dot(a, b)))
  const lq = axes.map((a) => Vector3.dot(a, q))
  const { values, vectors } = eigen(gram)
  const beta = vectors.map((v) => v[0]! * lq[0]! + v[1]! * lq[1]! + v[2]! * lq[2]!)

  const top = Math.max(...values)
  const reach = Math.hypot(...beta)
  if (reach === 0) return qq + top

  const g = (mu: number): number =>
    beta.reduce((sum, b, i) => (b === 0 ? sum : sum + (b * b) / (mu - values[i]!)), mu + qq)
  const slope = (mu: number): number =>
    1 - beta.reduce((sum, b, i) => (b === 0 ? sum : sum + (b / (mu - values[i]!)) ** 2), 0)

  let lo = top
  let hi = top + reach
  for (let i = 0; i < 128 && lo < hi; i++) {
    const mid = (lo + hi) / 2
    if (mid === lo || mid === hi) break
    if (slope(mid) < 0) lo = mid
    else hi = mid
  }

  return g(hi)
}

interface Point2 {
  x: number
  y: number
}

const dot2 = (a: Point2, b: Point2): number => a.x * b.x + a.y * b.y

/** The point of segment `ab` nearest the origin, and the part of `ab` it lies on. */
const nearestOnSegment = (a: Point2, b: Point2): [Point2, Point2[]] => {
  const ab = { x: b.x - a.x, y: b.y - a.y }
  const length = dot2(ab, ab)
  const t = length === 0 ? 0 : -dot2(a, ab) / length
  if (t <= 0) return [a, [a]]
  if (t >= 1) return [b, [b]]
  return [{ x: a.x + t * ab.x, y: a.y + t * ab.y }, [a, b]]
}

/**
 * Whether every point of a convex planar set lies at least `radius` from the origin, the set given
 * by its support mapping. GJK: each step yields a point of the set, whose distance bounds the answer
 * from above, and a supporting line, whose distance bounds it from below.
 */
const clearOf = (support: (d: Point2) => Point2, start: Point2, radius: number): boolean => {
  if (radius <= 0) return true

  const slack = TOLERANCE * Math.max(1, radius)
  let v = start
  let simplex: Point2[] = [start]

  for (let i = 0; i < 64; i++) {
    const distance = Math.hypot(v.x, v.y)
    if (distance < radius - slack) return false

    const w = support({ x: -v.x, y: -v.y })
    const lower = dot2(v, w) / distance
    if (lower >= radius - slack) return true
    if (distance - lower <= slack) return false

    simplex = [...simplex, w]
    if (simplex.length === 3) {
      const [a, b, c] = simplex as [Point2, Point2, Point2]
      const cross = (p: Point2, q: Point2): number => p.x * q.y - p.y * q.x
      const ab = cross(a, b)
      const bc = cross(b, c)
      const ca = cross(c, a)
      if ((ab >= 0 && bc >= 0 && ca >= 0) || (ab <= 0 && bc <= 0 && ca <= 0)) return false

      const edges = [nearestOnSegment(a, b), nearestOnSegment(b, c), nearestOnSegment(c, a)]
      ;[v, simplex] = edges.reduce((best, edge) =>
        dot2(edge[0], edge[0]) < dot2(best[0], best[0]) ? edge : best,
      )
    } else {
      ;[v, simplex] = nearestOnSegment(simplex[0]!, simplex[1]!)
    }
  }

  return false
}

/** Whether the balls, in a frame where the outer cylinder's axis is y, fit its radius and height. */
const withinCylinder = (balls: Ball[], radius: number, height: number): boolean => {
  const h = height / 2
  if (!balls.every((ball) => within(supportValue(ball, Vector3.y), h))) return false
  if (!balls.every((ball) => within(supportValue(ball, { x: 0, y: -1, z: 0 }), h))) return false

  const flatten: [Vector3, Vector3, Vector3] = [Vector3.x, Vector3.zero, Vector3.z]
  return balls.every((ball) => within(farthest(mapBall(ball, flatten)), radius * radius))
}

const Shape = {
  /**
   * Whether `inner` lies wholly inside `outer`, surfaces touching allowed.
   *
   * Exact for every pair but one: a ring inside a ring whose axes are not parallel, where the inner
   * ring's hull reaches into the outer's hole, answers `false` even when the inner ring's own hole
   * would leave room. An outer with a zero dimension contains nothing.
   */
  contains(outer: Shape, inner: Shape): boolean {
    const frame = frameOf(outer)
    const local = ballsOf(inner).map((ball) =>
      mapBall(ball, [frame.x, frame.y, frame.z], frame.center),
    )

    switch (outer.type) {
      case 'sphere':
      case 'ellipsoid': {
        const r =
          outer.type === 'sphere'
            ? { x: outer.radius, y: outer.radius, z: outer.radius }
            : outer.radii
        if (!(r.x > 0 && r.y > 0 && r.z > 0)) return false

        const unit: [Vector3, Vector3, Vector3] = [
          { x: 1 / r.x, y: 0, z: 0 },
          { x: 0, y: 1 / r.y, z: 0 },
          { x: 0, y: 0, z: 1 / r.z },
        ]
        return local.every((ball) => within(farthest(mapBall(ball, unit)), 1))
      }
      case 'box': {
        const { size } = outer
        if (!(size.x > 0 && size.y > 0 && size.z > 0)) return false

        return [Vector3.x, Vector3.y, Vector3.z].every((axis) => {
          const h = Vector3.dot(axis, size) / 2
          const back = Vector3.multiplyScalar(axis, -1)
          return local.every(
            (ball) => within(supportValue(ball, axis), h) && within(supportValue(ball, back), h),
          )
        })
      }
      case 'cylinder': {
        if (!(outer.radius > 0 && outer.height > 0)) return false
        return withinCylinder(local, outer.radius, outer.height)
      }
      case 'ring': {
        if (!(outer.radius > 0 && outer.height > 0)) return false
        if (!withinCylinder(local, outer.radius, outer.height)) return false

        const support = (d: Point2): Point2 => {
          const direction = { x: d.x, y: 0, z: d.y }
          const best = local.reduce((a, b) =>
            supportValue(b, direction) > supportValue(a, direction) ? b : a,
          )
          const p = supportPoint(best, direction)
          return { x: p.x, y: p.z }
        }
        const start = { x: local[0]!.center.x, y: local[0]!.center.z }
        if (clearOf(support, start, outer.innerRadius)) return true

        // The hull reaches into the hole. A ring can still clear it through its own hole, which it
        // does when the two are parallel and the outer's hole lies wholly inside the inner's.
        if (inner.type !== 'ring') return false

        const axis = Quat.transform(Vector3.y, inner.orientation)
        const offset = Vector3.subtract(inner.center, frame.center)
        if (!within(1, Math.abs(Vector3.dot(axis, frame.y)))) return false

        const along = Vector3.dot(offset, frame.y)
        const across = Math.sqrt(Math.max(0, Vector3.dot(offset, offset) - along * along))
        return within(across + outer.innerRadius, inner.innerRadius)
      }
    }
  },
}

export default Shape
