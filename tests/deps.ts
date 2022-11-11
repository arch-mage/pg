export {
  assertEquals,
  assertThrows,
  assertRejects,
} from 'https://deno.land/std@0.163.0/testing/asserts.ts'

export function uint8(...bytes: number[]) {
  return new Uint8Array(bytes)
}
