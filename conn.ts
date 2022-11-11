import { ProtocolError, SASLError, UnexpectedResponseError } from './error.ts'
import { Protocol } from './protocol.ts'
import { AuthCode, Param } from './types.ts'
import { mustPacket, extract, extractAuth, must } from './internal.ts'
import { QueryResult } from './result.ts'

export interface Options {
  user: string
  host?: string
  port?: number
  database?: string
  password?: string
}

export class Conn {
  readonly #proto: Protocol

  static async connect(opts: Options) {
    const conn = new Conn(
      Protocol.fromConn(
        await Deno.connect({ port: opts.port ?? 5432, hostname: opts.host })
      )
    )

    const startup: Record<string, string> = {}
    if (opts.database) {
      startup.database = opts.database
    }
    await conn.#startup(opts.user, startup)
    return conn
  }

  constructor(proto: Protocol) {
    this.#proto = proto
  }

  async #sasl() {
    const clientNonce = 'nonce' // TODO: random nonce
    const message = `n,,n=*,r=${clientNonce}`
    await this.#proto.saslInit('SCRAM-SHA-256', message).send()
    const serverFirstMessage = await this.#proto
      .recv()
      .then(extract('R'))
      .then(extractAuth(AuthCode.SASLContinue))
    const attrs = new Map(
      serverFirstMessage
        .split(',')
        .map((item) => item.split('=', 2) as [string, string])
    )
    const serverNonce = must(
      attrs.get('r'),
      new SASLError('missing server nonce')
    )
    const salt = must(attrs.get('s'), new SASLError('missing server salt'))
    const iteration = must(
      attrs.get('i'),
      new SASLError('missing iteration count')
    )

    if (!serverNonce.startsWith(clientNonce)) {
      throw new SASLError('invalid server nonce')
    }

    if (serverNonce.length <= clientNonce.length) {
      throw new SASLError('invalid server nonce')
    }

    throw new Error('not implemented')
  }

  async #startup(user: string, opts: Record<string, string>) {
    await this.#proto.startup(user, opts).send()
    const auth = await this.#proto.recv().then(extract('R'))

    if (auth.code === 10) {
      await this.#sasl()
    }

    for await (const packet of this.#proto) {
      if (packet.code === 'K') {
        break
      }
      extract('S', packet)
    }

    await this.#proto.recv().then(extract('Z'))
  }

  async batch(query: string) {
    await this.#proto.query(query).send()

    for await (const packet of this.#proto) {
      if (packet.code === 'Z') {
        break
      }
    }
  }

  async query(
    query: string,
    params: Param[] = []
  ): Promise<QueryResult | null> {
    await this.#proto
      .parse(query)
      .bind(params, undefined, undefined, [0], [1])
      .describe('P')
      .execute()
      .close('P')
      .sync()
      .send()

    await this.#proto.recv().then(extract('1'))
    await this.#proto.recv().then(extract('2'))
    const packet = await this.#proto.recv().then(mustPacket)
    if (packet.code === 'n') {
      await this.#proto.recv().then(extract('C'))
      await this.#proto.recv().then(extract('3'))
      await this.#proto.recv().then(extract('Z'))
      return null
    }
    if (packet.code === 'T') {
      return new QueryResult(this.#proto, packet.data)
    }

    throw new UnexpectedResponseError(packet.code)
  }
}
