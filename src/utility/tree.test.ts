import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { findTreeElement, listTreeElements, listTreePairs, reduceTree, type Tree } from './tree.js'

interface Node extends Tree<Node> {
  name: string
}

const node = (name: string, ...children: Node[]): Node => ({ name, children })

/**
 * ```
 * a ─┬─ b ─┬─ d
 *    │     └─ e
 *    └─ c ─── f
 * ```
 * Deliberately unbalanced, so depth-first and breadth-first give different orders and a walker
 * that does the wrong one cannot pass by coincidence.
 */
const root = node('a', node('b', node('d'), node('e')), node('c', node('f')))

const names = (nodes: Iterable<Node>) => [...nodes].map(({ name }) => name)

describe('listTreeElements', () => {
  it('yields the root first, then every descendant depth-first', () => {
    deepStrictEqual(names(listTreeElements(root)), ['a', 'b', 'd', 'e', 'c', 'f'])
  })

  it('yields a leaf as a single element', () => {
    deepStrictEqual(names(listTreeElements(node('only'))), ['only'])
  })
})

describe('listTreePairs', () => {
  // The root has no parent, which is the whole difference from listTreeElements — a walker that
  // yielded it would have to invent one.
  it('yields every edge and never the root', () => {
    deepStrictEqual(
      [...listTreePairs(root)].map(({ parent, child }) => `${parent.name}${child.name}`),
      ['ab', 'bd', 'be', 'ac', 'cf'],
    )
  })

  it('yields nothing for a leaf', () => {
    deepStrictEqual([...listTreePairs(node('only'))], [])
  })

  it('pairs a child with the node it actually hangs from, not with the root', () => {
    const pairs = [...listTreePairs(root)]

    strictEqual(pairs.find(({ child }) => child.name === 'd')?.parent.name, 'b')
    strictEqual(pairs.find(({ child }) => child.name === 'f')?.parent.name, 'c')
  })

  it('covers every node but the root exactly once', () => {
    const children = [...listTreePairs(root)].map(({ child }) => child.name)

    deepStrictEqual(children.sort(), ['b', 'c', 'd', 'e', 'f'])
  })
})

describe('findTreeElement', () => {
  it('returns the first match in depth-first order', () => {
    // 'b' precedes 'c' depth-first, but 'd' precedes 'c' too — a breadth-first walk would
    // return 'c' here.
    strictEqual(findTreeElement(root, ({ name }) => 'cd'.includes(name))?.name, 'd')
  })

  it('can match the root itself', () => {
    strictEqual(
      findTreeElement(root, ({ name }) => name === 'a'),
      root,
    )
  })

  it('returns undefined when nothing matches', () => {
    strictEqual(
      findTreeElement(root, ({ name }) => name === 'z'),
      undefined,
    )
  })
})

describe('reduceTree', () => {
  it('calls the reducer for the root with a null parent, before any child', () => {
    const calls: [string, string | null][] = []

    reduceTree(
      root,
      (accumulator, child, parent) => {
        calls.push([child.name, parent?.name ?? null])
        return accumulator
      },
      null,
    )

    deepStrictEqual(calls, [
      ['a', null],
      ['b', 'a'],
      ['d', 'b'],
      ['e', 'b'],
      ['c', 'a'],
      ['f', 'c'],
    ])
  })

  it('threads the accumulator through every call', () => {
    strictEqual(
      reduceTree(root, (count: number) => count + 1, 0),
      [...listTreeElements(root)].length,
    )
  })

  // The ordering guarantee is what makes this possible: a node is never reduced before the
  // parent whose result it builds on.
  it('lets an accumulator depend on the parent result', () => {
    const depths = reduceTree(
      root,
      (depths: Map<Node, number>, child, parent) =>
        depths.set(child, parent ? (depths.get(parent) ?? 0) + 1 : 0),
      new Map(),
    )

    deepStrictEqual(
      [...depths].map(([{ name }, depth]) => `${name}${depth}`),
      ['a0', 'b1', 'd2', 'e2', 'c1', 'f2'],
    )
  })

  it('reduces a leaf to a single call', () => {
    const leaf = node('only')

    strictEqual(
      reduceTree(leaf, (count: number) => count + 1, 0),
      1,
    )
  })
})
