import { AuthCode, ErrorField } from './types.ts'

export class ProtocolError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause })
    this.name = this.constructor.name
  }
}

export class EncodeError extends ProtocolError {
  constructor(message: string, cause?: unknown) {
    super(message, cause)
  }
}

export class DecodeError extends ProtocolError {
  constructor(message: string, cause?: unknown) {
    super(message, cause)
  }
}

export class UnrecognizedFormatCodeError extends DecodeError {
  readonly format: number

  constructor(format: number) {
    super(`unrecognized format code: ${format}`)
    this.format = format
  }
}

export class UnrecognizedReadyStateError extends DecodeError {
  readonly readyState: string

  constructor(readyState: string) {
    super(`unrecognized ready state: ${readyState}`)
    this.readyState = readyState
  }
}

export class UnrecognizedResponseError extends DecodeError {
  readonly received: string

  constructor(received: string) {
    super(`unrecognized server response: ${received}`)
    this.received = received
  }
}

export class UnexpectedResponseCodeError extends DecodeError {
  readonly received: string
  readonly expected?: string

  constructor(received: string, expected?: string) {
    const message =
      typeof expected === 'string'
        ? `unexpected server response: ${received}. expected: ${expected}`
        : `unexpected server response: ${received}`
    super(message)
    this.name = 'UnexpectedResponseError'
    this.received = received
    if (typeof expected === 'string') {
      this.expected = expected
    }
  }
}

export class UnexpectedAuthCodeError extends DecodeError {
  readonly received: AuthCode
  readonly expected?: AuthCode

  constructor(received: AuthCode, expected?: AuthCode) {
    const message =
      typeof expected === 'string'
        ? `unexpected auth response: ${received}. expected: ${expected}`
        : `unexpected auth response: ${received}`
    super(message)
    this.name = 'UnexpectedAuthError'
    this.received = received
    this.expected = expected
  }
}

export class SASLError extends ProtocolError {
  constructor(message: string) {
    super(message)
  }
}

export class ConnectionClosedError extends ProtocolError {
  constructor() {
    super('no data: connection closed')
    this.name = 'UnrecognizedResponseError'
  }
}

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

  constructor(packet: ErrorField) {
    super()
    this.name = 'PostgresError'
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
