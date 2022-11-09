import { expect } from './decoder.ts'
import { parse } from './parser.ts'
import { Protocol } from './protocol.ts'
import { ColumnDescription, Param } from './types.ts'

export interface Options {
  host: string
  port: number
  user: string
  password: string
  database: string
}

const mustRow = expect('D')
const mustParam = expect('S')
const mustColumns = expect('T')

export class Conn {
  readonly #proto: Protocol

  public static async connect(opts: Partial<Options> = {}) {
    const user = opts.user ?? Deno.env.get('USER') ?? 'postgres'
    const port = opts.port ?? 5432
    const hostname = opts.host ?? 'localhost'

    const conn = await Deno.connect({ port, hostname })
    const proto = new Protocol(conn, conn)

    await proto.startup(user, { database: opts.database ?? user })

    await proto.read().then(expect('R'))

    for await (const packet of proto) {
      if (packet.code === 'K') {
        break
      }
      mustParam(packet)
    }

    await proto.read().then(expect('Z'))

    return new Conn(proto)
  }

  private constructor(proto: Protocol) {
    this.#proto = proto
  }

  public query<T extends Record<string, unknown>>(
    query: string,
    params: Param[] = []
  ): Query<T> {
    return new Query(this.#proto, query, params)
  }
}

class Query<T extends Record<string, unknown>>
  implements AsyncIterable<T>, PromiseLike<T[] | null>
{
  #params: Param[] | null
  #closed: boolean
  #columns: ColumnDescription[] | null
  readonly #proto: Protocol
  readonly #query: string

  public constructor(proto: Protocol, query: string, params: Param[]) {
    this.#proto = proto
    this.#query = query
    this.#params = params
    this.#closed = false
    this.#columns = null
  }

  async #init() {
    if (!this.#params) {
      return
    }
    await this.#proto.prepare({ query: this.#query })
    await this.#proto.execute({ params: this.#params, formats: [1] })
    this.#params = null

    await this.#proto.read().then(expect('1'))
    await this.#proto.read().then(expect('Z'))
    await this.#proto.read().then(expect('2'))

    const packet = await this.#proto.read()

    if (packet?.code === 'n') {
      await this.#proto.read().then(expect('C'))
      await this.#proto.read().then(expect('Z'))
      await this.#proto.close()
      await this.#proto.read().then(expect('3'))
      await this.#proto.read().then(expect('Z'))
      this.#closed = true
      return
    }

    this.#columns = mustColumns(packet)
  }

  public then<TResult1 = T[], TResult2 = never>(
    onfulfilled?: ((value: T[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.fetchall().then(onfulfilled, onrejected)
  }

  public [Symbol.asyncIterator](): this {
    return this
  }

  public async fetchall(): Promise<T[]> {
    if (this.#params) {
      await this.#init()
    }
    if (this.#closed) {
      return []
    }
    if (!this.#columns) {
      for await (const packet of this.#proto) {
        if (packet.code === 'Z') {
          break
        }
      }
      this.#closed = true
      return []
    }

    const rows = []
    for await (const packet of this.#proto) {
      if (packet.code === 'C') {
        break
      }
      rows.push(record(this.#columns, mustRow(packet)))
    }

    await this.#proto.read().then(expect('Z'))

    return rows
  }

  public async fetch(): Promise<T | undefined> {
    if (this.#params) {
      await this.#init()
    }
    if (this.#closed) {
      return
    }
    if (!this.#columns) {
      for await (const packet of this.#proto) {
        if (packet.code === 'Z') {
          break
        }
      }
      this.#closed = true
      return
    }
    const packet = await this.#proto.read()
    if (packet?.code === 'C') {
      await this.#proto.read().then(expect('Z'))
      return
    }

    const data = mustRow(packet)
    return record(this.#columns, data)
  }

  public async next(): Promise<IteratorResult<T, void>> {
    const value = await this.fetch()
    return value ? { done: false, value } : { done: true, value }
  }
}

function record(
  columns: ColumnDescription[],
  data: Array<Uint8Array | null>
  // deno-lint-ignore no-explicit-any
): any {
  if (columns.length !== data.length) {
    throw new TypeError('mismatch number of columns')
  }

  const rec: Record<string, unknown> = {}
  for (let i = 0; i < data.length; ++i) {
    const col = columns[i]
    const val = data[i]
    rec[col.name] = val ? parse(col.oid, val) : null
  }
  return rec
}
