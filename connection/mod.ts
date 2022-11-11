import { UnexpectedAuthError, UnexpectedResponseError } from '../errors.ts'
import { Protocol } from '../protocol/mod.ts'
import { Param } from '../types.ts'
import { mustPacket, extract } from '../internal/assert.ts'
import { QueryResult } from './result.ts'
import { sasl } from '../internal/sasl-scram-sha-256.ts'

export interface Options {
  user: string
  host?: string
  port?: number
  database?: string
  password?: string
  params?: Record<string, string>
}

export class Conn {
  readonly #proto: Protocol

  static async connect(opts: Options) {
    const conn = new Conn(
      Protocol.fromConn(
        await Deno.connect({ port: opts.port ?? 5432, hostname: opts.host })
      )
    )

    if (opts.database) {
      opts = { ...opts, params: { ...opts.params, database: opts.database } }
    }
    await conn.#startup(opts)
    return conn
  }

  constructor(proto: Protocol) {
    this.#proto = proto
  }

  async #startup(opts: Options) {
    await this.#proto.startup(opts.user, opts.params).send()
    const auth = await this.#proto.recv().then(extract('R'))

    if (auth.code === 10) {
      await sasl(this.#proto, opts.password ?? '')
    } else if (auth.code === 0) {
      /* empty */
    } else {
      throw new UnexpectedAuthError(auth.code, 0)
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
