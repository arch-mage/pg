import {
  BackendPacket,
  NoticeResponse,
  NotificationResponse,
  PacketDecoder,
  ParameterStatus,
} from '../decoder/packet-decoder.ts'
import { FrontendPacket, PacketEncoder } from '../encoder/packet-encoder.ts'
import { extract } from './extract.ts'
import { clearNil, maybeBackendError } from '../utils.ts'
import { sasl } from './sasl.ts'
import { Command, Stream } from './command.ts'

type RawValue = Uint8Array | null

export interface ConnectOptions {
  ssl?: boolean
  host?: string
  port?: number
}

export interface StartupOptions {
  user: string
  password?: string
  database?: string
}

export interface Options extends ConnectOptions, StartupOptions {}

async function connect(options: ConnectOptions = {}): Promise<Deno.Conn> {
  const port = options.port ?? 5432
  const hostname = options.host ?? 'localhost'

  const conn = await Deno.connect({ port, hostname })

  if (!options.ssl) {
    return conn
  } else {
    const buff = new Uint8Array([0, 0, 0, 8, 4, 210, 22, 47])
    await conn.write(buff)
    await conn.read(buff.subarray(0, 1))

    if (buff[0] === 78) {
      return conn
    } else if (buff[0] === 83) {
      return Deno.startTls(conn, { hostname })
    } else {
      return Deno.connect({ port, hostname })
    }
  }
}

async function startup(
  writer: WritableStreamDefaultWriter<FrontendPacket[]>,
  reader: ReadableStreamDefaultReader<BackendPacket>,
  { user, database, password }: StartupOptions
) {
  try {
    password ??= ''
    await writer.ready
    await writer.write([
      {
        code: null,
        data: {
          code: 196608,
          data: { user, params: clearNil({ database }) },
        },
      },
    ])
    const auth = extract('R', await reader.read().then((res) => res.value))
    if (auth.code === 0) {
      // OK
    } else if (auth.code === 10) {
      await sasl(writer, reader, password, 'nonce')
    }

    const params = new Map<string, string>()
    let process: number
    let secret: number
    for (;;) {
      const result = await reader.read()
      const packet = extract(result.value)
      if (packet.code === 'S') {
        params.set(packet.data.name, packet.data.data)
        continue
      }

      if (packet.code === 'K') {
        process = packet.data.process
        secret = packet.data.secret
        break
      }
    }
    const state = extract('Z', await reader.read().then((res) => res.value))
    return { params, process, secret, state }
  } catch (error) {
    throw maybeBackendError(error)
  }
}

function createReadable(
  readable: ReadableStream<Uint8Array>
): ReadableStream<BackendPacket> {
  const dec = new PacketDecoder()
  const reader = readable.getReader()
  return new ReadableStream({
    async pull(controller) {
      try {
        const result = await reader.read()
        if (result.done) {
          controller.close()
        } else {
          for (const packet of dec.feed(result.value)) {
            controller.enqueue(packet)
          }
        }
      } catch (error) {
        controller.error(error)
      }
    },
    cancel(reason?: unknown) {
      reader.cancel(reason)
    },
  })
}

function createWritable(
  writable: WritableStream<Uint8Array>
): WritableStream<FrontendPacket[]> {
  const enc = new PacketEncoder()
  const writer = writable.getWriter()
  return new WritableStream({
    async start() {
      await writer.ready
    },
    async write(chunk, controller) {
      try {
        enc.reset()
        chunk.forEach(enc.encode.bind(enc))
        await writer.write(enc.buff)
      } catch (error) {
        controller.error(error)
      }
    },
    abort(reason?: unknown) {
      writer.abort(reason)
    },
    close() {
      writable.close()
    },
  })
}

export interface Connection {
  readonly writable: WritableStream<Uint8Array>
  readonly readable: ReadableStream<Uint8Array>
  close(): void
}

export class Conn extends EventTarget {
  readonly #conn: Connection
  readonly #params: Map<string, string>
  readonly #secret: number
  readonly #process: number
  readonly #queue: Array<(stream: Stream) => void>
  readonly #writer: WritableStreamDefaultWriter<FrontendPacket[]>
  readonly #reader: ReadableStreamDefaultReader<BackendPacket>

  #locked: boolean
  #state: 'I' | 'T' | 'E'

  static async connect({
    ssl,
    host,
    port,
    ...options
  }: Options): Promise<Conn> {
    const conn = await connect({ ssl, host, port })
    const writable = createWritable(conn.writable)
    const readable = createReadable(conn.readable)
    const writer = writable.getWriter()
    const reader = readable.getReader()
    let startupResult: Awaited<ReturnType<typeof startup>>
    try {
      startupResult = await startup(writer, reader, options)
    } finally {
      writer.releaseLock()
      reader.releaseLock()
    }
    const { params, process, secret, state } = startupResult
    return new Conn(conn, writable, readable, process, secret, state, params)
  }

  constructor(
    conn: Connection,
    writable: WritableStream<FrontendPacket[]>,
    readable: ReadableStream<BackendPacket>,
    process: number = 0,
    secret: number = 0,
    state: 'I' | 'T' | 'E' = 'I',
    params?: Map<string, string>
  ) {
    super()
    this.#conn = conn
    this.#queue = []
    this.#state = state
    this.#locked = false
    this.#writer = writable.getWriter()
    this.#reader = readable
      .pipeThrough(
        new TransformStream<BackendPacket, BackendPacket>({
          transform: this.#filter.bind(this),
        })
      )
      .getReader()
    this.#params = params ?? new Map()
    this.#process = process
    this.#secret = secret
  }

  send(packets: FrontendPacket[]): Promise<void> {
    return this.#writer.write(packets)
  }

  async recv(): Promise<BackendPacket | null> {
    const result = await this.#reader.read()
    if (result.done) {
      return null
    }
    return result.value
  }

  acquire(): Promise<Stream> {
    if (this.#locked) {
      return new Promise((resolve) => this.#queue.push(resolve))
    } else {
      this.#locked = true
      return Promise.resolve(this)
    }
  }

  release(_: Stream, state: null | 'I' | 'E' | 'T') {
    if (state) {
      this.#state = state
    }
    const resolve = this.#queue.shift()
    if (!resolve) {
      this.#locked = false
      return
    }
    resolve(this)
  }

  #filter(
    packet: BackendPacket,
    controller: TransformStreamDefaultController<BackendPacket>
  ) {
    let event: Event
    switch (packet.code) {
      case 'A':
        event = new CustomEvent<NotificationResponse['data']>('notification', {
          detail: packet.data,
        })
        break
      case 'N':
        event = new CustomEvent<NoticeResponse['data']>('notice', {
          detail: packet.data,
        })
        break
      case 'S':
        event = new CustomEvent<ParameterStatus['data']>('paramterStatus', {
          detail: packet.data,
        })
        break
      default:
        controller.enqueue(packet)
        return
    }
    this.dispatchEvent(event)
  }

  get state(): 'I' | 'T' | 'E' {
    return this.#state
  }

  get process(): number {
    return this.#process
  }

  get secret(): number {
    return this.#secret
  }

  param(name: string): string | undefined {
    return this.#params.get(name)
  }

  async terminate() {
    const stream = await this.acquire()
    await stream.send([{ code: 'X' }])
  }

  close() {
    this.#conn.close()
  }

  query(query: string, params: RawValue[] = []) {
    return Command.create(
      query,
      params,
      this.acquire(),
      this.release.bind(this)
    )
  }

  addEventListener(
    type: 'notice',
    listener: ListenerOrListenerObject<NoticeResponse['data']> | null,
    options?: boolean | AddEventListenerOptions | undefined
  ): void
  addEventListener(
    type: 'notification',
    listener: ListenerOrListenerObject<NotificationResponse['data']> | null,
    options?: boolean | AddEventListenerOptions | undefined
  ): void
  addEventListener(
    type: 'parameterStatus',
    listener: ListenerOrListenerObject<ParameterStatus['data']> | null,
    options?: boolean | AddEventListenerOptions | undefined
  ): void
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions | undefined
  ): void {
    super.addEventListener(type, listener, options)
  }
}

interface Listener<T> {
  (evt: CustomEvent<T>): void | Promise<void>
}

interface ListenerObject<T> {
  handleEvent(evt: CustomEvent<T>): void | Promise<void>
}

type ListenerOrListenerObject<T> = Listener<T> | ListenerObject<T>
