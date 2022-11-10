import {
  Reader,
  Writer,
  NodeBuffer,
  putVarnum,
  BufReader,
  BufWriter,
} from './deps.ts'
import { ProtocolError } from './error.ts'
import {
  AuthCode,
  ColumnDescription,
  Format,
  Packet,
  Param,
  ReadyState,
} from './types.ts'
import { Decoder } from './decoder.ts'
import { Encoder } from './encoder.ts'

export class Protocol implements AsyncIterableIterator<Packet> {
  #enc: Encoder
  #dec: Decoder
  #rd: BufReader
  #wd: BufWriter
  #closed: boolean

  constructor(reader: Reader, writer: Writer, size = 4096) {
    this.#enc = new Encoder(size)
    this.#dec = new Decoder(size)
    this.#rd = BufReader.create(reader, size)
    this.#wd = BufWriter.create(writer, size)
    this.#closed = false
  }

  #begin(code?: string) {
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

  // StartupMessage (F)
  startup(user: string, options: Record<string, string> = {}) {
    const end = this.#begin()
    Object.entries(options)
      .flat()
      .reduce(
        (enc, val) => enc.cstr(val),
        this.#enc.int32(196608).cstr('user').cstr(user)
      )
      .byte(0)
    return end()
  }

  // Sync (F)
  sync(): this {
    return this.#begin('S')()
  }

  // Terminate (F)
  terminate(): this {
    return this.#begin('X')()
  }

  // Parse (F)
  parse(query: string, name = ''): this {
    const end = this.#begin('P')
    this.#enc.cstr(name).cstr(query).int16(0)
    return end()
  }

  // Bind (F)
  bind(
    params: Param[] = [],
    portal = '',
    stmt = '',
    paramFormat: Format[] = [],
    resultFormat: Format[] = []
  ): this {
    const end = this.#begin('B')

    this.#enc.cstr(portal).cstr(stmt)

    paramFormat.reduce(
      (enc, fmt) => enc.int16(fmt),
      this.#enc.int16(paramFormat.length)
    )

    this.#enc.int16(params.length)
    for (const param of params) {
      if (param === null) {
        this.#enc.int32(-1)
      } else {
        const value = param.toString()
        this.#enc.int32(NodeBuffer.byteLength(value))
        this.#enc.str(value)
      }
    }

    resultFormat.reduce(
      (enc, fmt) => enc.int16(fmt),
      this.#enc.int16(resultFormat.length)
    )

    return end()
  }

  // Describe (F)
  describe(kind: 'S' | 'P', name = ''): this {
    const end = this.#begin('D')
    this.#enc.byte(kind.charCodeAt(0)).cstr(name)
    return end()
  }

  // Execute (F)
  execute(name = '', max = 0): this {
    const end = this.#begin('E')
    this.#enc.cstr(name).int32(max)
    return end()
  }

  // Close (F)
  close(kind: 'S' | 'P', name = ''): this {
    const end = this.#begin('C')
    this.#enc.byte(kind.charCodeAt(0)).cstr(name)
    return end()
  }

  // Query (F)
  query(query: string): this {
    const end = this.#begin('Q')
    this.#enc.cstr(query)
    return end()
  }

  async send() {
    await this.#wd.write(this.#enc.buff)
    this.#enc.reset()
    await this.#wd.flush()
  }

  async recv(): Promise<Packet | null> {
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
      return { code: '1' as const }
    }
    if (code === '2') {
      return { code: '2' as const }
    }
    if (code === '3') {
      return { code: '3' as const }
    }
    if (code === 'C') {
      return { code: 'C' as const, data: commandComplete(this.#dec) }
    }
    if (code === 'D') {
      return { code: 'D' as const, data: dataRow(this.#dec) }
    }
    if (code === 'E') {
      return { code: 'E' as const, data: errorResponse(this.#dec) }
    }
    if (code === 'K') {
      return { code: 'K' as const, data: backendKeyData(this.#dec) }
    }
    if (code === 'n') {
      return { code: 'n' as const }
    }
    if (code === 'R') {
      return { code: 'R' as const, data: authentication(this.#dec) }
    }
    if (code === 'S') {
      return { code: 'S' as const, data: parameterStatus(this.#dec) }
    }
    if (code === 'T') {
      return { code: 'T' as const, data: rowDescription(this.#dec) }
    }
    if (code === 't') {
      return { code: 't' as const, data: parameterDescription(this.#dec) }
    }
    if (code === 'Z') {
      return { code: 'Z' as const, data: readyForQuery(this.#dec) }
    }
    throw new ProtocolError(`unrecognized server response: ${code}`)
  }

  [Symbol.asyncIterator](): this {
    return this
  }

  async next(): Promise<IteratorResult<Packet, null>> {
    const value = await this.recv()
    return value ? { done: false, value } : { done: true, value }
  }
}

// CommandComplete (B)
function commandComplete(dec: Decoder): string {
  return dec.cstr()
}

// DataRow (B)
function dataRow(dec: Decoder): Array<Uint8Array | null> {
  const n = dec.int16()
  const columns = []
  for (let i = 0; i < n; ++i) {
    const len = dec.int32()
    if (len === -1) {
      columns.push(null)
    } else {
      columns.push(dec.bytes(len))
    }
  }
  return columns
}

// ErrorResponse (B)
function errorResponse(dec: Decoder): Record<string, string> {
  const record: Record<string, string> = {}
  for (;;) {
    const key = dec.byte()
    if (key === 0) {
      return record
    }
    const val = dec.cstr()
    record[String.fromCharCode(key)] = val
  }
}

// BackendKeyData (B)
function backendKeyData(dec: Decoder): [number, number] {
  return [dec.int32(), dec.int32()]
}

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
function authentication(dec: Decoder): AuthCode {
  const code = dec.int32()
  if (code === 0) return code
  throw new ProtocolError(`unrecognized authentication response: ${code}`)
}

// ParameterStatus (B)
function parameterStatus(dec: Decoder): [string, string] {
  return [dec.cstr(), dec.cstr()]
}

// RowDescription (B)
function rowDescription(dec: Decoder): ColumnDescription[] {
  const n = dec.int16()

  const columns: ColumnDescription[] = []
  for (let i = 0; i < n; ++i) {
    const name = dec.cstr()
    const columnOid = dec.int32()
    const attNum = dec.int16()
    const oid = dec.int32()
    const typelen = dec.int16()
    const typemod = dec.int32()
    const format = dec.int16() as 0 | 1
    if (format !== 0 && format !== 1) {
      throw new ProtocolError(`invalid format code: ${format}`)
    }
    columns.push({
      name,
      table: columnOid === 0 ? null : columnOid,
      attNum: attNum === 0 ? null : attNum,
      oid,
      typelen,
      typemod,
      format,
    })
  }
  return columns
}

// ParameterDescription (B)
function parameterDescription(dec: Decoder): number[] {
  const n = dec.int16()

  const oids = []
  for (let i = 0; i < n; ++i) {
    oids.push(dec.int32())
  }
  return oids
}

// ReadyForQuery (B)
function readyForQuery(dec: Decoder): ReadyState {
  const code = String.fromCharCode(dec.byte())
  if (code === 'I') return ReadyState.Idle
  if (code === 'T') return ReadyState.Transaction
  if (code === 'E') return ReadyState.Error
  throw new ProtocolError(`unrecognized ready state: ${code}`)
}

// CopyBothResponse (B)
// CopyInResponse (B)
// CopyOutResponse (B)
// EmptyQueryResponse (B)
// FunctionCallResponse (B)
// NegotiateProtocolVersion (B)
// NoticeResponse (B)
// NotificationResponse (B)
// PortalSuspended (B)
// CancelRequest (F)
// CopyFail (F)
// Flush (F)
// FunctionCall (F)
// GSSENCRequest (F)
// GSSResponse (F)
// PasswordMessage (F)
// SASLInitialResponse (F)
// SASLResponse (F)
// SSLRequest (F)
// CopyData (F & B)
// CopyDone (F & B)
