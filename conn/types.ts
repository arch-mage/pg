import type {
  BackendPacket,
  RowDescription,
} from '../decoder/packet-decoder.ts'
import type { FrontendPacket } from '../encoder/packet-encoder.ts'

export type Field = RowDescription['data'][number]
export type Writer = WritableStreamDefaultWriter<FrontendPacket>
export type Reader = ReadableStreamDefaultReader<BackendPacket>
export type Writable = WritableStream<FrontendPacket>
export type Readable = ReadableStream<BackendPacket>
export type RawValue = Uint8Array | null
export type ReadyState = 'I' | 'T' | 'E'

export interface Listener<T> {
  (evt: CustomEvent<T>): void | Promise<void>
}

export interface ListenerObject<T> {
  handleEvent(evt: CustomEvent<T>): void | Promise<void>
}

export type ListenerOrListenerObject<T> = Listener<T> | ListenerObject<T>
