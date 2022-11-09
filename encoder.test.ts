import {
  assertEquals,
  assertThrows,
} from 'https://deno.land/std@0.163.0/testing/asserts.ts'

import { Encoder } from './encoder.ts'

Deno.test('size', () => {
  assertThrows(() => new Encoder(1))
  assertThrows(() => new Encoder(0))
})

Deno.test('str', () => {
  const enc = new Encoder(3)
  assertEquals(enc.str('ab').view(), new Uint8Array([97, 98]))
  assertEquals(enc.str('cd').view(), new Uint8Array([97, 98, 99, 100]))
})

Deno.test('cstr', () => {
  const enc = new Encoder()
  assertEquals(enc.cstr('a').view(), new Uint8Array([97, 0]))
  assertEquals(enc.cstr('bc').view(), new Uint8Array([97, 0, 98, 99, 0]))
})

Deno.test('byte', () => {
  const enc = new Encoder()
  assertEquals(enc.byte(1).view(), new Uint8Array([1]))
  enc.reset()
  assertEquals(enc.byte(-1).view(), new Uint8Array([0xff]))
})

Deno.test('int16', () => {
  const enc = new Encoder()
  assertEquals(enc.int16(1).view(), new Uint8Array([0, 1]))
  enc.reset()
  assertEquals(enc.int16(-1).view(), new Uint8Array([0xff, 0xff]))
})

Deno.test('int32', () => {
  const enc = new Encoder()
  assertEquals(enc.int32(1).view(), new Uint8Array([0, 0, 0, 1]))
  enc.reset()
  assertEquals(enc.int32(-1).view(), new Uint8Array([0xff, 0xff, 0xff, 0xff]))
  enc.reset()
  assertEquals(enc.int32(196608).view(), new Uint8Array([0, 3, 0, 0]))
})

Deno.test('startup', () => {
  assertEquals(
    Encoder.startup('user', { database: 'db' }).view(),
    new Uint8Array([
      0, 0, 0, 31, 0, 3, 0, 0, 117, 115, 101, 114, 0, 117, 115, 101, 114, 0,
      100, 97, 116, 97, 98, 97, 115, 101, 0, 100, 98, 0, 0,
    ])
  )
})

Deno.test('sync', () => {
  assertEquals(Encoder.sync().view(), new Uint8Array([83, 0, 0, 0, 4]))
})

Deno.test('terminate', () => {
  assertEquals(Encoder.terminate().view(), new Uint8Array([88, 0, 0, 0, 4]))
})

Deno.test('parse', () => {
  assertEquals(
    Encoder.parse('SELECT', 'stmt').view(),
    new Uint8Array([
      80, 0, 0, 0, 18, 115, 116, 109, 116, 0, 83, 69, 76, 69, 67, 84, 0, 0, 0,
    ])
  )
})

Deno.test('bind', () => {
  assertEquals(
    Encoder.bind([1, null], 'portal', 'stmt', [1], [1]).view(),
    new Uint8Array([
      66, 0, 0, 0, 35, 112, 111, 114, 116, 97, 108, 0, 115, 116, 109, 116, 0, 0,
      1, 0, 1, 0, 2, 0, 0, 0, 1, 49, 255, 255, 255, 255, 0, 1, 0, 1,
    ])
  )
})

Deno.test('describe', () => {
  assertEquals(
    Encoder.describe('S', 'stmt').view(),
    new Uint8Array([68, 0, 0, 0, 10, 83, 115, 116, 109, 116, 0])
  )
})

Deno.test('execute', () => {
  assertEquals(
    Encoder.execute('stmt', 1).view(),
    new Uint8Array([69, 0, 0, 0, 13, 115, 116, 109, 116, 0, 0, 0, 0, 1])
  )
})

Deno.test('execute', () => {
  assertEquals(
    Encoder.close('S', 'stmt').view(),
    new Uint8Array([67, 0, 0, 0, 10, 83, 115, 116, 109, 116, 0])
  )
})

Deno.test('query', () => {
  assertEquals(
    Encoder.query('SELECT').view(),
    new Uint8Array([81, 0, 0, 0, 11, 83, 69, 76, 69, 67, 84, 0])
  )
})
