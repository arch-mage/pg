import { Reader, Writer, putVarnum, BufReader, BufWriter } from '../deps.ts'
import {
  UnexpectedAuthCodeError,
  UnrecognizedFormatCodeError,
  UnrecognizedReadyStateError,
  UnrecognizedResponseError,
} from '../errors.ts'
import {
  AuthCode,
  ColumnDescription,
  FrontendPacket,
  BackendPacket,
  ReadonlyUint8Array,
  ReadyState,
  IProtocol,
} from '../types.ts'
import { Decoder } from './decoder.ts'
import { Encoder } from './encoder.ts'

export class Protocol implements IProtocol {
  #enc: Encoder
  #dec: Decoder
  #rd: BufReader
  #wd: BufWriter
  #closed: boolean

  static fromPair(reader: Reader, writer: Writer, size = 4096) {
    return new Protocol(reader, writer, size)
  }

  static fromConn(conn: Reader & Writer, size = 4096) {
    return new Protocol(conn, conn, size)
  }

  constructor(reader: Reader, writer: Writer, size = 4096) {
    this.#enc = new Encoder(size)
    this.#dec = new Decoder(size)
    this.#rd = BufReader.create(reader, size)
    this.#wd = BufWriter.create(writer, size)
    this.#closed = false
  }

  #begin(code?: string | null) {
    if (code) {
      this.#enc.byte(code.charCodeAt(0))
    }
    const pos = this.#enc.pos
    const buf = this.#enc.alloc(4)
    return () => {
      putVarnum(buf, this.#enc.pos - pos, {
        endian: 'big',
        dataType: 'int32',
      })
      return this
    }
  }

  get rbuff(): ReadonlyUint8Array {
    return this.#dec.buff
  }

  get wbuff(): ReadonlyUint8Array {
    return this.#enc.buff
  }

  reset() {
    this.#dec.reset()
    this.#enc.reset()
  }

  encode(packet: FrontendPacket): this {
    const end = this.#begin(packet.code)
    if (packet.code === null) {
      // StartupMessage (F)
      Object.entries(packet.data)
        .flat()
        .reduce((enc, val) => enc.cstr(val), this.#enc.int32(196608))
        .byte(0)
    } else if (packet.code === 'B') {
      // Bind (F)
      const { portal, stmt, paramFormats, params, resultFormats } = packet.data
      this.#enc.cstr(portal).cstr(stmt)
      paramFormats.reduce(
        (enc, fmt) => enc.int16(fmt),
        this.#enc.int16(paramFormats.length)
      )
      params.reduce((enc, param) => {
        return param ? enc.int32(param.length).bytes(param) : enc.int32(-1)
      }, this.#enc.int16(params.length))
      resultFormats.reduce(
        (enc, fmt) => enc.int16(fmt),
        this.#enc.int16(resultFormats.length)
      )
    } else if (packet.code === 'C') {
      // Close (F)
      this.#enc.byte(packet.data.kind.charCodeAt(0)).cstr(packet.data.name)
    } else if (packet.code === 'D') {
      // Describe (F)
      this.#enc.byte(packet.data.kind.charCodeAt(0)).cstr(packet.data.name)
    } else if (packet.code === 'E') {
      // Execute (F)
      this.#enc.cstr(packet.data.name).int32(packet.data.max)
    } else if (packet.code === 'P') {
      // Parse (F)
      const { query, name, formats } = packet.data
      formats.reduce(
        (enc, fmt) => enc.int16(fmt),
        this.#enc.cstr(name).cstr(query).int16(formats.length)
      )
    } else if (packet.code === 'p') {
      // PasswordMessage (F)
      // SASLInitialResponse (F)
      // SASLResponse (F)
      this.#enc.bytes(packet.data)
    } else if (packet.code === 'Q') {
      // Query (F)
      this.#enc.cstr(packet.data)
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

  async send(): Promise<void> {
    await this.#wd.write(this.#enc.buff as Uint8Array)
    this.#enc.reset()
    await this.#wd.flush()
  }

  async recv(): Promise<BackendPacket | null> {
    if (this.#closed) {
      return null
    }
    const raw = await this.#dec.readPacket(this.#rd)
    if (!raw) {
      this.#closed = true
      return null
    }
    const [code] = raw
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
          processId: this.#dec.int32(),
          channel: this.#dec.cstr(),
          payload: this.#dec.cstr(),
        },
      }
    }
    if (code === 'C') {
      // CommandComplete (B)
      return { code, data: this.#dec.cstr() }
    }
    if (code === 'D') {
      // DataRow (B)
      const n = this.#dec.int16()
      const data = []
      for (let i = 0; i < n; ++i) {
        const len = this.#dec.int32()
        if (len === -1) {
          data.push(null)
        } else {
          data.push(this.#dec.bytes(len))
        }
      }
      return { code, data }
    }
    if (code === 'E') {
      // ErrorResponse (B)
      // deno-lint-ignore no-explicit-any
      const data: any = {}
      for (;;) {
        const key = this.#dec.byte()
        if (key === 0) {
          break
        }
        const val = this.#dec.cstr()
        data[String.fromCharCode(key)] = val
      }
      return { code, data }
    }
    if (code === 'K') {
      // BackendKeyData (B)
      return { code, data: [this.#dec.int32(), this.#dec.int32()] }
    }
    if (code === 'N') {
      // NoticeResponse (B)
      // deno-lint-ignore no-explicit-any
      const data: any = {}
      for (;;) {
        const key = this.#dec.byte()
        if (key === 0) {
          break
        }
        const val = this.#dec.cstr()
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
      const auth = this.#dec.int32()
      if (auth === 0) {
        return { code, data: { code: AuthCode.Ok, data: null } }
      }

      if (auth === 10) {
        const data = []
        for (let mech = this.#dec.cstr(); mech; mech = this.#dec.cstr()) {
          data.push(mech)
        }
        return { code, data: { code: AuthCode.SASL, data } }
      }

      if (auth === 11) {
        return {
          code,
          data: { code: AuthCode.SASLContinue, data: this.#dec.str() },
        }
      }

      if (auth === 12) {
        return {
          code,
          data: { code: AuthCode.SASLFinal, data: this.#dec.str() },
        }
      }
      throw new UnexpectedAuthCodeError(auth)
    }
    if (code === 'S') {
      // ParameterStatus (B)
      return { code, data: [this.#dec.cstr(), this.#dec.cstr()] }
    }
    if (code === 's') {
      return { code, data: null }
    }
    if (code === 'T') {
      // RowDescription (B)
      const n = this.#dec.int16()

      const data: ColumnDescription[] = []
      for (let i = 0; i < n; ++i) {
        const name = this.#dec.cstr()
        const table = this.#dec.int32()
        const attNum = this.#dec.int16()
        const oid = this.#dec.int32()
        const typelen = this.#dec.int16()
        const typemod = this.#dec.int32()
        const format = this.#dec.int16() as 0 | 1
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
      const n = this.#dec.int16()
      const data = []
      for (let i = 0; i < n; ++i) {
        data.push(this.#dec.int32())
      }
      return { code, data }
    }
    if (code === 'Z') {
      // ReadyForQuery (B)
      const data = String.fromCharCode(this.#dec.byte())
      if (data === 'I') return { code, data: ReadyState.Idle }
      if (data === 'T') return { code, data: ReadyState.Transaction }
      if (data === 'E') return { code, data: ReadyState.Error }
      throw new UnrecognizedReadyStateError(data)
    }
    throw new UnrecognizedResponseError(code)
  }

  [Symbol.asyncIterator](): this {
    return this
  }

  async next(): Promise<IteratorResult<BackendPacket, null>> {
    const value = await this.recv()
    return value ? { done: false, value } : { done: true, value }
  }
}

// CopyBothResponse (B)
// CopyInResponse (B)
// CopyOutResponse (B)
// EmptyQueryResponse (B)
// FunctionCallResponse (B)
// NegotiateProtocolVersion (B)
// CancelRequest (F)
// CopyFail (F)
// Flush (F)
// FunctionCall (F)
// GSSENCRequest (F)
// GSSResponse (F)
// SSLRequest (F)
// CopyData (F & B)
// CopyDone (F & B)
