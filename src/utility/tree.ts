/** Tree node recursively containing child nodes. */
export interface Tree<T> {
  children: T[]
}

/** A parent-child pair representing link in hierarchy connection. */
export interface Parenthesis<T> {
  parent: T
  child: T
}

export function* listTreePairs<T extends Tree<T>>(parent: T): Generator<Parenthesis<T>> {
  for (const child of parent.children) {
    yield { parent, child }
    yield* listTreePairs(child)
  }
}

export function* listTreeElements<T extends Tree<T>>(parent: T): Generator<T> {
  yield parent
  for (const child of parent.children) yield* listTreeElements(child)
}

export function findTreeElement<T extends Tree<T>>(
  root: T,
  predicate: (item: T) => boolean,
): T | undefined {
  for (const element of listTreeElements(root)) if (predicate(element)) return element
}

export function reduceTree<T extends Tree<T>, R>(
  root: T,
  reducer: (accumulator: R, child: T, parent: T | null) => R,
  initial: R,
): R {
  let result = reducer(initial, root, null)
  for (const { child, parent } of listTreePairs(root)) result = reducer(result, child, parent)
  return result
}
