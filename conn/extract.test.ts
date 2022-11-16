import { extract } from './extract.ts'
import { assertThrows, assertEquals } from '../testing.ts'
import { NoDataReceived, UnexpectedBackendPacket } from '../errors.ts'

Deno.test('extract', () => {
  assertThrows(() => extract(), NoDataReceived, 'no data received')
  assertThrows(() => extract(null), NoDataReceived, 'no data received')
  assertThrows(
    () => extract({ done: true, value: undefined }),
    NoDataReceived,
    'no data received',
  )
  assertThrows(() => extract('Z'), NoDataReceived, 'no data received')
  assertThrows(() => extract('Z', null), NoDataReceived, 'no data received')
  assertThrows(
    () => extract('Z', { done: true, value: undefined }),
    NoDataReceived,
    'no data received',
  )
  assertThrows(
    () => extract('Z', { done: false, value: { code: '1' } }),
    UnexpectedBackendPacket,
    'unexpected backend packet: 1. expected: Z',
  )

  assertEquals(extract({ done: false, value: { code: '1' } }), { code: '1' })
  assertEquals(
    extract('Z', { done: false, value: { code: 'Z', data: 'I' } }),
    'I',
  )
})
