import { UnexpectedAuthCodeError } from '../errors.ts'
import { Protocol } from '../protocol/mod.ts'
import { AuthCode, Param } from '../types.ts'
import { extract } from '../internal/assert.ts'
import { sasl } from '../internal/sasl-scram-sha-256.ts'
import { Task } from './task.ts'

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
  readonly #queue: Promise<void>[]

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
    this.#queue = []
  }

  async #startup(opts: Options) {
    await this.#proto.startup(opts.user, opts.params).send()
    const auth = await this.#proto.recv().then(extract('R'))

    if (auth.code === 10) {
      await sasl(this.#proto, opts.password ?? '')
    } else if (auth.code === 0) {
      /* empty */
    } else {
      throw new UnexpectedAuthCodeError(auth.code, AuthCode.Ok)
    }

    for await (const packet of this.#proto) {
      if (packet.code === 'K') {
        break
      }
      extract('S', packet)
    }

    await this.#proto.recv().then(extract('Z'))
  }

  query(query: string, params: Param[] = []) {
    const entry = this.#queue.shift() ?? Promise.resolve()
    const task = new Task(this.#proto, query, params, entry)
    this.#queue.push(new Promise(task.listen.bind(task)))
    return task
  }
}
