import {
  ConnectionClosedError,
  PostgresError,
  UnexpectedAuthCodeError,
  UnexpectedResponseError,
} from '../errors.ts'
import {
  AuthCode,
  AuthData,
  ColumnDescription,
  ErrorResponse,
  BackendPacket,
  ReadyState,
} from '../types.ts'

export function mustPacket(packet: BackendPacket | null): BackendPacket {
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

export function extract(code: '1', packet: BackendPacket | null): null
export function extract(code: '1'): (packet: BackendPacket | null) => null

export function extract(code: '2', packet: BackendPacket | null): null
export function extract(code: '2'): (packet: BackendPacket | null) => null

export function extract(code: '3', packet: BackendPacket | null): null
export function extract(code: '3'): (packet: BackendPacket | null) => null

export function extract(code: 'C', packet: BackendPacket | null): string
export function extract(code: 'C'): (packet: BackendPacket | null) => string

export function extract(
  code: 'D',
  packet: BackendPacket | null
): Array<Uint8Array | null>
export function extract(
  code: 'D'
): (packet: BackendPacket | null) => Array<Uint8Array | null>

export function extract(code: 'E', packet: BackendPacket | null): ErrorResponse
export function extract(
  code: 'E'
): (packet: BackendPacket | null) => ErrorResponse

export function extract(
  code: 'K',
  packet: BackendPacket | null
): [number, number]
export function extract(
  code: 'K'
): (packet: BackendPacket | null) => [number, number]

export function extract(code: 'n', packet: BackendPacket | null): null
export function extract(code: 'n'): (packet: BackendPacket | null) => null

export function extract(code: 'R', packet: BackendPacket | null): AuthData
export function extract(code: 'R'): (packet: BackendPacket | null) => AuthData

export function extract(
  code: 'S',
  packet: BackendPacket | null
): [string, string]
export function extract(
  code: 'S'
): (packet: BackendPacket | null) => [string, string]

export function extract(code: 's', packet: BackendPacket | null): null
export function extract(code: 's'): (packet: BackendPacket | null) => null

export function extract(
  code: 'T',
  packet: BackendPacket | null
): ColumnDescription[]
export function extract(
  code: 'T'
): (packet: BackendPacket | null) => ColumnDescription[]

export function extract(code: 't', packet: BackendPacket | null): number[]
export function extract(code: 't'): (packet: BackendPacket | null) => number[]

export function extract(code: 'Z', packet: BackendPacket | null): ReadyState
export function extract(code: 'Z'): (packet: BackendPacket | null) => ReadyState

export function extract(
  code: BackendPacket['code'],
  packet?: BackendPacket | null
): unknown {
  function assert(packet: BackendPacket | null) {
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
    throw new UnexpectedResponseError(packet, code)
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
