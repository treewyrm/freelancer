import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import Directory from '#/utf/directory.js'
import File from '#/utf/file.js'
import { DefaultId, type EffectLibrary } from './effect.js'
import { writeNodeLibrary, type NodeLibrary } from './node.js'
import { PropertyType } from './property.js'
import { hasAlchemy, readAlchemy, writeAlchemy, type Alchemy } from './library.js'

/**
 * Version 1.5 against the effect library's 1, so a reader that took one stream for the other
 * cannot pass by symmetry — the two libraries are separate byte streams that happen to share a
 * container, and neither knows the other's version.
 */
const nodes: NodeLibrary = {
  version: 1.5,
  nodes: [
    {
      type: 'FxSphereEmitter',
      properties: [{ name: 'Node_Name', type: PropertyType.String, value: 'sphere_emitter' }],
    },
  ],
}

const effects: EffectLibrary = {
  version: 1,
  effects: [
    {
      name: 'fx_test',
      unknown1: 0,
      unknown2: 0,
      unknown3: 0,
      unknown4: 0,
      children: [{ crc: DefaultId, flags: 1, sort: 0, id: 7, children: [], targets: [] }],
    },
  ],
}

const sample = (): Alchemy => ({ nodes, effects })

/** The container as it sits in a `.ale`: the two libraries as sibling directories at the root. */
const wrap = (alchemy: Alchemy = sample()) => new Directory('\\', writeAlchemy(alchemy))

describe('hasAlchemy', () => {
  it('recognises a container holding an effect library', () => {
    strictEqual(hasAlchemy(wrap()), true)
  })

  it('rejects a directory without one', () => {
    strictEqual(hasAlchemy(new Directory('\\')), false)
  })

  // The node library is the half a `.3db` could plausibly carry on its own; the effect library is
  // what makes the container a `.ale`.
  it('keys off the effect library rather than the node library', () => {
    const directory = wrap()
    directory.delete('ALEffectLib')

    strictEqual(hasAlchemy(directory), false)
  })
})

describe('writeAlchemy', () => {
  it('emits the two libraries as siblings, not under a shared root', () => {
    deepStrictEqual(
      writeAlchemy(sample()).map(({ name }) => name),
      ['AlchemyNodeLibrary', 'ALEffectLib'],
    )
  })

  it('names the file inside each directory after the directory', () => {
    for (const directory of writeAlchemy(sample()))
      deepStrictEqual(
        directory.files.map(({ name }) => name),
        [directory.name],
      )
  })
})

describe('readAlchemy', () => {
  it('round-trips both libraries', () => {
    deepStrictEqual(readAlchemy(wrap()), sample())
  })

  it('returns undefined rather than throwing when neither directory is there', () => {
    strictEqual(readAlchemy(new Directory('\\')), undefined)
  })

  it('returns undefined when only one of the two is there', () => {
    for (const missing of ['AlchemyNodeLibrary', 'ALEffectLib']) {
      const directory = wrap()
      directory.delete(missing)

      strictEqual(readAlchemy(directory), undefined, missing)
    }
  })

  // The two names repeat at both levels, and a directory without its file is damage rather than
  // a container that carries no effects — but the question asked is still "is this a `.ale`".
  it('returns undefined when a directory is there without its file', () => {
    const directory = wrap()
    directory.getDirectory('AlchemyNodeLibrary')!.delete('AlchemyNodeLibrary')

    strictEqual(readAlchemy(directory), undefined)
  })

  it('searches only the root level, as readMaterials and readTextures do', () => {
    const nested = new Directory('\\', [new Directory('Nested', writeAlchemy(sample()))])

    strictEqual(readAlchemy(nested), undefined)
  })

  it('reads a library written by hand into the two names', () => {
    const directory = new Directory('\\', [
      new Directory('AlchemyNodeLibrary', [
        new File('AlchemyNodeLibrary', writeNodeLibrary(nodes)),
      ]),
      ...writeAlchemy(sample()).slice(1),
    ])

    deepStrictEqual(readAlchemy(directory)?.nodes, nodes)
  })

  it('keeps each library on its own version, reading the two streams separately', () => {
    const alchemy = readAlchemy(wrap())

    strictEqual(alchemy?.nodes.version, 1.5)
    strictEqual(alchemy.effects.version, 1)
  })

  it('carries the instance tree through the container', () => {
    const [effect] = readAlchemy(wrap())?.effects.effects ?? []

    strictEqual(effect?.name, 'fx_test')
    deepStrictEqual(
      effect.children.map(({ crc }) => crc),
      [DefaultId],
    )
  })
})

describe('the container as a whole', () => {
  it('unwraps what a .ale actually holds and nothing else', () => {
    const directory = wrap()

    deepStrictEqual(
      directory.children.map(({ name }) => name),
      ['AlchemyNodeLibrary', 'ALEffectLib'],
    )
  })

  it('leaves anything else in the container alone', () => {
    const directory = new Directory('\\', [
      ...writeAlchemy(sample()),
      new Directory('Texture library'),
    ])

    deepStrictEqual(readAlchemy(directory), sample())
  })
})
