import { BackendPacket } from '../decoder/packet-decoder.ts'
import { FrontendPacket } from '../encoder/packet-encoder.ts'
import { extract } from './extract.ts'

export class Stream {
  readonly #writer: WritableStreamDefaultWriter<FrontendPacket[]>
  readonly #reader: ReadableStreamDefaultReader<BackendPacket>
  readonly #release: (state: null | 'I' | 'E' | 'T') => void

  constructor(
    writer: WritableStreamDefaultWriter<FrontendPacket[]>,
    reader: ReadableStreamDefaultReader<BackendPacket>,
    release: (state: null | 'I' | 'E' | 'T') => void
  ) {
    this.#writer = writer
    this.#reader = reader
    this.#release = release
  }

  send(packet: FrontendPacket[]) {
    return this.#writer.write(packet)
  }

  async recv() {
    return extract(await this.#reader.read())
  }

  next() {
    return this.#reader.read()
  }

  release(state: null | 'I' | 'E' | 'T') {
    this.#writer.releaseLock()
    this.#reader.releaseLock()
    this.#release(state)
  }

  [Symbol.asyncIterator]() {
    return this
  }
}
