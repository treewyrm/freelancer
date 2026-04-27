interface Compound<T> {
  children: T[]
}

interface Pair<T> {
  parent: T
  child: T
}

const Compound = {
  /** Yields a pair of parent/child of descendants. */
  *pair<T extends Compound<T>>(parent: T): Generator<Pair<T>> {
    for (const child of parent.children) {
      yield { parent, child }
      yield* this.pair(child)
    }
  },

  /** Yields all compound parts including itself. */
  *list<T extends Compound<T>>(parent: T): Generator<T> {
    yield parent
    for (const child of parent.children) yield* this.list(child)
  },

  /** Finds first compound part by matching predicate. */
  find<T extends Compound<T>>(root: T, predicate: (item: T) => boolean) {
    for (const child of Compound.list(root)) if (predicate(child)) return child
  },

  /** Reduces compound parts. */
  reduce<T extends Compound<T>, U>(
    root: T,
    reducer: (accumulator: U, child: T, parent: T | null) => U,
    initial: U,
  ): U {
    let result = reducer(initial, root, null)
    for (const { child, parent } of Compound.pair(root)) result = reducer(result, child, parent)
    return result
  },
}

export default Compound
