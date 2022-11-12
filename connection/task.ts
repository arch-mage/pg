import { UnexpectedResponseCodeError } from '../errors.ts'
import { extract, mustPacket } from '../internal/assert.ts'
import { Protocol } from '../protocol/mod.ts'
import { ColumnDescription, Param } from '../types.ts'

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
}

export type TaskState = TaskFresh | TaskInitializing | TaskRunning | TaskClosed

export class Task {
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

  #close() {
    this.#state = { code: TaskStateCode.Closed }
    for (const fn of this.#listeners) {
      fn()
    }
    return this.#state
  }

  async #initialize(): Promise<Exclude<TaskState, TaskFresh>> {
    await this.#turn
    if (this.#state.code !== TaskStateCode.Fresh) {
      return this.#state
    }
    const { query, params } = this.#state
    this.#state = { code: TaskStateCode.Initializing }

    await this.#proto
      .parse(query)
      .bind(params, '', '', [1], [1])
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
      return this.#close()
    }

    if (packet.code === 'T') {
      this.#state = { code: TaskStateCode.Running, fields: packet.data }
      return this.#state
    }

    throw new UnexpectedResponseCodeError(packet.code)
  }

  async fetchone(): Promise<[Column[], ColumnDescription[]] | null> {
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

    throw new UnexpectedResponseCodeError(packet.code)
  }

  async fetchall(): Promise<[Column[][], ColumnDescription[]] | null> {
    const state = await this.#initialize()
    if (state.code === TaskStateCode.Initializing) {
      throw new Error('invalid state')
    }
    if (state.code === TaskStateCode.Closed) {
      return null
    }

    const rows: Column[][] = []
    for await (const packet of this.#proto) {
      if (packet.code === 'C') {
        break
      }

      if (packet.code !== 'D') {
        throw new UnexpectedResponseCodeError(packet.code)
      }

      if (packet.data.length !== state.fields.length) {
        throw new Error('mismatch number of field')
      }
      rows.push(packet.data)
      continue
    }
    await this.#proto.recv().then(extract('3'))
    await this.#proto.recv().then(extract('Z'))
    this.#close()
    return [rows, state.fields]
  }

  listen(listener: () => void) {
    this.#listeners.push(listener)
    return () => {
      const idx = this.#listeners.indexOf(listener)
      if (idx !== -1) {
        this.#listeners.splice(idx, 1)
      }
    }
  }
}

export type Column = Uint8Array | null
