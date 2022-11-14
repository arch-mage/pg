import { base64 } from '../deps.ts'
import { UnexpectedAuthCodeError } from '../errors.ts'
import { ReadWriteProtocol } from '../protocol/mod.ts'
import { Protocol, NotificationListener, Param } from '../types.ts'
import { extract, mustPacket } from '../internal/assert.ts'
import { sasl } from '../internal/sasl-scram-sha-256.ts'
import { Task } from './task.ts'
import { FilteredProtocol } from './filtered-proto.ts'

export interface Options {
  user: string
  database?: string
  password?: string
  nonce?: string // for testing
  params?: Record<string, string>
}

export interface ConnectOptions extends Options {
  host?: string
  port?: number
  ssl?: boolean
}

export class Conn {
  readonly #proto: FilteredProtocol
  readonly #queue: Promise<void>[]

  static fromConn(
    conn: Deno.Reader & Deno.Writer,
    opts: Options
  ): Promise<Conn> {
    return Conn.fromProto(ReadWriteProtocol.fromConn(conn), opts)
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
    this.#proto = new FilteredProtocol(proto)
    this.#queue = []
  }

  async #startup(opts: Options) {
    await this.#proto.send({
      code: null,
      data: {
        user: opts.user,
        ...filterUndefined({ database: opts.database, ...opts.params }),
      },
    })
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
      throw new UnexpectedAuthCodeError(auth.code, 0)
    }

    for (;;) {
      const packet = await this.#proto.recv().then(mustPacket)
      if (packet.code === 'K') {
        break
      }
      extract('S', packet)
    }

    await this.#proto.recv().then(extract('Z'))
  }

  listen(listener: NotificationListener): () => void {
    return this.#proto.onNotification(listener)
  }

  query(query: string, params: Param[] = []): Task {
    if (
      params.some((param) => param !== null && !(param instanceof Uint8Array))
    ) {
      throw TypeError(`invalid parameter type`)
    }
    const entry = this.#queue.shift() ?? Promise.resolve()
    const task = new Task(this.#proto, query, params, entry)
    this.#queue.push(new Promise(task.onClose.bind(task)))
    return task
  }
}

function filterUndefined(
  record: Record<string, string | null | undefined>
): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, val] of Object.entries(record)) {
    if (typeof val === 'string') {
      result[key] = val
    }
  }
  return result
}
