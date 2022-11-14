import { concat } from '../utils.ts'

const SIZES = {
  int8: 1,
  uint8: 1,
  int16: 2,
  uint16: 2,
  int32: 4,
  uint32: 4,
  int64: 8,
  uint64: 8,
}

const METHOD = {
  int8: 'setInt8' as const,
  int16: 'setInt16' as const,
  int32: 'setInt32' as const,
  int64: 'setBigInt64' as const,
  uint8: 'setUint8' as const,
  uint16: 'setUint16' as const,
  uint32: 'setUint32' as const,
  uint64: 'setBigUint64' as const,
}

export class Encoder {
  #pos: number
  #enc: TextEncoder
  #buf: Uint8Array

  constructor(size: number = 4096) {
    this.#pos = 0
    this.#buf = new Uint8Array(size)
    this.#enc = new TextEncoder()
  }

  #putVarNum(
    dataType: 'int8' | 'int16' | 'int32' | 'uint8' | 'uint16' | 'uint32',
    num: number
  ): this {
    const size = SIZES[dataType]
    this.#ensure(size)
    const buff = this.#buf.subarray(this.#pos, this.#pos + size)
    const view = new DataView(buff.buffer)
    view[METHOD[dataType]](buff.byteOffset, num)
    this.#pos += size
    return this
  }

  #putVarBig(dataType: 'int64' | 'uint64', num: bigint): this {
    const size = SIZES[dataType]
    this.#ensure(size)
    const buff = this.#buf.subarray(this.#pos, this.#pos + size)
    const view = new DataView(buff.buffer)
    view[METHOD[dataType]](buff.byteOffset, num)
    this.#pos += size
    return this
  }

  #ensure(size: number): Uint8Array {
    if (this.#buf.length - this.#pos >= size) {
      return this.#buf.subarray(0, size)
    }
    const grow = Math.max(size, this.#buf.length * 2)
    this.#buf = concat(this.#buf, new Uint8Array(grow))
    return this.#buf.subarray(0, size)
  }

  reset(): this {
    this.#pos = 0
    return this
  }

  alloc(size: number): Uint8Array {
    const pos = this.#pos
    this.#ensure(size)
    this.#pos += size
    return this.#buf.subarray(pos, this.#pos)
  }

  get buff(): Uint8Array {
    return this.#buf.subarray(0, this.#pos)
  }

  get pos(): number {
    return this.#pos
  }

  int8(num: number): this {
    return this.#putVarNum('int8', num)
  }

  int16(num: number): this {
    return this.#putVarNum('int16', num)
  }

  int32(num: number): this {
    return this.#putVarNum('int32', num)
  }

  int64(num: bigint): this {
    return this.#putVarBig('int64', num)
  }

  uint8(num: number): this {
    return this.#putVarNum('uint8', num)
  }

  uint16(num: number): this {
    return this.#putVarNum('uint16', num)
  }

  uint32(num: number): this {
    return this.#putVarNum('uint32', num)
  }

  uint64(num: bigint): this {
    return this.#putVarBig('uint64', num)
  }

  char(str: string): this {
    this.#ensure(1)
    this.#buf[this.#pos++] = str.charCodeAt(0)
    return this
  }

  bytes(buff: Uint8Array): this {
    this.#ensure(buff.length)
    this.#buf.set(buff, this.#pos)
    this.#pos += buff.length
    return this
  }

  str(str: string): this {
    this.#ensure(str.length * 3)
    const res = this.#enc.encodeInto(str, this.#buf.subarray(this.#pos))
    this.#pos += res.written
    return this
  }

  cstr(str: string): this {
    this.#ensure(str.length * 3)
    const res = this.#enc.encodeInto(str, this.#buf.subarray(this.#pos))
    this.#pos += res.written
    this.#buf[this.#pos++] = 0
    return this
  }
}
