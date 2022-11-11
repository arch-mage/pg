import {
  ConnectionClosedError,
  PostgresError,
  UnexpectedResponseError,
} from './error.ts'
import { Packet } from './types.ts'

export function must(packet: Packet | null): Packet {
  if (packet) {
    return packet
  }
  throw new ConnectionClosedError()
}

export function extract<C>(
  code: C
): (packet: Packet | null) => Extract<Packet, { code: C }>['data']
export function extract<C>(
  code: C,
  packet: Packet | null
): Extract<Packet, { code: C }>['data']
export function extract(code: string, packet?: Packet | null): unknown {
  function assert(packet: Packet | null) {
    if (!packet) {
      throw new ConnectionClosedError()
    }
    if (packet.code === 'E') {
      if (code === 'E') {
        return packet.data
      }
      throw new PostgresError(packet.data)
    }

    if (packet.code === code) {
      return packet.data
    }
    throw new UnexpectedResponseError(packet?.code ?? null, code)
  }
  return typeof packet !== 'undefined' ? assert(packet) : assert
}
