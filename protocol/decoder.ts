import { concat, varnum } from '../deps.ts'
import { DecodeError } from '../errors.ts'
import { FullReader } from '../types.ts'

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

  int16(): number {
    const num = varnum(this.#buf.subarray(this.#pos, this.#pos + 2), {
      dataType: 'int16',
      endian: 'big',
    })
    this.#pos += 2
    if (typeof num === 'number') {
      return num
    }
    throw new DecodeError('not int16')
  }

  int32(): number {
    const num = varnum(this.#buf.subarray(this.#pos, this.#pos + 4), {
      dataType: 'int32',
      endian: 'big',
    })
    this.#pos += 4
    if (typeof num === 'number') {
      return num
    }
    throw new DecodeError('not int32')
  }

  bytes(size: number): Uint8Array {
    const buff = this.#buf.subarray(this.#pos, this.#pos + size)
    this.#pos += Math.min(buff.length, size)
    if (buff.length !== size) {
      throw new DecodeError(`not a buff with length of ${size}`)
    }
    return buff
  }

  byte(): number {
    const byte = this.#buf.at(this.#pos++)
    if (typeof byte === 'number') {
      return byte
    }
    throw new DecodeError('not byte')
  }

  cstr(): string {
    const idx = this.#buf.subarray(this.#pos).indexOf(0)
    if (idx === -1) {
      this.#pos = this.#end
      throw new DecodeError('not cstr')
    }
    const str = this.#dec.decode(this.#buf.subarray(this.#pos, this.#pos + idx))
    this.#pos += idx + 1
    return str
  }

  str(): string {
    const idx = this.#buf.subarray(this.#pos).indexOf(0)
    let buf
    if (idx === -1) {
      buf = this.#buf.subarray(this.#pos)
      this.#pos = this.#end
    } else {
      buf = this.#buf.subarray(this.#pos, this.#pos + idx)
      this.#pos += idx
    }
    if (buf.length === 0) {
      throw new DecodeError('empty string')
    }
    return this.#dec.decode(buf)
  }

  async readPacket(reader: FullReader): Promise<string | null> {
    this.#reset()

    if (!(await reader.readFull(this.#head).catch(wrapError))) {
      return null
    }
    const code = String.fromCharCode(this.#head[0])
    this.#end =
      (varnum(this.#head.subarray(1, 5), {
        endian: 'big',
        dataType: 'int32',
      }) as number) - 4
    this.#ensure(this.#end)

    if (!(await reader.readFull(this.#buf).catch(wrapError))) {
      throw new DecodeError('insufficient data to read')
    }

    return code
  }
}

function wrapError(error: Error) {
  throw new DecodeError(error.message, error)
}
