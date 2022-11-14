export * from './definition.ts'
export * from './backend.ts'
export * from './frontend.ts'

import type { BackendPacket } from './backend.ts'
import type { FrontendPacket } from './frontend.ts'

export interface Protocol {
  recv(): Promise<BackendPacket | null>
  send(...packets: FrontendPacket[]): Promise<void>
}
