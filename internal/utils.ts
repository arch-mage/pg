export function* zip<A, B>(
  iterableA: Iterable<A>,
  iterableB: Iterable<B>
): Generator<[A, B], void, unknown> {
  const iteratorA = iterableA[Symbol.iterator]()
  const iteratorB = iterableB[Symbol.iterator]()

  for (;;) {
    const resultA = iteratorA.next()
    const resultB = iteratorB.next()

    if (resultA.done || resultB.done) {
      break
    }

    yield [resultA.value, resultB.value]
  }
}

export function hasProp<P extends string | number | symbol>(
  prop: P,
  value: unknown
): value is { [K in P]: unknown } {
  return !!value && typeof value === 'object' && prop in value
}

export interface Flusher {
  flush(): Promise<void>
}

export function isFlusher(value: unknown): value is Flusher {
  return hasProp('flush', value) && typeof value.flush === 'function'
}
