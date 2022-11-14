export * from './definition.ts'
export * from './backend.ts'
export * from './frontend.ts'

import type { BackendPacket } from './backend.ts'
import type { FrontendPacket } from './frontend.ts'

export interface IProtocol extends AsyncIterableIterator<BackendPacket> {
  recv(): Promise<BackendPacket | null>
  encode(packet: FrontendPacket): this
  send(): Promise<void>
}
