import { deepStrictEqual, ok, strictEqual, throws } from 'node:assert/strict'
import { describe, it } from 'node:test'
import Directory from '#/utf/directory.js'
import File from '#/utf/file.js'
import Matrix3 from '#/math/matrix3.js'
import { getResourceId } from '#/hash.js'
import { listTreeElements } from '#/utility/tree.js'
import type { Constraint } from './constraint.js'
import type { Joint } from './joint.js'
import type { Hardpoint } from './hardpoint.js'
import {
  arrangeByConstraints,
  getModelHardpoint,
  isCompoundModel,
  readModel,
  writeModel,
  type Model,
} from './model.js'

/**
 * What a part holds, standing in for whatever a format module supplies — `rigid/` puts a mesh part
 * here and `deformable/` puts a bone. Nothing in this module looks inside it, which is what the
 * fragment reader and writer below are here to hold to.
 */
interface Payload {
  tag: string
}

const readPayload = (parent: Directory): Payload => ({
  tag: [...(parent.getFile('Tag')?.readStrings() ?? [])].join(''),
})

const writePayload = ({ tag }: Payload): Directory =>
  new Directory('\\', [new File('Tag').writeStrings(tag)])

const position = { x: 1, y: 2, z: 3 }

const rotation = Matrix3.copy({})

const fixed: Joint = { type: 'fixed', position, rotation }

const revolute: Joint = {
  type: 'revolute',
  position,
  offset: { x: -1, y: -2, z: -3 },
  rotation,
  axis: { x: 0, y: 1, z: 0 },
  min: -0.5,
  max: 1.25,
}

interface PartOptions {
  index?: number
  joint?: Joint
  children?: Model<Payload>[]
}

const part = (
  name: string,
  { index = 0, joint, children = [] }: PartOptions = {},
): Model<Payload> => ({
  type: 'compound',
  name,
  index,
  filename: `${name}.3db`,
  part: { tag: name },
  children,
  ...(joint ? { joint } : {}),
})

/**
 * A three-level model, so the hierarchy is not something a flat reader could produce by accident:
 * `handle` hangs off `door`, not off the root.
 */
const sample = (): Model<Payload> =>
  part('Root', {
    children: [
      part('wing_lod1', { index: 1, joint: fixed }),
      part('door', {
        index: 2,
        joint: revolute,
        children: [part('handle', { index: 3, joint: fixed })],
      }),
    ],
  })

const document = (model: Model<Payload> = sample()) => writeModel(model, writePayload)

const names = (model: Model<Payload>) => [...listTreeElements(model)].map(({ name }) => name)

describe('isCompoundModel', () => {
  it('recognises a document holding a Cmpnd hierarchy', () => {
    strictEqual(isCompoundModel(document()), true)
  })

  it('rejects a single-part document, which carries its part at the root', () => {
    strictEqual(isCompoundModel(new Directory('\\', [new File('Tag')])), false)
  })
})

describe('writeModel', () => {
  it('names the root Root and every other part Part_<name>', () => {
    deepStrictEqual(
      document()
        .getDirectory('Cmpnd')
        ?.directories.map(({ name }) => name),
      ['Root', 'Part_wing_lod1', 'Part_door', 'Part_handle', 'Cons'],
    )
  })

  it('writes object name, index and file name for each part', () => {
    const directory = document().getDirectory('Cmpnd', 'Part_door')

    deepStrictEqual(
      directory?.files.map(({ name }) => name),
      ['Object name', 'Index', 'File name'],
    )

    deepStrictEqual([...directory.getFile('Object name')!.readStrings()], ['door'])
    deepStrictEqual([...directory.getFile('Index')!.readIntegers()], [2])
    deepStrictEqual([...directory.getFile('File name')!.readStrings()], ['door.3db'])
  })

  it('writes each part fragment under its own file name, at the document root', () => {
    const root = document()

    for (const name of ['Root.3db', 'wing_lod1.3db', 'door.3db', 'handle.3db'])
      deepStrictEqual([...root.getFile(name, 'Tag')!.readStrings()], [name.replace('.3db', '')])
  })

  // The fragment writer is handed a part and hands back a directory; the name on it is the
  // caller's to give, so what goes into the document is the children rather than the directory.
  it('takes the fragment writer children, not the directory it names them with', () => {
    strictEqual(document().getDirectory('door.3db')?.name, 'door.3db')
  })

  it('groups constraint records into one file per joint kind', () => {
    deepStrictEqual(
      document()
        .getDirectory('Cmpnd', 'Cons')
        ?.files.map(({ name }) => name),
      ['Fix', 'Rev'],
    )
  })

  // Two fixed joints, one file: records are appended, not written to a second file.
  it('appends records of the same kind into one file', () => {
    const [fix] = document().getDirectory('Cmpnd', 'Cons')!.files

    strictEqual(fix?.byteLength, 176 * 2)
  })

  it('writes no constraint for the root, which hangs from nothing', () => {
    const root = document(part('Root'))

    strictEqual(root.getDirectory('Cmpnd', 'Cons'), undefined)
  })

  it('leaves out a child carrying no joint', () => {
    const root = document(part('Root', { children: [part('loose_bit', { index: 1 })] }))

    strictEqual(root.getDirectory('Cmpnd', 'Cons'), undefined)
  })

  it('refuses a part with an empty object name', () => {
    throws(() => document(part('')), RangeError)
  })

  // Names are how a constraint addresses a part, so two parts sharing one makes a hierarchy that
  // cannot be read back the way it was written.
  it('refuses two parts sharing a name', () => {
    const model = part('Root', {
      children: [
        part('door', { index: 1, joint: fixed }),
        part('door', { index: 2, joint: fixed }),
      ],
    })

    throws(() => document(model), /Duplicate compound part name: door/)
  })

  it('refuses a non-integer part index', () => {
    throws(() => document(part('Root', { index: 1.5 })), RangeError)
  })
})

describe('readModel', () => {
  it('round-trips a model', () => {
    deepStrictEqual(readModel(document(), readPayload), sample())
  })

  it('reads a root with no children', () => {
    const model = part('Root')

    deepStrictEqual(readModel(document(model), readPayload), model)
  })

  it('reads the part payload through the fragment reader it is given', () => {
    const model = readModel(document(), readPayload)

    deepStrictEqual(
      [...listTreeElements(model)].map(({ part }) => part.tag),
      ['Root', 'wing_lod1', 'door', 'handle'],
    )
  })

  // The Cmpnd directory is flat: every part sits beside the root, and the tree comes out of Cons.
  // Reordering the directories cannot change the hierarchy.
  it('rebuilds the hierarchy from the constraints, not from directory order', () => {
    const root = document()
    const compound = root.getDirectory('Cmpnd')!

    compound.children.reverse()

    deepStrictEqual(readModel(root, readPayload), sample())
  })

  it('carries the joint onto the child it constrains', () => {
    const model = readModel(document(), readPayload)
    const door = model.children.find(({ name }) => name === 'door')

    deepStrictEqual(door?.joint, revolute)
    strictEqual('joint' in model, false)
  })

  it('defaults a part with no Index to zero', () => {
    const root = document()
    root.getDirectory('Cmpnd', 'Part_door')!.delete('Index')

    const model = readModel(root, readPayload)
    strictEqual(model.children.find(({ name }) => name === 'door')?.index, 0)
  })

  it('throws without a Cmpnd directory', () => {
    throws(() => readModel(new Directory('\\'), readPayload), /Missing compound directory/)
  })

  it('throws when a part has no object name', () => {
    const root = document()
    root.getDirectory('Cmpnd', 'Part_door')!.delete('Object name')

    throws(() => readModel(root, readPayload), /Missing compound object name/)
  })

  it('throws when a part has no file name', () => {
    const root = document()
    root.getDirectory('Cmpnd', 'Part_door')!.delete('File name')

    throws(() => readModel(root, readPayload), /Missing compound object file name/)
  })

  // A file name that names nothing is damage rather than a part without geometry: the fragment
  // reader would otherwise be handed nothing and have to invent a part.
  it('throws when a part names a fragment that is not in the document', () => {
    const root = document()
    root.delete('door.3db')

    throws(() => readModel(root, readPayload), /Missing object fragment directory/)
  })

  it('throws when Cmpnd holds no part at all', () => {
    const root = new Directory('\\')
    root.setDirectory('Cmpnd', 'Cons')

    throws(() => readModel(root, readPayload), /Missing root object/)
  })

  // The Root directory is a marker, not a requirement: a document without one is read with the
  // first part in directory order standing in, which is also the part nothing may hang off. No
  // retail model omits it, so this is what the reader does rather than what the format promises.
  it('falls back to the first part when no directory is marked as the root', () => {
    const root = document()
    root.getDirectory('Cmpnd')!.getDirectory('Root')!.name = 'Part_hull'

    const model = readModel(root, readPayload)

    strictEqual(model.name, 'Root')
    deepStrictEqual(names(model), ['Root', 'wing_lod1', 'door', 'handle'])
  })

  // Root is picked up by its first four characters and moved to the front, so it reads as the
  // root wherever it sits among the parts.
  it('takes the Root directory as the root wherever it appears among the parts', () => {
    const root = document()
    const compound = root.getDirectory('Cmpnd')!
    const [marker] = compound.children.splice(0, 1)

    compound.children.push(marker!)

    deepStrictEqual(readModel(root, readPayload), sample())
  })

  it('ignores a directory under Cmpnd it does not recognise', () => {
    const root = document()
    root.getDirectory('Cmpnd')!.setDirectory('Notes')

    deepStrictEqual(readModel(root, readPayload), sample())
  })
})

describe('arrangeByConstraints', () => {
  const objects = (...names: string[]): Model<Payload>[] => names.map((name) => part(name))

  const link = (parent: string, child: string, joint: Joint = fixed): Constraint => ({
    parent,
    child,
    joint,
  })

  it('attaches each child to the parent its constraint names', () => {
    const parts = objects('Root', 'door', 'handle')

    arrangeByConstraints(parts, [link('Root', 'door'), link('door', 'handle')])

    deepStrictEqual(names(parts[0]!), ['Root', 'door', 'handle'])
  })

  it('carries the joint onto the child', () => {
    const parts = objects('Root', 'door')

    arrangeByConstraints(parts, [link('Root', 'door', revolute)])

    deepStrictEqual(parts[1]?.joint, revolute)
  })

  // The root is the one part nothing may hang off: a constraint naming it as a child would
  // otherwise make the tree recursive and the writer would never terminate.
  it('never makes the first object anyone child', () => {
    const parts = objects('Root', 'door')

    arrangeByConstraints(parts, [link('door', 'Root')])

    deepStrictEqual(parts[0]!.children, [])
  })

  // Retail ships a constraint naming a part no model declares; dropping it is what lets those
  // models load at all.
  it('skips a constraint naming a part that is not there', () => {
    const parts = objects('Root', 'door')

    arrangeByConstraints(parts, [link('Root', 'missing'), link('missing', 'door')])

    deepStrictEqual(parts[0]!.children, [])
  })

  it('matches part names case-insensitively, as the game does', () => {
    const parts = objects('Root', 'door')

    arrangeByConstraints(parts, [link('ROOT', 'DOOR')])

    deepStrictEqual(names(parts[0]!), ['Root', 'door'])
  })
})

describe('getModelHardpoint', () => {
  interface Mount {
    hardpoints: Hardpoint[]
  }

  const mount = (name: string, ...hardpoints: string[]): Model<Mount> => ({
    type: 'compound',
    name,
    index: 0,
    filename: `${name}.3db`,
    part: {
      hardpoints: hardpoints.map((name) => ({
        type: 'fixed',
        name,
        position: { x: 0, y: 0, z: 0 },
        orientation: rotation,
      })),
    },
    children: [],
  })

  const model = (): Model<Mount> => {
    const root = mount('Root', 'HpMount01')
    const wing = mount('wing_lod1', 'HpWeapon01', 'HpWeapon02')

    root.children.push(wing)
    return root
  }

  const hardpoints = ({ hardpoints }: Mount) => hardpoints

  it('finds a hardpoint on the root', () => {
    strictEqual(getModelHardpoint(model(), hardpoints, 'HpMount01')?.hardpoint.name, 'HpMount01')
  })

  // Which part owns the hardpoint is the half a per-part lookup cannot answer, and it is what a
  // caller needs to place anything on it — the part carries the transform.
  it('says which part owns the match', () => {
    strictEqual(getModelHardpoint(model(), hardpoints, 'HpWeapon02')?.parent.name, 'wing_lod1')
  })

  it('finds a hardpoint by its resource CRC', () => {
    const match = getModelHardpoint(model(), hardpoints, getResourceId('HpWeapon01'))

    strictEqual(match?.hardpoint.name, 'HpWeapon01')
    strictEqual(match.parent.name, 'wing_lod1')
  })

  it('folds case, as the game does', () => {
    ok(getModelHardpoint(model(), hardpoints, 'hpweapon01'))
  })

  it('returns undefined when no part carries the hardpoint', () => {
    strictEqual(getModelHardpoint(model(), hardpoints, 'HpEngine01'), undefined)
  })
})
