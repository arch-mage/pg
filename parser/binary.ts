import { varnum, varbig } from '../deps.ts'

type Value = string | boolean | number | Date | bigint | Uint8Array

type Parser = (value: Uint8Array) => Value

export function int2(value: Uint8Array): number {
  return varnum(value, { endian: 'big', dataType: 'int16' }) as number
}

export function int4(value: Uint8Array): number {
  return varnum(value, { endian: 'big', dataType: 'int32' }) as number
}

export function int8(value: Uint8Array): bigint {
  return varbig(value, { endian: 'big', dataType: 'int64' }) as bigint
}

export function bool(value: Uint8Array): boolean {
  return value[0] !== 0
}

export function char(value: Uint8Array): string {
  return String.fromCharCode(value[0])
}

export function text(value: Uint8Array): string {
  return new TextDecoder().decode(value)
}

export function oid(value: Uint8Array): number {
  return varnum(value, { endian: 'big', dataType: 'uint32' }) as number
}

const EPOCH = 946684800000
export function timestamp(value: Uint8Array): Date {
  const num = varbig(value, { endian: 'big', dataType: 'int64' }) as bigint
  return new Date(Number(num / 1000n) + EPOCH)
}

const SIGN_POSITIVE = 0x0000
const SIGN_NEGATIVE = 0x4000
const SIGN_NAN = 0xc000

export function numericS(
  value: Uint8Array,
  digits: number,
  weight: number,
  sign: number,
  scale: number
): string {
  let int = ''
  let fra = ''

  for (let pos = 0; pos < digits * 2; pos += 2) {
    const digit = varnum(value.subarray(pos, pos + 2), {
      endian: 'big',
      dataType: 'int16',
    }) as number
    if (weight >= 0) {
      const part = digit.toString()
      int += pos ? part.padStart(4, '0') : part
    } else {
      fra = fra + digit.toString().padStart(4, '0')
    }
    weight--
  }

  while (weight >= 0) {
    int += '0000'
    weight--
  }
  const result = fra.length > 0 ? int + '.' + fra.slice(0, scale) : int

  if (sign === SIGN_NEGATIVE) {
    return '-' + result
  }

  return result
}

export function numericN(
  value: Uint8Array,
  digits: number,
  weight: number,
  sign: number
): number {
  let result = 0
  for (let pos = 0; pos < digits * 2; pos += 2) {
    const digit = varnum(value.subarray(pos, pos + 2), {
      endian: 'big',
      dataType: 'int16',
    }) as number
    result += digit * 10_000 ** weight--
  }

  return sign === SIGN_POSITIVE ? result : -result
}

export function numeric(value: Uint8Array): string
export function numeric(value: Uint8Array, mode: 'S'): string
export function numeric(value: Uint8Array, mode: 'N'): number
export function numeric(
  value: Uint8Array,
  mode: 'S' | 'N' = 'S'
): string | number {
  const digits = varnum(value.subarray(0, 2), {
    endian: 'big',
    dataType: 'int16',
  }) as number
  const weight = varnum(value.subarray(2, 4), {
    endian: 'big',
    dataType: 'int16',
  }) as number
  const sign = varnum(value.subarray(4, 6), {
    endian: 'big',
    dataType: 'int16',
  }) as number
  const scale = varnum(value.subarray(6, 8), {
    endian: 'big',
    dataType: 'int16',
  }) as number

  switch (sign) {
    case SIGN_POSITIVE:
      break
    case SIGN_NEGATIVE:
      break
    case SIGN_NAN:
      throw new TypeError('sign value is NaN')
    default:
      throw new TypeError(
        `invalid numeric sign: 0x${sign.toString(16).padStart(4)}`
      )
  }

  return mode === 'S'
    ? numericS(value.subarray(8, 8 + digits * 2), digits, weight, sign, scale)
    : numericN(value.subarray(8, 8 + digits * 2), digits, weight, sign)
}

export const parsers = new Map<number, Parser>([
  [16, bool],
  [18, char],
  [19, text], // name
  [21, int2],
  [20, int8],
  [23, int4],
  [24, oid], // regproc
  [25, text],
  [26, oid],
  [1114, timestamp], // timestamp
  [1184, timestamp], // timestamptz
  [1700, numeric],
])

export function parse(oid: number, raw: Uint8Array | null): Value | null {
  if (!raw) {
    return raw
  }
  const parser = parsers.get(oid)
  if (!parser) {
    throw new TypeError(`not implemented: oid ${oid}`)
  }
  return parser(raw)
}
