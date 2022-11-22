import { BackendPacket } from '../decoder/packet-decoder.ts'
import { FrontendPacket } from '../encoder/packet-encoder.ts'
import { UnexpectedBackendPacket } from '../errors.ts'
import { compose, maybeBackendError, noop } from '../utils.ts'
import { extract } from './extract.ts'
import type { Field, Writer, Reader, RawValue, ReadyState } from './types.ts'

export class Stream {
  readonly #queue: Array<(stream: this) => void>
  readonly #writer: Writer
  readonly #reader: Reader

  #streaming: boolean

  constructor(writer: Writer, reader: Reader) {
    this.#queue = []
    this.#writer = writer
    this.#reader = reader
    this.#streaming = false
  }

  close(): void {
    this.#writer.releaseLock()
    this.#reader.releaseLock()
  }

  async send(packets: FrontendPacket[]): Promise<void> {
    await this.#writer.ready
    for (const packet of packets) {
      await this.#writer.write(packet)
    }
  }

  async recv(): Promise<BackendPacket | null> {
    const { value } = await this.#reader.read()
    return value ?? null
  }

  acquire(): Promise<Stream> {
    if (this.#streaming) {
      return new Promise((resolve) => this.#queue.push(resolve))
    } else {
      this.#streaming = true
      return Promise.resolve(this)
    }
  }

  release() {
    const resolve = this.#queue.shift()
    if (!resolve) {
      this.#streaming = false
      return
    }
    resolve(this)
  }

  command(packets: FrontendPacket[]) {
    return Command.create(
      packets,
      this.acquire.bind(this),
      this.release.bind(this)
    )
  }
}

interface StateIdle {
  code: 'idle'
  packets: FrontendPacket[]
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
  state: ReadyState | null
}

type State = StateIdle | StateInit | StateRunning | StateClosed

export class Command<T> implements AsyncIterableIterator<T> {
  readonly #mapper: (value: [RawValue[], Field[]]) => T
  readonly #acquire: () => Promise<Stream>
  readonly #release: (state: ReadyState | null, stream: Stream) => void
  #state: State

  static create(
    packets: FrontendPacket[],
    acquire: () => Promise<Stream>,
    release: (state: ReadyState | null, stream: Stream) => void
  ): Command<[RawValue[], Field[]]> {
    const state: StateIdle = { code: 'idle', packets }
    return new Command(state, acquire, release, noop<[RawValue[], Field[]]>)
  }

  constructor(
    state: State,
    acquire: () => Promise<Stream>,
    release: (state: ReadyState | null, stream: Stream) => void,
    mapper: (value: [RawValue[], Field[]]) => T
  ) {
    this.#state = state
    this.#mapper = mapper
    this.#acquire = acquire
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

  async throw(e?: unknown): Promise<IteratorResult<T, null>> {
    if (this.#state.code === 'init' || this.#state.code === 'running') {
      this.#close(await this.#exhaust(this.#state.stream))
    }
    throw e
  }

  map<U>(mapper: (value: T) => U): Command<U> {
    return new Command(
      this.#state,
      this.#acquire,
      this.#release,
      compose(mapper, this.#mapper)
    )
  }

  #close(state: ReadyState | null = null) {
    if (this.#state.code === 'init' || this.#state.code === 'running') {
      this.#release(state, this.#state.stream)
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

  async #send(stream: Stream, packets: FrontendPacket[]) {
    try {
      await stream.send(packets)
    } catch (error) {
      this.#close()
      throw error
    }
  }

  async #initialize(): Promise<void> {
    if (this.#state.code !== 'idle') {
      return
    }
    const { packets } = this.#state
    const stream = await this.#acquire()
    this.#state = { code: 'init', stream }
    await this.#send(stream, packets)
    try {
      extract('1', await stream.recv())
      extract('2', await stream.recv())
      const packet = extract(await stream.recv())

      if (packet.code === 'T') {
        this.#state = { code: 'running', stream, fields: packet.data }
        return
      }

      if (packet.code === 'n') {
        const packet = extract(await stream.recv())
        if (packet.code !== 'C' && packet.code !== 'I') {
          throw new UnexpectedBackendPacket(packet, ['C', 'I'])
        }
        extract('3', await stream.recv())
        return this.#close(extract('Z', await stream.recv()))
      }

      if (packet.code === 'I') {
        extract('C', await stream.recv())
        extract('3', await stream.recv())
        return this.#close(extract('Z', await stream.recv()))
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
