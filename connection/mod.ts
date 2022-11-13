import { base64, Reader, Writer } from '../deps.ts'
import { UnexpectedAuthCodeError } from '../errors.ts'
import { Protocol } from '../protocol/mod.ts'
import { AuthCode, IProtocol, NotificationListener, Param } from '../types.ts'
import { extract } from '../internal/assert.ts'
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

  static async connect({
    host,
    port,
    ssl,
    ...opts
  }: ConnectOptions): Promise<Conn> {
    port = port ?? 5432
    host = host ?? 'localhost'
    const conn = await Deno.connect({
      port: port ?? 5432,
      hostname: host,
    })

    if (!ssl) {
      return Conn.fromConn(conn, opts)
    }

    await conn.write(new Uint8Array([0, 0, 0, 8, 4, 210, 22, 47]))

    const buff = new Uint8Array(1)
    await conn.read(buff)

    if (buff[0] === 78) {
      return Conn.fromConn(conn, opts)
    }

    if (buff[0] === 83) {
      const tlsConn = await Deno.startTls(conn, { hostname: host })
      return Conn.fromConn(tlsConn, opts)
    }
    throw new Error(`invalid ssl response: ${buff[0]}`)
  }

  static fromConn(conn: Reader & Writer, opts: Options): Promise<Conn> {
    return Conn.fromProto(Protocol.fromConn(conn), opts)
  }

  static async fromProto(proto: IProtocol, opts: Options): Promise<Conn> {
    const cn = new Conn(proto)
    if (opts.database) {
      opts = { ...opts, params: { ...opts.params, database: opts.database } }
    }
    await cn.#startup(opts)
    return cn
  }

  constructor(proto: IProtocol) {
    this.#proto = new FilteredProtocol(proto)
    this.#queue = []
  }

  async #startup(opts: Options) {
    await this.#proto
      .encode({
        code: null,
        data: {
          user: opts.user,
          ...filterUndefined({ database: opts.database, ...opts.params }),
        },
      })
      .send()
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

  listen(listener: NotificationListener): () => void {
    return this.#proto.onNotification(listener)
  }

  query(query: string, params: Param[] = []): Task {
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
