import { type Compound, listCompoundElements } from '#/utility/compound.js'
import Directory from '#/directory.js'
import { getResource, getResourceId, type Hashable } from '#/hash.js'
import { readConstraints, writeConstraints, type Constraint } from './constraint.js'
import { getHardpoint, type Hardpoint } from './hardpoint.js'
import type { Joint } from './joint.js'

export interface Model<T> extends Compound<Model<T>> {
  type: 'compound'

  /** Part name. */
  name: string

  /** Part index. */
  index: number

  /** Part fragment filename. */
  filename: string

  /** Part. */
  part: T

  /** Joint connecting to parent object. */
  joint?: Joint
}

/**
 * Arranges compound objects into hierarchy from constraints.
 * @param objects
 * @param constraints
 */
export function arrangeByConstraints(objects: Model<unknown>[], constraints: Constraint[]): void {
  /** Exclude root from array of children. */
  const [, ...children] = objects

  for (const constraint of constraints) {
    const parent = getResource(objects, ({ name }) => name, constraint.parent)
    const child = getResource(children, ({ name }) => name, constraint.child)

    if (!parent || !child) continue

    child.joint = constraint.joint
    parent.children.push(child)
  }
}

/**
 * Reads compound object from directory.
 * @param parent Input directory
 * @param read Object fragment directory reader
 * @returns Root object
 */
export function readModel<T>(parent: Directory, read: (parent: Directory) => T): Model<T> {
  const compound = parent.getDirectory('Cmpnd')
  if (!compound) throw new Error('Missing compound directory')

  let objects: Model<T>[] = []
  let constraints: Constraint[] = []

  for (const directory of compound.directories) {
    let isRoot = false

    switch (directory.name.substring(0, 4).toLowerCase()) {
      case 'root': // Flags object as root
        isRoot = true
      case 'part': // Object
        const [name] = directory.getFile('Object name')?.readStrings() ?? []
        if (!name) throw new Error('Missing compound object name')

        const [index = 0] = directory.getFile('Index')?.readIntegers() ?? []

        const [filename] = directory.getFile('File name')?.readStrings() ?? []
        if (!filename) throw new Error('Missing compound object file name')

        const fragment = parent.getDirectory(filename)
        if (!fragment) throw new Error('Missing object fragment directory')

        const compound: Model<T> = {
          type: 'compound',
          name,
          index,
          filename,
          part: read(fragment),
          children: [],
        }

        isRoot ? objects.unshift(compound) : objects.push(compound)

        break
      case 'cons': // Constraints
        constraints = [...readConstraints(directory.files)]
        break
    }
  }

  const root = objects.at(0)
  if (!root) throw new Error('Missing root object')

  if (constraints) arrangeByConstraints(objects, constraints)

  return root
}

/**
 * Writes compound object into directory.
 * @param root Root compound object
 * @param write Object fragment directory writer
 * @param parent Output directory
 */
export function writeModel<T>(root: Model<T>, write: (value: T) => Directory): Directory {
  const directory = new Directory()

  /** Compound directory. */
  const compound = directory.setDirectory('Cmpnd')

  /** Model constraint list. */
  const constraints: Constraint[] = []

  /** Unique object names. */
  const names = new Set<string>()

  for (const object of listCompoundElements(root)) {
    const { name, filename, index, part } = object

    if (!name.length) throw new RangeError(`Compound part has empty object name`)
    if (names.has(name)) throw new Error(`Duplicate compound part name: ${name}`)
    if (!Number.isInteger(index)) throw new RangeError(`Non-integer compound part index in ${name}`)

    names.add(name)

    const directory = compound.setDirectory(object === root ? 'Root' : `Part_${name}`)

    directory.setFile('Object name').writeStrings(name)
    directory.setFile('Index').writeIntegers(index)
    directory.setFile('File name').writeStrings(filename)

    for (const { joint, name } of object.children)
      if (joint) constraints.push({ parent: object.name, child: name, joint })

    const fragment = directory.setDirectory(filename)
    fragment.children = write(part).children
  }

  // Write constraints.
  for (const file of writeConstraints(constraints))
    compound.setFile('Cons', file.name).append(file.data)

  return directory
}

/** Finds hardpoint. */
export function getModelHardpoint<T>(
  root: Model<T>,
  predicate: (part: T) => Hardpoint[],
  name: Hashable,
) {
  let hardpoint: Hardpoint | undefined
  name = getResourceId(name)

  for (const parent of listCompoundElements(root))
    if ((hardpoint = getHardpoint(predicate(parent.part), name))) return { hardpoint, parent }
}
