import Directory from '#/utf/directory.js'
import { readVMeshRef, writeVMeshRef, type VMeshRef } from './ref.js'

/** A part's geometry: one reference into a mesh library, and nothing else. */
export interface VMeshPart {
  type: 'vmeshpart'
  reference: VMeshRef
}

/**
 * Reads a `VMeshPart` directory — a thin wrapper holding one `VMeshRef`.
 *
 * `undefined` when the directory is absent, so a caller can probe for it; a directory that exists
 * without its `VMeshRef` still throws, because that is damage rather than an absence.
 */
export function readVMeshPart(parent: Directory): VMeshPart | undefined {
  const directory = parent.getDirectory('VMeshPart')
  if (!directory) return

  return { type: 'vmeshpart', reference: readVMeshRef(directory) }
}

/** Writes a `VMeshPart` directory holding the part's single `VMeshRef` file. */
export function writeVMeshPart(parent: VMeshPart): Directory {
  const file = writeVMeshRef(parent.reference)
  return new Directory('VMeshPart', [file])
}
