import { UnrecognizedFrontendPacket } from '../errors.ts'
import { assertEquals, assertThrows, uint8 } from '../testing.ts'
import { PacketEncoder } from './packet-encoder.ts'

Deno.test('startup', () => {
  const expect = uint8([
    0, 0, 0, 31, 0, 3, 0, 0, 117, 115, 101, 114, 0, 117, 115, 101, 114, 0, 100,
    97, 116, 97, 98, 97, 115, 101, 0, 100, 98, 0, 0,
  ])
  assertEquals(
    new PacketEncoder().encode({
      code: null,
      data: { user: 'user', params: { database: 'db' } },
    }).buff,
    expect
  )
})

Deno.test('sync', () => {
  const expect = uint8([83, 0, 0, 0, 4])
  assertEquals(new PacketEncoder().encode({ code: 'S' }).buff, expect)
})

Deno.test('terminate', () => {
  const expect = uint8([88, 0, 0, 0, 4])
  assertEquals(new PacketEncoder().encode({ code: 'X' }).buff, expect)
})

Deno.test('parse', () => {
  const expect = uint8([
    80, 0, 0, 0, 20, 115, 116, 109, 116, 0, 83, 69, 76, 69, 67, 84, 0, 0, 1, 0,
    1,
  ])
  assertEquals(
    new PacketEncoder().encode({
      code: 'P',
      data: { name: 'stmt', query: 'SELECT', formats: [1] },
    }).buff,
    expect
  )
})

Deno.test('bind', () => {
  const expect = uint8([
    66, 0, 0, 0, 38, 112, 111, 114, 116, 97, 108, 0, 115, 116, 109, 116, 0, 0,
    1, 0, 1, 0, 2, 0, 0, 0, 4, 0, 0, 0, 1, 255, 255, 255, 255, 0, 1, 0, 1,
  ])
  assertEquals(
    new PacketEncoder().encode({
      code: 'B',
      data: {
        portal: 'portal',
        stmt: 'stmt',
        paramFormats: [1],
        params: [uint8([0, 0, 0, 1]), null],
        resultFormats: [1],
      },
    }).buff,
    expect
  )
})

Deno.test('describe', () => {
  const expect = uint8([68, 0, 0, 0, 10, 83, 115, 116, 109, 116, 0])
  assertEquals(
    new PacketEncoder().encode({ code: 'D', data: { kind: 'S', name: 'stmt' } })
      .buff,
    expect
  )
})

Deno.test('execute', () => {
  const expect = uint8([69, 0, 0, 0, 13, 115, 116, 109, 116, 0, 0, 0, 0, 1])
  assertEquals(
    new PacketEncoder().encode({ code: 'E', data: { name: 'stmt', max: 1 } })
      .buff,
    expect
  )
})

Deno.test('close', () => {
  const expect = uint8([67, 0, 0, 0, 10, 83, 115, 116, 109, 116, 0])
  assertEquals(
    new PacketEncoder().encode({ code: 'C', data: { kind: 'S', name: 'stmt' } })
      .buff,
    expect
  )
})

Deno.test('query', () => {
  const expect = uint8([81, 0, 0, 0, 11, 83, 69, 76, 69, 67, 84, 0])
  assertEquals(
    new PacketEncoder().encode({ code: 'Q', data: 'SELECT' }).buff,
    expect
  )
})

Deno.test('saslInit', () => {
  const expect = uint8([
    112, 0, 0, 0, 27, 83, 67, 82, 65, 77, 45, 83, 72, 65, 45, 50, 53, 54, 0, 0,
    0, 0, 5, 110, 111, 110, 99, 101,
  ])
  assertEquals(
    new PacketEncoder().encode({
      code: 'p',
      data: uint8([
        83, 67, 82, 65, 77, 45, 83, 72, 65, 45, 50, 53, 54, 0, 0, 0, 0, 5, 110,
        111, 110, 99, 101,
      ]),
    }).buff,
    expect
  )
})

Deno.test('sasl', () => {
  const expect = uint8([112, 0, 0, 0, 8, 112, 97, 115, 115])
  assertEquals(
    new PacketEncoder().encode({
      code: 'p',
      data: uint8([112, 97, 115, 115]),
    }).buff,
    expect
  )
})

Deno.test('invalid', () => {
  assertThrows(
    // deno-lint-ignore no-explicit-any
    () => new PacketEncoder().encode({ code: '0' as any as 'S' }),
    UnrecognizedFrontendPacket,
    'unrecognized frontend packet: 0'
  )
})
