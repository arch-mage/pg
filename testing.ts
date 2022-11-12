import { Buffer, Reader, Writer } from './deps.ts'

export function uint8(...bytes: number[]) {
  return new Uint8Array(bytes)
}

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

export {
  assertEquals,
  assertThrows,
  assertRejects,
} from 'https://deno.land/std@0.163.0/testing/asserts.ts'
export {
  spy,
  assertSpyCalls,
} from 'https://deno.land/std@0.163.0/testing/mock.ts'
