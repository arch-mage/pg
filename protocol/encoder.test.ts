import { assertEquals, uint8 } from '../deps.ts'
import { Encoder } from './encoder.ts'

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
