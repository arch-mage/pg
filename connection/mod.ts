import { base64, Reader, Writer } from '../deps.ts'
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
  nonce?: string // for testing
  params?: Record<string, string>
}

export class Conn {
  readonly #proto: Protocol
  readonly #queue: Promise<void>[]

  static async connect(opts: Options): Promise<Conn> {
    const conn = await Deno.connect({
      port: opts.port ?? 5432,
      hostname: opts.host,
    })
    return Conn.fromConn(conn, opts)
  }

  static fromConn(conn: Reader & Writer, opts: Options): Promise<Conn> {
    return Conn.fromProto(Protocol.fromConn(conn), opts)
  }

  static async fromProto(proto: Protocol, opts: Options): Promise<Conn> {
    const cn = new Conn(proto)
    if (opts.database) {
      opts = { ...opts, params: { ...opts.params, database: opts.database } }
    }
    await cn.#startup(opts)
    return cn
  }

  constructor(proto: Protocol) {
    this.#proto = proto
    this.#queue = []
  }

  async #startup(opts: Options) {
    await this.#proto.startup(opts.user, opts.params).send()
    const auth = await this.#proto.recv().then(extract('R'))

    if (auth.code === 10) {
      await sasl(
        this.#proto,
        opts.password ?? '',
        opts?.nonce ?? base64.encode(crypto.getRandomValues(new Uint8Array(18)))
      )
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
