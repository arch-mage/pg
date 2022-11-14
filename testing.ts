import type { BackendPacket } from './decoder/packet-decoder.ts'

export {
  assertEquals,
  assertThrows,
  assertRejects,
} from 'https://deno.land/std@0.164.0/testing/asserts.ts'
export {
  spy,
  assertSpyCalls,
  assertSpyCallArg,
} from 'https://deno.land/std@0.164.0/testing/mock.ts'

export function uint8(...bytes: Array<string | number | number[]>) {
  return new Uint8Array(
    bytes.flatMap((chunk) => {
      if (Array.isArray(chunk)) {
        return chunk
      }
      if (typeof chunk === 'number') {
        return [chunk]
      }
      return [...new TextEncoder().encode(chunk)]
    })
  )
}

export function packets(
  packets: BackendPacket[]
): ReadableStream<BackendPacket> {
  return new ReadableStream({
    pull(controller) {
      const packet = packets.shift()
      if (packet) {
        controller.enqueue(packet)
      } else {
        controller.close()
      }
    },
  })
}
