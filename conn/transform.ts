export class FilterStream<I, O extends I> extends TransformStream<I, O> {
  constructor(predicate: (value: I) => value is O) {
    super({
      transform(chunk, controller) {
        try {
          if (predicate(chunk)) {
            controller.enqueue(chunk)
          }
        } catch (error) {
          controller.error(error)
        }
      },
    })
  }
}

export function filter<I, O extends I>(
  predicate: (value: I) => value is O
): FilterStream<I, O> {
  return new FilterStream(predicate)
}
