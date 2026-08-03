/**
 * The two libraries a `.ale` container holds, read out of a directory.
 *
 * Every one of the 596 retail effect files has exactly the same shape: a directory
 * `AlchemyNodeLibrary` holding one file of that name, and a directory `ALEffectLib` holding one
 * file of that name. Nothing else, and never one without the other. The rest of this module reads
 * from a {@link BufferView} rather than a {@link Directory}, because the two libraries are plain
 * byte streams and neither knows it lives in a UTF tree — so the unwrapping has to happen
 * somewhere, and doing it once here spares every consumer from rediscovering the two names.
 *
 * `undefined` rather than a throw when the directories are absent: a caller handed an arbitrary
 * UTF file is asking whether this one carries effects, which is the same question `readMaterials`
 * answers by yielding nothing.
 */
import Directory from '#/directory.js'
import File from '#/file.js'
import BufferView from '#/utility/bufferview.js'
import { readEffectLibrary, writeEffectLibrary, type EffectLibrary } from './effect.js'
import { readNodeLibrary, writeNodeLibrary, type NodeLibrary } from './node.js'

const nodeName = 'AlchemyNodeLibrary'

const effectName = 'ALEffectLib'

/** Both libraries of one `.ale`, which are only ever found together. */
export interface Alchemy {
  nodes: NodeLibrary
  effects: EffectLibrary
}

/** Whether the directory carries an effect library, asked before reading it. */
export const hasAlchemy = (parent: Directory): boolean => !!parent.getDirectory(effectName)

/**
 * Reads both libraries from a directory, looking for the two names within.
 *
 * Only the root level is searched, as `readMaterials` and `readTextures` do.
 * @param parent Parent directory (typically root)
 */
export function readAlchemy(parent: Directory): Alchemy | undefined {
  const node = parent.getDirectory(nodeName)?.getFile(nodeName)
  const effect = parent.getDirectory(effectName)?.getFile(effectName)

  if (!node || !effect) return undefined

  return {
    nodes: readNodeLibrary(BufferView.from(node)),
    effects: readEffectLibrary(BufferView.from(effect)),
  }
}

/**
 * Writes both libraries as the two sibling directories they are.
 *
 * Two directories rather than one root, because they sit at the top of the container beside
 * whatever else it holds, and nothing in the format groups them.
 */
export function writeAlchemy({ nodes, effects }: Alchemy): Directory[] {
  return [
    new Directory(nodeName, [new File(nodeName, writeNodeLibrary(nodes))]),
    new Directory(effectName, [new File(effectName, writeEffectLibrary(effects))]),
  ]
}
