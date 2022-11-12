import { Protocol } from './mod.ts'
import { Buffer } from '../deps.ts'
import { assertEquals } from '../testing.ts'
import { FrontendPacket } from '../types.ts'

async function encode(packet: FrontendPacket) {
  const buff = new Buffer()
  const proto = Protocol.fromConn(buff)
  await proto.encode(packet).send()
  return buff.bytes()
}

Deno.test('startup', async () => {
  const expect = new Uint8Array([
    0, 0, 0, 31, 0, 3, 0, 0, 117, 115, 101, 114, 0, 117, 115, 101, 114, 0, 100,
    97, 116, 97, 98, 97, 115, 101, 0, 100, 98, 0, 0,
  ])
  assertEquals(
    await encode({
      code: null,
      data: { user: 'user', database: 'db' },
    }),
    expect
  )
})

Deno.test('sync', async () => {
  const expect = new Uint8Array([83, 0, 0, 0, 4])
  assertEquals(await encode({ code: 'S' }), expect)
})

Deno.test('terminate', async () => {
  const expect = new Uint8Array([88, 0, 0, 0, 4])
  assertEquals(await encode({ code: 'X' }), expect)
})

Deno.test('parse', async () => {
  const expect = new Uint8Array([
    80, 0, 0, 0, 18, 115, 116, 109, 116, 0, 83, 69, 76, 69, 67, 84, 0, 0, 0,
  ])
  assertEquals(
    await encode({
      code: 'P',
      data: { name: 'stmt', query: 'SELECT', formats: [] },
    }),
    expect
  )
})

Deno.test('bind', async () => {
  const expect = new Uint8Array([
    66, 0, 0, 0, 38, 112, 111, 114, 116, 97, 108, 0, 115, 116, 109, 116, 0, 0,
    1, 0, 1, 0, 2, 0, 0, 0, 4, 0, 0, 0, 1, 255, 255, 255, 255, 0, 1, 0, 1,
  ])
  assertEquals(
    await encode({
      code: 'B',
      data: {
        portal: 'portal',
        stmt: 'stmt',
        paramFormats: [1],
        params: [new Uint8Array([0, 0, 0, 1]), null],
        resultFormats: [1],
      },
    }),
    expect
  )
})

Deno.test('describe', async () => {
  const expect = new Uint8Array([68, 0, 0, 0, 10, 83, 115, 116, 109, 116, 0])
  assertEquals(
    await encode({ code: 'D', data: { kind: 'S', name: 'stmt' } }),
    expect
  )
})

Deno.test('execute', async () => {
  const expect = new Uint8Array([
    69, 0, 0, 0, 13, 115, 116, 109, 116, 0, 0, 0, 0, 1,
  ])
  assertEquals(
    await encode({ code: 'E', data: { name: 'stmt', max: 1 } }),
    expect
  )
})

Deno.test('close', async () => {
  const expect = new Uint8Array([67, 0, 0, 0, 10, 83, 115, 116, 109, 116, 0])
  assertEquals(
    await encode({ code: 'C', data: { kind: 'S', name: 'stmt' } }),
    expect
  )
})

Deno.test('query', async () => {
  const expect = new Uint8Array([81, 0, 0, 0, 11, 83, 69, 76, 69, 67, 84, 0])
  assertEquals(await encode({ code: 'Q', data: 'SELECT' }), expect)
})

Deno.test('saslInit', async () => {
  const expect = new Uint8Array([
    112, 0, 0, 0, 27, 83, 67, 82, 65, 77, 45, 83, 72, 65, 45, 50, 53, 54, 0, 0,
    0, 0, 5, 110, 111, 110, 99, 101,
  ])
  assertEquals(
    await encode({
      code: 'p',
      data: new Uint8Array([
        83, 67, 82, 65, 77, 45, 83, 72, 65, 45, 50, 53, 54, 0, 0, 0, 0, 5, 110,
        111, 110, 99, 101,
      ]),
    }),
    expect
  )
})

Deno.test('sasl', async () => {
  const expect = new Uint8Array([112, 0, 0, 0, 8, 112, 97, 115, 115])
  assertEquals(
    await encode({ code: 'p', data: new Uint8Array([112, 97, 115, 115]) }),
    expect
  )
})
