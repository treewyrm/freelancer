import Directory from '#/utf/directory.js'
import { readMultiLevel, writeMultiLevel, type MultiLevel } from '#/vmesh/multilevel.js'
import { readVMeshPart, writeVMeshPart, type VMeshPart } from '#/vmesh/part.js'
import { readVMeshWire, writeVMeshWire, type VMeshWire } from '#/vmesh/wireframe.js'
import { isCamera, readCamera, writeCamera, type Camera } from './camera.js'
import { isCompoundModel, type Model, readModel, writeModel } from '#/compound/model.js'
import { readHardpoints, writeHardpoints, type Hardpoint } from '#/compound/hardpoint.js'
import { isSphere, readSphere, writeSphere, type Sphere } from './sphere.js'

/** What a rigid part hangs its geometry off: one reference, or a switch over several. */
export type MeshSource = MultiLevel | VMeshPart

/**
 * A geometry part: what it draws, where things attach to it, and its wireframe overlay.
 *
 * `part` is optional — a hierarchy's group nodes carry hardpoints and children but no geometry of
 * their own.
 */
export interface Rigid {
  type: 'rigid'
  hardpoints: Hardpoint[]
  part?: MeshSource
  wireframe?: VMeshWire
}

/** What a `.3db` fragment can be. Only {@link Rigid} carries geometry. */
export type RigidPart = Rigid | Camera | Sphere

/**
 * A rigid model in either form the container allows: a `Cmpnd` hierarchy of parts for a `.cmp`, or
 * the single part a `.3db` or `.sph` writes straight to the file root.
 */
export type RigidModel = Model<RigidPart> | RigidPart

/**
 * Reads a geometry part: its hardpoints, its mesh source and its wireframe overlay.
 *
 * A part need not have geometry — `part` is absent for the group nodes a hierarchy hangs children
 * off — so nothing here throws on an empty fragment. Detail levels win over a bare reference where
 * both somehow appear.
 */
export function readRigid(parent: Directory): Rigid {
  const hardpoints = [...readHardpoints(parent)]
  const part = readMultiLevel(parent) ?? readVMeshPart(parent)
  const wire = readVMeshWire(parent)

  return { type: 'rigid', hardpoints, part, wireframe: wire }
}

/**
 * Writes a geometry part into an unnamed directory, for the caller to name — a compound part takes
 * its name from the fragment filename, a `.3db` root has none.
 *
 * Absent pieces stay absent: no empty `Hardpoints` directory is emitted for a part carrying none.
 */
export function writeRigid(rigid: Rigid): Directory {
  const { part, hardpoints, wireframe: wire } = rigid
  const directory = new Directory()

  switch (part?.type) {
    case 'vmeshpart':
      directory.children.push(writeVMeshPart(part))
      break
    case 'multilevel':
      directory.children.push(writeMultiLevel(part))
      break
  }

  if (hardpoints.length) directory.children.push(writeHardpoints(hardpoints))
  if (wire) directory.children.push(writeVMeshWire(wire))

  return directory
}

/**
 * Reads one part fragment, dispatching on what the directory holds. Camera and sphere are probed
 * for by name; anything else is geometry, which is the only form with no marker of its own.
 */
export function readPart(parent: Directory): RigidPart {
  if (isCamera(parent)) return readCamera(parent)
  if (isSphere(parent)) return readSphere(parent)
  return readRigid(parent)
}

/**
 * Writes one part fragment into an unnamed directory, for the caller to name. Camera and sphere
 * fragments are wrapped, since their readers return the inner directory.
 */
export function writePart(part: RigidPart): Directory {
  switch (part.type) {
    case 'rigid':
      return writeRigid(part)
    case 'camera':
      return new Directory(undefined, [writeCamera(part)])
    case 'sphere':
      return new Directory(undefined, [writeSphere(part)])
  }
}

/**
 * Reads a rigid model from a file root, either form: a `Cmpnd` hierarchy for a `.cmp`, or the single
 * part a `.3db` or `.sph` carries at the root.
 *
 * `MaterialAnim` is a root-level sibling of `Cmpnd` and is not part of the model — read it from the
 * same root with `readMaterialAnimLibrary`.
 * @param parent File root directory
 */
export function readRigidModel(parent: Directory): RigidModel {
  if (isCompoundModel(parent)) return readModel(parent, readPart)
  return readPart(parent)
}

/**
 * Writes a rigid model to a file root, in whichever of the two forms the model is — a hierarchy, or
 * a lone part written straight to the root.
 */
export function writeRigidModel(model: RigidModel): Directory {
  switch (model.type) {
    case 'rigid':
      return writeRigid(model)
    case 'compound':
      return writeModel(model, writePart)
    case 'camera':
    case 'sphere':
      return writePart(model)
  }
}
