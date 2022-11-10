export class ProtocolError extends Error {
  constructor(message: string) {
    super(message)
    Object.setPrototypeOf(this, ProtocolError.prototype)
    this.name = 'ProtocolError'
  }
}
