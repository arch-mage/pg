import type {
  DataRow,
  ErrorResponse,
  ReadyForQuery,
  BackendPacket,
  RowDescription,
  Authentication,
  BackendKeyData,
  NoticeResponse,
  CommandComplete,
  ParameterStatus,
  NotificationResponse,
  ParameterDescription,
} from '../decoder/packet-decoder.ts'
import { NoDataReceived, UnexpectedBackendPacket } from '../errors.ts'
import { hasProp } from '../utils.ts'

export function extract(packet?: BackendPacket | null): BackendPacket
export function extract(code: '1', packet?: BackendPacket | null): void
export function extract(code: '2', packet?: BackendPacket | null): void
export function extract(code: '3', packet?: BackendPacket | null): void
export function extract(
  code: 'A',
  packet?: BackendPacket | null
): NotificationResponse['data']
export function extract(
  code: 'C',
  packet?: BackendPacket | null
): CommandComplete['data']
export function extract(
  code: 'D',
  packet?: BackendPacket | null
): DataRow['data']
export function extract(
  code: 'E',
  packet?: BackendPacket | null
): ErrorResponse['data']
export function extract(
  code: 'K',
  packet?: BackendPacket | null
): BackendKeyData['data']
export function extract(
  code: 'N',
  packet?: BackendPacket | null
): NoticeResponse['data']
export function extract(code: 'n', packet?: BackendPacket | null): void
export function extract(
  code: 'R',
  packet?: BackendPacket | null
): Authentication['data']
export function extract(
  code: 'S',
  packet?: BackendPacket | null
): ParameterStatus['data']
export function extract(code: 's', packet?: BackendPacket | null): void
export function extract(
  code: 'T',
  packet?: BackendPacket | null
): RowDescription['data']
export function extract(
  code: 't',
  packet?: BackendPacket | null
): ParameterDescription['data']
export function extract(
  code: 'Z',
  packet?: BackendPacket | null
): ReadyForQuery['data']
export function extract(
  code?: string | BackendPacket | null,
  packet?: BackendPacket | null
): unknown {
  if (typeof code !== 'string') {
    if (!code) {
      throw new NoDataReceived()
    }
    return code
  }
  if (!packet) {
    throw new NoDataReceived()
  }

  if (packet.code !== code) {
    throw new UnexpectedBackendPacket(packet, [code])
  }
  if (hasProp(packet, 'data')) {
    return packet.data
  }
}
