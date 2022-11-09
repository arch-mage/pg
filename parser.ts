import {
  varnum,
  varbig,
} from 'https://deno.land/std@0.163.0/encoding/binary.ts'
import { Decoder } from './decoder.ts'

const EPOCH = 946_684_800_000n

// deno-lint-ignore no-explicit-any
export const parsers = new Map<number, (value: Uint8Array) => any>()

export function parse<T = unknown>(oid: number, value: Uint8Array): T {
  const parser = parsers.get(oid)
  if (!parser) {
    throw new TypeError(`unable to parse type of oid ${oid}`)
  }
  return parser(value)
}

parsers.set(23, int4)
parsers.set(25, text)
parsers.set(1184, timestamptz)
parsers.set(1700, numeric)

function int4(value: Uint8Array): number {
  return varnum(value, { dataType: 'int32', endian: 'big' }) as number
}

function text(value: Uint8Array): string {
  return new TextDecoder().decode(value)
}

function timestamptz(value: Uint8Array): Date {
  const num = varbig(value, { endian: 'big', dataType: 'int64' }) as bigint
  return new Date(Number(num / 1_000n + EPOCH))
}

// string should be safer, but ...
function numeric(value: Uint8Array): number {
  const decoder = new Decoder(value)
  const digits = decoder.int16()
  const weight = decoder.int16()
  const sign = decoder.int16()
  decoder.int16() // scale
  let num = 0
  for (let i = 0; i < digits; ++i) {
    num += decoder.int16() * 10_000 ** weight
  }
  return sign === 0x4000 ? -num : num
}
