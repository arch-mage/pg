import type {
  Reader,
  Writer,
} from 'https://deno.land/std@0.163.0/io/types.d.ts'
import { BufReader, BufWriter } from 'https://deno.land/std@0.163.0/io/mod.ts'
import { Encoder } from './encoder.ts'
import { decode } from './decoder.ts'
import { Param, Packet, Format } from './types.ts'

export interface Options {
  port: number
  host: string
  user: string
  database: string
}

export class Protocol implements AsyncIterableIterator<Packet> {
  #closed: boolean
  readonly #reader: BufReader
  readonly #writer: BufWriter
  readonly #encoder: Encoder

  public constructor(reader: Reader, writer: Writer, size = 4096) {
    this.#closed = false
    this.#reader = BufReader.create(reader, size)
    this.#writer = BufWriter.create(writer, size)
    this.#encoder = new Encoder()
  }

  public async startup(user: string, options: Record<string, string> = {}) {
    const buff = this.#encoder.reset().startup(user, options).view()
    await this.#writer.write(buff)
    await this.#writer.flush()
  }

  public async prepare(args: { query: string; name?: string }) {
    const buff = this.#encoder
      .reset()
      .parse(args.query, args.name)
      .sync()
      .view()
    await this.#writer.write(buff)
    await this.#writer.flush()
  }

  public async execute(
    args: { params?: Param[]; name?: string; formats?: Format[] } = {}
  ) {
    const buff = this.#encoder
      .reset()
      .bind(args.params, '', args.name, args.formats, args.formats)
      .describe('P')
      .execute()
      .sync()
      .view()
    await this.#writer.write(buff)
    await this.#writer.flush()
  }

  public async close(name = '') {
    const buff = this.#encoder.reset().close('S', name).sync().view()
    await this.#writer.write(buff)
    await this.#writer.flush()
  }

  public async terminate() {
    const buff = this.#encoder.reset().terminate().view()
    await this.#writer.write(buff)
    await this.#writer.flush()
  }

  public async query(query: string) {
    const buff = this.#encoder.reset().query(query).view()
    await this.#writer.write(buff)
    await this.#writer.flush()
  }

  public [Symbol.asyncIterator](): AsyncIterableIterator<Packet> {
    return this
  }

  public async read(): Promise<Packet | null> {
    if (this.#closed) {
      return null
    }
    const packet = await decode(this.#reader)
    if (packet) {
      return packet
    }
    this.#closed = true
    return null
  }

  public async next(): Promise<IteratorResult<Packet, void>> {
    const packet = await this.read()
    return packet
      ? { done: false, value: packet }
      : { done: true, value: undefined }
  }
}
