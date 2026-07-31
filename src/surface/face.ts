export type TriangleIndices = [x: number, y: number, z: number]

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
