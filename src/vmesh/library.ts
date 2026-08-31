import Directory from '#/utf/directory.js'
import { getResource, type Hashable } from '#/hash.js'
import { readVMeshData, writeVMeshData, type VMeshData } from './data.js'
import type { VMeshRef } from './ref.js'

/**
 * The meshes one file carries. A flat list rather than a map: resolution is global across whatever
 * libraries the consumer has loaded, not per file — see {@link getMesh}.
 */
export type VMeshLibrary = VMeshData[]

/**
 * Reads a `VMeshLibrary` directory, one mesh per subdirectory. An empty library comes back when
 * there is no such directory — a file holding only references is normal, since a `VMeshRef` may
 * name a mesh that lives in another file entirely.
 * @param parent Parent directory (typically root)
 */
export function readVMeshLibrary(parent: Directory): VMeshLibrary {
  const library: VMeshLibrary = []

  const directory = parent.getDirectory('VMeshLibrary')
  if (!directory) return library

  for (const subdirectory of directory.directories) {
    const data = readVMeshData(subdirectory)
    if (!data) continue

    library.push(data)
  }

  return library
}

/**
 * Writes a `VMeshLibrary` directory. Meshes are named by their own `name`, and nothing here checks
 * that a reference elsewhere in the file resolves to one of them.
 */
export function writeVMeshLibrary(values: Iterable<VMeshData>): Directory {
  const directory = new Directory('VMeshLibrary')

  for (const data of values) directory.children.push(writeVMeshData(data))

  return directory
}

/**
 * Finds a mesh in a library by name or by the CRC a `VMeshRef` names it with.
 *
 * Resolution is global rather than per file: a reference carries `meshId` and nothing to say which
 * library holds it, and 530 `INTERFACE/**` references resolve into `INTERFACE/interface.generic.vms`,
 * which the game loads unprompted. So a consumer rendering arbitrary models merges libraries and
 * looks up in the merged set — which is why resolution is the caller's step and not
 * {@link getMeshDraw}'s.
 */
export const getMesh = (library: VMeshLibrary, name: Hashable): VMeshData | undefined =>
  getResource(library, (data) => data.name, name)

/** One `DrawIndexedPrimitive`: a material, and where in the mesh its geometry sits. */
export interface MeshDraw {
  /** CRC of the material name — set the active material before issuing this draw. */
  materialId: number

  /** `StartIndex`: where this group's indices begin in the mesh's index buffer. */
  startIndex: number

  /** Number of indices, `elementCount / 3` triangles for a `TriangleList`. */
  elementCount: number

  /**
   * `BaseVertex` **and** `MinIndex` — the value every one of this group's indices is relative to.
   *
   * Both `ref.vertexStart` and `group.vertexStart` apply and neither is absolute on its own: read
   * with `group.vertexStart` alone the group ranges of references sharing a mesh overlap, and the
   * minimum `group.vertexStart` within a reference is 0 in all 8,792 retail references — groups are
   * numbered from their reference's base, not from the mesh's. 6,535 of those references carry a
   * non-zero `ref.vertexStart`, so dropping it draws the wrong geometry rather than failing.
   */
  baseVertex: number

  /** `NumVertices`: the width of the group's vertex window. `vertexEnd` is inclusive. */
  numVertices: number
}

/**
 * Resolves a reference into one {@link MeshDraw} per group, in index-buffer order.
 *
 * Offsets only — no slice of `indices` or `vertices` comes back. Direct3D takes `BaseVertex` as a
 * draw parameter, and an API without one (WebGL2 has no base vertex) has to fold it into the
 * indices, the attribute pointers or the buffer upload; which of those is a policy this library does
 * not hold. `docs/RENDERER.md` §3.3 weighs the four options.
 *
 * The mesh comes in resolved — see {@link getMesh}.
 */
export function* getMeshDraw(data: VMeshData, reference: VMeshRef): Generator<MeshDraw> {
  const { groupStart, groupCount, indexStart, vertexStart } = reference

  let startIndex = indexStart

  for (let index = 0; index < groupCount; index++) {
    // Stops rather than skips: the group list is dense, so the only way to miss is to run off
    // the end, and continuing past that would walk startIndex forward over nothing.
    const group = data.groups[groupStart + index]
    if (!group) break

    yield {
      materialId: group.materialId,
      startIndex,
      elementCount: group.elementCount,
      baseVertex: vertexStart + group.vertexStart,
      // vertexEnd is the last vertex of the group, not one past it.
      numVertices: Math.max(0, group.vertexEnd - group.vertexStart + 1),
    }

    startIndex += group.elementCount
  }
}
