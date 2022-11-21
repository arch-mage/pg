import { DecodeError } from '../errors.ts'
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
  int8: 'getInt8' as const,
  int16: 'getInt16' as const,
  int32: 'getInt32' as const,
  int64: 'getBigInt64' as const,
  uint8: 'getUint8' as const,
  uint16: 'getUint16' as const,
  uint32: 'getUint32' as const,
  uint64: 'getBigUint64' as const,
}

export class Decoder {
  #dec: TextDecoder
  #data: Uint8Array
  #pos: number

  constructor(buff?: Uint8Array) {
    this.#pos = 0
    this.#dec = new TextDecoder('utf-8', { fatal: true })
    this.#data = buff ?? new Uint8Array()
  }

  get buff() {
    return this.#data
  }

  #varnum(
    dataType: 'int8' | 'int16' | 'int32' | 'uint8' | 'uint16' | 'uint32'
  ): number {
    const size = SIZES[dataType]
    const buff = this.buff.subarray(this.#pos, this.#pos + size)
    if (buff.length !== size) {
      throw new DecodeError(`not an ${dataType}`)
    }
    this.#pos += size
    const view = new DataView(buff.buffer)
    return view[METHOD[dataType]](buff.byteOffset)
  }

  #varbig(dataType: 'int64' | 'uint64'): bigint {
    const size = SIZES[dataType]
    const buff = this.buff.subarray(this.#pos, this.#pos + size)
    if (buff.length !== size) {
      throw new DecodeError(`not an ${dataType}`)
    }
    this.#pos += size
    const view = new DataView(buff.buffer)
    return view[METHOD[dataType]](buff.byteOffset)
  }

  rewind(n: number): this {
    this.#pos -= n
    return this
  }

  discard(): this {
    this.#data = this.#data.subarray(this.#pos)
    this.#pos = 0
    return this
  }

  feed(buff: Uint8Array): this {
    this.#data = concat(this.#data.subarray(this.#pos), buff)
    this.#pos = 0
    return this
  }

  int8(): number {
    return this.#varnum('int8')
  }

  int16(): number {
    return this.#varnum('int16')
  }

  int32(): number {
    return this.#varnum('int32')
  }

  int64(): bigint {
    return this.#varbig('int64')
  }

  uint8(): number {
    return this.#varnum('uint8')
  }

  uint16(): number {
    return this.#varnum('uint16')
  }

  uint32(): number {
    return this.#varnum('uint32')
  }

  uint64(): bigint {
    return this.#varbig('uint64')
  }

  bytes(size?: number): Uint8Array {
    if (typeof size === 'undefined') {
      const buff = this.buff.slice(this.#pos)
      this.#pos += buff.length
      return buff
    }
    if (this.#pos + size > this.buff.length) {
      throw new DecodeError(`not a bytes with length of ${size}`)
    }
    const buff = this.buff.slice(this.#pos, this.#pos + size)
    this.#pos += buff.length
    return buff
  }

  char(): string {
    const byte = this.buff.at(this.#pos)
    if (typeof byte !== 'number') {
      throw new DecodeError('not a char')
    }
    this.#pos++
    return String.fromCharCode(byte)
  }

  cstr(): string {
    const idx = this.buff.subarray(this.#pos).indexOf(0)
    if (idx === -1) {
      throw new DecodeError('not a null terminated string')
    }
    const str = this.#dec.decode(this.buff.subarray(this.#pos, this.#pos + idx))
    this.#pos += idx + 1
    return str
  }

  str(): string {
    // string should not have a null byte
    const idx = this.buff.subarray(this.#pos).indexOf(0)
    let buf
    let len
    if (idx === -1) {
      buf = this.buff.subarray(this.#pos)
      len = buf.length
    } else {
      buf = this.buff.subarray(this.#pos, this.#pos + idx)
      len = idx
    }
    if (buf.length === 0) {
      throw new DecodeError('not a string')
    }
    this.#pos += len
    return this.#dec.decode(buf)
  }
}
