// deno-lint-ignore-file no-explicit-any
import { assertEquals, assertThrows, uint8 } from '../testing.ts'
import { Encoder, PacketEncoder } from './encoder.ts'

Deno.test('int16', () => {
  assertEquals(new Encoder(2).int16(1).int16(-1).buff, uint8(0, 1, 255, 255))
})

Deno.test('int32', () => {
  assertEquals(
    new Encoder(2).int32(1).int32(-1).buff,
    uint8(0, 0, 0, 1, 255, 255, 255, 255)
  )
})

Deno.test('byte', () => {
  assertEquals(new Encoder(2).byte(1).byte(-1).buff, uint8(1, 255))
})

Deno.test('bytes', () => {
  assertEquals(
    new Encoder(2).bytes(uint8(0, 1)).bytes(uint8(2, 3)).buff,
    uint8(0, 1, 2, 3)
  )
})

Deno.test('str', () => {
  assertEquals(new Encoder(2).str('a').str('b').buff, uint8(97, 98))
})

Deno.test('cstr', () => {
  assertEquals(new Encoder(2).cstr('a').cstr('b').buff, uint8(97, 0, 98, 0))
})

Deno.test('startup', () => {
  const expect = new Uint8Array([
    0, 0, 0, 31, 0, 3, 0, 0, 117, 115, 101, 114, 0, 117, 115, 101, 114, 0, 100,
    97, 116, 97, 98, 97, 115, 101, 0, 100, 98, 0, 0,
  ])
  assertEquals(
    new PacketEncoder().encode({
      code: null,
      data: { user: 'user', database: 'db' },
    }).buff,
    expect
  )
})

Deno.test('sync', () => {
  const expect = new Uint8Array([83, 0, 0, 0, 4])
  assertEquals(new PacketEncoder().encode({ code: 'S' }).buff, expect)
})

Deno.test('terminate', () => {
  const expect = new Uint8Array([88, 0, 0, 0, 4])
  assertEquals(new PacketEncoder().encode({ code: 'X' }).buff, expect)
})

Deno.test('parse', () => {
  const expect = new Uint8Array([
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
  const expect = new Uint8Array([
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
        params: [new Uint8Array([0, 0, 0, 1]), null],
        resultFormats: [1],
      },
    }).buff,
    expect
  )
})

Deno.test('describe', () => {
  const expect = new Uint8Array([68, 0, 0, 0, 10, 83, 115, 116, 109, 116, 0])
  assertEquals(
    new PacketEncoder().encode({ code: 'D', data: { kind: 'S', name: 'stmt' } })
      .buff,
    expect
  )
})

Deno.test('execute', () => {
  const expect = new Uint8Array([
    69, 0, 0, 0, 13, 115, 116, 109, 116, 0, 0, 0, 0, 1,
  ])
  assertEquals(
    new PacketEncoder().encode({ code: 'E', data: { name: 'stmt', max: 1 } })
      .buff,
    expect
  )
})

Deno.test('close', () => {
  const expect = new Uint8Array([67, 0, 0, 0, 10, 83, 115, 116, 109, 116, 0])
  assertEquals(
    new PacketEncoder().encode({ code: 'C', data: { kind: 'S', name: 'stmt' } })
      .buff,
    expect
  )
})

Deno.test('query', () => {
  const expect = new Uint8Array([81, 0, 0, 0, 11, 83, 69, 76, 69, 67, 84, 0])
  assertEquals(
    new PacketEncoder().encode({ code: 'Q', data: 'SELECT' }).buff,
    expect
  )
})

Deno.test('saslInit', () => {
  const expect = new Uint8Array([
    112, 0, 0, 0, 27, 83, 67, 82, 65, 77, 45, 83, 72, 65, 45, 50, 53, 54, 0, 0,
    0, 0, 5, 110, 111, 110, 99, 101,
  ])
  assertEquals(
    new PacketEncoder().encode({
      code: 'p',
      data: new Uint8Array([
        83, 67, 82, 65, 77, 45, 83, 72, 65, 45, 50, 53, 54, 0, 0, 0, 0, 5, 110,
        111, 110, 99, 101,
      ]),
    }).buff,
    expect
  )
})

Deno.test('sasl', () => {
  const expect = new Uint8Array([112, 0, 0, 0, 8, 112, 97, 115, 115])
  assertEquals(
    new PacketEncoder().encode({
      code: 'p',
      data: new Uint8Array([112, 97, 115, 115]),
    }).buff,
    expect
  )
})

Deno.test('invalid', () => {
  assertThrows(() => new PacketEncoder().encode({ code: '.' as any as 'S' }))
})
