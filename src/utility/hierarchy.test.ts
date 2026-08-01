import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { assemble, flatten } from './hierarchy.js'

/**
 * A flat record of the shape `assemble` is written for: an identifier, an optional parent
 * identifier, and a payload. Alchemy effect entries are these, keyed by handles the authoring
 * tool handed out.
 */
interface Record {
  id: number
  parent?: number
  name: string
}

interface Node {
  name: string
  children: Node[]
}

/** Assembles records into nodes the way `readEffect` does, parent pushing child. */
const build = (records: Record[]): Node[] =>
  assemble<Record, Node>(
    records,
    ({ id, parent, name }) => ({
      child: { name, children: [] },
      childId: id,
      parentId: parent,
    }),
    ({ child, parent }) => void parent?.children.push(child),
  )

const names = (nodes: Node[]): unknown =>
  nodes.map(({ name, children }) => (children.length ? { [name]: names(children) } : name))

describe('assemble', () => {
  it('returns nothing for no input', () => {
    deepStrictEqual(build([]), [])
  })

  it('treats a record with no parent identifier as a root', () => {
    deepStrictEqual(names(build([{ id: 1, name: 'root' }])), ['root'])
  })

  it('nests children under the parent they name', () => {
    const roots = build([
      { id: 1, name: 'root' },
      { id: 2, parent: 1, name: 'a' },
      { id: 3, parent: 1, name: 'b' },
      { id: 4, parent: 3, name: 'b1' },
    ])

    deepStrictEqual(names(roots), [{ root: ['a', { b: ['b1'] }] }])
  })

  it('keeps every root of a forest, in input order', () => {
    const roots = build([
      { id: 1, name: 'first' },
      { id: 2, name: 'second' },
      { id: 3, parent: 2, name: 'child' },
    ])

    deepStrictEqual(names(roots), ['first', { second: ['child'] }])
  })

  it('links a child declared before its parent', () => {
    const roots = build([
      { id: 2, parent: 1, name: 'child' },
      { id: 1, name: 'root' },
    ])

    deepStrictEqual(names(roots), [{ root: ['child'] }])
  })

  /**
   * A parent identifier naming no record leaves the child unattached and out of the roots, which
   * is how a link to an entry outside the effect drops rather than throwing.
   */
  it('drops a child whose parent is not in the input', () => {
    const roots = build([
      { id: 1, name: 'root' },
      { id: 2, parent: 99, name: 'orphan' },
    ])

    deepStrictEqual(names(roots), ['root'])
  })

  /**
   * Identifier 0 is falsy, so a record claiming it as a parent counts as a root *and* still gets
   * attached to the record holding it — the child lands in the result twice. Latent rather than
   * live: no retail effect entry uses 0 at either end, and the writer hands out identifiers from
   * 1. Pinned so a reader that starts numbering from 0 is caught here rather than in the data.
   */
  it('reads a record claiming parent 0 as both a root and a child', () => {
    const roots = build([
      { id: 0, name: 'zero' },
      { id: 1, parent: 0, name: 'claims zero' },
    ])

    deepStrictEqual(names(roots), [{ zero: ['claims zero'] }, 'claims zero'])
  })

  it('hands the pair callback both ends of every link and the whole array', () => {
    const seen: [child: string, parent: string | undefined, size: number][] = []

    assemble<Record, Node>(
      [
        { id: 1, name: 'root' },
        { id: 2, parent: 1, name: 'child' },
      ],
      ({ id, parent, name }) => ({
        child: { name, children: [] },
        childId: id,
        parentId: parent,
      }),
      ({ child, parent, array }) => void seen.push([child.name, parent?.name, array.length]),
    )

    deepStrictEqual(seen, [
      ['root', undefined, 2],
      ['child', 'root', 2],
    ])
  })
})

describe('flatten', () => {
  const tree = (): Node[] => [
    {
      name: 'root',
      children: [
        { name: 'a', children: [{ name: 'a1', children: [] }] },
        { name: 'b', children: [] },
      ],
    },
  ]

  const steps = (roots: Node[], count?: number) => [
    ...flatten(roots, ({ children }) => children, count),
  ]

  it('yields nothing for no input', () => {
    deepStrictEqual(steps([]), [])
  })

  it('visits breadth first', () => {
    deepStrictEqual(
      steps(tree()).map(({ child }) => child.name),
      ['root', 'a', 'b', 'a1'],
    )
  })

  it('numbers entries in the order they are queued', () => {
    deepStrictEqual(
      steps(tree()).map(({ childId }) => childId),
      [0, 1, 2, 3],
    )
  })

  it('starts numbering where told, as effect entries do at 1', () => {
    deepStrictEqual(
      steps(tree(), 1).map(({ childId }) => childId),
      [1, 2, 3, 4],
    )
  })

  it('reports each entry parent, and none for a root', () => {
    deepStrictEqual(
      steps(tree()).map(({ child, parent }) => [child.name, parent?.name]),
      [
        ['root', undefined],
        ['a', 'root'],
        ['b', 'root'],
        ['a1', 'a'],
      ],
    )
  })

  it('pairs a parent identifier with the identifier it was given', () => {
    const found = steps(tree())
    const a1 = found.at(-1)!
    const a = found.find(({ child }) => child.name === 'a')!

    strictEqual(a1.parentId, a.childId)
  })

  it('reports depth from the roots', () => {
    deepStrictEqual(
      steps(tree()).map(({ depth }) => depth),
      [0, 1, 1, 2],
    )
  })

  it('walks several roots', () => {
    const roots: Node[] = [
      { name: 'first', children: [{ name: 'child', children: [] }] },
      { name: 'second', children: [] },
    ]

    deepStrictEqual(
      steps(roots).map(({ child, depth }) => [child.name, depth]),
      [
        ['first', 0],
        ['second', 0],
        ['child', 1],
      ],
    )
  })
})
