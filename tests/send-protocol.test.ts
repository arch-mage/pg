import { assertEquals } from './deps.ts'
import { Protocol } from '../protocol.ts'
import { Buffer } from '../deps.ts'

async function encode<K extends keyof Protocol>(
  method: K,
  ...args: Parameters<Protocol[K]>
) {
  const buff = new Buffer()
  const proto = new Protocol(buff, buff)
  // deno-lint-ignore no-explicit-any
  const func = proto[method] as any
  func.apply(proto, args)
  await proto.send()
  return buff.bytes()
}

Deno.test('startup', async () => {
  assertEquals(
    await encode('startup', 'user', { database: 'db' }),
    new Uint8Array([
      0, 0, 0, 31, 0, 3, 0, 0, 117, 115, 101, 114, 0, 117, 115, 101, 114, 0,
      100, 97, 116, 97, 98, 97, 115, 101, 0, 100, 98, 0, 0,
    ])
  )
})

Deno.test('sync', async () => {
  assertEquals(await encode('sync'), new Uint8Array([83, 0, 0, 0, 4]))
})

Deno.test('terminate', async () => {
  assertEquals(await encode('terminate'), new Uint8Array([88, 0, 0, 0, 4]))
})

Deno.test('parse', async () => {
  assertEquals(
    await encode('parse', 'SELECT', 'stmt'),
    new Uint8Array([
      80, 0, 0, 0, 18, 115, 116, 109, 116, 0, 83, 69, 76, 69, 67, 84, 0, 0, 0,
    ])
  )
})

Deno.test('bind', async () => {
  assertEquals(
    await encode(
      'bind',
      [new Uint8Array([0, 0, 0, 1]), null],
      'portal',
      'stmt',
      [1],
      [1]
    ),
    new Uint8Array([
      66, 0, 0, 0, 38, 112, 111, 114, 116, 97, 108, 0, 115, 116, 109, 116, 0, 0,
      1, 0, 1, 0, 2, 0, 0, 0, 4, 0, 0, 0, 1, 255, 255, 255, 255, 0, 1, 0, 1,
    ])
  )
})

Deno.test('describe', async () => {
  assertEquals(
    await encode('describe', 'S', 'stmt'),
    new Uint8Array([68, 0, 0, 0, 10, 83, 115, 116, 109, 116, 0])
  )
})

Deno.test('execute', async () => {
  assertEquals(
    await encode('execute', 'stmt', 1),
    new Uint8Array([69, 0, 0, 0, 13, 115, 116, 109, 116, 0, 0, 0, 0, 1])
  )
})

Deno.test('close', async () => {
  assertEquals(
    await encode('close', 'S', 'stmt'),
    new Uint8Array([67, 0, 0, 0, 10, 83, 115, 116, 109, 116, 0])
  )
})

Deno.test('query', async () => {
  assertEquals(
    await encode('query', 'SELECT'),
    new Uint8Array([81, 0, 0, 0, 11, 83, 69, 76, 69, 67, 84, 0])
  )
})
