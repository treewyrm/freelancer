export type TriangleIndices = [x: number, y: number, z: number]

export type TriangleFlags = [x: boolean, y: boolean, z: boolean]

/** Hull triangle face. */
export interface Face {
  /** Face properties. Most significant bit should be set when hull type is 5. */
  flag: number

  /** Opposite face index. Cast a ray opposite to face normal to find which opposite face is. */
  opposite: number

  /** Edge indices referencing point index in hulls' part. */
  edges: TriangleIndices

  /** Adjacent edges in a hull. */
  adjacent: TriangleIndices

  /** Face edge boolean state. Should be true when hull type is 5. */
  state: TriangleFlags
}
