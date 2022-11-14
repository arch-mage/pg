import { Buffer, concat, Reader, Writer } from './deps.ts'

export class TestBuffer implements Reader, Writer {
  reader: Buffer
  writer: Buffer

  constructor() {
    this.reader = new Buffer()
    this.writer = new Buffer()
  }

  reset(): this {
    this.reader.reset()
    this.writer.reset()
    return this
  }

  read(p: Uint8Array): Promise<number | null> {
    return this.reader.read(p)
  }

  write(p: Uint8Array): Promise<number> {
    return this.writer.write(p)
  }
}

export function uint8(...bytes: Array<string | number | number[]>) {
  return new Uint8Array(
    bytes.flatMap((chunk) => {
      if (Array.isArray(chunk)) {
        return chunk
      }
      if (typeof chunk === 'number') {
        return [chunk]
      }
      return [...new TextEncoder().encode(chunk)]
    })
  )
}

export function buffer(...source: Array<string | number | number[]>) {
  return new Buffer(
    concat(
      ...source.map((source) =>
        Array.isArray(source)
          ? new Uint8Array(source)
          : typeof source === 'string'
          ? new TextEncoder().encode(source)
          : new Uint8Array([source])
      )
    )
  )
}

export {
  assertEquals,
  assertThrows,
  assertRejects,
} from 'https://deno.land/std@0.163.0/testing/asserts.ts'
export {
  spy,
  assertSpyCalls,
} from 'https://deno.land/std@0.163.0/testing/mock.ts'
