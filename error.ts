import { ErrorResponse } from './types.ts'

export class ProtocolError extends Error {
  constructor(message: string) {
    super(message)
    Object.setPrototypeOf(this, ProtocolError.prototype)
    this.name = 'ProtocolError'
  }
}

export class UnrecognizedResponseError extends ProtocolError {
  readonly received: string

  constructor(received: string) {
    super(`unrecognized server response: ${received}`)
    Object.setPrototypeOf(this, UnrecognizedResponseError.prototype)
    this.name = 'UnrecognizedResponseError'
    this.received = received
  }
}

export class ConnectionClosedError extends ProtocolError {
  constructor() {
    super('no data: connection closed')
    Object.setPrototypeOf(this, UnrecognizedResponseError.prototype)
    this.name = 'UnrecognizedResponseError'
  }
}

export class UnexpectedResponseError extends ProtocolError {
  readonly received: string | null
  readonly expected: string | null

  constructor(received: string | null, expected?: string) {
    const code = typeof received === 'string' ? received : 'null'
    const message =
      typeof expected === 'string'
        ? `unexpected server response: ${code}. expected: ${expected}`
        : `unexpected server response: ${code}`
    super(message)
    Object.setPrototypeOf(this, UnexpectedResponseError.prototype)
    this.name = 'UnexpectedResponseError'
    this.received = received
    this.expected = expected ?? null
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

  constructor(packet: ErrorResponse['data']) {
    super()
    Object.setPrototypeOf(this, PostgresError.prototype)
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
