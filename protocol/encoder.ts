import { sizeof, concat, copy, NodeBuffer, putVarnum } from '../deps.ts'

export class Encoder {
  #pos: number
  #enc: TextEncoder
  #buf: Uint8Array

  constructor(size: number = 4096) {
    this.#pos = 0
    this.#buf = new Uint8Array(size)
    this.#enc = new TextEncoder()
  }

  #ensure(size: number) {
    if (this.#buf.length - this.#pos >= size) {
      return this
    }
    const grow = Math.max(size, Math.floor(this.#buf.length / 2))
    this.#buf = concat(this.#buf, new Uint8Array(grow))
    return this
  }

  #putVarNum(
    dataType: 'int8' | 'int16' | 'int32' | 'uint8' | 'uint16' | 'uint32',
    num: number
  ): this {
    const size = sizeof(dataType)
    this.#ensure(size)
    const array = this.#buf.subarray(this.#pos, this.#pos + size)
    putVarnum(array, num, { endian: 'big', dataType })
    this.#pos += size
    return this
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

  int16(num: number): this {
    return this.#putVarNum('int16', num)
  }

  int32(num: number): this {
    return this.#putVarNum('int32', num)
  }

  byte(num: number): this {
    this.#ensure(1)
    putVarnum(this.#buf.subarray(this.#pos, this.#pos + 1), num, {
      endian: 'big',
      dataType: 'uint8',
    })
    this.#pos += 1
    return this
  }

  bytes(buff: Uint8Array): this {
    this.#ensure(buff.length)
    copy(buff, this.#buf, this.#pos)
    this.#pos += buff.length
    return this
  }

  str(ch: string): this {
    const len = NodeBuffer.byteLength(ch)
    this.#ensure(len)
    this.#enc.encodeInto(ch, this.#buf.subarray(this.#pos, this.#pos + len))
    this.#pos += len
    return this
  }

  cstr(ch: string): this {
    const len = NodeBuffer.byteLength(ch)
    this.#ensure(len + 1)
    this.#enc.encodeInto(ch, this.#buf.subarray(this.#pos, this.#pos + len))
    this.#pos += len
    this.#buf[this.#pos] = 0
    this.#pos += 1
    return this
  }
}
