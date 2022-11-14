import { assertEquals, assertThrows, uint8 } from '../testing.ts'
import { DecodeError } from '../errors.ts'
import { Decoder } from './decoder.ts'

Deno.test('(u)int8', () => {
  const dec = new Decoder(uint8(255, 255))
  assertEquals(dec.int8(), -1)
  assertEquals(dec.uint8(), 0xff)
  assertThrows(() => dec.int8(), DecodeError, 'not an int8')
  assertThrows(() => dec.uint8(), DecodeError, 'not an uint8')
})

Deno.test('(u)int16', () => {
  const dec = new Decoder(uint8(255, 255, 255, 255))
  assertEquals(dec.int16(), -1)
  assertEquals(dec.uint16(), 0xffff)
  assertThrows(() => dec.int16(), DecodeError, 'not an int16')
  assertThrows(() => dec.uint16(), DecodeError, 'not an uint16')
})

Deno.test('(u)int32', () => {
  const dec = new Decoder(uint8(255, 255, 255, 255, 255, 255, 255, 255))
  assertEquals(dec.int32(), -1)
  assertEquals(dec.uint32(), 0xffffffff)
  assertThrows(() => dec.int32(), DecodeError, 'not an int32')
  assertThrows(() => dec.uint32(), DecodeError, 'not an uint32')
})

Deno.test('(u)int64', () => {
  // prettier-ignore
  const dec = new Decoder(uint8(255, 255, 255, 255, 255, 255, 255, 255,
                                255, 255, 255, 255, 255, 255, 255, 255))
  assertEquals(dec.int64(), -1n)
  assertEquals(dec.uint64(), 0xffffffffffffffffn)
  assertThrows(() => dec.int64(), DecodeError, 'not an int64')
  assertThrows(() => dec.uint64(), DecodeError, 'not an uint64')
})

Deno.test('bytes', () => {
  const dec = new Decoder(uint8(0x00, 0x00, 0x00))
  assertEquals(dec.bytes(2), uint8(0x00, 0x00))
  assertThrows(() => dec.bytes(2), DecodeError, 'not a bytes with length of 2')
})

Deno.test('char', () => {
  const dec = new Decoder(uint8(0x41))
  assertEquals(dec.char(), 'A')
  assertThrows(() => dec.char(), DecodeError, 'not a char')
})

Deno.test('cstr', () => {
  const dec = new Decoder(uint8(0x00, 0x41, 0x00, 0x42))
  assertEquals(dec.cstr(), '')
  assertEquals(dec.cstr(), 'A')
  assertThrows(() => dec.cstr(), DecodeError, 'not a null terminated string')
})

Deno.test('str', () => {
  const dec = new Decoder(uint8(0x41, 0x00, 0x42, 0x43))
  assertEquals(dec.str(), 'A')
  assertThrows(() => dec.str(), DecodeError, 'not a string')
  dec.uint8()
  assertEquals(dec.str(), 'BC')
  assertThrows(() => dec.str(), DecodeError, 'not a string')
})

Deno.test('feed', () => {
  const dec = new Decoder()
  assertThrows(() => dec.uint8())
  dec.feed(uint8(1, 0, 0, 0))
  assertEquals(dec.uint8(), 1)
  assertThrows(() => dec.uint32())
  dec.feed(uint8(1))
  assertEquals(dec.uint32(), 1)
})
