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

export function copy(source: Uint8Array, target: Uint8Array, pos?: number) {
  target.set(source, pos)
  return target
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
