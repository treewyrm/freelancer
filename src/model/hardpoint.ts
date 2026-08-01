import BufferView from '#/utility/bufferview.js'
import Directory from '#/directory.js'
import File from '#/file.js'
import { type Hashable, getResource } from '#/hash.js'
import Vector3 from '#/math/vector3.js'
import Matrix3 from '#/math/matrix3.js'

interface Base<T extends string> {
  type: T
  name: string
  position: Vector3
  orientation: Matrix3
}

/** Fixed attachment hardpoint. */
interface Fixed extends Base<'fixed'> {}

/** Revolute attachment hardpoint. */
interface Revolute extends Base<'revolute'> {
  axis: Vector3
  min: number
  max: number
}

/**
 * Attachment hardpoint.
 *
 * There is no prismatic form. `Hardpoints` holds exactly two subdirectories, `Fixed` and
 * `Revolute` — 10674 and 1379 of them across retail, and nothing else — matching the two joint
 * kinds a hardpoint can drive. A third variant here would be a shape no reader can produce and
 * no writer can place.
 */
export type Hardpoint = Fixed | Revolute

export function readPosition(parent: Directory): Vector3 {
  const file = parent.getFile('position')
  return (file && Vector3.read(BufferView.from(file))) ?? Vector3.copy({})
}

export function writePosition(position: Vector3): File {
  return new File('Position', Vector3.write(position))
}

export function readOrientation(parent: Directory): Matrix3 {
  const file = parent.getFile('orientation')
  return (file && Matrix3.read(BufferView.from(file))) ?? Matrix3.copy({})
}

export function writeOrientation(orientation: Matrix3): File {
  return new File('Orientation', Matrix3.write(orientation))
}

export function readAxis(parent: Directory): Vector3 {
  const file = parent.getFile('axis')
  return (file && Vector3.read(BufferView.from(file))) ?? Vector3.copy(Vector3.y)
}

export function writeAxis(axis: Vector3): File {
  return new File('Axis', Vector3.write(axis))
}

export function readFixed(parent: Directory): Fixed {
  return {
    type: 'fixed',
    name: parent.name,
    position: readPosition(parent),
    orientation: readOrientation(parent),
  }
}

export function writeFixed(fixed: Fixed): Directory {
  const { name, position, orientation } = fixed
  return new Directory(name, [writePosition(position), writeOrientation(orientation)])
}

export function readRevolute(parent: Directory): Revolute {
  const position = readPosition(parent)
  const orientation = readOrientation(parent)
  const axis = readAxis(parent)

  const [min = 0] = parent.getFile('min')?.readFloats() ?? []
  const [max = 0] = parent.getFile('max')?.readFloats() ?? []

  return { type: 'revolute', name: parent.name, position, orientation, axis, min, max }
}

export function writeRevolute(revolute: Revolute): Directory {
  const { name, position, orientation, axis, min, max } = revolute

  const directory = new Directory(name, [
    writePosition(position),
    writeOrientation(orientation),
    writeAxis(axis),
    new File('Min').writeFloats(min),
    new File('Max').writeFloats(max),
  ])

  return directory
}

/**
 * Reads hardpoints from object directory.
 * @param parent Object directory
 * @returns
 */
export function* readHardpoints(parent: Directory): Generator<Hardpoint> {
  const hardpoints = parent.getDirectory('hardpoints')
  if (!hardpoints) return

  for (const directory of hardpoints.directories) {
    switch (directory.name.toLowerCase()) {
      case 'fixed':
        for (const subdirectory of directory.directories) yield readFixed(subdirectory)

        break
      case 'revolute':
        for (const subdirectory of directory.directories) yield readRevolute(subdirectory)

        break
    }
  }
}

export function writeHardpoints(hardpoints: Iterable<Hardpoint>): Directory {
  const directory = new Directory('Hardpoints')

  for (const hardpoint of hardpoints) {
    switch (hardpoint.type) {
      case 'fixed':
        directory.setDirectory('Fixed').children.push(writeFixed(hardpoint))
        break
      case 'revolute':
        directory.setDirectory('Revolute').children.push(writeRevolute(hardpoint))
        break

      // A variant added without a branch here would drop out of the file unannounced.
      default:
        throw new TypeError(`Unknown hardpoint type: ${(hardpoint as Hardpoint).type}`)
    }
  }

  return directory
}

export const getHardpoint = (hardpoints: Hardpoint[], name: Hashable): Hardpoint | undefined =>
  getResource(hardpoints, ({ name }) => name, name)
