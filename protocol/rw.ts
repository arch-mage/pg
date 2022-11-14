import { Reader, Writer, BufReader, BufWriter } from '../deps.ts'
import { FrontendPacket, BackendPacket, Protocol } from '../types.ts'
import { PacketEncoder } from './encoder.ts'
import { PacketDecoder } from './decoder.ts'

export class ReadWriteProtocol implements Protocol {
  #enc: PacketEncoder
  #dec: PacketDecoder
  #rd: BufReader
  #wd: BufWriter
  #closed: boolean

  static fromPair(reader: Reader, writer: Writer, size = 4096) {
    return new ReadWriteProtocol(reader, writer, size)
  }

  static fromConn(conn: Reader & Writer, size = 4096) {
    return new ReadWriteProtocol(conn, conn, size)
  }

  constructor(reader: Reader, writer: Writer, size = 4096) {
    this.#enc = new PacketEncoder(size)
    this.#dec = new PacketDecoder()
    this.#rd = BufReader.create(reader, size)
    this.#wd = BufWriter.create(writer, size)
    this.#closed = false
  }

  async send(...packets: FrontendPacket[]): Promise<void> {
    this.#enc.reset()
    for (const packet of packets) {
      this.#enc.encode(packet)
    }
    await this.#wd.write(this.#enc.buff as Uint8Array)
    await this.#wd.flush()
  }

  async recv(): Promise<BackendPacket | null> {
    if (this.#closed) {
      return null
    }
    const packet = this.#dec.decode()
    if (packet) {
      return packet
    }

    const buff = new Uint8Array(65535)
    const len = await this.#rd.read(buff)
    if (typeof len !== 'number') {
      return null
    }
    this.#dec.feed(buff.subarray(0, len))
    return this.#dec.decode()
  }
}
