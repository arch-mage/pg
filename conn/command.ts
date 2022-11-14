import { FrontendPacket } from '../encoder/packet-encoder.ts'
import { BackendPacket, RowDescription } from '../decoder/packet-decoder.ts'
import { extract } from './extract.ts'
import { PostgresError, UnexpectedBackendPacket } from '../errors.ts'

type Field = RowDescription['data'][0]

type Param = string | Uint8Array | null

const enum StateCode {
  Fresh,
  Init,
  Running,
  Closed,
}

interface StateFresh {
  code: StateCode.Fresh
  query: string
  params: Param[]
}

interface StateInit {
  code: StateCode.Init
  reader: ReadableStreamDefaultReader<BackendPacket>
  writer: WritableStreamDefaultWriter<FrontendPacket>
}

interface StateRunning {
  code: StateCode.Running
  fields: Field[]
  reader: ReadableStreamDefaultReader<BackendPacket>
  writer: WritableStreamDefaultWriter<FrontendPacket>
}

interface StateClosed {
  code: StateCode.Closed
}

type State = StateFresh | StateInit | StateRunning | StateClosed

type Acquire = () => PromiseLike<
  readonly [
    ReadableStreamDefaultReader<BackendPacket>,
    WritableStreamDefaultWriter<FrontendPacket>
  ]
>

type Callback = (state: null | 'I' | 'T' | 'E') => void

export class Command<Row> {
  readonly #turn: Acquire
  readonly #mapper: (data: [Array<Uint8Array | null>, Field[]]) => Row
  readonly #callback: Callback

  #state: State

  static create<T>(
    query: string,
    params: Param[],
    turn: Acquire,
    mapper: (data: [Array<Uint8Array | null>, Field[]]) => T,
    callback: Callback
  ): Command<T> {
    return new Command(
      turn,
      { code: StateCode.Fresh, query, params },
      mapper,
      callback
    )
  }

  private constructor(
    turn: Acquire,
    state: State,
    mapper: (data: [Array<Uint8Array | null>, Field[]]) => Row,
    callback: Callback
  ) {
    this.#turn = turn
    this.#state = state
    this.#mapper = mapper
    this.#callback = callback
  }

  then<R1 = Row[] | null, R2 = never>(
    onfulfilled?: ((value: Row[] | null) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null
  ): Promise<R1 | R2> {
    return this.#fetchall().then(onfulfilled, onrejected)
  }

  catch<R = never>(
    onrejected?: ((reason: unknown) => R | PromiseLike<R>) | null
  ): Promise<Row[] | R | null> {
    return this.#fetchall().catch(onrejected)
  }

  finally(onfinally?: (() => void) | null): Promise<Row[] | null> {
    return this.#fetchall().finally(onfinally)
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<Row> {
    return this
  }

  async next(): Promise<IteratorResult<Row, null>> {
    const value = await this.#fetchone()
    return value ? { done: false, value } : { done: true, value: null }
  }

  async return(): Promise<IteratorResult<Row, null>> {
    if (this.#state.code !== StateCode.Running) {
      return {
        done: true,
        value: null,
      }
    }
    const { reader } = this.#state
    for (;;) {
      const { value } = await reader.read()
      if (!value || value.code === 'Z') {
        return { done: true, value: this.#close(value?.data ?? null) }
      }
    }
  }

  #close(state: null | 'I' | 'T' | 'E') {
    if (
      this.#state.code === StateCode.Running ||
      this.#state.code === StateCode.Init
    ) {
      this.#state.reader.releaseLock()
      this.#state.writer.releaseLock()
    }
    this.#state = { code: StateCode.Closed }
    this.#callback(state)
    return null
  }

  async #send(
    writer: WritableStreamDefaultWriter<FrontendPacket | FrontendPacket[]>,
    query: string,
    params: Param[]
  ) {
    const formats = params.map((param) =>
      param instanceof Uint8Array ? (1 as const) : (0 as const)
    )
    await writer.ready
    await writer.write([
      { code: 'P', data: { name: '', query, formats: [] } },
      {
        code: 'B',
        data: {
          portal: '',
          stmt: '',
          paramFormats: formats,
          params: [],
          resultFormats: formats,
        },
      },
      { code: 'D', data: { kind: 'P', name: '' } },
      { code: 'E', data: { name: '', max: 0 } },
      { code: 'C', data: { kind: 'P', name: '' } },
      { code: 'S' },
    ])
  }

  async #init() {
    if (this.#state.code !== StateCode.Fresh) {
      return
    }
    const [reader, writer] = await this.#turn()
    const { query, params } = this.#state
    this.#state = { code: StateCode.Init, reader, writer }

    try {
      await this.#send(writer, query, params)
      extract('1', await reader.read())
      extract('2', await reader.read())
      const packet = extract(await reader.read())
      if (packet.code === 'n') {
        extract('C', await reader.read())
        extract('3', await reader.read())
        return this.#close(extract('Z', await reader.read()))
      } else if (packet.code === 'T') {
        this.#state = {
          code: StateCode.Running,
          fields: packet.data,
          reader,
          writer,
        }
      } else {
        throw new UnexpectedBackendPacket(packet, ['T', 'n'])
      }
    } catch (error) {
      return this.#onerror(error, reader)
    }
  }

  async #onerror(
    error: unknown,
    reader: ReadableStreamDefaultReader<BackendPacket>
  ): Promise<never> {
    for (;;) {
      const { value } = await reader.read()
      if (!value || value.code === 'Z') {
        this.#close(value?.data ?? null)
        break
      }
    }

    if (error instanceof UnexpectedBackendPacket && error.packet.code === 'E') {
      throw new PostgresError(error.packet.data)
    }
    throw error
  }

  async #fetchall(): Promise<Row[] | null> {
    await this.#init()

    if (this.#state.code !== StateCode.Running) {
      return null
    }

    const rows = []
    for await (const row of this) {
      rows.push(row)
    }

    return rows
  }

  async #fetchone(): Promise<Row | null> {
    await this.#init()

    if (this.#state.code !== StateCode.Running) {
      return null
    }

    const { reader, fields } = this.#state

    try {
      const packet = extract(await reader.read())
      if (packet.code === 'C') {
        extract('3', await reader.read())
        const state = extract('Z', await reader.read())
        return this.#close(state)
      }

      if (packet.code === 'D') {
        return this.#mapper([packet.data, fields])
      }

      throw new UnexpectedBackendPacket(packet, ['C', 'D'])
    } catch (error) {
      return this.#onerror(error, reader)
    }
  }
}
