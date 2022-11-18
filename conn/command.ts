import { BackendPacket, RowDescription } from '../decoder/packet-decoder.ts'
import { FrontendPacket } from '../encoder/packet-encoder.ts'
import { UnexpectedBackendPacket } from '../errors.ts'
import { compose, maybeBackendError, noop } from '../utils.ts'
import { extract } from './extract.ts'

export interface Stream {
  send(packets: FrontendPacket[]): Promise<void>
  recv(): Promise<BackendPacket | null>
}

type Release = (stream: Stream, state: null | 'I' | 'E' | 'T') => void

type RawValue = Uint8Array | null

type Field = RowDescription['data'][number]

interface StateIdle {
  code: 'idle'
  query: string
  params: RawValue[]
}

interface StateInit {
  code: 'init'
  stream: Stream
}

interface StateRunning {
  code: 'running'
  stream: Stream
  fields: Field[]
}

interface StateClosed {
  code: 'closed'
  state: null | 'I' | 'E' | 'T'
}

type State = StateIdle | StateInit | StateRunning | StateClosed

export class Command<T> {
  readonly #mapper: (value: [RawValue[], Field[]]) => T
  readonly #stream: Promise<Stream>
  readonly #release: Release
  #state: State

  static create(
    query: string,
    params: RawValue[],
    stream: Promise<Stream>,
    release: Release
  ): Command<[RawValue[], Field[]]> {
    return new Command(
      stream,
      { code: 'idle', query, params },
      release,
      noop<[RawValue[], Field[]]>
    )
  }

  constructor(
    stream: Promise<Stream>,
    state: State,
    release: Release,
    mapper: (value: [RawValue[], Field[]]) => T
  ) {
    this.#state = state
    this.#mapper = mapper
    this.#stream = stream
    this.#release = release
  }

  then<R1 = T[] | null, R2 = never>(
    onfulfilled?: ((value: T[] | null) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null
  ): Promise<R1 | R2> {
    return this.#fetchall().then(onfulfilled, onrejected)
  }

  catch<R = never>(
    onrejected?: ((reason: unknown) => R | PromiseLike<R>) | null
  ): Promise<T[] | R | null> {
    return this.#fetchall().catch(onrejected)
  }

  finally(onfinally?: (() => void) | null): Promise<T[] | null> {
    return this.#fetchall().finally(onfinally)
  }

  [Symbol.asyncIterator](): this {
    return this
  }

  async next(): Promise<IteratorResult<T, null>> {
    const value = await this.#fetchone()
    return value ? { done: false, value } : { done: true, value: null }
  }

  async return(): Promise<IteratorResult<T, null>> {
    if (this.#state.code === 'init' || this.#state.code === 'running') {
      this.#close(await this.#exhaust(this.#state.stream))
    }
    return { done: true, value: null }
  }

  map<U>(mapper: (value: T) => U): Command<U> {
    return new Command(
      this.#stream,
      this.#state,
      this.#release,
      compose(mapper, this.#mapper)
    )
  }

  #close(state: null | 'I' | 'E' | 'T' = null) {
    if (this.#state.code === 'init' || this.#state.code === 'running') {
      this.#release(this.#state.stream, state)
    }
    this.#state = { code: 'closed', state }
  }

  async #exhaust(stream: Stream) {
    for (;;) {
      const result = await stream.recv()
      if (!result) {
        return null
      }
      if (result.code === 'Z') {
        return result.data
      }
    }
  }

  async #send(stream: Stream, query: string, params: RawValue[]) {
    try {
      await stream.send([
        parse(query),
        bind(params),
        describe(),
        execute(),
        close(),
        sync(),
      ])
    } catch (error) {
      this.#close()
      throw error
    }
  }

  async #initialize(): Promise<void> {
    if (this.#state.code !== 'idle') {
      return
    }
    const { query, params } = this.#state
    const stream = await this.#stream
    this.#state = { code: 'init', stream }
    await this.#send(stream, query, params)
    try {
      extract('1', await stream.recv())
      extract('2', await stream.recv())
      const packet = extract(await stream.recv())

      if (packet.code === 'n') {
        extract('C', await stream.recv())
        extract('3', await stream.recv())
        return this.#close(extract('Z', await stream.recv()))
      }

      if (packet.code === 'T') {
        this.#state = { code: 'running', stream, fields: packet.data }
        return
      }

      throw new UnexpectedBackendPacket(packet, ['T', 'n'])
    } catch (error) {
      this.#close(await this.#exhaust(stream))
      throw maybeBackendError(error)
    }
  }

  async #fetchall(): Promise<T[] | null> {
    await this.#initialize()
    if (this.#state.code !== 'running') {
      return null
    }
    const { stream, fields } = this.#state
    try {
      const rows: T[] = []
      for (;;) {
        const packet = extract(await stream.recv())
        if (packet.code === 'C') {
          extract('3', await stream.recv())
          break
        }
        if (packet.code === 'D') {
          rows.push(this.#mapper([packet.data, fields]))
          continue
        }

        throw new UnexpectedBackendPacket(packet, ['C', 'D'])
      }
      this.#close(extract('Z', await stream.recv()))
      return rows
    } catch (error) {
      this.#close(await this.#exhaust(stream))
      throw maybeBackendError(error)
    }
  }

  async #fetchone(): Promise<T | null> {
    await this.#initialize()
    if (this.#state.code !== 'running') {
      return null
    }
    const { stream, fields } = this.#state
    try {
      const packet = extract(await stream.recv())
      if (packet.code === 'D') {
        return this.#mapper([packet.data, fields])
      }
      if (packet.code === 'C') {
        extract('3', await stream.recv())
        this.#close(extract('Z', await stream.recv()))
        return null
      }
      throw new UnexpectedBackendPacket(packet, ['C', 'D'])
    } catch (error) {
      this.#close(await this.#exhaust(stream))
      throw maybeBackendError(error)
    }
  }
}

function parse(query: string, name = ''): FrontendPacket {
  return { code: 'P', data: { name, query, formats: [] } }
}

function bind(params: RawValue[], stmt = ''): FrontendPacket {
  return {
    code: 'B',
    data: {
      stmt,
      portal: '',
      params,
      paramFormats: [],
      resultFormats: [],
    },
  }
}

function describe(): FrontendPacket {
  return { code: 'D', data: { kind: 'P', name: '' } }
}

function execute(): FrontendPacket {
  return { code: 'E', data: { max: 0, name: '' } }
}

function close(): FrontendPacket {
  return { code: 'C', data: { kind: 'P', name: '' } }
}

function sync(): FrontendPacket {
  return { code: 'S' }
}
