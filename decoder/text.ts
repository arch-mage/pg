import { RowDescription } from './packet-decoder.ts'

export const enum Types {
  bool = 16,
  bytea = 17,
  char = 18,
  name = 19,
  int8 = 20,
  int2 = 21,
  int4 = 23,
  regproc = 24,
  text = 25,
  oid = 26,
  json = 114,
  jsonb = 3802,
  timestamp = 1114,
  timestamptz = 1184,
}

export function decode(
  value: Uint8Array | null,
  field: RowDescription['data'][number]
): unknown {
  if (!value) {
    return null
  }
  switch (field.oid) {
    case Types.bytea:
      return value
    case Types.bool:
      return toStr(value) === 't'
    case Types.char:
    case Types.name:
    case Types.text:
      return toStr(value)
    case Types.int2:
    case Types.int4:
    case Types.regproc:
    case Types.oid:
      return parseInt(toStr(value), 10)
    case Types.json:
    case Types.jsonb:
      return JSON.parse(toStr(value))
    case Types.int8:
      return BigInt(toStr(value))
    case Types.timestamp:
    case Types.timestamptz:
      return new Date(toStr(value))
    default:
      return toStr(value)
  }
}

function toStr(value: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(value)
}
