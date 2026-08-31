import Vector3 from '#/math/vector3.js'

/** Three point indices, one per triangle corner, in winding order. */
export type TriangleIndices = [x: number, y: number, z: number]

/** A per-edge flag triple, indexed the same way {@link TriangleIndices} is. */
export type TriangleFlags = [x: boolean, y: boolean, z: boolean]

/** Hull triangle face. Corresponds to IVP's `IVP_Compact_Triangle`. */
export interface Face {
  /** Material index (7 bits). Freelancer leaves this at zero. */
  material: number

  /** Whether the face belongs to a hull that merely bounds a subtree (type 5). */
  virtual: boolean

  /** Face reached by casting a ray opposite to this face's normal. */
  pierce: number

  /** Point index, into the part's shared point list, at which each edge starts. */
  points: TriangleIndices

  /** Flat index (`face * 3 + edge`) of the half-edge opposing each edge. */
  opposites: TriangleIndices

  /** Per-edge counterpart of {@link virtual}. Should be true when hull type is 5. */
  virtualEdges: TriangleFlags
}

/**
 * Outward normal of a triangle wound counter-clockwise seen from outside, unnormalized — its
 * magnitude is twice the triangle's area. This is IVP's `hesse` vector, `(b - a) x (c - a)`, and
 * the winding every reader here assumes.
 */
export const getNormal = (a: Vector3, b: Vector3, c: Vector3): Vector3 =>
  Vector3.cross(Vector3.subtract(b, a), Vector3.subtract(c, a))

/**
 * IVP's `insert_pierce_info`. Each face is paired with the one whose normal points most nearly the
 * other way, walking the list in order and passing over a face that already has a partner — but
 * still offering it as one, which overwrites what it was given. That is why the result is *not* an
 * involution, and neither is retail's.
 *
 * The order walked here is the face list; IVP walked its own, which the compact ledge does not
 * record, so a tie it broke is not recoverable. See [SURFACE.md](../../docs/SURFACE.md).
 */
function getPierceIndices(normals: Vector3[]): number[] {
  const pierce = new Array<number>(normals.length).fill(-1)

  for (const [index, normal] of normals.entries()) {
    if (pierce[index]! >= 0) continue

    let found = -1

    // IVP starts the search at -1e-6, so a face never pierces itself and never pairs with one
    // facing the same way.
    let minimum = -1e-6

    for (const [other, against] of normals.entries()) {
      const value = Vector3.dot(normal, against)
      if (value >= minimum) continue

      minimum = value
      found = other
    }

    if (found < 0) throw new RangeError(`Face ${index} faces away from nothing`)

    pierce[index] = found
    pierce[found] = index
  }

  return pierce
}

/**
 * Builds the face list of one convex hull from triangles indexing a shared point list, deriving
 * the half-edge adjacency and pierce indices the format records but does not let a writer omit.
 *
 * Triangles must be wound counter-clockwise seen from outside and must close the hull: every
 * half-edge needs the matching one running the other way, or there is nothing to put in
 * {@link Face.opposites}. The point count is checked against Euler's `V = 2 + F / 2`, which the
 * ledge size the writer encodes assumes.
 */
export function createFaces(
  points: readonly Vector3[],
  triangles: Iterable<TriangleIndices>,
  virtual = false,
): Face[] {
  const list = [...triangles]
  const normals: Vector3[] = []

  /** Flat index `face * 3 + edge` of the half-edge leaving point `a` for point `b`. */
  const edges = new Map<string, number>()

  for (const [index, triangle] of list.entries()) {
    const [a, b, c] = triangle.map((value) => points[value])

    if (!a || !b || !c) throw new RangeError(`Triangle ${index} indexes a point that is not there`)

    const normal = getNormal(a, b, c)
    if (!Vector3.dot(normal, normal)) throw new RangeError(`Triangle ${index} is degenerate`)

    normals.push(Vector3.normalize(normal))

    for (let v = 0; v < 3; v++) {
      const key = `${triangle[v]},${triangle[(v + 1) % 3]}`
      if (edges.has(key)) throw new RangeError(`Half-edge ${key} is wound by two triangles`)

      edges.set(key, index * 3 + v)
    }
  }

  const indices = new Set(list.flat())

  if (indices.size !== 2 + list.length / 2)
    throw new RangeError(
      `A closed convex hull of ${list.length} faces needs ${2 + list.length / 2} points, not ${indices.size}`,
    )

  const pierce = getPierceIndices(normals)

  return list.map((triangle, index) => ({
    material: 0,
    virtual,
    pierce: pierce[index]!,
    points: [...triangle],
    opposites: triangle.map((_, v) => {
      const key = `${triangle[(v + 1) % 3]},${triangle[v]}`
      const opposite = edges.get(key)

      if (opposite === undefined) throw new RangeError(`Half-edge ${key} closes nothing`)
      return opposite
    }) as TriangleIndices,
    virtualEdges: [virtual, virtual, virtual],
  }))
}
