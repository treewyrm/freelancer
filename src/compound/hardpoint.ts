import BufferView from '#/utility/bufferview.js'
import Directory from '#/utf/directory.js'
import File from '#/utf/file.js'
import { type Hashable, getResource } from '#/hash.js'
import Vector3 from '#/math/vector3.js'
import Matrix3 from '#/math/matrix3.js'

/** What both hardpoint kinds carry: a name, and a frame to attach in. */
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

/** Reads a `Position` file, defaulting to the origin when the hardpoint carries none. */
function readPosition(parent: Directory): Vector3 {
  const file = parent.getFile('position')
  return (file && Vector3.read(BufferView.from(file))) ?? Vector3.copy({})
}

/** Writes a `Position` file, in the retail capitalization. */
function writePosition(position: Vector3): File {
  return new File('Position', Vector3.write(position))
}

/** Reads an `Orientation` file, defaulting to identity when the hardpoint carries none. */
function readOrientation(parent: Directory): Matrix3 {
  const file = parent.getFile('orientation')
  return (file && Matrix3.read(BufferView.from(file))) ?? Matrix3.copy({})
}

/** Writes an `Orientation` file, in the retail capitalization. */
function writeOrientation(orientation: Matrix3): File {
  return new File('Orientation', Matrix3.write(orientation))
}

/** Reads an `Axis` file, defaulting to Y when the hardpoint carries none. */
function readAxis(parent: Directory): Vector3 {
  const file = parent.getFile('axis')
  return (file && Vector3.read(BufferView.from(file))) ?? Vector3.copy(Vector3.y)
}

/** Writes an `Axis` file, in the retail capitalization. */
function writeAxis(axis: Vector3): File {
  return new File('Axis', Vector3.write(axis))
}

/** Reads one fixed hardpoint from its own directory, which is also its name. */
function readFixed(parent: Directory): Fixed {
  return {
    type: 'fixed',
    name: parent.name,
    position: readPosition(parent),
    orientation: readOrientation(parent),
  }
}

/** Writes one fixed hardpoint as a directory named after it, for placing under `Hardpoints/Fixed`. */
function writeFixed(fixed: Fixed): Directory {
  const { name, position, orientation } = fixed
  return new Directory(name, [writePosition(position), writeOrientation(orientation)])
}

/**
 * Reads one revolute hardpoint from its own directory, which is also its name. `Min` and `Max` are
 * the rotation limits about `axis`, in radians, and default to zero when absent.
 */
function readRevolute(parent: Directory): Revolute {
  const position = readPosition(parent)
  const orientation = readOrientation(parent)
  const axis = readAxis(parent)

  const [min = 0] = parent.getFile('min')?.readFloats() ?? []
  const [max = 0] = parent.getFile('max')?.readFloats() ?? []

  return { type: 'revolute', name: parent.name, position, orientation, axis, min, max }
}

/**
 * Writes one revolute hardpoint as a directory named after it, for placing under
 * `Hardpoints/Revolute`. Every file is emitted, defaults included, the way retail writes them.
 */
function writeRevolute(revolute: Revolute): Directory {
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

/**
 * Writes a part's `Hardpoints` directory, grouping hardpoints into `Fixed` and `Revolute` by kind.
 * Neither group is created unless something goes in it, which is how retail writes a part carrying
 * only one kind.
 * @throws TypeError on a hardpoint kind with no group, rather than dropping it from the file.
 */
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

/**
 * Finds a hardpoint by name or resource CRC within one part's list. `getModelHardpoint` is the
 * counterpart that searches a whole model and says which part owns the match.
 */
export const getHardpoint = (hardpoints: Hardpoint[], name: Hashable): Hardpoint | undefined =>
  getResource(hardpoints, ({ name }) => name, name)
