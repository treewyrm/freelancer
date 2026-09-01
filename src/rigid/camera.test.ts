import { deepStrictEqual, strictEqual, throws } from 'node:assert/strict'
import { describe, it } from 'node:test'
import Directory from '#/utf/directory.js'
import { isCamera, readCamera, writeCamera, type Camera } from './camera.js'
import { readRigidModel, writeRigidModel } from './rigid.js'

/** A 4:3 frustum, which is what all 17 retail cockpit cameras are. */
const sample = (): Camera => ({
  type: 'camera',
  fovX: 0.75,
  fovY: 0.5,
  zNear: 0.25,
  zFar: 1000,
})

const wrap = (camera: Camera = sample()) => new Directory('\\', [writeCamera(camera)])

describe('isCamera', () => {
  it('recognises a fragment holding a Camera', () => {
    strictEqual(isCamera(wrap()), true)
  })

  it('rejects a geometry fragment', () => {
    strictEqual(isCamera(new Directory('\\')), false)
  })

  // The fields live in a Camera subdirectory, not at the fragment root — probing at the root
  // reads all 17 cockpit cameras back as empty rigid parts.
  it('does not look for the fields at the fragment root', () => {
    const directory = wrap().getDirectory('Camera')!

    strictEqual(isCamera(directory), false)
  })
})

describe('writeCamera', () => {
  it('names the directory Camera', () => {
    strictEqual(writeCamera(sample()).name, 'Camera')
  })

  // Retail spells them Fovx and Fovy, not FovX and FovY. Lookups fold case so the game reads
  // either, but nothing is gained by writing a spelling no retail file uses.
  it('writes the four fields in the capitalization retail uses', () => {
    deepStrictEqual(
      writeCamera(sample()).files.map(({ name }) => name),
      ['Fovx', 'Fovy', 'Znear', 'Zfar'],
    )
  })

  it('writes each field as a single float32', () => {
    for (const file of writeCamera(sample()).files) strictEqual(file.byteLength, 4)
  })
})

describe('readCamera', () => {
  it('round-trips a frustum', () => {
    deepStrictEqual(readCamera(wrap()), sample())
  })

  it('throws when the fragment has no Camera directory', () => {
    throws(() => readCamera(new Directory('\\')), /Missing Camera/)
  })

  // Every field is required. The game has no default for a frustum, and a missing one read as
  // zero is a camera that renders nothing while looking like it loaded.
  it('throws on any missing field rather than defaulting it', () => {
    for (const name of ['Fovx', 'Fovy', 'Znear', 'Zfar']) {
      const directory = wrap()
      directory.getDirectory('Camera')!.delete(name)

      throws(() => readCamera(directory), new RegExp(`Missing ${name} in Camera`), name)
    }
  })

  it('throws on a field written with no value in it', () => {
    const directory = wrap()
    directory.getDirectory('Camera')!.delete('Zfar')
    directory.getDirectory('Camera')!.setFile('Zfar')

    throws(() => readCamera(directory), /Missing Zfar in Camera/)
  })
})

describe('camera as a rigid model part', () => {
  it('is what readRigidModel returns for a camera fragment', () => {
    deepStrictEqual(readRigidModel(wrap()), sample())
  })

  // The reader hands back the inner directory, so the writer has to put the wrapper back —
  // otherwise the fragment round-trips one level short.
  it('round-trips back into a fragment holding a Camera directory', () => {
    const document = writeRigidModel(sample())

    strictEqual(isCamera(document), true)
    deepStrictEqual(readRigidModel(document), sample())
  })

  it('is preferred over an empty rigid part, which a camera would otherwise read as', () => {
    strictEqual(readRigidModel(new Directory('\\')).type, 'rigid')
    strictEqual(readRigidModel(wrap()).type, 'camera')
  })
})
