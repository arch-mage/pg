import { Encoder } from './encoder.ts'

export type Value = string | number | bigint | boolean | Date | null

export function encode(value: Value, enc?: Encoder): Uint8Array | null {
  enc = enc ?? new Encoder()
  if (typeof value === 'string') {
    return enc.reset().str(value).buff.slice()
  }
  if (typeof value === 'number') {
    return enc.reset().str(value.toString()).buff.slice()
  }
  if (typeof value === 'bigint') {
    return enc.reset().str(value.toString()).buff.slice()
  }
  if (typeof value === 'boolean') {
    return enc.reset().str(value.toString()).buff.slice()
  }
  if (value instanceof Date) {
    return enc.reset().str(value.toISOString()).buff.slice()
  }
  if (value === null) {
    return null
  }

  throw new TypeError(`invalid value type: ${value}`)
}
