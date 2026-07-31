import Directory from '#/directory.js'
import { readMultiLevel, writeMultiLevel, type MultiLevel } from '#/vmesh/multilevel.js'
import { readVMeshPart, writeVMeshPart, type VMeshPart } from '#/vmesh/part.js'
import { readVMeshWire, writeVMeshWire, type VMeshWire } from '#/vmesh/wireframe.js'
import { isCamera, readCamera, writeCamera, type Camera } from './camera.js'
import { isCompoundModel, type Model, readModel, writeModel } from './model.js'
import { readHardpoints, writeHardpoints, type Hardpoint } from './hardpoint.js'

export interface Rigid {
  type: 'rigid'
  hardpoints: Hardpoint[]
  part?: MultiLevel | VMeshPart
  wireframe?: VMeshWire
}

export type RigidPart = Rigid | Camera

export type RigidModel = Model<RigidPart> | RigidPart

export function readRigid(parent: Directory): Rigid {
  const hardpoints = [...readHardpoints(parent)]
  const part = readMultiLevel(parent) ?? readVMeshPart(parent)
  const wire = readVMeshWire(parent)

  return { type: 'rigid', hardpoints, part, wireframe: wire }
}

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

export function readPart(directory: Directory): RigidPart {
  if (isCamera(directory)) return readCamera(directory)
  return readRigid(directory)
}

export function writePart(part: RigidPart): Directory {
  switch (part.type) {
    case 'rigid':
      return writeRigid(part)
    case 'camera':
      return writeCamera(part)
  }
}

export function readRigidModel(directory: Directory): RigidModel {
  if (isCompoundModel(directory)) return readModel(directory, readPart)
  return readPart(directory)
}

export function writeRigidModel(model: RigidModel): Directory {
  switch (model.type) {
    case 'rigid':
      return writeRigid(model)
    case 'compound':
      return writeModel(model, writePart)
    case 'camera':
      return writeCamera(model)
  }
}
