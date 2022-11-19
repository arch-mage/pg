import { PostgresError, UnexpectedBackendPacket } from './errors.ts'

export function hasProp<P extends string | number | symbol>(
  value: unknown,
  prop: P
): value is {
  [K in P]: unknown
} {
  return !!value && prop in value
}

export function clearNil<T>(
  value: Record<string, T | null | undefined>
): Record<string, T> {
  const record: Record<string, T> = {}
  for (const [key, val] of Object.entries(value)) {
    if (typeof val === 'undefined') {
      continue
    }
    if (val === null) {
      continue
    }
    record[key] = val
  }
  return record
}

export function concat(...buff: Uint8Array[]): Uint8Array {
  const len = buff.reduce((len, buf) => len + buf.length, 0)
  const result = new Uint8Array(len)
  let pos = 0
  for (const buf of buff) {
    result.set(buf, pos)
    pos += buf.length
  }
  return result
}

export function putInt32(buffer: Uint8Array, num: number) {
  const buff = buffer.subarray(0, 4)
  const view = new DataView(buff.buffer)
  view.setInt32(buff.byteOffset, num)
}

export function noop(): void
export function noop<T>(value: T): T
export function noop<T>(value?: T): T | void {
  return value
}

export function compose<A, B, C>(
  fn2: (value: B) => C,
  fn1: (value: A) => B
): (value: A) => C {
  return (value) => fn2(fn1(value))
}

export function maybeBackendError(error: unknown): unknown {
  if (!(error instanceof UnexpectedBackendPacket)) {
    return error
  }
  if (error.packet.code !== 'E') {
    return error
  }
  return new PostgresError(error.packet.data)
}

export function remove<T>(array: T[], elem: T) {
  const idx = array.indexOf(elem)
  if (idx === -1) {
    return null
  }
  array.splice(idx, 1)
  return elem
}
