import type { Authentication, BackendPacket } from './decoder/packet-decoder.ts'

export class EncodeError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause })
    this.name = this.constructor.name
  }
}

export class UnrecognizedFrontendPacket extends EncodeError {
  readonly code: string

  constructor(code: string, cause?: string) {
    super(`unrecognized frontend packet: ${code}`, cause)
    this.code = code
  }
}

export class UnrecognizedRequestCode extends EncodeError {
  readonly code: number

  constructor(code: number, cause?: string) {
    super(`unrecognized request code: ${code}`, cause)
    this.code = code
  }
}

export class DecodeError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause })
    this.name = this.constructor.name
  }
}

export class UnrecognizedBackendPacket extends DecodeError {
  readonly code: string

  constructor(code: string, cause?: unknown) {
    super(`unrecognized backend packet: ${code}`, cause)
    this.code = code
  }
}

export class UnrecognizedAuth extends DecodeError {
  readonly code: number
  constructor(code: number, cause?: unknown) {
    super(`unrecognized auth response: ${code}`, { cause })
    this.code = code
  }
}

export class UnrecognizedFormatCode extends DecodeError {
  readonly code: number
  constructor(code: number, cause?: unknown) {
    super(`unrecognized format code: ${code}`, { cause })
    this.code = code
  }
}

export class UnrecognizedReadyState extends DecodeError {
  readonly code: string
  constructor(code: string, cause?: unknown) {
    super(`unrecognized ready state: ${code}`, { cause })
    this.code = code
  }
}

export class UnexpectedBackendPacket extends DecodeError {
  readonly packet: BackendPacket
  readonly expect: string[]
  constructor(packet: BackendPacket, expect: string[], cause?: unknown) {
    super(
      `unexpected backend packet: ${packet.code}. expected: ${expect.join(
        ', '
      )}`,
      cause
    )
    this.packet = packet
    this.expect = expect
  }
}

export class UnexpectedAuth extends DecodeError {
  readonly data: Authentication['data']
  readonly expect: number
  constructor(data: Authentication['data'], expect: number, cause?: unknown) {
    const code = data.code
    super(`unexpected auth response: ${code}. expected: ${expect}`, { cause })
    this.data = data
    this.expect = expect
  }
}

export class SASLError extends DecodeError {}

export class PostgresError extends Error {
  readonly code: string
  readonly message: string
  readonly severity: string
  readonly detail?: string
  readonly hint?: string
  readonly position?: string
  readonly internalPosition?: string
  readonly query?: string
  readonly where?: string
  readonly schema?: string
  readonly table?: string
  readonly column?: string
  readonly dataType?: string
  readonly constraint?: string
  readonly file?: string
  readonly line?: string
  readonly routine?: string

  constructor(packet: Record<string, string>) {
    super()
    this.code = packet.C
    this.message = packet.M
    this.severity = packet.V ?? packet.S
    this.detail = packet.D
    this.hint = packet.H
    this.internalPosition = packet.p
    this.query = packet.Q
    this.where = packet.W
    this.schema = packet.s
    this.table = packet.t
    this.column = packet.c
    this.dataType = packet.d
    this.constraint = packet.n
    this.file = packet.F
    this.line = packet.L
    this.routine = packet.R
  }
}

export class NoDataReceived extends Error {
  constructor(cause?: unknown) {
    super('no data received', { cause })
  }
}
