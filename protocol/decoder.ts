import { concat, varnum } from '../deps.ts'
import {
  DecodeError,
  UnexpectedAuthCodeError,
  UnrecognizedFormatCodeError,
  UnrecognizedReadyStateError,
  UnrecognizedResponseError,
} from '../errors.ts'
import { BackendPacket, ColumnDescription } from '../types.ts'

export class Decoder {
  #dec: TextDecoder
  pos: number
  data: Uint8Array
  limit?: number

  constructor(buff: Uint8Array) {
    this.pos = 0
    this.#dec = new TextDecoder()
    this.data = buff
  }

  get buff() {
    return this.data.subarray(0, this.limit)
  }

  int16(): number {
    const num = varnum(this.buff.subarray(this.pos, this.pos + 2), {
      dataType: 'int16',
      endian: 'big',
    })
    this.pos += 2
    if (typeof num === 'number') {
      return num
    }
    throw new DecodeError('not int16')
  }

  int32(): number {
    const num = varnum(this.buff.subarray(this.pos, this.pos + 4), {
      dataType: 'int32',
      endian: 'big',
    })
    this.pos += 4
    if (typeof num === 'number') {
      return num
    }
    throw new DecodeError('not int32')
  }

  bytes(size: number): Uint8Array {
    const buff = this.buff.slice(this.pos, this.pos + size)
    this.pos += Math.min(buff.length, size)
    if (buff.length !== size) {
      throw new DecodeError(`not a buff with length of ${size}`)
    }
    return buff
  }

  byte(): number {
    const byte = this.buff.at(this.pos++)
    if (typeof byte === 'number') {
      return byte
    }
    throw new DecodeError('not byte')
  }

  char(): string {
    const byte = this.buff.at(this.pos++)
    if (typeof byte === 'number') {
      return String.fromCharCode(byte)
    }
    throw new DecodeError('not char')
  }

  cstr(): string {
    const idx = this.buff.subarray(this.pos).indexOf(0)
    if (idx === -1) {
      this.pos = this.buff.length
      throw new DecodeError('not cstr')
    }
    const str = this.#dec.decode(this.buff.subarray(this.pos, this.pos + idx))
    this.pos += idx + 1
    return str
  }

  str(): string {
    const idx = this.buff.subarray(this.pos).indexOf(0)
    let buf
    if (idx === -1) {
      buf = this.buff.subarray(this.pos)
      this.pos = this.buff.length
    } else {
      buf = this.buff.subarray(this.pos, this.pos + idx)
      this.pos += idx
    }
    if (buf.length === 0) {
      throw new DecodeError('empty string')
    }
    return this.#dec.decode(buf)
  }
}

export class PacketDecoder extends Decoder {
  constructor(buff?: Uint8Array) {
    super(buff ?? new Uint8Array(0))
  }
  #header() {
    this.data = this.data.subarray(this.pos)
    this.pos = 0
    if (this.data.length < 5) {
      return null
    }
    const code = this.char()
    const size = this.int32()
    if (size + 1 > this.data.length) {
      this.pos -= 5
      return null
    }
    this.limit = this.pos + (size - 4)
    return code
  }

  feed(buff: Uint8Array): this {
    this.data = concat(this.data, buff)
    return this
  }

  decode(): BackendPacket | null {
    const code = this.#header()
    if (code === null) {
      return null
    }
    if (code === '1') {
      return { code, data: null }
    }
    if (code === '2') {
      return { code, data: null }
    }
    if (code === '3') {
      return { code, data: null }
    }
    if (code === 'A') {
      // NotificationResponse (B)
      return {
        code,
        data: {
          processId: this.int32(),
          channel: this.cstr(),
          payload: this.cstr(),
        },
      }
    }
    if (code === 'C') {
      // CommandComplete (B)
      return { code, data: this.cstr() }
    }
    if (code === 'D') {
      // DataRow (B)
      const n = this.int16()
      const data = []
      for (let i = 0; i < n; ++i) {
        const len = this.int32()
        if (len === -1) {
          data.push(null)
        } else {
          data.push(this.bytes(len))
        }
      }
      return { code, data }
    }
    if (code === 'E') {
      // ErrorResponse (B)
      // deno-lint-ignore no-explicit-any
      const data: any = {}
      for (;;) {
        const key = this.byte()
        if (key === 0) {
          break
        }
        const val = this.cstr()
        data[String.fromCharCode(key)] = val
      }
      return { code, data }
    }
    if (code === 'K') {
      // BackendKeyData (B)
      return { code, data: [this.int32(), this.int32()] }
    }
    if (code === 'N') {
      // NoticeResponse (B)
      // deno-lint-ignore no-explicit-any
      const data: any = {}
      for (;;) {
        const key = this.byte()
        if (key === 0) {
          break
        }
        const val = this.cstr()
        data[String.fromCharCode(key)] = val
      }
      return { code, data }
    }
    if (code === 'n') {
      return { code, data: null }
    }
    if (code === 'R') {
      // AuthenticationCleartextPassword (B)
      // AuthenticationGSS (B)
      // AuthenticationGSSContinue (B)
      // AuthenticationKerberosV5 (B)
      // AuthenticationMD5Password (B)
      // AuthenticationOk (B)
      // AuthenticationSASL (B)
      // AuthenticationSASLContinue (B)
      // AuthenticationSASLFinal (B)
      // AuthenticationSCMCredential (B)
      // AuthenticationSSPI (B)
      const auth = this.int32()
      if (auth === 0) {
        return { code, data: { code: auth, data: null } }
      }

      if (auth === 10) {
        const data = []
        for (let mech = this.cstr(); mech; mech = this.cstr()) {
          data.push(mech)
        }
        return { code, data: { code: auth, data } }
      }

      if (auth === 11) {
        return {
          code,
          data: { code: auth, data: this.str() },
        }
      }

      if (auth === 12) {
        return {
          code,
          data: { code: auth, data: this.str() },
        }
      }
      throw new UnexpectedAuthCodeError(auth)
    }
    if (code === 'S') {
      // ParameterStatus (B)
      return { code, data: [this.cstr(), this.cstr()] }
    }
    if (code === 's') {
      return { code, data: null }
    }
    if (code === 'T') {
      // RowDescription (B)
      const n = this.int16()

      const data: ColumnDescription[] = []
      for (let i = 0; i < n; ++i) {
        const name = this.cstr()
        const table = this.int32()
        const attNum = this.int16()
        const oid = this.int32()
        const typelen = this.int16()
        const typemod = this.int32()
        const format = this.int16() as 0 | 1
        if (format !== 0 && format !== 1) {
          throw new UnrecognizedFormatCodeError(format)
        }
        data.push({
          name,
          table: table === 0 ? null : table,
          attNum: attNum === 0 ? null : attNum,
          oid,
          typelen,
          typemod,
          format,
        })
      }
      return { code, data }
    }
    if (code === 't') {
      // ParameterDescription (B)
      const n = this.int16()
      const data = []
      for (let i = 0; i < n; ++i) {
        data.push(this.int32())
      }
      return { code, data }
    }
    if (code === 'Z') {
      // ReadyForQuery (B)
      const data = String.fromCharCode(this.byte())
      if (data === 'I') return { code, data }
      if (data === 'T') return { code, data }
      if (data === 'E') return { code, data }
      throw new UnrecognizedReadyStateError(data)
    }
    throw new UnrecognizedResponseError(code)
  }

  [Symbol.iterator](): IterableIterator<BackendPacket> {
    return this
  }

  next(): IteratorResult<BackendPacket, null> {
    const value = this.decode()
    return value ? { done: false, value } : { done: true, value }
  }
}
