import { UnexpectedResponseError } from './error.ts'
import { Protocol } from './protocol.ts'
import { Param } from './types.ts'
import { must, extract } from './internal.ts'
import { QueryResult } from './result.ts'

export interface Options {
  user: string
  host?: string
  port?: number
  database?: string
}

export class Conn {
  readonly #proto: Protocol

  static async connect(opts: Options) {
    const conn = await Deno.connect({
      port: opts.port ?? 5432,
      hostname: opts.host,
    })

    const proto = new Protocol(conn, conn)

    const startup: Record<string, string> = {}
    if (opts.database) {
      startup.database = opts.database
    }
    await proto.startup(opts.user, startup).send()
    await proto.recv().then(extract('R'))

    for await (const packet of proto) {
      if (packet.code === 'K') {
        break
      }
      extract('S', packet)
    }

    await proto.recv().then(extract('Z'))

    return new Conn(proto)
  }

  constructor(proto: Protocol) {
    this.#proto = proto
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
      .bind(params, undefined, undefined, [1], [1])
      .describe('P')
      .execute()
      .close('P')
      .sync()
      .send()

    await this.#proto.recv().then(extract('1'))
    await this.#proto.recv().then(extract('2'))
    const packet = await this.#proto.recv().then(must)
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
