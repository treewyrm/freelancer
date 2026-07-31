import File from '#/file.js'
import BufferView from '#/utility/bufferview.js'
import {
  readCylinder,
  readFixed,
  readLoose,
  readPrismatic,
  readRevolute,
  readSphere,
  writeCylinder,
  writeFixed,
  writeLoose,
  writePrismatic,
  writeRevolute,
  writeSphere,
  type Joint,
} from './joint.js'

export interface Constraint {
  /** Parent object name. */
  parent: string

  /** Child object name. */
  child: string

  /** Connection joint. */
  joint: Joint
}

/** Byte length of a constraint name field. Names are NUL-padded to it, not NUL-separated. */
const NAME_LENGTH = 0x40

const readName = (view: BufferView) => {
  const value = view.readString(NAME_LENGTH)
  const end = value.indexOf('\0')

  return end < 0 ? value : value.substring(0, end)
}

const writeName = (value: string) => BufferView.allocate(NAME_LENGTH).writeString(value)

const readNames = (view: BufferView) => ({
  parent: readName(view),
  child: readName(view),
})

const writeNames = (parent: string, child: string): BufferView =>
  BufferView.join(writeName(parent), writeName(child))

/**
 * Reads compound hierarchy constraints.
 *
 * Records are not self-describing: the file name is the only thing that gives their size, so a
 * file whose joint cannot be read cannot be skipped either — carrying on would silently
 * desynchronize every record after it.
 * @param files
 */
export function* readConstraints(files: Iterable<File>): Generator<Constraint> {
  for (const file of files) {
    const view = BufferView.from(file)
    const kind = file.name.toLowerCase()

    while (view.byteRemain > 0) {
      const { parent, child } = readNames(view)

      switch (kind) {
        case 'fix':
          yield { parent, child, joint: readFixed(view) }
          break
        case 'rev':
          yield { parent, child, joint: readRevolute(view) }
          break
        case 'pris':
          yield { parent, child, joint: readPrismatic(view) }
          break
        case 'cyl':
          yield { parent, child, joint: readCylinder(view) }
          break
        case 'sphere':
          yield { parent, child, joint: readSphere(view) }
          break
        case 'loose':
          yield { parent, child, joint: readLoose(view) }
          break
        default:
          throw new RangeError(`Unknown constraint file ${file.name}`)
      }
    }
  }
}

export function* writeConstraints(constraints: Iterable<Constraint>): Generator<File> {
  for (const { parent, child, joint } of constraints) {
    switch (joint.type) {
      case 'fixed':
        yield new File('fix', BufferView.join(writeNames(parent, child), writeFixed(joint)))
        break
      case 'revolute':
        yield new File('rev', BufferView.join(writeNames(parent, child), writeRevolute(joint)))
        break
      case 'prismatic':
        yield new File('pris', BufferView.join(writeNames(parent, child), writePrismatic(joint)))
        break
      case 'sphere':
        yield new File('sphere', BufferView.join(writeNames(parent, child), writeSphere(joint)))
        break
      case 'loose':
        yield new File('loose', BufferView.join(writeNames(parent, child), writeLoose(joint)))
        break
      case 'cylinder':
        yield new File('cyl', BufferView.join(writeNames(parent, child), writeCylinder(joint)))
        break
    }
  }
}
