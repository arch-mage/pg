import { varnum } from 'https://deno.land/std@0.163.0/encoding/binary.ts'
import {
  AuthCode,
  ColumnDescription,
  Reader,
  ReadyState,
  Packet,
} from './types.ts'

export class Decoder {
  #pos: number
  #buff: Uint8Array
  readonly #decoder: TextDecoder

  public constructor(buff: Uint8Array) {
    this.#pos = 0
    this.#buff = buff
    this.#decoder = new TextDecoder()
  }

  public int16() {
    const num = varnum(this.#buff.subarray(this.#pos, this.#pos + 2), {
      dataType: 'int16',
      endian: 'big',
    })
    this.#pos += 2
    if (typeof num === 'number') {
      return num
    }
    throw new TypeError('not int16')
  }

  public int32() {
    const num = varnum(this.#buff.subarray(this.#pos, this.#pos + 4), {
      dataType: 'int32',
      endian: 'big',
    })
    this.#pos += 4
    if (typeof num === 'number') {
      return num
    }
    throw new TypeError('not int32')
  }

  public bytes(size: number) {
    const buff = this.#buff.slice(this.#pos, this.#pos + size)
    if (buff.length !== size) {
      throw new TypeError(`not a buff with length of ${size}`)
    }
    this.#pos += buff.length
    return buff
  }

  public byte() {
    return this.#buff[this.#pos++]
  }

  public cstr() {
    const idx = this.#buff.subarray(this.#pos).indexOf(0)
    if (idx === -1) {
      throw new TypeError('not cstr')
    }
    const str = this.#decoder.decode(
      this.#buff.subarray(this.#pos, this.#pos + idx)
    )
    this.#pos += idx + 1
    return str
  }
}

function readyForQuery(buff: Uint8Array): ReadyState {
  const code = String.fromCharCode(buff[0])
  if (code === 'I') return ReadyState.Idle
  if (code === 'T') return ReadyState.Transaction
  if (code === 'E') return ReadyState.Error
  throw new TypeError(`unrecognized ready state: ${code}`)
}

function backendKeyData(buff: Uint8Array): [number, number] {
  const decoder = new Decoder(buff)
  return [decoder.int32(), decoder.int32()]
}

function parameterStatus(buff: Uint8Array): [string, string] {
  const decoder = new Decoder(buff)
  return [decoder.cstr(), decoder.cstr()]
}

function authentication(buff: Uint8Array): AuthCode {
  const decoder = new Decoder(buff)
  const code = decoder.int32()
  if (code === 0) return code
  throw new TypeError(`unrecognized authentication response: ${code}`)
}

function errorResponse(buff: Uint8Array): Record<string, string> {
  const decoder = new Decoder(buff)
  const record: Record<string, string> = {}
  for (;;) {
    const key = decoder.byte()
    if (key === 0) {
      return record
    }
    const val = decoder.cstr()
    record[String.fromCharCode(key)] = val
  }
}

function parameterDescription(buff: Uint8Array): number[] {
  const decoder = new Decoder(buff)
  const n = decoder.int16()

  const oids = []
  for (let i = 0; i < n; ++i) {
    oids.push(decoder.int32())
  }
  return oids
}

function rowDescription(buff: Uint8Array): ColumnDescription[] {
  const decoder = new Decoder(buff)
  const n = decoder.int16()

  const columns: ColumnDescription[] = []
  for (let i = 0; i < n; ++i) {
    const name = decoder.cstr()
    const columnOid = decoder.int32()
    const attNum = decoder.int16()
    const oid = decoder.int32()
    const typelen = decoder.int16()
    const typemod = decoder.int32()
    const format = decoder.int16() as 0 | 1
    if (format !== 0 && format !== 1) {
      throw new TypeError(`invalid format code: ${format}`)
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

function dataRow(buff: Uint8Array): Array<Uint8Array | null> {
  const decoder = new Decoder(buff)
  const n = decoder.int16()
  const columns = []
  for (let i = 0; i < n; ++i) {
    const len = decoder.int32()
    if (len === -1) {
      columns.push(null)
    } else {
      columns.push(decoder.bytes(len))
    }
  }
  return columns
}

function commandComplete(buff: Uint8Array): string {
  const decoder = new Decoder(buff)
  return decoder.cstr()
}

export async function decode(reader: Reader): Promise<Packet | null> {
  const head = new Uint8Array(5)
  if (!(await reader.readFull(head))) {
    return null
  }
  const code = String.fromCharCode(head[0])
  const size = varnum(head.subarray(1, 5), {
    endian: 'big',
    dataType: 'int32',
  }) as number
  const data = new Uint8Array(size - 4)

  if (!(await reader.readFull(data))) {
    throw new Error('insufficient data to read')
  }

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
    return { code: 'C' as const, data: commandComplete(data) }
  }
  if (code === 'D') {
    return { code: 'D' as const, data: dataRow(data) }
  }
  if (code === 'E') {
    return { code: 'E' as const, data: errorResponse(data) }
  }
  if (code === 'K') {
    return { code: 'K' as const, data: backendKeyData(data) }
  }
  if (code === 'n') {
    return { code: 'n' as const }
  }
  if (code === 'R') {
    return { code: 'R' as const, data: authentication(data) }
  }
  if (code === 'S') {
    return { code: 'S' as const, data: parameterStatus(data) }
  }
  if (code === 'T') {
    return { code: 'T' as const, data: rowDescription(data) }
  }
  if (code === 't') {
    return { code: 't' as const, data: parameterDescription(data) }
  }
  if (code === 'Z') {
    return { code: 'Z' as const, data: readyForQuery(data) }
  }

  throw new TypeError(`unrecognized server response: ${code}`)
}

export function expect(code: '1'): (packet: Packet | null) => void
export function expect(code: '2'): (packet: Packet | null) => void
export function expect(code: '3'): (packet: Packet | null) => void
export function expect(code: 'C'): (packet: Packet | null) => string
export function expect(
  code: 'D'
): (packet: Packet | null) => Array<Uint8Array | null>
export function expect(
  code: 'E'
): (packet: Packet | null) => Record<string, string>
export function expect(code: 'K'): (packet: Packet | null) => [number, number]
export function expect(code: 'n'): (packet: Packet | null) => void
export function expect(code: 'R'): (packet: Packet | null) => AuthCode
export function expect(code: 'S'): (packet: Packet | null) => [string, string]
export function expect(
  code: 'T'
): (packet: Packet | null) => ColumnDescription[]
export function expect(code: 't'): (packet: Packet | null) => number[]
export function expect(code: 'Z'): (packet: Packet | null) => ReadyState
export function expect(code: string): (packet: Packet | null) => unknown {
  return (packet) => {
    if (packet === null) {
      throw new TypeError(`unexpected eof`)
    }
    if (packet.code !== code) {
      throw new TypeError(
        `unexpected server response: ${packet.code}, expected: ${code}`
      )
    }
    // deno-lint-ignore no-explicit-any
    return (packet as any).data
  }
}
