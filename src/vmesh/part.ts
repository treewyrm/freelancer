import Directory from '#/utf/directory.js'
import { readVMeshRef, writeVMeshRef, type VMeshRef } from './ref.js'

export interface VMeshPart {
  type: 'vmeshpart'
  reference: VMeshRef
}

export function readVMeshPart(parent: Directory): VMeshPart | undefined {
  const directory = parent.getDirectory('VMeshPart')
  if (!directory) return

  return { type: 'vmeshpart', reference: readVMeshRef(directory) }
}

export function writeVMeshPart(parent: VMeshPart): Directory {
  const file = writeVMeshRef(parent.reference)
  return new Directory('VMeshPart', [file])
}
