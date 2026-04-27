/** Compound hierarchy element recursively containing compound children. */
export interface Compound<T> {
  children: T[]
}

/** A parent-child pair representing link in hierarchy connection. */
export interface Parenthesis<T> {
  parent: T
  child: T
}

export function* listCompoundPairs<T extends Compound<T>>(parent: T): Generator<Parenthesis<T>> {
  for (const child of parent.children) {
    yield { parent, child }
    yield* listCompoundPairs(child)
  }
}

export function* listCompoundElements<T extends Compound<T>>(parent: T): Generator<T> {
  yield parent
  for (const child of parent.children) yield* listCompoundElements(child)
}

export function findCompoundElement<T extends Compound<T>>(
  root: T,
  predicate: (item: T) => boolean,
): T | undefined {
  for (const element of listCompoundElements(root)) if (predicate(element)) return element
}

export function reduceCompount<T extends Compound<T>, R>(
  root: T,
  reducer: (accumulator: R, child: T, parent: T | null) => R,
  initial: R,
): R {
  let result = reducer(initial, root, null)
  for (const { child, parent } of listCompoundPairs(root)) result = reducer(result, child, parent)
  return result
}
