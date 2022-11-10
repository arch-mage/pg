import { UnexpectedResponseError } from './error.ts'
import { extract, must } from './internal.ts'
import { Protocol } from './protocol.ts'
import { ColumnDescription } from './types.ts'

export class QueryResult {
  readonly #columns: ReadonlyArray<ColumnDescription>
  readonly #proto: Protocol
  #closed: boolean

  constructor(proto: Protocol, columns: ReadonlyArray<ColumnDescription>) {
    this.#proto = proto
    this.#closed = false
    this.#columns = columns
  }

  get columns() {
    return this.#columns
  }

  async fetch(): Promise<Array<Uint8Array | null> | null> {
    if (this.#closed) {
      return null
    }
    const packet = await this.#proto.recv().then(must)
    if (packet.code === 'D') {
      return packet.data
    }
    if (packet.code === 'C') {
      await this.#proto.recv().then(extract('3'))
      await this.#proto.recv().then(extract('Z'))
      this.#closed = true
      return null
    }
    throw new UnexpectedResponseError(packet.code)
  }

  async fetchall(): Promise<Array<Uint8Array | null>[] | null> {
    if (this.#closed) {
      return null
    }
    const rows = []
    for (;;) {
      const row = await this.fetch()
      if (!row) {
        break
      }
      rows.push(row)
    }
    return rows
  }

  [Symbol.asyncIterator](): this {
    return this
  }

  async next(): Promise<IteratorResult<Array<Uint8Array | null>, null>> {
    const value = await this.fetch()
    return value ? { done: false, value } : { done: true, value }
  }

  // then<TResult1 = T[], TResult2 = never>(
  //   onfulfilled?:
  //     | ((value: T[]) => TResult1 | PromiseLike<TResult1>)
  //     | null
  //     | undefined,
  //   onrejected?:
  //     | ((reason: any) => TResult2 | PromiseLike<TResult2>)
  //     | null
  //     | undefined
  // ): PromiseLike<TResult1 | TResult2> {
  //   throw new Error('Method not implemented.')
  // }
}
