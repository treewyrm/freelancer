import Directory from '#/directory.js'
import { readMultiLevel, writeMultiLevel, type MultiLevel } from '#/vmesh/multilevel.js'
import { readVMeshPart, writeVMeshPart, type VMeshPart } from '#/vmesh/part.js'
import { readCamera, writeCamera, type Camera } from './camera.js'
import { type Model, readModel, writeModel } from './model.js'
import { readHardpoints, writeHardpoints, type Hardpoint } from './hardpoint.js'

export interface Rigid {
  type: 'rigid'
  hardpoints: Hardpoint[]
  part?: MultiLevel | VMeshPart
}

export type RigidModel = Model<Rigid | Camera> | Rigid | Camera

export function readRigid(parent: Directory): Rigid {
  const hardpoints = [...readHardpoints(parent)]
  const part = readMultiLevel(parent) ?? readVMeshPart(parent)

  return { type: 'rigid', hardpoints, part }
}

export function writeRigid(rigid: Rigid): Directory {
  const { part, hardpoints } = rigid
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

  return directory
}

export function readPart(directory: Directory) {
  try {
    return readCamera(directory)
  } catch (cause) {
    return readRigid(directory)
  }
}

export function writePart(part: Rigid | Camera) {
  switch (part.type) {
    case 'rigid':
      return writeRigid(part)
    case 'camera':
      return writeCamera(part)
  }
}

export function readRigidModel(directory: Directory): RigidModel {
  try {
    return readModel(directory, readPart)
  } catch (cause) {
    return readPart(directory)
  }
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
