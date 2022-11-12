import {
  ConnectionClosedError,
  PostgresError,
  UnexpectedAuthCodeError,
  UnexpectedResponseCodeError,
} from '../errors.ts'
import {
  AuthCode,
  AuthData,
  ColumnDescription,
  ErrorResponse,
  Packet,
  ReadyState,
} from '../types.ts'

export function mustPacket(packet: Packet | null): Packet {
  if (packet) {
    return packet
  }
  throw new ConnectionClosedError()
}

export function must<T>(value: T | null | undefined, err: Error): T {
  if (value === null) {
    throw err
  }
  if (typeof value === 'undefined') {
    throw err
  }
  return value
}

export function extract(code: '1', packet: Packet | null): null
export function extract(code: '1'): (packet: Packet | null) => null

export function extract(code: '2', packet: Packet | null): null
export function extract(code: '2'): (packet: Packet | null) => null

export function extract(code: '3', packet: Packet | null): null
export function extract(code: '3'): (packet: Packet | null) => null

export function extract(code: 'C', packet: Packet | null): string
export function extract(code: 'C'): (packet: Packet | null) => string

export function extract(
  code: 'D',
  packet: Packet | null
): Array<Uint8Array | null>
export function extract(
  code: 'D'
): (packet: Packet | null) => Array<Uint8Array | null>

export function extract(code: 'E', packet: Packet | null): ErrorResponse
export function extract(code: 'E'): (packet: Packet | null) => ErrorResponse

export function extract(code: 'K', packet: Packet | null): [number, number]
export function extract(code: 'K'): (packet: Packet | null) => [number, number]

export function extract(code: 'n', packet: Packet | null): null
export function extract(code: 'n'): (packet: Packet | null) => null

export function extract(code: 'R', packet: Packet | null): AuthData
export function extract(code: 'R'): (packet: Packet | null) => AuthData

export function extract(code: 'S', packet: Packet | null): [string, string]
export function extract(code: 'S'): (packet: Packet | null) => [string, string]

export function extract(code: 's', packet: Packet | null): null
export function extract(code: 's'): (packet: Packet | null) => null

export function extract(code: 'T', packet: Packet | null): ColumnDescription[]
export function extract(
  code: 'T'
): (packet: Packet | null) => ColumnDescription[]

export function extract(code: 't', packet: Packet | null): number[]
export function extract(code: 't'): (packet: Packet | null) => number[]

export function extract(code: 'Z', packet: Packet | null): ReadyState
export function extract(code: 'Z'): (packet: Packet | null) => ReadyState

export function extract(code: string, packet?: Packet | null): unknown {
  function assert(packet: Packet | null) {
    if (!packet) {
      throw new ConnectionClosedError()
    }
    if (packet.code === 'E') {
      if (code === 'E') {
        return packet.data
      }
      throw new PostgresError(packet.data)
    }

    if (packet.code === code) {
      return packet.data
    }
    throw new UnexpectedResponseCodeError(packet.code, code)
  }
  return typeof packet !== 'undefined' ? assert(packet) : assert
}

export function extractAuth(code: AuthCode.Ok, data: AuthData): null
export function extractAuth(code: AuthCode.Ok): (data: AuthData) => null
export function extractAuth(code: AuthCode.SASL, data: AuthData): string[]
export function extractAuth(code: AuthCode.SASL): (data: AuthData) => string[]
export function extractAuth(code: AuthCode.SASLContinue, data: AuthData): string
export function extractAuth(
  code: AuthCode.SASLContinue
): (data: AuthData) => string
export function extractAuth(code: AuthCode.SASLFinal, data: AuthData): string
export function extractAuth(
  code: AuthCode.SASLFinal
): (data: AuthData) => string
export function extractAuth(code: AuthCode, data?: AuthData): unknown {
  function assert(data: AuthData) {
    if (data.code === code) {
      return data.data
    }
    throw new UnexpectedAuthCodeError(data.code, code)
  }
  return typeof data === 'undefined' ? assert : assert(data)
}
