import { varnum } from '../deps.ts'
import { DecodeError } from '../errors.ts'
import { FullReader } from '../types.ts'

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

export async function readPacket(
  reader: FullReader
): Promise<readonly [string, Uint8Array] | null> {
  const head = new Uint8Array(5)
  if (!(await reader.readFull(head).catch(wrapError))) {
    return null
  }
  const code = String.fromCharCode(head[0])
  const len =
    (varnum(head.subarray(1, 5), {
      endian: 'big',
      dataType: 'int32',
    }) as number) - 4

  const body = new Uint8Array(len)
  if (!(await reader.readFull(body).catch(wrapError))) {
    throw new DecodeError('insufficient data to read')
  }

  return [code, body] as const
}

function wrapError(error: Error) {
  throw new DecodeError(error.message, error)
}
