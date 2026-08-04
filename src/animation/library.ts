import Directory from '#/utf/directory.js'
import { getResource, type Hashable } from '#/hash.js'
import { getScriptDuration, readScript, writeScript, type Script } from './script.js'

/**
 * Animation scripts of a model.
 *
 * Rigid compound models embed the library in the `.cmp` file next to `Cmpnd`, deformable models
 * keep it in a standalone `.anm` file. Both use the same structures.
 */
export type AnimationLibrary = Script[]

/** Library duration in seconds, the longest of its scripts. */
export function getLibraryDuration(library: AnimationLibrary): number {
  let duration = 0
  for (const script of library) duration = Math.max(duration, getScriptDuration(script))

  return duration
}

/** Finds script by name. */
export const getScript = (library: AnimationLibrary, name: Hashable): Script | undefined =>
  getResource(library, ({ name }) => name, name)

/**
 * Reads animation library from file root directory.
 * @param parent File root directory
 * @returns
 */
export function readAnimationLibrary(parent: Directory): AnimationLibrary {
  const library: AnimationLibrary = []

  const directory = parent.getDirectory('Animation', 'Script')
  if (!directory) return library

  for (const subdirectory of directory.directories) library.push(readScript(subdirectory))

  return library
}

/**
 * Writes animation library into directory.
 * @param scripts Animation scripts
 * @returns
 */
export function writeAnimationLibrary(scripts: Iterable<Script>): Directory {
  const directory = new Directory('Animation')
  const parent = directory.setDirectory('Script')

  for (const script of scripts) parent.children.push(writeScript(script))

  return directory
}
