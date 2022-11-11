import {
  ConnectionClosedError,
  PostgresError,
  UnexpectedAuthError,
  UnexpectedResponseError,
} from './error.ts'
import {
  AuthCode,
  AuthData,
  ColumnDescription,
  ErrorResponse,
  Packet,
  ReadyState,
} from './types.ts'

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
    throw new UnexpectedResponseError(packet?.code ?? null, code)
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
    throw new UnexpectedAuthError(data.code, code)
  }
  return typeof data === 'undefined' ? assert : assert(data)
}

export async function pbkdf2(
  password: Uint8Array,
  salt: Uint8Array,
  iterations: number
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    password,
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  )

  const buff = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    32 * 8
  )

  return new Uint8Array(buff)
}

export async function hmac256(password: Uint8Array, message: Uint8Array) {
  const key = await crypto.subtle.importKey(
    'raw',
    password,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const buff = await crypto.subtle.sign('HMAC', key, message)
  return new Uint8Array(buff)
}

export function xorBuffer(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) {
    throw new TypeError('mismatch array length')
  }
  if (a.length === 0) {
    new TypeError('empty array')
  }

  const c = new Uint8Array(a.length)
  for (let i = 0; i < a.length; ++i) {
    c[i] = a[i] ^ b[i]
  }
  return c
}
