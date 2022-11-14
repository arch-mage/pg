import { sizeof, concat, copy, putVarnum } from '../deps.ts'
import { FrontendPacket } from '../types.ts'

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
    const size = sizeof(dataType)
    this.ensure(size)
    const array = this.#buf.subarray(this.#pos, this.#pos + size)
    putVarnum(array, num, { endian: 'big', dataType })
    this.#pos += size
    return this
  }

  ensure(size: number): Uint8Array {
    if (this.#buf.length - this.#pos >= size) {
      return this.#buf.subarray(0, size)
    }
    const grow = Math.max(size, Math.floor(this.#buf.length / 2))
    this.#buf = concat(this.#buf, new Uint8Array(grow))
    return this.#buf.subarray(0, size)
  }

  reset(): this {
    this.#pos = 0
    return this
  }

  alloc(size: number): Uint8Array {
    const pos = this.#pos
    this.ensure(size)
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
    this.ensure(1)
    putVarnum(this.#buf.subarray(this.#pos, this.#pos + 1), num, {
      endian: 'big',
      dataType: 'uint8',
    })
    this.#pos += 1
    return this
  }

  bytes(buff: Uint8Array): this {
    this.ensure(buff.length)
    copy(buff, this.#buf, this.#pos)
    this.#pos += buff.length
    return this
  }

  str(ch: string): this {
    this.ensure(ch.length * 3)
    const res = this.#enc.encodeInto(ch, this.#buf.subarray(this.#pos))
    this.#pos += res.written
    return this
  }

  cstr(ch: string): this {
    this.ensure(ch.length * 3)
    const res = this.#enc.encodeInto(ch, this.#buf.subarray(this.#pos))
    this.#pos += res.written
    this.#buf[this.#pos++] = 0
    return this
  }
}

export class PacketEncoder extends Encoder {
  #begin(code?: string | null) {
    if (code) {
      this.byte(code.charCodeAt(0))
    }
    const pos = this.pos
    const buf = this.alloc(4)
    return () => {
      const size = this.pos - pos
      putVarnum(buf, size, {
        endian: 'big',
        dataType: 'int32',
      })
      return this
    }
  }

  encode(packet: FrontendPacket): this {
    const end = this.#begin(packet.code)
    if (packet.code === null) {
      // StartupMessage (F)
      Object.entries(packet.data)
        .flat()
        .reduce((enc, val) => enc.cstr(val), this.int32(196608))
        .byte(0)
    } else if (packet.code === 'B') {
      // Bind (F)
      const { portal, stmt, paramFormats, params, resultFormats } = packet.data
      this.cstr(portal).cstr(stmt)
      paramFormats.reduce(
        (enc, fmt) => enc.int16(fmt),
        this.int16(paramFormats.length)
      )
      params.reduce((enc, param) => {
        return param ? enc.int32(param.length).bytes(param) : enc.int32(-1)
      }, this.int16(params.length))
      resultFormats.reduce(
        (enc, fmt) => enc.int16(fmt),
        this.int16(resultFormats.length)
      )
    } else if (packet.code === 'C') {
      // Close (F)
      this.byte(packet.data.kind.charCodeAt(0)).cstr(packet.data.name)
    } else if (packet.code === 'D') {
      // Describe (F)
      this.byte(packet.data.kind.charCodeAt(0)).cstr(packet.data.name)
    } else if (packet.code === 'E') {
      // Execute (F)
      this.cstr(packet.data.name).int32(packet.data.max)
    } else if (packet.code === 'P') {
      // Parse (F)
      const { query, name, formats } = packet.data
      formats.reduce(
        (enc, fmt) => enc.int16(fmt),
        this.cstr(name).cstr(query).int16(formats.length)
      )
    } else if (packet.code === 'p') {
      // PasswordMessage (F)
      // SASLInitialResponse (F)
      // SASLResponse (F)
      this.bytes(packet.data)
    } else if (packet.code === 'Q') {
      // Query (F)
      this.cstr(packet.data)
    } else if (packet.code === 'S') {
      // Sync (F)
    } else if (packet.code === 'X') {
      // Terminate (F)
    } else {
      throw new Error('not implemented')
    }
    end()
    return this
  }
}
