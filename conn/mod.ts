import { BackendPacket, PacketDecoder } from '../decoder/packet-decoder.ts'
import { FrontendPacket, PacketEncoder } from '../encoder/packet-encoder.ts'
import { extract } from './extract.ts'
import { clearNil, maybeBackendError } from '../utils.ts'
import { sasl } from './sasl.ts'
import { Stream } from './stream.ts'
import { Command } from './command.ts'

type RawValue = Uint8Array | null

export interface ConnectOptions {
  ssl?: boolean
  host?: string
  port?: number
}

export interface StartupOptions {
  user?: string
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

function createReadable(
  dec: PacketDecoder,
  readable: ReadableStream<Uint8Array>
): ReadableStream<BackendPacket> {
  return new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of readable) {
          for (const packet of dec.feed(chunk)) {
            controller.enqueue(packet)
          }
        }
      } catch (error) {
        controller.error(error)
        controller.close()
      }
    },
  })
}

function createWritable(
  enc: PacketEncoder,
  writable: WritableStream<Uint8Array>
): WritableStream<FrontendPacket[]> {
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
        writer.releaseLock()
        controller.error(error)
      }
    },
  })
}

export interface Connection {
  readonly writable: WritableStream<Uint8Array>
  readonly readable: ReadableStream<Uint8Array>
  close(): void
}

export class Conn {
  readonly #enc: PacketEncoder
  readonly #dec: PacketDecoder
  readonly #conn: Connection
  readonly #queue: Array<(stream: Stream) => void>
  readonly #writable: WritableStream<FrontendPacket[]>
  readonly #readable: ReadableStream<BackendPacket>

  #locked: boolean
  #state: 'I' | 'T' | 'E'

  static async connect({ ssl, host, port, ...options }: Options = {}) {
    const conn = new Conn(await connect({ ssl, host, port }))
    await conn.#startup(options)
    return conn
  }

  constructor(conn: Connection) {
    this.#enc = new PacketEncoder()
    this.#dec = new PacketDecoder()
    this.#conn = conn
    this.#queue = []
    this.#state = 'I'
    this.#locked = false
    this.#writable = createWritable(this.#enc, this.#conn.writable)
    this.#readable = createReadable(this.#dec, this.#conn.readable)
  }

  get state(): 'I' | 'T' | 'E' {
    return this.#state
  }

  async terminate() {
    const stream = await this.#acquire()
    await stream.send([{ code: 'X' }])
    stream.release(null)
  }

  close() {
    this.#conn.close()
  }

  async #startup({ user, database, password }: StartupOptions = {}) {
    const writer = this.#writable.getWriter()
    const reader = this.#readable.getReader()
    try {
      user ??= Deno.env.get('USER') ?? 'postgres'
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
      const auth = extract('R', await reader.read())
      if (auth.code === 0) {
        // OK
      } else if (auth.code === 10) {
        await sasl(writer, reader, password, 'nonce')
      }
      for (;;) {
        const packet = extract(await reader.read())
        if (packet.code === 'Z') {
          break
        }
      }
    } catch (error) {
      throw maybeBackendError(error)
    } finally {
      writer.releaseLock()
      reader.releaseLock()
    }
  }

  query(query: string, params: RawValue[] = []) {
    return Command.create(query, params, this.#acquire())
  }

  #acquire(): Promise<Stream> {
    if (this.#locked) {
      return new Promise((resolve) => this.#queue.push(resolve))
    } else {
      this.#locked = true
      const stream = new Stream(
        this.#writable.getWriter(),
        this.#readable.getReader(),
        this.#release.bind(this)
      )
      return Promise.resolve(stream)
    }
  }

  #release(state: null | 'I' | 'E' | 'T') {
    if (state) {
      this.#state = state
    }
    const resolve = this.#queue.shift()
    if (!resolve) {
      this.#locked = false
      return
    }
    const stream = new Stream(
      this.#writable.getWriter(),
      this.#readable.getReader(),
      this.#release.bind(this)
    )
    resolve(stream)
  }
}
