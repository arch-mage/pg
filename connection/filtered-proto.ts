import {
  BackendPacket,
  FrontendPacket,
  IProtocol,
  NoticeListener,
  NotificationListener,
  ParameterStatusListener,
} from '../types.ts'

export class FilteredProtocol implements IProtocol {
  #proto: IProtocol
  #listeners: {
    A: Array<NotificationListener>
    N: Array<NoticeListener>
    S: Array<ParameterStatusListener>
  }

  constructor(proto: IProtocol) {
    while (proto instanceof FilteredProtocol) proto = proto.#proto
    this.#proto = proto
    this.#listeners = {
      A: [],
      N: [],
      S: [],
    }
  }

  async recv(): Promise<BackendPacket | null> {
    for await (const packet of this.#proto) {
      if (packet.code === 'A') {
        const {
          data: { processId, channel, payload },
        } = packet
        this.#listeners.A.forEach((fn) => fn(processId, channel, payload))
        continue
      }
      if (packet.code === 'N') {
        const { data } = packet
        this.#listeners.N.forEach((fn) => fn(data))
        continue
      }
      if (packet.code === 'S') {
        const { data } = packet
        this.#listeners.S.forEach((fn) => fn(data[0], data[1]))
        continue
      }
      return packet
    }
    return null
  }
  encode(packet: FrontendPacket): this {
    this.#proto.encode(packet)
    return this
  }
  send(): Promise<void> {
    return this.#proto.send()
  }
  [Symbol.asyncIterator](): this {
    return this
  }
  next(): Promise<IteratorResult<BackendPacket, null>> {
    return this.#proto.next()
  }

  onNotification(listener: NotificationListener): () => void {
    this.#listeners.A.push(listener)
    return () => {
      const idx = this.#listeners.A.indexOf(listener)
      if (idx !== -1) {
        this.#listeners.A.splice(idx, 1)
      }
    }
  }

  onNotice(listener: NoticeListener): () => void {
    this.#listeners.N.push(listener)
    return () => {
      const idx = this.#listeners.N.indexOf(listener)
      if (idx !== -1) {
        this.#listeners.N.splice(idx, 1)
      }
    }
  }

  onParameterStatus(listener: ParameterStatusListener): () => void {
    this.#listeners.S.push(listener)
    return () => {
      const idx = this.#listeners.S.indexOf(listener)
      if (idx !== -1) {
        this.#listeners.S.splice(idx, 1)
      }
    }
  }
}
