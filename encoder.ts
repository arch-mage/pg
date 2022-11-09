import { Buffer } from 'https://deno.land/std@0.163.0/node/buffer.ts'
import { concat } from 'https://deno.land/std@0.163.0/bytes/mod.ts'
import { putVarnum } from 'https://deno.land/std@0.163.0/encoding/binary.ts'
import { Format, Param } from './types.ts'

export class Encoder {
  #buffer: Uint8Array
  #pos: number
  readonly #encoder: TextEncoder

  public constructor(size: number = 4096) {
    if (size < 2) {
      throw new TypeError('size must be greater than 2')
    }
    this.#pos = 0
    this.#buffer = new Uint8Array(size)
    this.#encoder = new TextEncoder()
  }

  public reset() {
    this.#pos = 0
    return this
  }

  private ensure(size: number) {
    if (this.#buffer.length - this.#pos >= size) {
      return this
    }
    const grow = Math.max(size, Math.floor(this.#buffer.length / 2))
    this.#buffer = concat(this.#buffer, new Uint8Array(grow))
    return this
  }

  public view(begin?: number, end?: number): Uint8Array {
    return this.#buffer.subarray(0, this.#pos).subarray(begin, end)
  }

  public str(ch: string): this {
    const len = Buffer.byteLength(ch)
    this.ensure(len)
    this.#encoder.encodeInto(
      ch,
      this.#buffer.subarray(this.#pos, this.#pos + len)
    )
    this.#pos += len
    return this
  }

  public cstr(ch: string): this {
    const len = Buffer.byteLength(ch)
    this.ensure(len + 1)
    this.#encoder.encodeInto(
      ch,
      this.#buffer.subarray(this.#pos, this.#pos + len)
    )
    this.#pos += len
    this.#buffer[this.#pos] = 0
    this.#pos += 1
    return this
  }

  public byte(num: number): this {
    this.ensure(1)
    putVarnum(this.#buffer.subarray(this.#pos, this.#pos + 1), num, {
      endian: 'big',
      dataType: 'uint8',
    })
    this.#pos += 1
    return this
  }

  public int16(num: number): this {
    this.ensure(2)
    putVarnum(this.#buffer.subarray(this.#pos, this.#pos + 2), num, {
      endian: 'big',
      dataType: 'int16',
    })
    this.#pos += 2
    return this
  }

  public int32(num: number): this {
    this.ensure(4)
    putVarnum(this.#buffer.subarray(this.#pos, this.#pos + 4), num, {
      endian: 'big',
      dataType: 'int32',
    })
    this.#pos += 4
    return this
  }

  public static startup(
    user: string,
    options: Record<string, string> = {}
  ): Encoder {
    return new Encoder().startup(user, options)
  }

  public startup(user: string, options: Record<string, string> = {}): this {
    const pos = this.#pos
    this.int32(0) // allocate
    this.int32(196608)
    this.cstr('user').cstr(user)
    for (const [key, val] of Object.entries(options)) {
      this.cstr(key).cstr(val)
    }
    this.byte(0)
    putVarnum(this.#buffer.subarray(pos, pos + 4), this.#pos - pos, {
      endian: 'big',
      dataType: 'int32',
    })
    return this
  }

  public static sync(): Encoder {
    return new Encoder().sync()
  }

  public sync(): this {
    this.str('S')
    const pos = this.#pos
    this.int32(0) // allocate
    putVarnum(this.#buffer.subarray(pos, pos + 4), this.#pos - pos, {
      endian: 'big',
      dataType: 'int32',
    })
    return this
  }

  public static terminate(): Encoder {
    return new Encoder().terminate()
  }

  public terminate(): this {
    this.str('X')
    const pos = this.#pos
    this.int32(0) // allocate
    putVarnum(this.#buffer.subarray(pos, pos + 4), this.#pos - pos, {
      endian: 'big',
      dataType: 'int32',
    })
    return this
  }

  public static parse(query: string, name = ''): Encoder {
    return new Encoder().parse(query, name)
  }

  public parse(query: string, name = ''): this {
    this.str('P')
    const pos = this.#pos
    this.int32(0) // allocate
    this.cstr(name).cstr(query).int16(0)
    putVarnum(this.#buffer.subarray(pos, pos + 4), this.#pos - pos, {
      endian: 'big',
      dataType: 'int32',
    })
    return this
  }

  public static bind(
    params: Param[] = [],
    portal = '',
    stmt = '',
    paramFormat: Format[] = [],
    resultFormat: Format[] = []
  ): Encoder {
    return new Encoder().bind(params, portal, stmt, paramFormat, resultFormat)
  }

  public bind(
    params: Param[] = [],
    portal = '',
    stmt = '',
    paramFormat: Format[] = [],
    resultFormat: Format[] = []
  ): this {
    this.str('B')
    const pos = this.#pos
    this.int32(0) // allocate

    this.cstr(portal).cstr(stmt)

    this.int16(paramFormat.length)
    for (const fmt of paramFormat) {
      this.int16(fmt)
    }

    this.int16(params.length)
    for (const param of params) {
      if (param === null) {
        this.int32(-1)
      } else {
        const value = param.toString()
        this.int32(Buffer.byteLength(value))
        this.str(value)
      }
    }

    this.int16(resultFormat.length)
    for (const fmt of resultFormat) {
      this.int16(fmt)
    }

    putVarnum(this.#buffer.subarray(pos, pos + 4), this.#pos - pos, {
      endian: 'big',
      dataType: 'int32',
    })
    return this
  }

  public static describe(kind: 'S' | 'P', name = ''): Encoder {
    return new Encoder().describe(kind, name)
  }

  public describe(kind: 'S' | 'P', name = ''): this {
    this.str('D')
    const pos = this.#pos
    this.int32(0) // allocate

    this.byte(kind.charCodeAt(0)).cstr(name)

    putVarnum(this.#buffer.subarray(pos, pos + 4), this.#pos - pos, {
      endian: 'big',
      dataType: 'int32',
    })
    return this
  }

  public static execute(name = '', max = 0): Encoder {
    return new Encoder().execute(name, max)
  }

  public execute(name = '', max = 0): this {
    this.str('E')
    const pos = this.#pos
    this.int32(0) // allocate

    this.cstr(name).int32(max)

    putVarnum(this.#buffer.subarray(pos, pos + 4), this.#pos - pos, {
      endian: 'big',
      dataType: 'int32',
    })
    return this
  }

  public static close(kind: 'S' | 'P', name = ''): Encoder {
    return new Encoder().close(kind, name)
  }

  public close(kind: 'S' | 'P', name = ''): this {
    this.str('C')
    const pos = this.#pos
    this.int32(0) // allocate

    this.byte(kind.charCodeAt(0)).cstr(name)

    putVarnum(this.#buffer.subarray(pos, pos + 4), this.#pos - pos, {
      endian: 'big',
      dataType: 'int32',
    })
    return this
  }

  public static query(query: string): Encoder {
    return new Encoder().query(query)
  }

  public query(query: string): this {
    this.str('Q')
    const pos = this.#pos
    this.int32(0) // allocate

    this.cstr(query)

    putVarnum(this.#buffer.subarray(pos, pos + 4), this.#pos - pos, {
      endian: 'big',
      dataType: 'int32',
    })
    return this
  }
}
