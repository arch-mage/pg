import { sasl } from './sasl.ts'
import { Command, Stream } from './stream.ts'
import { extract } from './extract.ts'
import type { Writable, Readable, ReadyState } from './types.ts'
import { clearNil, maybeBackendError } from '../utils.ts'
import { BackendPacket, PacketDecoder } from '../decoder/packet-decoder.ts'
import { FrontendPacket, PacketEncoder } from '../encoder/packet-encoder.ts'

export interface ConnectOptions {
  ssl?: boolean
  port?: number
  host?: string
}

export interface StartupOptions {
  user: string
  password?: string
  database?: string
}

export interface Options extends ConnectOptions, StartupOptions {}

interface Conn extends Deno.Closer {
  readonly readable: ReadableStream<Uint8Array>
  readonly writable: WritableStream<Uint8Array>
}

export class Client {
  readonly #enc: PacketEncoder
  readonly #dec: PacketDecoder
  readonly #conn: Conn
  readonly #stream: Stream
  readonly #params: Map<string, string>
  readonly #secret: number
  readonly #process: number
  readonly #writable: Writable
  readonly #readable: Readable

  #state: ReadyState

  static async connect(options: Options) {
    return Client.fromConn(await connect(options), options)
  }

  static async fromConn(conn: Conn, options: StartupOptions) {
    const enc = new PacketEncoder()
    const dec = new PacketDecoder()
    const writable = createWritable(enc, conn.writable)
    const readable = createReadable(dec, conn.readable)
    const stream = new Stream(writable.getWriter(), readable.getReader())
    const result = await startup(stream.writer, stream.reader, options)
    const { state, params, secret, process } = result
    return new Client(
      enc,
      dec,
      conn,
      state,
      stream,
      params,
      secret,
      process,
      writable,
      readable
    )
  }

  constructor(
    enc: PacketEncoder,
    dec: PacketDecoder,
    conn: Conn,
    state: ReadyState,
    stream: Stream,
    params: Map<string, string>,
    secret: number,
    process: number,
    writable: Writable,
    readable: Readable
  ) {
    this.#enc = enc
    this.#dec = dec
    this.#conn = conn
    this.#state = state
    this.#stream = stream
    this.#params = params
    this.#secret = secret
    this.#process = process
    this.#writable = writable
    this.#readable = readable
  }

  close(): void {
    this.#stream.close()
    this.#conn.close()
  }

  async shutdown() {
    const stream = await this.#stream.acquire()
    await stream.send([{ code: 'X' }])
    this.close()
  }

  query(query: string) {
    const packets: FrontendPacket[] = [
      { code: 'P', data: { query, name: '', formats: [] } },
      {
        code: 'B',
        data: {
          stmt: '',
          portal: '',
          params: [],
          paramFormats: [],
          resultFormats: [],
        },
      },
      { code: 'D', data: { kind: 'P', name: '' } },
      { code: 'E', data: { max: 0, name: '' } },
      { code: 'C', data: { kind: 'P', name: '' } },
      { code: 'S' },
    ]
    return Command.create(this.#stream.acquire(), packets, (state, stream) => {
      this.#state = state
      stream.release()
    })
  }
}

function createReadable(
  dec: PacketDecoder,
  readable: ReadableStream<Uint8Array>
): ReadableStream<BackendPacket> {
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
  enc: PacketEncoder,
  writable: WritableStream<Uint8Array>
): WritableStream<FrontendPacket> {
  const writer = writable.getWriter()
  return new WritableStream({
    async start() {
      await writer.ready
    },
    async write(chunk, controller) {
      try {
        await writer.write(enc.reset().encode(chunk).buff)
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

async function startup(
  writer: WritableStreamDefaultWriter<FrontendPacket>,
  reader: ReadableStreamDefaultReader<BackendPacket>,
  { user, database, password }: StartupOptions
) {
  try {
    password ??= ''
    await writer.ready
    await writer.write({
      code: null,
      data: {
        code: 196608,
        data: { user, params: clearNil({ database }) },
      },
    })
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
