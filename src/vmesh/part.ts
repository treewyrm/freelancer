import Directory from '#/directory.js'
import { readVMeshRef, writeVMeshRef, type VMeshRef } from './ref.js'

export interface VMeshPart {
  type: 'vmeshpart'
  reference: VMeshRef
}

export const readVMeshPart = (parent: Directory): VMeshPart => {
  const directory = parent.getDirectory('VMeshPart')
  if (!directory) throw new Error(`Missing VMeshPart in ${parent.name}`)

  return { type: 'vmeshpart', reference: readVMeshRef(directory) }
}

export const writeVMeshPart = (parent: VMeshPart): Directory =>
  new Directory('VMeshPart', [writeVMeshRef(parent.reference)])
