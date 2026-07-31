import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import Directory from '../directory.js'
import { ChannelType, type Channel } from './channel.js'
import {
  getLibraryDuration,
  getScript,
  readAnimationLibrary,
  writeAnimationLibrary,
} from './library.js'
import { writeAnimationMap, type AnimationMap } from './map.js'
import { getJointMap, getObjectMap, getScriptDuration, writeScript, type Script } from './script.js'

const channel = (...keys: number[]): Channel => ({
  interval: -1,
  type: ChannelType.Angle,
  keyframes: keys.map((key) => ({ key, value: key })),
})

const joint = (parent: string, child: string, ...keys: number[]): AnimationMap => ({
  type: 'joint',
  parent,
  child,
  channel: channel(...keys),
})

const object = (parent: string, ...keys: number[]): AnimationMap => ({
  type: 'object',
  parent,
  channel: channel(...keys),
})

const script = (name: string, ...maps: AnimationMap[]): Script => ({ name, maps })

const library = [
  script('Sc_open dock', joint('Root', 'door_left', 0, 1.5), joint('Root', 'door_right', 0, 2)),
  script('Sc_spin', joint('Root', 'radar', 0, 4)),
]

describe('writeAnimationLibrary', () => {
  it('nests scripts under Animation/Script', () => {
    const directory = writeAnimationLibrary(library)

    strictEqual(directory.name, 'Animation')
    deepStrictEqual(
      directory.directories.map(({ name }) => name),
      ['Script'],
    )
    deepStrictEqual(
      directory.getDirectory('Script')?.directories.map(({ name }) => name),
      ['Sc_open dock', 'Sc_spin'],
    )
  })

  it('round-trips through the reader', () => {
    deepStrictEqual(
      readAnimationLibrary(new Directory('\\', [writeAnimationLibrary(library)])),
      library,
    )
  })
})

describe('readAnimationLibrary', () => {
  it('returns nothing for a model without animation', () => {
    deepStrictEqual(readAnimationLibrary(new Directory()), [])
  })

  it('ignores stray entries beside the maps', () => {
    const directory = writeAnimationLibrary(library)
    directory.getDirectory('Script', 'Sc_spin')?.setDirectory('Notes')

    strictEqual(readAnimationLibrary(new Directory('\\', [directory])).at(1)?.maps.length, 1)
  })
})

describe('writeScript', () => {
  it('numbers object and joint maps separately', () => {
    const directory = writeScript(
      script('Sc_walk', object('Root'), joint('Root', 'a'), joint('a', 'b')),
    )

    deepStrictEqual(
      directory.directories.map(({ name }) => name),
      ['Object map 0', 'Joint map 0', 'Joint map 1'],
    )
  })

  it('writes root height ahead of the maps, and only when set', () => {
    deepStrictEqual(
      writeScript({ ...script('Sc_walk', object('Root')), height: 2.5 }).children.map(
        ({ name }) => name,
      ),
      ['Root height', 'Object map 0'],
    )

    ok(!writeScript(script('Sc_walk', object('Root'))).getFile('Root height'))
  })
})

describe('writeAnimationMap', () => {
  it('gives joint maps a child name and object maps none', () => {
    deepStrictEqual(
      writeAnimationMap(joint('Root', 'door'), 3).children.map(({ name }) => name),
      ['Parent name', 'Child name', 'Channel'],
    )

    deepStrictEqual(
      writeAnimationMap(object('Root')).children.map(({ name }) => name),
      ['Parent name', 'Channel'],
    )

    strictEqual(writeAnimationMap(joint('Root', 'door'), 3).name, 'Joint map 3')
  })
})

describe('duration', () => {
  it('takes the longest map, script and library', () => {
    strictEqual(getScriptDuration(library[0]!), 2)
    strictEqual(getLibraryDuration(library), 4)
  })

  it('is zero for a script with no keyframes', () => {
    strictEqual(getScriptDuration(script('Sc_empty')), 0)
  })
})

describe('lookup', () => {
  it('finds scripts and maps by name, ignoring case', () => {
    const found = getScript(library, 'SC_OPEN DOCK')

    strictEqual(found?.name, 'Sc_open dock')
    strictEqual(getJointMap(found!, 'DOOR_RIGHT')?.child, 'door_right')
    strictEqual(getObjectMap(found!, 'Root'), undefined)
    strictEqual(getObjectMap(script('Sc_x', object('Root')), 'root')?.parent, 'Root')
  })
})
