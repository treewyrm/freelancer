import File from '#/file.js'
import BufferView from '#/utility/bufferview.js'
import {
  readFixed,
  readLoose,
  readPrismatic,
  readRevolute,
  readSphere,
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

const readName = (view: BufferView) => view.slice(0x40).readStringZ()

const writeName = (value: string) => BufferView.allocate(0x40).writeString(value)

const readNames = (view: BufferView) => ({
  parent: readName(view),
  child: readName(view),
})

const writeNames = (parent: string, child: string): BufferView =>
  BufferView.join(writeName(parent), writeName(child))

/**
 * Reads compound hierarchy constraints.
 * @param files
 */
export function* readConstraints(files: Iterable<File>): Generator<Constraint> {
  for (const file of files) {
    const view = BufferView.from(file)

    while (view.byteRemain > 0) {
      const { parent, child } = readNames(view)

      switch (file.name.toLowerCase()) {
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
          break
        case 'sphere':
          yield { parent, child, joint: readSphere(view) }
          break
        case 'loose':
          yield { parent, child, joint: readLoose(view) }
          break
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
        yield new File('rev', BufferView.join(writeNames(parent, child), writePrismatic(joint)))
        break
      case 'sphere':
        yield new File('sphere', BufferView.join(writeNames(parent, child), writeSphere(joint)))
        break
      case 'loose':
        yield new File('loose', BufferView.join(writeNames(parent, child), writeLoose(joint)))
        break
    }
  }
}
