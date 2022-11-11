export type {
  Reader,
  Writer,
} from 'https://deno.land/std@0.163.0/io/types.d.ts'
export {
  Buffer,
  BufReader,
  BufWriter,
  PartialReadError,
} from 'https://deno.land/std@0.163.0/io/mod.ts'
export { Buffer as NodeBuffer } from 'https://deno.land/std@0.163.0/node/buffer.ts'
export { concat, copy } from 'https://deno.land/std@0.163.0/bytes/mod.ts'
export {
  sizeof,
  varnum,
  putVarnum,
} from 'https://deno.land/std@0.163.0/encoding/binary.ts'

export * as base64 from 'https://deno.land/std@0.163.0/encoding/base64.ts'

// =============================================================================
// TESTING DEPS
// =============================================================================

export {
  assertEquals,
  assertThrows,
  assertRejects,
} from 'https://deno.land/std@0.163.0/testing/asserts.ts'

export function uint8(...bytes: number[]) {
  return new Uint8Array(bytes)
}
