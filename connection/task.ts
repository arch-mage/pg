import { UnexpectedResponseError } from '../errors.ts'
import { extract, mustPacket } from '../internal/assert.ts'
import { Row, Param, Protocol, ColumnDescription } from '../types.ts'

export const enum TaskStateCode {
  Fresh,
  Initializing,
  Running,
  Closed,
}

export interface TaskFresh {
  code: TaskStateCode.Fresh
  query: string
  params: Param[]
}

export interface TaskInitializing {
  code: TaskStateCode.Initializing
}

export interface TaskRunning {
  code: TaskStateCode.Running
  fields: ColumnDescription[]
}

export interface TaskClosed {
  code: TaskStateCode.Closed
  error?: unknown
}

export type TaskState = TaskFresh | TaskInitializing | TaskRunning | TaskClosed

export class Task
  implements
    PromiseLike<[Row[], ColumnDescription[]] | null>,
    AsyncIterableIterator<[Row, ColumnDescription[]]>
{
  readonly #proto: Protocol
  readonly #listeners: Array<() => void>
  readonly #turn: Promise<void>

  #state: TaskState

  constructor(
    proto: Protocol,
    query: string,
    params: Param[],
    turn: Promise<void>
  ) {
    this.#proto = proto
    this.#state = { code: TaskStateCode.Fresh, query, params }
    this.#listeners = []
    this.#turn = turn
  }

  #close(error?: unknown) {
    if (this.#state.code === TaskStateCode.Closed) {
      // the first error wins
      this.#state.error ??= error
      return this.#state
    }
    this.#state = { code: TaskStateCode.Closed, error }
    this.#listeners.forEach((fn) => fn())
    return this.#state
  }

  async #initialize(): Promise<Exclude<TaskState, TaskFresh>> {
    await this.#turn
    if (this.#state.code !== TaskStateCode.Fresh) {
      return this.#state
    }
    const { query, params } = this.#state
    this.#state = { code: TaskStateCode.Initializing }

    await this.#proto.send(
      { code: 'P', data: { name: '', query, formats: [] } },
      {
        code: 'B',
        data: {
          portal: '',
          stmt: '',
          paramFormats: [1],
          params,
          resultFormats: [1],
        },
      },
      { code: 'D', data: { kind: 'P', name: '' } },
      { code: 'E', data: { name: '', max: 0 } },
      { code: 'C', data: { kind: 'P', name: '' } },
      { code: 'S' }
    )

    await this.#proto.recv().then(extract('1'))
    await this.#proto.recv().then(extract('2'))

    const packet = await this.#proto.recv().then(mustPacket)

    if (packet.code === 'n') {
      await this.#proto.recv().then(extract('C'))
      await this.#proto.recv().then(extract('3'))
      await this.#proto.recv().then(extract('Z'))
      return this.#close()
    }

    if (packet.code === 'T') {
      this.#state = { code: TaskStateCode.Running, fields: packet.data }
      return this.#state
    }

    throw new UnexpectedResponseError(packet)
  }

  async #fetchone(): Promise<[Row, ColumnDescription[]] | null> {
    try {
      const state = await this.#initialize()
      if (state.code === TaskStateCode.Initializing) {
        throw new Error('invalid state')
      }
      if (state.code === TaskStateCode.Closed) {
        return null
      }

      const packet = await this.#proto.recv().then(mustPacket)

      if (packet.code === 'D') {
        if (packet.data.length !== state.fields.length) {
          throw new Error('mismatch number of field')
        }
        return [packet.data, state.fields]
      }

      if (packet.code === 'C') {
        await this.#proto.recv().then(extract('3'))
        await this.#proto.recv().then(extract('Z'))
        this.#close()
        return null
      }

      throw new UnexpectedResponseError(packet)
    } catch (error) {
      for (;;) {
        const packet = await this.#proto.recv()
        if (!packet || packet.code === 'Z') {
          break
        }
      }
      this.#close(error)
      throw error
    }
  }

  async #fetchall(): Promise<[Row[], ColumnDescription[]] | null> {
    try {
      const state = await this.#initialize()
      if (state.code === TaskStateCode.Initializing) {
        throw new Error('invalid state')
      }
      if (state.code === TaskStateCode.Closed) {
        return null
      }

      const rows: Row[] = []
      for (;;) {
        const packet = await this.#proto.recv().then(mustPacket)
        if (packet.code === 'C') {
          await this.#proto.recv().then(extract('3'))
          await this.#proto.recv().then(extract('Z'))
          this.#close()
          return [rows, state.fields]
        }
        if (packet.code !== 'D') {
          throw new UnexpectedResponseError(packet)
        }
        if (packet.data.length !== state.fields.length) {
          throw new Error('mismatch number of field')
        }
        rows.push(packet.data)
        continue
      }
    } catch (error) {
      for (;;) {
        const packet = await this.#proto.recv()
        if (!packet || packet.code === 'Z') {
          break
        }
      }
      this.#close(error)
      throw error
    }
  }

  onClose(listener: () => void) {
    this.#listeners.push(listener)
    return () => {
      const idx = this.#listeners.indexOf(listener)
      if (idx !== -1) {
        this.#listeners.splice(idx, 1)
      }
    }
  }

  then<TResult1 = [Row[], ColumnDescription[]] | null, TResult2 = never>(
    onfulfilled?:
      | ((
          value: [Row[], ColumnDescription[]] | null
        ) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.#fetchall().then(onfulfilled, onrejected)
  }

  [Symbol.asyncIterator](): this {
    return this
  }

  async next(): Promise<IteratorResult<[Row, ColumnDescription[]], null>> {
    const value = await this.#fetchone()
    return value ? { done: false, value } : { done: true, value }
  }

  async return(): Promise<IteratorResult<[Row, ColumnDescription[]], null>> {
    // exhaust the iterator
    for (;;) {
      const value = await this.#fetchone() // fetchone handles calling #close
      if (!value) {
        return { done: true, value }
      }
    }
  }

  async throw(
    error?: unknown
  ): Promise<IteratorResult<[Row, ColumnDescription[]], null>> {
    // exhaust the iterator
    for (;;) {
      const value = await this.#fetchone() // fetchone handles calling #close
      if (!value) {
        this.#close(error)
        return { done: true, value }
      }
    }
  }
}
