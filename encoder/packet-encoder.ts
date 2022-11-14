import { UnrecognizedFrontendPacket } from '../errors.ts'
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
      // StartupMessage (F)
      this.int32(196608)
      this.cstr('user')
      this.cstr(packet.data.user)
      for (const [key, val] of Object.entries(packet.data.params)) {
        this.cstr(key).cstr(val)
      }
      this.uint8(0)
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
    } else if (packet.code === 'D') {
      // Describe (F)
      this.char(packet.data.kind)
      this.cstr(packet.data.name)
    } else if (packet.code === 'E') {
      // Execute (F)
      this.cstr(packet.data.name)
      this.int32(packet.data.max)
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
      // CancelRequest (F)
      // CopyFail (F)
      // Flush (F)
      // FunctionCall (F)
      // GSSENCRequest (F)
      // GSSResponse (F)
      // SSLRequest (F)
      // CopyData (F & B)
      // CopyDone (F & B)

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

export interface Describe {
  code: 'D'
  data: {
    kind: 'S' | 'P'
    name: string
  }
}

export interface Execute {
  code: 'E'
  data: {
    max: number
    name: string
  }
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

export interface Startup {
  code: null
  data: {
    user: string
    params: Record<string, string>
  }
}

export interface Sync {
  code: 'S'
}

export interface Terminate {
  code: 'X'
}

export type FrontendPacket =
  | Bind
  | Close
  | Describe
  | Execute
  | Parse
  | Password
  | Query
  | Startup
  | Sync
  | Terminate
