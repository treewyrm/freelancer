import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import Shape, { type BoxShape, type CylinderShape, type RingShape } from './shape.js'
import Quat from './quat.js'
import Vector3 from './vector3.js'
import Vector4 from './vector4.js'

const at = (x = 0, y = 0, z = 0): Vector3 => ({ x, y, z })
const turn = (axis: Vector3, angle: number): Quat => Quat.axisAngle({ axis, angle })

const sphere = (radius: number, center = at()): Shape => ({ type: 'sphere', center, radius })
const ellipsoid = (radii: Vector3, center = at(), orientation: Quat = Quat.identity): Shape => ({
  type: 'ellipsoid',
  center,
  orientation,
  radii,
})
const box = (size: Vector3, center = at(), orientation: Quat = Quat.identity): BoxShape => ({
  type: 'box',
  center,
  orientation,
  size,
})
const cylinder = (
  radius: number,
  height: number,
  center = at(),
  orientation: Quat = Quat.identity,
): CylinderShape => ({
  type: 'cylinder',
  center,
  orientation,
  radius,
  height,
})
const ring = (
  radius: number,
  innerRadius: number,
  height: number,
  center = at(),
  orientation: Quat = Quat.identity,
): RingShape => ({ type: 'ring', center, orientation, radius, innerRadius, height })

describe('Shape.contains', () => {
  it('sphere in sphere: by centre distance plus radius, touching allowed', () => {
    assert.equal(Shape.contains(sphere(10), sphere(4, at(6))), true)
    assert.equal(Shape.contains(sphere(10), sphere(4, at(6.01))), false)
    assert.equal(Shape.contains(sphere(10), sphere(10)), true)
  })

  it('a shape contains itself, rotated or not', () => {
    const q = Vector4.normalize(Quat.fromEuler(0.3, 1.1, -0.7))
    for (const shape of [
      ellipsoid(at(3, 5, 7), at(1, 2, 3), q),
      box(at(3, 5, 7), at(1, 2, 3), q),
      cylinder(4, 9, at(1, 2, 3), q),
      ring(4, 2, 9, at(1, 2, 3), q),
    ])
      assert.equal(Shape.contains(shape, shape), true, shape.type)
  })

  it('box in box: rotation decides', () => {
    const outer = box(at(10, 10, 10))
    assert.equal(Shape.contains(outer, box(at(7, 7, 7))), true)
    assert.equal(Shape.contains(outer, box(at(7, 7, 7), at(), turn(Vector3.z, Math.PI / 4))), true)
    assert.equal(Shape.contains(outer, box(at(8, 8, 8), at(), turn(Vector3.z, Math.PI / 4))), false)
  })

  it('box in sphere: by its corners', () => {
    assert.equal(Shape.contains(sphere(Math.sqrt(3)), box(at(2, 2, 2))), true)
    assert.equal(Shape.contains(sphere(Math.sqrt(3) - 0.001), box(at(2, 2, 2))), false)
  })

  it('sphere in ellipsoid: limited by the shortest semi-axis away from the centre', () => {
    const outer = ellipsoid(at(10, 4, 6))
    assert.equal(Shape.contains(outer, sphere(4)), true)
    assert.equal(Shape.contains(outer, sphere(4.01)), false)
    // Near the tip a sphere tighter than the ellipse's curvature (16/10) is stopped by the tip…
    assert.equal(Shape.contains(outer, sphere(1, at(9))), true)
    assert.equal(Shape.contains(outer, sphere(1, at(9.01))), false)
    // …and a looser one by the flanks before it reaches it: at 8 its tip touches, its side is out.
    assert.equal(Shape.contains(outer, sphere(2, at(7.9))), true)
    assert.equal(Shape.contains(outer, sphere(2, at(8))), false)
  })

  it('cylinder in cylinder: height and radius both bind, and tilt counts', () => {
    const outer = cylinder(5, 10)
    assert.equal(Shape.contains(outer, cylinder(5, 10)), true)
    assert.equal(Shape.contains(outer, cylinder(3, 6, at(2, 2))), true)
    assert.equal(Shape.contains(outer, cylinder(3, 6, at(2.1, 0))), false)
    assert.equal(Shape.contains(outer, cylinder(3, 6, at(0, 2.1))), false)
    assert.equal(Shape.contains(outer, cylinder(1, 9, at(), turn(Vector3.x, Math.PI / 2))), true)
    assert.equal(
      Shape.contains(outer, cylinder(1, 10.1, at(), turn(Vector3.x, Math.PI / 2))),
      false,
    )
  })

  it('anything in a ring must miss the hole', () => {
    const outer = ring(10, 4, 4)
    assert.equal(Shape.contains(outer, sphere(1, at(7))), true)
    assert.equal(Shape.contains(outer, sphere(1.5, at(5.5))), true)
    assert.equal(Shape.contains(outer, sphere(1.6, at(5.5))), false)
    assert.equal(Shape.contains(outer, box(at(2, 2, 2), at(0, 0, 7), turn(Vector3.y, 0.4))), true)
    assert.equal(Shape.contains(outer, cylinder(1, 2)), false)
  })

  it('a ring in a ring clears the hole through its own', () => {
    const outer = ring(10, 4, 4)
    assert.equal(Shape.contains(outer, ring(9, 5, 2)), true)
    assert.equal(Shape.contains(outer, ring(9, 4, 2)), true)
    assert.equal(Shape.contains(outer, ring(9, 3, 2)), false)
    assert.equal(Shape.contains(outer, ring(8, 5, 2, at(0.5))), true)
    assert.equal(Shape.contains(outer, ring(8, 5, 2, at(1.5))), false)
    assert.equal(Shape.contains(outer, ring(9, 5, 2, at(), turn(Vector3.y, 1))), true)
  })

  it('an outer with a zero dimension contains nothing', () => {
    assert.equal(Shape.contains(sphere(0), sphere(0)), false)
    assert.equal(Shape.contains(box(at(1, 0, 1)), sphere(0)), false)
  })
})

/** The outer's gauge: at most 1 exactly on and inside a convex outer. */
const gauge = (outer: Shape, point: Vector3): number => {
  const d = Vector3.subtract(point, outer.center)
  const q = outer.type === 'sphere' ? Quat.identity : outer.orientation
  const l = Quat.transform(d, Quat.conjugate(q))

  switch (outer.type) {
    case 'sphere':
      return Vector3.magnitude(l) / outer.radius
    case 'ellipsoid':
      return Math.hypot(l.x / outer.radii.x, l.y / outer.radii.y, l.z / outer.radii.z)
    case 'box':
      return Math.max(
        Math.abs(l.x) / (outer.size.x / 2),
        Math.abs(l.y) / (outer.size.y / 2),
        Math.abs(l.z) / (outer.size.z / 2),
      )
    case 'cylinder':
    case 'ring':
      return Math.max(Math.abs(l.y) / (outer.height / 2), Math.hypot(l.x, l.z) / outer.radius)
  }
}

/** Points on the inner's surface — enough of them that the largest gauge is near the true one. */
const surface = (shape: Shape, count: number): Vector3[] => {
  const q = shape.type === 'sphere' ? Quat.identity : shape.orientation
  const place = (l: Vector3): Vector3 => Vector3.add(shape.center, Quat.transform(l, q))
  const points: Vector3[] = []

  for (let i = 0; i < count; i++) {
    const u = Vector3.normalize(
      at(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1),
    )
    switch (shape.type) {
      case 'sphere':
        points.push(place(Vector3.multiplyScalar(u, shape.radius)))
        break
      case 'ellipsoid':
        points.push(place(Vector3.multiply(u, shape.radii)))
        break
      case 'box': {
        // A random face, a random point on it: the corners alone bound the gauge, not the axis.
        const l = { ...u }
        const face = (['x', 'y', 'z'] as const)[i % 3]!
        l[face] = Math.sign(l[face]) || 1
        if (i % 4 === 0) Object.assign(l, at(Math.sign(u.x), Math.sign(u.y), Math.sign(u.z)))
        points.push(place(Vector3.multiply(l, Vector3.multiplyScalar(shape.size, 0.5))))
        break
      }
      case 'cylinder':
      case 'ring': {
        // A third on the caps, the rest on the side, and a share of each on the rims.
        const a = Math.random() * Math.PI * 2
        const cap = i % 3 === 0
        const r = cap && i % 2 === 0 ? Math.sqrt(Math.random()) * shape.radius : shape.radius
        const y =
          (cap || i % 4 === 1 ? (Math.random() < 0.5 ? -0.5 : 0.5) : Math.random() - 0.5) *
          shape.height
        points.push(place(at(Math.cos(a) * r, y, Math.sin(a) * r)))
        break
      }
    }
  }

  return points
}

const randomShape = (scale: number, convexOnly: boolean): Shape => {
  const r = () => (0.2 + Math.random()) * scale
  const center = at(
    (Math.random() - 0.5) * scale,
    (Math.random() - 0.5) * scale,
    (Math.random() - 0.5) * scale,
  )
  const orientation = Vector4.normalize(
    Quat.fromEuler(Math.random() * 6.3, Math.random() * 6.3, Math.random() * 6.3),
  )
  const kinds = convexOnly ? 4 : 5
  switch (Math.floor(Math.random() * kinds)) {
    case 0:
      return sphere(r(), center)
    case 1:
      return ellipsoid(at(r(), r(), r()), center, orientation)
    case 2:
      return box(at(r(), r(), r()), center, orientation)
    case 3:
      return cylinder(r(), r(), center, orientation)
    default:
      return ring(r(), 0, r(), center, orientation)
  }
}

describe('Shape.contains against sampled surfaces', () => {
  it('never says "fits" when a point sticks out, and never misses a clear violation', () => {
    let fits = 0
    let misses = 0

    for (let trial = 0; trial < 3000; trial++) {
      const outer = randomShape(10, true)
      const inner = randomShape(3, false)
      const worst = Math.max(...surface(inner, 4000).map((p) => gauge(outer, p)))

      if (Shape.contains(outer, inner)) {
        fits++
        assert.ok(worst <= 1 + 1e-6, `${outer.type} ⊇ ${inner.type}: a sample reaches ${worst}`)
      } else {
        misses++
        assert.ok(worst > 0.97, `${outer.type} ⊉ ${inner.type}: samples reach only ${worst}`)
      }
    }

    assert.ok(fits > 100 && misses > 100, `${fits} fit, ${misses} do not`)
  })
})

describe('Shape.contains a ring, against sampled surfaces', () => {
  it('agrees with the outer cylinder and the hole both', () => {
    let fits = 0
    let misses = 0

    for (let trial = 0; trial < 3000; trial++) {
      const outer = randomShape(10, false)
      if (outer.type !== 'ring') continue
      outer.radius *= 2
      outer.innerRadius = outer.radius * Math.random() * 0.6
      const inner = randomShape(3, false)
      const points = surface(inner, 4000)
      const local = (p: Vector3) =>
        Quat.transform(Vector3.subtract(p, outer.center), Quat.conjugate(outer.orientation))
      const worst = Math.max(...points.map((p) => gauge(outer, p)))
      const nearest = Math.min(...points.map((p) => Math.hypot(local(p).x, local(p).z)))

      if (Shape.contains(outer, inner)) {
        fits++
        assert.ok(worst <= 1 + 1e-6, `ring ⊇ ${inner.type}: a sample reaches ${worst}`)
        assert.ok(
          nearest >= outer.innerRadius * (1 - 1e-6),
          `ring ⊇ ${inner.type}: a sample in the hole`,
        )
      } else {
        misses++
        assert.ok(
          worst > 0.97 || nearest < outer.innerRadius * 1.03 + 0.03,
          `ring ⊉ ${inner.type}: samples reach ${worst}, ${nearest} from the axis`,
        )
      }
    }

    assert.ok(fits > 20 && misses > 20, `${fits} fit, ${misses} do not`)
  })
})
