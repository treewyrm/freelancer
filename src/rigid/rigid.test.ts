import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import Directory from '#/utf/directory.js'
import Matrix3 from '#/math/matrix3.js'
import { listTreeElements } from '#/utility/tree.js'
import { isCompoundModel, type Model } from '#/compound/model.js'
import type { Hardpoint } from '#/compound/hardpoint.js'
import type { Joint } from '#/compound/joint.js'
import type { MultiLevel } from '#/vmesh/multilevel.js'
import type { VMeshPart } from '#/vmesh/part.js'
import type { VMeshRef } from '#/vmesh/ref.js'
import type { VMeshWire } from '#/vmesh/wireframe.js'
import { getResourceId } from '#/hash.js'
import { readRigidModel, writeRigidModel, type Rigid, type RigidModel } from './rigid.js'
import type { Camera } from './camera.js'
import type { Sphere } from './sphere.js'

const reference = (meshId: number): VMeshRef => ({
  meshId,
  vertexStart: 0,
  vertexCount: 24,
  indexStart: 0,
  indexCount: 36,
  groupStart: 0,
  groupCount: 1,
  boundingBox: { a: { x: -1, y: -1, z: -1 }, b: { x: 1, y: 1, z: 1 } },
  boundingSphere: { center: { x: 0, y: 0, z: 0 }, radius: 1.75 },
})

const vmeshPart = (name: string): VMeshPart => ({
  type: 'vmeshpart',
  reference: reference(getResourceId(`${name}.vms`)),
})

const multiLevel = (name: string): MultiLevel => ({
  type: 'multilevel',
  ranges: [0, 100, 1000],
  levels: [vmeshPart(`${name}_lod0`), vmeshPart(`${name}_lod1`)],
})

const wireframe = (name: string): VMeshWire => ({
  data: {
    meshId: getResourceId(`${name}.vms`),
    vertexStart: 0,
    vertexCount: 8,
    vertexRange: 8,
    indices: new Uint16Array([0, 1, 1, 2, 2, 3, 3, 0]),
  },
})

const orientation = Matrix3.copy({ x: { x: 0, y: 1, z: 0 }, y: { x: -1, y: 0, z: 0 } })

const fixedHardpoint = (name: string): Hardpoint => ({
  type: 'fixed',
  name,
  position: { x: 0, y: 0.5, z: 2 },
  orientation,
})

// The revolute hardpoint is the half of the pair no retail write path exercises, and its Axis,
// Min and Max are three files a fixed hardpoint never writes.
const revoluteHardpoint = (name: string): Hardpoint => ({
  type: 'revolute',
  name,
  position: { x: 1, y: 0, z: 0 },
  orientation,
  axis: { x: 0, y: 1, z: 0 },
  min: -0.5,
  max: 1.25,
})

/**
 * Shaped the way `readRigid` returns a part: a piece the fragment does not carry is a missing key,
 * not a key holding `undefined`, so a round trip compares equal under `deepStrictEqual`. See the
 * invariant-4 test at the foot of this file.
 */
const rigid = ({ hardpoints = [], part, wireframe }: Partial<Rigid> = {}): Rigid => ({
  type: 'rigid',
  hardpoints,
  ...(part ? { part } : {}),
  ...(wireframe ? { wireframe } : {}),
})

const camera = (): Camera => ({ type: 'camera', fovX: 0.75, fovY: 0.5, zNear: 0.25, zFar: 1000 })

const fixed: Joint = { type: 'fixed', position: { x: 0, y: 0, z: 0 }, rotation: orientation }

const revolute: Joint = {
  type: 'revolute',
  position: { x: 1, y: 0, z: -2 },
  offset: { x: 0, y: 0, z: 0 },
  rotation: orientation,
  axis: { x: 0, y: 1, z: 0 },
  min: 0,
  max: 1.5,
}

interface PartOptions {
  index?: number
  joint?: Joint
  children?: Model<Rigid | Camera | Sphere>[]
}

const compoundPart = (
  name: string,
  part: Rigid | Camera | Sphere,
  { index = 0, joint, children = [] }: PartOptions = {},
): Model<Rigid | Camera | Sphere> => ({
  type: 'compound',
  name,
  index,
  filename: `${name}.3db`,
  part,
  children,
  ...(joint ? { joint } : {}),
})

/**
 * The shape of a real `.cmp`: a geometry root with detail levels and a wireframe, a moving part on
 * a revolute joint carrying the hardpoint that drives it, and a cockpit camera hanging off the
 * root — the three fragment kinds in one document.
 */
const model = (): Model<Rigid | Camera | Sphere> =>
  compoundPart(
    'Root',
    rigid({
      hardpoints: [fixedHardpoint('HpMount01')],
      part: multiLevel('hull'),
      wireframe: wireframe('hull'),
    }),
    {
      children: [
        compoundPart(
          'baydoor01',
          rigid({
            hardpoints: [revoluteHardpoint('HpBayDoor01'), fixedHardpoint('HpWeapon01')],
            part: vmeshPart('baydoor'),
          }),
          { index: 1, joint: revolute },
        ),
        compoundPart('cockpit_cam', camera(), { index: 2, joint: fixed }),
      ],
    },
  )

const roundTrip = (value: RigidModel) => readRigidModel(writeRigidModel(value))

describe('a single-part document, the shape a .3db has', () => {
  it('round-trips geometry, hardpoints and the wireframe overlay', () => {
    const part = rigid({
      hardpoints: [fixedHardpoint('HpMount01'), revoluteHardpoint('HpBayDoor01')],
      part: vmeshPart('crate'),
      wireframe: wireframe('crate'),
    })

    deepStrictEqual(roundTrip(part), part)
  })

  it('round-trips detail levels', () => {
    const part = rigid({ part: multiLevel('hull') })

    deepStrictEqual(roundTrip(part), part)
  })

  it('writes the fragment unnamed, for the caller to name', () => {
    strictEqual(writeRigidModel(rigid({ part: vmeshPart('crate') })).name, '\\')
  })

  it('lays the fragment out as geometry, hardpoints, then wireframe', () => {
    const document = writeRigidModel(
      rigid({
        hardpoints: [fixedHardpoint('HpMount01')],
        part: vmeshPart('crate'),
        wireframe: wireframe('crate'),
      }),
    )

    deepStrictEqual(
      document.children.map(({ name }) => name),
      ['VMeshPart', 'Hardpoints', 'VMeshWire'],
    )
  })

  // A group node in a hierarchy carries hardpoints and children but no geometry of its own, so an
  // empty fragment is a part rather than damage.
  it('reads a fragment with no geometry as a part carrying none', () => {
    deepStrictEqual(readRigidModel(new Directory('\\')), rigid())
  })

  it('emits nothing for the pieces a part does not have', () => {
    deepStrictEqual(writeRigidModel(rigid()).children, [])
  })

  // Detail levels and a bare reference are alternatives, not a pair. Retail never writes both,
  // and MultiLevel is what a reader must take when somehow handed them.
  it('prefers detail levels over a bare reference', () => {
    const document = writeRigidModel(rigid({ part: multiLevel('hull') }))
    document.children.push(...writeRigidModel(rigid({ part: vmeshPart('crate') })).children)

    const part = readRigidModel(document)

    strictEqual(part.type, 'rigid')
    strictEqual(part.part?.type, 'multilevel')
  })
})

describe('a compound document, the shape a .cmp has', () => {
  it('round-trips the whole model', () => {
    deepStrictEqual(roundTrip(model()), model())
  })

  it('writes a document a compound reader recognises', () => {
    strictEqual(isCompoundModel(writeRigidModel(model())), true)
  })

  it('keeps the hierarchy the constraints describe', () => {
    const result = roundTrip(model())

    deepStrictEqual(
      [...listTreeElements(result as Model<Rigid | Camera | Sphere>)].map(({ name }) => name),
      ['Root', 'baydoor01', 'cockpit_cam'],
    )
  })

  it('carries each joint onto the part it constrains', () => {
    const result = roundTrip(model()) as Model<Rigid | Camera | Sphere>

    deepStrictEqual(
      result.children.map(({ joint }) => joint?.type),
      ['revolute', 'fixed'],
    )
    strictEqual('joint' in result, false)
  })

  it('writes each part fragment under its own file name', () => {
    const document = writeRigidModel(model())

    for (const name of ['Root.3db', 'baydoor01.3db', 'cockpit_cam.3db'])
      ok(document.getDirectory(name), `${name} is not in the document`)
  })

  // The three fragment kinds are dispatched on what the directory holds, and geometry is the one
  // with no marker of its own — so a camera or sphere misread as geometry is a silent empty part.
  it('reads each fragment back as the kind it was written as', () => {
    const result = roundTrip(model()) as Model<Rigid | Camera | Sphere>

    deepStrictEqual(
      [...listTreeElements(result)].map(({ name, part }) => `${name}:${part.type}`),
      ['Root:rigid', 'baydoor01:rigid', 'cockpit_cam:camera'],
    )
  })

  it('round-trips a camera part inside a hierarchy, wrapper included', () => {
    const result = roundTrip(model()) as Model<Rigid | Camera | Sphere>
    const cockpit = result.children.find(({ name }) => name === 'cockpit_cam')

    deepStrictEqual(cockpit?.part, camera())
  })

  it('round-trips the revolute hardpoint that drives the moving part', () => {
    const result = roundTrip(model()) as Model<Rigid | Camera | Sphere>
    const door = result.children.find(({ name }) => name === 'baydoor01')

    strictEqual(door?.part.type, 'rigid')
    deepStrictEqual(door.part.hardpoints, [
      revoluteHardpoint('HpBayDoor01'),
      fixedHardpoint('HpWeapon01'),
    ])
  })

  it('round-trips a sphere part inside a hierarchy', () => {
    const planet: Sphere = {
      type: 'sphere',
      hardpoints: [fixedHardpoint('HpDock01')],
      sides: ['planet_side'],
      radius: 3000,
    }
    const value = compoundPart('Root', rigid(), {
      children: [compoundPart('shell', planet, { index: 1, joint: fixed })],
    })

    deepStrictEqual(roundTrip(value), value)
  })

  // Detail levels are per part, not per model: two parts may switch at different distances, and
  // a reader that hoisted them would collapse the difference.
  it('keeps each part on its own detail level ranges', () => {
    const value = compoundPart('Root', rigid({ part: multiLevel('hull') }), {
      children: [
        compoundPart(
          'wing',
          rigid({ part: { type: 'multilevel', ranges: [0, 50], levels: [vmeshPart('wing')] } }),
          { index: 1, joint: fixed },
        ),
      ],
    })

    deepStrictEqual(roundTrip(value), value)
  })
})

describe('the shape a part is read into', () => {
  // Invariant 4: absence is a missing key, never a key holding undefined. Types do not catch a
  // violation — `part?: MeshSource` accepts both — and the difference is invisible to a consumer
  // until it enumerates keys or compares two parts, which is what a round-trip assertion does.
  it('leaves an absent piece out entirely, as invariant 4 asks', () => {
    const part = readRigidModel(new Directory('\\'))

    deepStrictEqual(Object.keys(part), ['type', 'hardpoints'])
  })

  // The pieces that are there keep their place, so key order stays the order the fragment is read
  // in rather than varying with what a part happens to carry.
  it('keeps present pieces in read order', () => {
    const directory = writeRigidModel(
      rigid({
        hardpoints: [fixedHardpoint('HpMount')],
        part: vmeshPart('crate'),
        wireframe: wireframe('crate'),
      }),
    )

    deepStrictEqual(Object.keys(readRigidModel(directory)), [
      'type',
      'hardpoints',
      'part',
      'wireframe',
    ])
  })
})
