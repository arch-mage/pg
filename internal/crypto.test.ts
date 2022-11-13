import { assertThrows } from '../testing.ts'
import { xorBuffer } from './crypto.ts'

Deno.test('xorBuffer', () => {
  assertThrows(
    () => xorBuffer(new Uint8Array([1]), new Uint8Array([])),
    TypeError,
    'mismatch array length'
  )
  assertThrows(
    () => xorBuffer(new Uint8Array([]), new Uint8Array([])),
    TypeError,
    'empty array'
  )
})
