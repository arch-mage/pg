import { concat, varnum } from './deps.ts'
import { ProtocolError } from './error.ts'
import { FullReader } from './types.ts'

export class Decoder {
  #pos: number
  #end: number
  #dec: TextDecoder
  #head: Uint8Array
  #body: Uint8Array

  constructor(size = 4096) {
    this.#pos = 0
    this.#end = 0
    this.#head = new Uint8Array(5)
    this.#body = new Uint8Array(size)
    this.#dec = new TextDecoder()
  }

  get #buf() {
    return this.#body.subarray(0, this.#end)
  }

  #ensure(size: number): this {
    if (this.#body.length - this.#pos >= size) {
      return this
    }
    const grow = Math.max(size, Math.floor(this.#body.length / 2))
    this.#body = concat(this.#body, new Uint8Array(grow))
    return this
  }

  #reset(): this {
    this.#pos = 0
    this.#end = 0
    return this
  }

  int16() {
    const num = varnum(this.#buf.subarray(this.#pos, this.#pos + 2), {
      dataType: 'int16',
      endian: 'big',
    })
    this.#pos += 2
    if (typeof num === 'number') {
      return num
    }
    throw new ProtocolError('not int16')
  }

  int32() {
    const num = varnum(this.#buf.subarray(this.#pos, this.#pos + 4), {
      dataType: 'int32',
      endian: 'big',
    })
    this.#pos += 4
    if (typeof num === 'number') {
      return num
    }
    throw new ProtocolError('not int32')
  }

  bytes(size: number) {
    const buff = this.#buf.slice(this.#pos, this.#pos + size)
    if (buff.length !== size) {
      throw new ProtocolError(`not a buff with length of ${size}`)
    }
    this.#pos += buff.length
    return buff
  }

  byte() {
    return this.#buf[this.#pos++]
  }

  cstr() {
    const idx = this.#buf.subarray(this.#pos).indexOf(0)
    if (idx === -1) {
      throw new ProtocolError('not cstr')
    }
    const str = this.#dec.decode(this.#buf.subarray(this.#pos, this.#pos + idx))
    this.#pos += idx + 1
    return str
  }

  async readPacket(reader: FullReader): Promise<string | null> {
    this.#reset()

    if (!(await reader.readFull(this.#head))) {
      return null
    }
    const code = String.fromCharCode(this.#head[0])
    this.#end =
      (varnum(this.#head.subarray(1, 5), {
        endian: 'big',
        dataType: 'int32',
      }) as number) - 4
    this.#ensure(this.#end)

    if (!(await reader.readFull(this.#buf))) {
      throw new ProtocolError('insufficient data to read')
    }

    return code
  }
}
