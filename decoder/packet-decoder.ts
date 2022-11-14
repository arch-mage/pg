import {
  UnrecognizedAuth,
  UnrecognizedFormatCode,
  UnrecognizedReadyState,
  UnrecognizedBackendPacket,
} from '../errors.ts'
import { Decoder } from './decoder.ts'

export class PacketDecoder extends Decoder {
  #limit: number

  constructor(buff?: Uint8Array) {
    super(buff)
    this.#limit = super.buff.length
  }

  get buff() {
    return super.buff.subarray(0, this.#limit)
  }

  #header() {
    this.discard()
    const buff = super.buff
    if (buff.length < 5) {
      return null
    }

    this.#limit = buff.length
    const code = this.char()
    const size = this.int32()
    if (size + 1 > buff.length) {
      this.rewind(5)
      return null
    }

    this.#limit = size + 1
    return code
  }

  decode(): BackendPacket | null {
    const code = this.#header()
    if (code === null) {
      return null
    }
    if (code === '1') {
      return { code }
    }
    if (code === '2') {
      return { code }
    }
    if (code === '3') {
      return { code }
    }
    if (code === 'A') {
      // NotificationResponse (B)
      return {
        code,
        data: {
          process: this.int32(),
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
      const data: Record<string, string> = {}
      for (;;) {
        const key = this.uint8()
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
      const data: Record<string, string> = {}
      for (;;) {
        const key = this.uint8()
        if (key === 0) {
          break
        }
        const val = this.cstr()
        data[String.fromCharCode(key)] = val
      }
      return { code, data }
    }
    if (code === 'n') {
      // NoData (B)
      return { code }
    }
    if (code === 'R') {
      const auth = this.int32()
      if (auth === 0) {
        // AuthenticationOk (B)
        return { code, data: { code: auth } }
      }

      if (auth === 10) {
        // AuthenticationSASL (B)
        const data = []
        for (let mech = this.cstr(); mech; mech = this.cstr()) {
          data.push(mech)
        }
        return { code, data: { code: auth, data } }
      }

      if (auth === 11) {
        // AuthenticationSASLContinue (B)
        return { code, data: { code: auth, data: this.str() } }
      }

      if (auth === 12) {
        // AuthenticationSASLFinal (B)
        return { code, data: { code: auth, data: this.str() } }
      }
      // AuthenticationCleartextPassword (B)
      // AuthenticationGSS (B)
      // AuthenticationGSSContinue (B)
      // AuthenticationKerberosV5 (B)
      // AuthenticationMD5Password (B)
      // AuthenticationSCMCredential (B)
      // AuthenticationSSPI (B)
      throw new UnrecognizedAuth(auth)
    }
    if (code === 'S') {
      // ParameterStatus (B)
      return { code, data: [this.cstr(), this.cstr()] }
    }
    if (code === 's') {
      return { code }
    }
    if (code === 'T') {
      // RowDescription (B)
      const n = this.int16()

      const data = []
      for (let i = 0; i < n; ++i) {
        const name = this.cstr()
        const table = this.int32()
        const attNum = this.int16()
        const oid = this.int32()
        const typelen = this.int16()
        const typemod = this.int32()
        const format = this.int16() as 0 | 1
        if (format !== 0 && format !== 1) {
          throw new UnrecognizedFormatCode(format)
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
      const data = this.char()
      if (data === 'I') return { code, data }
      if (data === 'T') return { code, data }
      if (data === 'E') return { code, data }
      throw new UnrecognizedReadyState(data)
    }

    // CopyBothResponse (B)
    // CopyInResponse (B)
    // CopyOutResponse (B)
    // EmptyQueryResponse (B)
    // FunctionCallResponse (B)
    // NegotiateProtocolVersion (B)
    // CopyData (F & B)
    // CopyDone (F & B)
    throw new UnrecognizedBackendPacket(code)
  }

  [Symbol.iterator](): this {
    return this
  }

  next(): IteratorResult<BackendPacket, null> {
    const value = this.decode()
    return value ? { done: false, value } : { done: true, value }
  }
}

export interface ParseComplete {
  code: '1'
}

export interface BindComplete {
  code: '2'
}

export interface CloseComplete {
  code: '3'
}

export interface NotificationResponse {
  code: 'A'
  data: {
    process: number
    channel: string
    payload: string
  }
}

export interface CommandComplete {
  code: 'C'
  data: string
}

export interface DataRow {
  code: 'D'
  data: Array<Uint8Array | null>
}

export interface ErrorResponse {
  code: 'E'
  data: Record<string, string>
}

export interface BackendKeyData {
  code: 'K'
  data: [number, number]
}

export interface NoticeResponse {
  code: 'N'
  data: Record<string, string>
}

export interface NoData {
  code: 'n'
}

export interface Authentication {
  code: 'R'
  data: AuthOk | AuthSASL | AuthSASLContinue | AuthSASLFinal
}

export interface ParameterStatus {
  code: 'S'
  data: [string, string]
}

export interface PortalSuspended {
  code: 's'
}

export interface RowDescription {
  code: 'T'
  data: Array<{
    name: string
    table: number | null
    attNum: number | null
    oid: number
    typelen: number
    typemod: number
    format: 0 | 1
  }>
}

export interface ParameterDescription {
  code: 't'
  data: number[]
}

export interface ReadyForQuery {
  code: 'Z'
  data: 'I' | 'T' | 'E'
}

export type BackendPacket =
  | ParseComplete
  | BindComplete
  | CloseComplete
  | NotificationResponse
  | CommandComplete
  | DataRow
  | ErrorResponse
  | BackendKeyData
  | NoticeResponse
  | NoData
  | Authentication
  | ParameterStatus
  | RowDescription
  | PortalSuspended
  | ParameterDescription
  | ReadyForQuery

export interface AuthOk {
  code: 0
}

export interface AuthSASL {
  code: 10
  data: string[]
}

export interface AuthSASLContinue {
  code: 11
  data: string
}

export interface AuthSASLFinal {
  code: 12
  data: string
}
