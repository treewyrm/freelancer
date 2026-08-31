/** Tree node recursively containing child nodes. */
export interface Tree<T> {
  children: T[]
}

/** A parent-child pair representing link in hierarchy connection. */
export interface Parenthesis<T> {
  parent: T
  child: T
}

/**
 * Walks a tree depth-first, yielding every edge as a {@link Parenthesis}. The root itself is not
 * yielded, having no parent — {@link listTreeElements} is the counterpart that includes it.
 */
export function* listTreePairs<T extends Tree<T>>(parent: T): Generator<Parenthesis<T>> {
  for (const child of parent.children) {
    yield { parent, child }
    yield* listTreePairs(child)
  }
}

/** Walks a tree depth-first, yielding the root first and then every descendant. */
export function* listTreeElements<T extends Tree<T>>(parent: T): Generator<T> {
  yield parent
  for (const child of parent.children) yield* listTreeElements(child)
}

/** First node in depth-first order the predicate accepts, `undefined` when none does. */
export function findTreeElement<T extends Tree<T>>(
  root: T,
  predicate: (item: T) => boolean,
): T | undefined {
  for (const element of listTreeElements(root)) if (predicate(element)) return element
}

/**
 * Folds a tree depth-first. The reducer is called for the root with a `null` parent first, then for
 * every descendant with the node it hangs from, so an accumulator may depend on the parent's result.
 */
export function reduceTree<T extends Tree<T>, R>(
  root: T,
  reducer: (accumulator: R, child: T, parent: T | null) => R,
  initial: R,
): R {
  let result = reducer(initial, root, null)
  for (const { child, parent } of listTreePairs(root)) result = reducer(result, child, parent)
  return result
}
