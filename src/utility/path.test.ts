import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import * as path from './path.js'

describe('path', () => {
  it('translates the separator the data is authored with', () => {
    assert.equal(path.join('Universe\\Systems\\Li01\\Li01.ini'), 'Universe/Systems/Li01/Li01.ini')
  })

  it('accepts either separator, since a consumer will pass the other one', () => {
    assert.equal(path.join('fx/weapons\\weapons_ale.ini'), 'fx/weapons/weapons_ale.ini')
  })

  // `[Data] fonts_dir = fonts\files\` names a directory, and the trailing separator is not a
  // segment with an empty name.
  it('drops a trailing separator', () => {
    assert.deepEqual(path.split('fonts\\files\\'), ['fonts', 'files'])
  })

  it('collapses repeated separators', () => {
    assert.deepEqual(path.split('fx\\\\weapons//beam.txm'), ['fx', 'weapons', 'beam.txm'])
  })

  // `[Freelancer] data path = ..\data` is written relative to EXE, the game's working directory.
  it('resolves the data path the way freelancer.ini writes it', () => {
    assert.equal(path.resolve(path.directoryOf('EXE/freelancer.ini'), '..\\data'), 'data')
  })

  it('folds . away and .. into the segment before it', () => {
    assert.deepEqual(path.split('a/./b/../c'), ['a', 'c'])
  })

  it('throws naming the path when .. climbs above the root', () => {
    assert.throws(() => path.split('EXE/../../data'), RangeError)
  })

  it('splits a root-level file into no directory and a name', () => {
    assert.equal(path.directoryOf('cameras.ini'), '')
    assert.equal(path.nameOf('cameras.ini'), 'cameras.ini')
  })

  it('compares paths the way the game compares names', () => {
    assert.ok(path.equals('missions\\mBases.ini', 'MISSIONS/mbases.ini'))
    assert.ok(!path.equals('missions\\mBases.ini', 'MISSIONS/mbase.ini'))
  })
})
