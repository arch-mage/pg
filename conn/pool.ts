import { Pool as GenericPool } from './generic-pool.ts'
import {
  Client,
  Options as ClientOptions,
  queryPackets,
  record,
} from './client.ts'
import { Value } from '../encoder/text.ts'
import { Command, Stream } from './stream.ts'
import { PacketEncoder } from '../encoder/packet-encoder.ts'
import { ReadyState } from './types.ts'

export interface Options extends ClientOptions {
  max?: number
  timeout?: number
}

export class Pool extends GenericPool<Client> {
  readonly #enc: PacketEncoder
  constructor({ max, timeout, ...options }: Options) {
    super({
      max: max ?? 10,
      timeout: timeout ?? 60000,
      create: () => Client.connect(options),
      destroy: (client) => client.shutdown(),
    })
    this.#enc = new PacketEncoder()
  }

  query(query: string, params: Value[] = []) {
    const packets = queryPackets(query, params, this.#enc)
    const sentinel = new Sentinel(this.release.bind(this))
    const acquire = sentinel.acquire.bind(sentinel)
    const release = sentinel.release.bind(sentinel)
    return Command.create(this.acquire().then(acquire), packets, release).map(
      record
    )
  }
}

class Sentinel {
  client: Client | null = null
  readonly #release: (client: Client) => void

  constructor(release: (client: Client) => void) {
    this.#release = release
  }

  acquire(client: Client) {
    this.client = client
    return client.acquireStream()
  }

  release(state: ReadyState, stream: Stream) {
    if (this.client) {
      this.client.releaseStream(state, stream)
      this.#release(this.client)
    }
  }
}
