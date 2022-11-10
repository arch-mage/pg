import {
  Reader,
  Writer,
  NodeBuffer,
  concat,
  putVarnum,
  varnum,
  BufReader,
  BufWriter,
} from './deps.ts'
import { ProtocolError } from './error.ts'
import {
  AuthCode,
  ColumnDescription,
  Format,
  FullReader,
  Packet,
  Param,
  ReadyState,
} from './types.ts'

const SIZES = {
  int8: 1,
  int16: 2,
  int32: 4,
  uint8: 1,
  uint16: 2,
  uint32: 4,
}

class Encoder {
  #pos: number
  #enc: TextEncoder
  #buf: Uint8Array

  constructor(size: number = 4096) {
    this.#pos = 0
    this.#buf = new Uint8Array(size)
    this.#enc = new TextEncoder()
  }

  #ensure(size: number) {
    if (this.#buf.length - this.#pos >= size) {
      return this
    }
    const grow = Math.max(size, Math.floor(this.#buf.length / 2))
    this.#buf = concat(this.#buf, new Uint8Array(grow))
    return this
  }

  #putVarNum(
    dataType: 'int8' | 'int16' | 'int32' | 'uint8' | 'uint16' | 'uint32',
    num: number
  ): this {
    this.#ensure(SIZES[dataType])
    const array = this.#buf.subarray(this.#pos, this.#pos + SIZES[dataType])
    putVarnum(array, num, { endian: 'big', dataType })
    this.#pos += SIZES[dataType]
    return this
  }

  reset(): this {
    this.#pos = 0
    return this
  }

  alloc(size: number): Uint8Array {
    const pos = this.#pos
    this.#ensure(size)
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
    this.#ensure(1)
    putVarnum(this.#buf.subarray(this.#pos, this.#pos + 1), num, {
      endian: 'big',
      dataType: 'uint8',
    })
    this.#pos += 1
    return this
  }

  str(ch: string): this {
    const len = NodeBuffer.byteLength(ch)
    this.#ensure(len)
    this.#enc.encodeInto(ch, this.#buf.subarray(this.#pos, this.#pos + len))
    this.#pos += len
    return this
  }

  cstr(ch: string): this {
    const len = NodeBuffer.byteLength(ch)
    this.#ensure(len + 1)
    this.#enc.encodeInto(ch, this.#buf.subarray(this.#pos, this.#pos + len))
    this.#pos += len
    this.#buf[this.#pos] = 0
    this.#pos += 1
    return this
  }
}

class Decoder {
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

export class Protocol {
  #enc: Encoder
  #dec: Decoder
  #rd: BufReader
  #wd: BufWriter

  constructor(reader: Reader, writer: Writer, size = 4096) {
    this.#enc = new Encoder(size)
    this.#dec = new Decoder(size)
    this.#rd = BufReader.create(reader, size)
    this.#wd = BufWriter.create(writer, size)
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

  sync(): this {
    return this.#begin('S')()
  }

  terminate(): this {
    return this.#begin('X')()
  }

  parse(query: string, name = ''): this {
    const end = this.#begin('P')
    this.#enc.cstr(name).cstr(query).int16(0)
    return end()
  }

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

  describe(kind: 'S' | 'P', name = ''): this {
    const end = this.#begin('D')
    this.#enc.byte(kind.charCodeAt(0)).cstr(name)
    return end()
  }

  execute(name = '', max = 0): this {
    const end = this.#begin('E')
    this.#enc.cstr(name).int32(max)
    return end()
  }

  close(kind: 'S' | 'P', name = ''): this {
    const end = this.#begin('C')
    this.#enc.byte(kind.charCodeAt(0)).cstr(name)
    return end()
  }

  query(query: string): this {
    const end = this.#begin('Q')
    this.#enc.cstr(query)
    return end()
  }

  async flush() {
    await this.#wd.write(this.#enc.buff)
    this.#enc.reset()
    await this.#wd.flush()
  }

  async recv(): Promise<Packet | null> {
    const raw = await this.#dec.readPacket(this.#rd)
    if (!raw) {
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
}

function commandComplete(dec: Decoder): string {
  return dec.cstr()
}

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

function backendKeyData(dec: Decoder): [number, number] {
  return [dec.int32(), dec.int32()]
}

function authentication(dec: Decoder): AuthCode {
  const code = dec.int32()
  if (code === 0) return code
  throw new ProtocolError(`unrecognized authentication response: ${code}`)
}

function parameterStatus(dec: Decoder): [string, string] {
  return [dec.cstr(), dec.cstr()]
}

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

function parameterDescription(dec: Decoder): number[] {
  const n = dec.int16()

  const oids = []
  for (let i = 0; i < n; ++i) {
    oids.push(dec.int32())
  }
  return oids
}

function readyForQuery(dec: Decoder): ReadyState {
  const code = String.fromCharCode(dec.byte())
  if (code === 'I') return ReadyState.Idle
  if (code === 'T') return ReadyState.Transaction
  if (code === 'E') return ReadyState.Error
  throw new ProtocolError(`unrecognized ready state: ${code}`)
}
