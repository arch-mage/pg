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

export function extract(
  result?: ReadableStreamReadResult<BackendPacket> | null
): BackendPacket
export function extract(
  code: '1',
  result?: ReadableStreamReadResult<BackendPacket> | null
): void
export function extract(
  code: '2',
  result?: ReadableStreamReadResult<BackendPacket> | null
): void
export function extract(
  code: '3',
  result?: ReadableStreamReadResult<BackendPacket> | null
): void
export function extract(
  code: 'A',
  result?: ReadableStreamReadResult<BackendPacket> | null
): NotificationResponse['data']
export function extract(
  code: 'C',
  result?: ReadableStreamReadResult<BackendPacket> | null
): CommandComplete['data']
export function extract(
  code: 'D',
  result?: ReadableStreamReadResult<BackendPacket> | null
): DataRow['data']
export function extract(
  code: 'E',
  result?: ReadableStreamReadResult<BackendPacket> | null
): ErrorResponse['data']
export function extract(
  code: 'K',
  result?: ReadableStreamReadResult<BackendPacket> | null
): BackendKeyData['data']
export function extract(
  code: 'N',
  result?: ReadableStreamReadResult<BackendPacket> | null
): NoticeResponse['data']
export function extract(
  code: 'n',
  result?: ReadableStreamReadResult<BackendPacket> | null
): void
export function extract(
  code: 'R',
  result?: ReadableStreamReadResult<BackendPacket> | null
): Authentication['data']
export function extract(
  code: 'S',
  result?: ReadableStreamReadResult<BackendPacket> | null
): ParameterStatus['data']
export function extract(
  code: 's',
  result?: ReadableStreamReadResult<BackendPacket> | null
): void
export function extract(
  code: 'T',
  result?: ReadableStreamReadResult<BackendPacket> | null
): RowDescription['data']
export function extract(
  code: 't',
  result?: ReadableStreamReadResult<BackendPacket> | null
): ParameterDescription['data']
export function extract(
  code: 'Z',
  result?: ReadableStreamReadResult<BackendPacket> | null
): ReadyForQuery['data']
export function extract(
  code?: string | ReadableStreamReadResult<BackendPacket> | null,
  result?: ReadableStreamReadResult<BackendPacket> | null
): unknown {
  if (typeof code !== 'string') {
    const packet = code?.value
    if (!packet) {
      throw new NoDataReceived()
    }
    return packet
  }
  const packet = result?.value
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
