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
