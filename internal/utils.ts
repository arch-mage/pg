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
