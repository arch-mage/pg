import { Decoder } from '../decoder.ts'
import { PartialReadError, Buffer, BufReader, putVarnum } from '../deps.ts'
import { ProtocolError } from '../error.ts'
import { assertRejects, assertEquals, assertThrows } from './deps.ts'

async function init(code: string, buff: number[]) {
  const head = new Uint8Array(5)
  head[0] = code.charCodeAt(0)
  putVarnum(head.subarray(1), buff.length + 4)
  const reader = new BufReader(new Buffer([...head, ...buff]))
  const dec = new Decoder()
  await dec.readPacket(reader)
  return dec
}

Deno.test('insufficient', async () => {
  const dec = new Decoder(2)
  const buff = new Buffer([0x41, 0x00, 0x00, 0x00, 0x10])
  await assertRejects(
    () => dec.readPacket(new BufReader(buff)),
    ProtocolError,
    'insufficient data to read'
  )
})

Deno.test('partial read', async () => {
  const dec = new Decoder(2)
  const buff = new Buffer([0x41, 0x00, 0x00, 0x00, 0x10, 0x00])
  await assertRejects(
    () => dec.readPacket(new BufReader(buff)),
    PartialReadError
  )
})

Deno.test('int16', async () => {
  const dec = await init('A', [0x00, 0x01, 0x00])
  assertEquals(dec.int16(), 1)
  assertThrows(() => dec.int16(), ProtocolError, 'not int16')
})

Deno.test('int32', async () => {
  const dec = await init('A', [0x00, 0x00, 0x00, 0x01, 0x00])
  assertEquals(dec.int32(), 1)
  assertThrows(() => dec.int32(), ProtocolError, 'not int32')
})

Deno.test('bytes', async () => {
  const dec = await init('A', [0x00, 0x00, 0x00])
  assertEquals(dec.bytes(2), new Uint8Array([0x00, 0x00]))
  assertThrows(() => dec.bytes(2), ProtocolError, 'not a buff with length of 2')
})

Deno.test('byte', async () => {
  const dec = await init('A', [0x00])
  assertEquals(dec.byte(), 0)
  assertThrows(() => dec.byte(), ProtocolError, 'not byte')
})

Deno.test('cstr', async () => {
  const dec = await init('A', [0x00, 0x41, 0x00, 0x42])
  assertEquals(dec.cstr(), '')
  assertEquals(dec.cstr(), 'A')
  assertThrows(() => dec.cstr(), ProtocolError, 'not cstr')
})

Deno.test('str', async () => {
  const dec = await init('A', [0x41, 0x00, 0x42, 0x43])
  assertEquals(dec.str(), 'A')
  assertThrows(() => dec.str(), ProtocolError, 'empty string')
  dec.byte()
  assertEquals(dec.str(), 'BC')
  assertThrows(() => dec.str(), ProtocolError, 'empty string')
})
