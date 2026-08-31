/**
 * Turns one flat record into a node plus the two identifiers that place it: its own, and its
 * parent's. A root is a record with no `parentId`.
 */
type TransformCallback<T, V> = (
  value: T,
  index: number,
  array: T[],
) => { childId: number; parentId?: number; child: V }

/** One edge, handed to the pairing callback with both ends already resolved where possible. */
interface PairValue<V> {
  childId: number
  child: V
  parentId?: number
  parent?: V
  array: ReturnType<TransformCallback<unknown, V>>[]
}

/** Links a node to its parent. Called once per record, root or not, so it also sees the orphans. */
type PairCallback<V> = (value: PairValue<V>) => void

/**
 * Assemble hierarchy of objects from flat array.
 * @param input
 * @param transform Transform flat structure into
 * @param pair Pair child -> parent objects callback
 * @returns
 */
export const assemble = <T, V>(
  input: Iterable<T>,
  transform: TransformCallback<T, V>,
  pair: PairCallback<V>,
): V[] => {
  const items = [...input].map(transform)
  const roots: V[] = []

  for (const { child, childId, parentId } of items) {
    if (!parentId) roots.push(child)

    const parent = items.find(({ childId }) => childId === parentId)?.child

    pair({
      childId,
      child,
      parentId,
      parent,
      array: items,
    })
  }

  return roots
}

/** One node on the way back out to a flat list, with the depth and identifiers a writer needs. */
interface FlattenResult<T> {
  /** Depth level. */
  depth: number

  /** Entry index. */
  childId: number

  /** Entry value. */
  child: T

  /** Parent entry index. */
  parentId?: number

  /** Parent value. */
  parent?: T
}

/**
 * Flatten hierarchy of objects where each may return iterator for children.
 * @param input Initial value
 * @param iterate Callback upon current iteration to feed the queue
 * @param count Start index
 */
export function* flatten<T>(
  input: Iterable<T>,
  iterate: (parent: T) => Iterable<T>,
  count = 0,
): Generator<FlattenResult<T>> {
  const queue: FlattenResult<T>[] = [...input].map((value) => ({
    childId: count++,
    child: value,
    depth: 0,
  }))

  let item: FlattenResult<T> | undefined

  while ((item = queue.shift())) {
    const { childId: parentId, child: parent, depth } = item

    for (const child of iterate(parent))
      queue.push({
        childId: count++,
        child,
        parentId,
        parent,
        depth: depth + 1,
      })

    yield item
  }
}
