import {
  BackendPacket,
  FrontendPacket,
  Protocol,
  NoticeListener,
  NotificationListener,
  ParameterStatusListener,
} from '../types.ts'

export class FilteredProtocol implements Protocol {
  #proto: Protocol
  #listeners: {
    A: Array<NotificationListener>
    N: Array<NoticeListener>
    S: Array<ParameterStatusListener>
  }

  constructor(proto: Protocol) {
    while (proto instanceof FilteredProtocol) proto = proto.#proto
    this.#proto = proto
    this.#listeners = {
      A: [],
      N: [],
      S: [],
    }
  }

  async recv(): Promise<BackendPacket | null> {
    for (;;) {
      const packet = await this.#proto.recv()
      if (!packet) {
        return null
      }
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
  }

  send(...packets: FrontendPacket[]): Promise<void> {
    return this.#proto.send(...packets)
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
