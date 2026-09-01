import { deepStrictEqual, strictEqual, throws } from 'node:assert/strict'
import { describe, it } from 'node:test'
import Directory from '#/utf/directory.js'
import Matrix3 from '#/math/matrix3.js'
import Vector3 from '#/math/vector3.js'
import { getResourceId } from '#/hash.js'
import { getHardpoint, readHardpoints, writeHardpoints, type Hardpoint } from './hardpoint.js'

const position = { x: 1, y: 2, z: 3 }

const orientation = Matrix3.copy({ x: { x: 0, y: 1, z: 0 }, y: { x: -1, y: 0, z: 0 } })

const fixed = (name = 'HpMount01'): Hardpoint => ({ type: 'fixed', name, position, orientation })

const revolute = (name = 'HpBayDoor01', min = -0.5, max = 1.25): Hardpoint => ({
  type: 'revolute',
  name,
  position,
  orientation,
  axis: { x: 0, y: 0, z: 1 },
  min,
  max,
})

/** A part fragment carrying the given hardpoints, as `readHardpoints` is handed one. */
const wrap = (...hardpoints: Hardpoint[]) =>
  new Directory('part.3db', [writeHardpoints(hardpoints)])

const read = (...hardpoints: Hardpoint[]) => [...readHardpoints(wrap(...hardpoints))]

describe('writeHardpoints', () => {
  it('names the directory Hardpoints', () => {
    strictEqual(writeHardpoints([fixed()]).name, 'Hardpoints')
  })

  it('groups hardpoints into Fixed and Revolute by kind', () => {
    const directory = writeHardpoints([fixed(), revolute(), fixed('HpMount02')])

    deepStrictEqual(
      directory.directories.map(({ name }) => name),
      ['Fixed', 'Revolute'],
    )

    deepStrictEqual(
      directory.getDirectory('Fixed')?.directories.map(({ name }) => name),
      ['HpMount01', 'HpMount02'],
    )
  })

  // Retail writes only the group a part actually uses, and an empty one would be a directory
  // no reader ever yields anything from.
  it('creates neither group unless something goes in it', () => {
    deepStrictEqual(writeHardpoints([]).children, [])
    deepStrictEqual(
      writeHardpoints([revolute()]).directories.map(({ name }) => name),
      ['Revolute'],
    )
  })

  it('writes a fixed hardpoint as position and orientation only', () => {
    const directory = writeHardpoints([fixed()]).getDirectory('Fixed', 'HpMount01')

    deepStrictEqual(
      directory?.files.map(({ name }) => name),
      ['Position', 'Orientation'],
    )
  })

  // Defaults included: retail emits all five files for a revolute hardpoint even when the limits
  // are zero, and Min/Max are what tell the reader the joint is driven at all.
  it('writes a revolute hardpoint with its axis and both limits', () => {
    const directory = writeHardpoints([revolute()]).getDirectory('Revolute', 'HpBayDoor01')

    deepStrictEqual(
      directory?.files.map(({ name }) => name),
      ['Position', 'Orientation', 'Axis', 'Min', 'Max'],
    )

    deepStrictEqual([...directory.getFile('Min')!.readFloats()], [-0.5])
    deepStrictEqual([...directory.getFile('Max')!.readFloats()], [1.25])
  })

  it('writes the limits even when both are zero', () => {
    const directory = writeHardpoints([revolute('HpBayDoor01', 0, 0)]).getDirectory(
      'Revolute',
      'HpBayDoor01',
    )

    deepStrictEqual([...directory!.getFile('Min')!.readFloats()], [0])
  })

  // A third variant added to the union without a branch here would drop out of the file with
  // nothing to say it had.
  it('refuses a hardpoint kind it has no group for', () => {
    throws(() => writeHardpoints([{ type: 'prismatic' } as unknown as Hardpoint]), TypeError)
  })
})

describe('readHardpoints', () => {
  it('round-trips both kinds', () => {
    deepStrictEqual(read(fixed(), revolute()), [fixed(), revolute()])
  })

  it('yields nothing when the part carries no Hardpoints directory', () => {
    deepStrictEqual([...readHardpoints(new Directory('part.3db'))], [])
  })

  it('yields nothing when the directory is there but empty', () => {
    deepStrictEqual(read(), [])
  })

  it('takes the hardpoint name from its directory, which is the only place it is written', () => {
    deepStrictEqual(
      read(fixed('HpWeapon01'), fixed('HpWeapon02')).map(({ name }) => name),
      ['HpWeapon01', 'HpWeapon02'],
    )
  })

  it('walks past a group it does not know', () => {
    const directory = wrap(fixed())
    directory.getDirectory('Hardpoints')!.setDirectory('Prismatic', 'HpSlide01')

    deepStrictEqual([...readHardpoints(directory)], [fixed()])
  })

  describe('defaults, for a hardpoint written without a field', () => {
    const bare = (group: string, name: string) => {
      const directory = new Directory('part.3db')
      directory.setDirectory('Hardpoints', group, name)

      return [...readHardpoints(directory)]
    }

    it('places a hardpoint with no Position at the origin', () => {
      deepStrictEqual(bare('Fixed', 'HpMount01')[0]?.position, Vector3.copy({}))
    })

    it('leaves a hardpoint with no Orientation unrotated', () => {
      deepStrictEqual(bare('Fixed', 'HpMount01')[0]?.orientation, Matrix3.copy({}))
    })

    // Y, not X and not zero: a zero axis is not a rotation at all, and the engine's default is
    // the up axis.
    it('turns a revolute hardpoint with no Axis about Y', () => {
      const [hardpoint] = bare('Revolute', 'HpBayDoor01')

      strictEqual(hardpoint?.type, 'revolute')
      deepStrictEqual(hardpoint.axis, Vector3.copy(Vector3.y))
    })

    it('reads absent limits as zero', () => {
      const [hardpoint] = bare('Revolute', 'HpBayDoor01')

      strictEqual(hardpoint?.type, 'revolute')
      deepStrictEqual([hardpoint.min, hardpoint.max], [0, 0])
    })
  })
})

describe('getHardpoint', () => {
  const hardpoints = [fixed('HpWeapon01'), revolute('HpBayDoor01'), fixed('HpWeapon02')]

  it('finds a hardpoint by name', () => {
    strictEqual(getHardpoint(hardpoints, 'HpBayDoor01')?.type, 'revolute')
  })

  // The game compares names with stricmp, so a lookup that folded case differently would miss
  // references retail resolves.
  it('folds case, the way the game compares names', () => {
    strictEqual(getHardpoint(hardpoints, 'hpweapon02')?.name, 'HpWeapon02')
  })

  // A hardpoint reference in a UTF file is a CRC, not a name — this is the lookup that resolves
  // one, and it must be getResourceId's CRC rather than the id32 INI nicknames hash.
  it('finds a hardpoint by its resource CRC', () => {
    strictEqual(getHardpoint(hardpoints, getResourceId('HpWeapon01'))?.name, 'HpWeapon01')
  })

  it('returns undefined when nothing matches', () => {
    strictEqual(getHardpoint(hardpoints, 'HpEngine01'), undefined)
    strictEqual(getHardpoint([], 'HpWeapon01'), undefined)
  })
})
