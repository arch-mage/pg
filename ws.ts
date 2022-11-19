import { Conn, Client, ClientOptions } from './conn/client.ts'
import { concat } from './utils.ts'

interface Executor<T> {
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
}

function connectWs(
  url: string | URL,
  protocols?: string | string[]
): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, protocols)

    socket.addEventListener('open', onOpen)
    socket.addEventListener('error', onError)

    function onError() {
      reject(new Error('failed to connect'))
      socket.removeEventListener('open', onOpen)
      socket.removeEventListener('error', onError)
    }
    function onOpen() {
      resolve(socket)
      socket.removeEventListener('open', onOpen)
      socket.removeEventListener('error', onError)
    }
  })
}

export class WebSocketConn implements Conn {
  readonly #queue: Executor<Uint8Array>[]
  readonly #socket: WebSocket
  readonly #errors: unknown[]
  readonly writable: WritableStream<Uint8Array>
  readonly readable: ReadableStream<Uint8Array>

  #buffer: Uint8Array[]

  static async connect(url: string | URL, protocols?: string | string[]) {
    const socket = await connectWs(url, protocols)
    return new WebSocketConn(socket)
  }

  constructor(socket: WebSocket) {
    this.#queue = []
    this.#buffer = []
    this.#socket = socket
    this.#errors = []
    this.#socket.addEventListener('message', this.#onMessage.bind(this))
    this.#socket.addEventListener('error', this.#onError.bind(this))

    this.writable = new WritableStream<Uint8Array>({
      write: (chunk, controller) => {
        const error = this.#errors.shift()
        if (error) {
          return controller.error(error)
        }
        try {
          socket.send(chunk)
        } catch (error) {
          controller.error(error)
        }
      },
    })

    this.readable = new ReadableStream<Uint8Array>({
      pull: async (controller) => {
        const error = this.#errors.shift()
        if (error) {
          return controller.error(error)
        }
        try {
          const data = await new Promise<Uint8Array>((resolve, reject) => {
            this.#queue.push({ resolve, reject })
          })
          controller.enqueue(data)
        } catch (error) {
          controller.error(error)
        }
      },
    })
  }

  close(): void {
    return this.#socket.close()
  }

  #onError() {
    this.#errors.push(new Error('socket error'))
  }

  async #onMessage(event: MessageEvent<Blob>) {
    const queue = this.#queue.shift()
    try {
      let data = new Uint8Array(await event.data.arrayBuffer())
      if (!queue) {
        this.#buffer.push(data)
        return
      }
      data = concat(...this.#buffer, data)
      this.#buffer = []
      queue.resolve(data)
    } catch (error) {
      if (queue) {
        queue.reject(error)
      } else {
        this.#errors.push(error)
      }
    }
  }
}

export async function connect({ ssl, port, host, ...startup }: ClientOptions) {
  host ??= location.host
  port ??= defaultPort()
  const proto = ssl ? 'wss' : 'ws'
  const conn = await WebSocketConn.connect(`${proto}://${host}:${port}`)
  return Client.fromConn(conn, startup)
}

function defaultPort(): number {
  const port = parseInt(location.port, 10)
  if (!isNaN(port)) {
    return port
  }

  return location.protocol.startsWith('https') ? 443 : 80
}
