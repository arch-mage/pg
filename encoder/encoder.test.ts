import { assertEquals, uint8 } from '../testing.ts'
import { Encoder } from './encoder.ts'

Deno.test('(u)int8', () => {
  assertEquals(new Encoder(2).uint8(1).int8(-1).buff, uint8(1, 255))
})

Deno.test('(u)int16', () => {
  assertEquals(new Encoder(2).uint16(1).int16(-1).buff, uint8(0, 1, 255, 255))
})

Deno.test('(u)int32', () => {
  assertEquals(
    new Encoder(2).uint32(1).int32(-1).buff,
    uint8(0, 0, 0, 1, 255, 255, 255, 255)
  )
})

Deno.test('(u)int64', () => {
  assertEquals(
    new Encoder(2).uint64(1n).int64(-1n).buff,
    uint8(0, 0, 0, 0, 0, 0, 0, 1, 255, 255, 255, 255, 255, 255, 255, 255)
  )
})

Deno.test('bytes', () => {
  assertEquals(
    new Encoder(2).bytes(uint8(0, 1)).bytes(uint8(2, 3)).buff,
    uint8(0, 1, 2, 3)
  )
})

Deno.test('char', () => {
  assertEquals(new Encoder(2).char('ab').char('cd').buff, uint8('ac'))
})

Deno.test('str', () => {
  assertEquals(new Encoder(2).str('ab').str('cd').buff, uint8('abcd'))
})

Deno.test('cstr', () => {
  assertEquals(new Encoder(2).cstr('a').cstr('b').buff, uint8(97, 0, 98, 0))
})

Deno.test('alloc', () => {
  const enc = new Encoder()
  enc.char('a')
  const buf = enc.alloc(4)
  enc.char('b')
  buf.set(uint8(255, 255, 255, 255))
  assertEquals(enc.buff, uint8(97, 255, 255, 255, 255, 98))
})

Deno.test('reset', () => {
  const enc = new Encoder()
  enc.uint32(1)
  assertEquals(enc.buff, uint8(0, 0, 0, 1))
  assertEquals(enc.pos, 4)
  enc.reset().uint8(1)
  assertEquals(enc.buff, uint8(1))
  assertEquals(enc.pos, 1)
})
