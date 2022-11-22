import { Pool as GenericPool } from './generic-pool.ts'
import { Client, ClientOptions, queryPackets, record } from './client.ts'
import { Value } from '../encoder/text.ts'
import { Command, Stream } from './stream.ts'
import { PacketEncoder } from '../encoder/packet-encoder.ts'
import { ReadyState } from './types.ts'

export interface PoolOptions extends ClientOptions {
  max?: number
  idleTimeout?: number
  acquireTimeout?: number
}

export class Pool extends GenericPool<Client> {
  readonly #enc: PacketEncoder
  constructor({ max, idleTimeout, acquireTimeout, ...options }: PoolOptions) {
    super({
      max: max ?? 10,
      idleTimeout,
      acquireTimeout,
      create: () => Client.connect(options),
      destroy: (client) => client.shutdown(),
    })
    this.#enc = new PacketEncoder()
  }

  query(query: string, params: Value[] = []) {
    const packets = queryPackets(query, params, this.#enc)

    let client: Client | null = null
    const acquire = async () => {
      client = await this.acquire()
      return client.acquireStream()
    }
    const release = (state: ReadyState | null, stream: Stream) => {
      if (!client) return
      client.releaseStream(state, stream)
      this.release(client)
      client = null
    }
    return Command.create(packets, acquire, release).map(record)
  }
}
