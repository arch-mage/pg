import {
  UnrecognizedFrontendPacket,
  UnrecognizedRequestCode,
} from '../errors.ts'
import { putInt32 } from '../utils.ts'
import { Encoder } from './encoder.ts'

export class PacketEncoder extends Encoder {
  encode(packet: FrontendPacket): this {
    // StartupMessage does not have a code
    if (packet.code) {
      this.char(packet.code)
    }

    // allocate 4 bytes for packet size. packet size does not include the code,
    // but includes the size itself.
    const pos = this.pos
    const size = this.alloc(4)

    if (packet.code === null) {
      const req = packet.data
      const code = req.code
      if (code === 196608) {
        // StartupMessage (F)
        this.int32(code)
        this.cstr('user')
        this.cstr(req.data.user)
        for (const [key, val] of Object.entries(req.data.params)) {
          this.cstr(key).cstr(val)
        }
        this.uint8(0)
      } else if (code === 80877102) {
        // CancelRequest (F)
        this.int32(code)
        this.int32(req.data.process)
        this.int32(req.data.secret)
      } else if (code === 80877103) {
        // SSLRequest (F)
        this.int32(code)
      } else {
        throw new UnrecognizedRequestCode(code)
      }
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
      this.char(packet.data.kind)
      this.cstr(packet.data.name)
    } else if (packet.code === 'c') {
      // CopyDone (F & B)
    } else if (packet.code === 'D') {
      // Describe (F)
      this.char(packet.data.kind)
      this.cstr(packet.data.name)
    } else if (packet.code === 'd') {
      // CopyData (F & B)
      this.bytes(packet.data)
    } else if (packet.code === 'E') {
      // Execute (F)
      this.cstr(packet.data.name)
      this.int32(packet.data.max)
    } else if (packet.code === 'f') {
      // CopyFail (F)
      this.cstr(packet.data)
    } else if (packet.code === 'P') {
      // Parse (F)
      const { query, name, formats } = packet.data
      formats.reduce(
        (enc, fmt) => enc.int16(fmt),
        this.cstr(name).cstr(query).int16(formats.length)
      )
    } else if (packet.code === 'H') {
      // Flush (F)
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
      // FunctionCall (F)
      // GSSENCRequest (F)
      // GSSResponse (F)

      // deno-lint-ignore no-explicit-any
      throw new UnrecognizedFrontendPacket((packet as any).code)
    }
    // put packet size in the allocated buffer above
    putInt32(size, this.pos - pos)
    return this
  }
}

type Param = Uint8Array | null

type Format = 0 | 1

export interface Bind {
  code: 'B'
  data: {
    portal: string
    stmt: string
    paramFormats: Format[]
    params: Param[]
    resultFormats: Format[]
  }
}

export interface Close {
  code: 'C'
  data: {
    kind: 'S' | 'P'
    name: string
  }
}

export interface CopyDone {
  code: 'c'
}

export interface Describe {
  code: 'D'
  data: {
    kind: 'S' | 'P'
    name: string
  }
}

export interface CopyData {
  code: 'd'
  data: Uint8Array
}

export interface Execute {
  code: 'E'
  data: {
    max: number
    name: string
  }
}

export interface CopyFail {
  code: 'f'
  data: string
}

export interface Flush {
  code: 'H'
}

export interface Parse {
  code: 'P'
  data: {
    query: string
    name: string
    formats: Format[]
  }
}

export interface Password {
  code: 'p'
  data: Uint8Array
}

export interface Query {
  code: 'Q'
  data: string
}

export interface Sync {
  code: 'S'
}

export interface Terminate {
  code: 'X'
}

export interface StartupRequest {
  code: 196608
  data: {
    user: string
    params: Record<string, string>
  }
}

export interface SSLRequest {
  code: 80877103
}

export interface CancelRequest {
  code: 80877102
  data: {
    process: number
    secret: number
  }
}

export interface Request {
  code: null
  data: StartupRequest | SSLRequest | CancelRequest
}

export type FrontendPacket =
  | Bind
  | Close
  | CopyDone
  | Describe
  | CopyData
  | Execute
  | CopyFail
  | Flush
  | Parse
  | Password
  | Query
  | Sync
  | Terminate
  | Request
