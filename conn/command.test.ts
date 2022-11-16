// deno-lint-ignore-file no-explicit-any
import {
  assertEquals,
  assertRejects,
  assertSpyCallArg,
  assertSpyCalls,
  packets,
  spy,
} from '../testing.ts'
import { BackendPacket } from '../decoder/packet-decoder.ts'
import { Stream } from './stream.ts'
import { FrontendPacket, PacketEncoder } from '../encoder/packet-encoder.ts'
import { noop } from '../utils.ts'
import { Command } from './command.ts'
import { PostgresError, UnexpectedBackendPacket } from '../errors.ts'

type Release = (state: null | 'I' | 'E' | 'T') => void

function createStream(packs: BackendPacket[]): Stream
function createStream(packs: BackendPacket[], buff: number[]): Stream
function createStream(packs: BackendPacket[], release: Release): Stream
function createStream(
  packs: BackendPacket[],
  buff: number[],
  release: Release
): Stream
function createStream(
  packs: BackendPacket[],
  wbuff?: number[] | Release,
  done?: Release
): Stream {
  const buff = Array.isArray(wbuff) ? wbuff : []
  const release =
    typeof wbuff === 'function'
      ? wbuff
      : typeof done === 'function'
      ? done
      : noop
  const enc = new PacketEncoder()
  const readable = packets(packs)
  const writable = new WritableStream<FrontendPacket[]>({
    write(chunk, controller) {
      try {
        enc.reset()
        chunk.forEach(enc.encode.bind(enc))
        buff.push(...enc.buff)
      } catch (error) {
        controller.error(error)
      }
    },
  })
  return new Stream(writable.getWriter(), readable.getReader(), release)
}

Deno.test('init error', async () => {
  const release = spy()
  const packets: BackendPacket[] = [{ code: '1' }, { code: '2' }, { code: '3' }]
  const stream = createStream(packets, release)
  const command = Command.create('', [], Promise.resolve(stream))
  await assertRejects(
    () => command,
    UnexpectedBackendPacket,
    'unexpected backend packet: 3. expected: T, n'
  )
  assertEquals(packets, [])
  assertSpyCalls(release, 1)
  assertSpyCallArg(release, 0, 0, null)
})

Deno.test('init send error', async () => {
  const writable = new WritableStream<FrontendPacket[]>({
    write() {
      throw new Error('failed')
    },
  })
  const release = spy()
  const stream = new Stream(
    writable.getWriter(),
    packets([]).getReader(),
    release
  )
  const command = Command.create('', [], Promise.resolve(stream))
  await assertRejects(() => command, Error, 'failed')
})

Deno.test('await error (before command complete)', async () => {
  const release = spy()
  const packets: BackendPacket[] = [
    { code: '1' },
    { code: '2' },
    { code: 'T', data: [] },
    { code: 'D', data: [] },
    { code: '1' },
    { code: 'Z', data: 'I' },
  ]
  const stream = createStream(packets, release)
  const command = Command.create('', [], Promise.resolve(stream))
  await assertRejects(
    () => command,
    UnexpectedBackendPacket,
    'unexpected backend packet: 1. expected: C, D'
  )
  assertEquals(packets, [])
  assertSpyCalls(release, 1)
  assertSpyCallArg(release, 0, 0, 'I')
})

Deno.test('await error (after command complete)', async () => {
  const release = spy()
  const packets: BackendPacket[] = [
    { code: '1' },
    { code: '2' },
    { code: 'T', data: [] },
    { code: 'D', data: [] },
    { code: 'C', data: '' },
    { code: '1' },
    { code: 'Z', data: 'I' },
  ]
  const stream = createStream(packets, release)
  const command = Command.create('', [], Promise.resolve(stream))
  await assertRejects(
    () => command,
    UnexpectedBackendPacket,
    'unexpected backend packet: 1. expected: 3'
  )
  assertEquals(packets, [])
  assertSpyCalls(release, 1)
  assertSpyCallArg(release, 0, 0, 'I')
})

Deno.test('await error (after close complete)', async () => {
  const release = spy()
  const packets: BackendPacket[] = [
    { code: '1' },
    { code: '2' },
    { code: 'T', data: [] },
    { code: 'D', data: [] },
    { code: 'C', data: '' },
    { code: '3' },
    { code: 'E', data: { M: 'error' } },
    { code: 'Z', data: 'E' },
  ]
  const stream = createStream(packets, release)
  const command = Command.create('', [], Promise.resolve(stream))
  await assertRejects(() => command, PostgresError, 'error')
  assertEquals(packets, [])
  assertSpyCalls(release, 1)
  assertSpyCallArg(release, 0, 0, 'E')
})

Deno.test('await data', async () => {
  const release = spy()
  const packets: BackendPacket[] = [
    { code: '1' },
    { code: '2' },
    { code: 'T', data: [] },
    { code: 'D', data: [] },
    { code: 'D', data: [] },
    { code: 'C', data: '' },
    { code: '3' },
    { code: 'Z', data: 'I' },
  ]
  const stream = createStream(packets, release)
  const command = Command.create('', [], Promise.resolve(stream))
  assertEquals(await command, [
    [[], []],
    [[], []],
  ])
  assertEquals(await command, null)
  assertEquals(packets, [])
  assertSpyCalls(release, 1)
  assertSpyCallArg(release, 0, 0, 'I')
})

Deno.test('await no data', async () => {
  const release = spy()
  const packets: BackendPacket[] = [
    { code: '1' },
    { code: '2' },
    { code: 'n' },
    { code: 'C', data: '' },
    { code: '3' },
    { code: 'Z', data: 'I' },
  ]
  const stream = createStream(packets, release)
  const command = Command.create('', [], Promise.resolve(stream))
  assertEquals(await command, null)
  assertEquals(await command, null)
  assertEquals(packets, [])
  assertSpyCalls(release, 1)
  assertSpyCallArg(release, 0, 0, 'I')
})

Deno.test('iter error (before command complete)', async () => {
  const release = spy()
  const packets: BackendPacket[] = [
    { code: '1' },
    { code: '2' },
    { code: 'T', data: [] },
    { code: 'D', data: [] },
    { code: '1' },
    { code: 'Z', data: 'I' },
  ]
  const stream = createStream(packets, release)
  const command = Command.create('', [], Promise.resolve(stream))
  assertEquals(await command.next(), { done: false, value: [[], []] })
  await assertRejects(
    () => command.next(),
    UnexpectedBackendPacket,
    'unexpected backend packet: 1. expected: C, D'
  )
  assertEquals(packets, [])
  assertSpyCalls(release, 1)
  assertSpyCallArg(release, 0, 0, 'I')
  assertEquals(await command.next(), { done: true, value: null })
})

Deno.test('iter error (after command complete)', async () => {
  const release = spy()
  const packets: BackendPacket[] = [
    { code: '1' },
    { code: '2' },
    { code: 'T', data: [] },
    { code: 'D', data: [] },
    { code: 'C', data: '' },
    { code: '1' },
    { code: 'Z', data: 'I' },
  ]
  const stream = createStream(packets, release)
  const command = Command.create('', [], Promise.resolve(stream))
  assertEquals(await command.next(), { done: false, value: [[], []] })
  await assertRejects(
    () => command.next(),
    UnexpectedBackendPacket,
    'unexpected backend packet: 1. expected: 3'
  )
  assertEquals(packets, [])
  assertSpyCalls(release, 1)
  assertSpyCallArg(release, 0, 0, 'I')
  assertEquals(await command.next(), { done: true, value: null })
})

Deno.test('iter error (after close complete)', async () => {
  const release = spy()
  const packets: BackendPacket[] = [
    { code: '1' },
    { code: '2' },
    { code: 'T', data: [] },
    { code: 'D', data: [] },
    { code: 'C', data: '' },
    { code: '3' },
    { code: 'E', data: { M: 'error' } },
    { code: 'Z', data: 'E' },
  ]
  const stream = createStream(packets, release)
  const command = Command.create('', [], Promise.resolve(stream))
  assertEquals(await command.next(), { done: false, value: [[], []] })
  await assertRejects(() => command.next(), PostgresError, 'error')
  assertEquals(packets, [])
  assertSpyCalls(release, 1)
  assertSpyCallArg(release, 0, 0, 'E')
  assertEquals(await command.next(), { done: true, value: null })
})

Deno.test('iter data', async () => {
  const release = spy()
  const packets: BackendPacket[] = [
    { code: '1' },
    { code: '2' },
    { code: 'T', data: [] },
    { code: 'D', data: [] },
    { code: 'D', data: [] },
    { code: 'C', data: '' },
    { code: '3' },
    { code: 'Z', data: 'I' },
  ]
  const stream = createStream(packets, release)
  const command = Command.create('', [], Promise.resolve(stream))
  assertEquals(await command.next(), { done: false, value: [[], []] })
  assertEquals(await command.next(), { done: false, value: [[], []] })
  assertEquals(await command.next(), { done: true, value: null })
  assertEquals(await command.next(), { done: true, value: null })
  assertEquals(packets, [])
  assertSpyCalls(release, 1)
  assertSpyCallArg(release, 0, 0, 'I')
})

Deno.test('await no data', async () => {
  const release = spy()
  const packets: BackendPacket[] = [
    { code: '1' },
    { code: '2' },
    { code: 'n' },
    { code: 'C', data: '' },
    { code: '3' },
    { code: 'Z', data: 'I' },
  ]
  const stream = createStream(packets, release)
  const command = Command.create('', [], Promise.resolve(stream))
  assertEquals(await command.next(), { done: true, value: null })
  assertEquals(await command.next(), { done: true, value: null })
  assertEquals(packets, [])
  assertSpyCalls(release, 1)
  assertSpyCallArg(release, 0, 0, 'I')
})

Deno.test('promise api catch', async () => {
  const catcher = spy((error: any) => error.message)
  const release = spy()
  const packets: BackendPacket[] = [
    { code: '1' },
    { code: '2' },
    { code: 'T', data: [] },
    { code: 'D', data: [] },
    { code: '1' },
    { code: 'Z', data: 'I' },
  ]
  const stream = createStream(packets, release)
  const command = Command.create('', [], Promise.resolve(stream))
  assertEquals(
    await command.catch(catcher),
    'unexpected backend packet: 1. expected: C, D'
  )
  assertEquals(packets, [])
  assertSpyCalls(catcher, 1)
  assertSpyCalls(release, 1)
  assertSpyCallArg(release, 0, 0, 'I')
})

Deno.test('promise api finally', async () => {
  const final = spy()
  const release = spy()
  const packets: BackendPacket[] = [
    { code: '1' },
    { code: '2' },
    { code: 'T', data: [] },
    { code: 'D', data: [] },
    { code: '1' },
    { code: 'Z', data: 'I' },
  ]
  const stream = createStream(packets, release)
  const command = Command.create('', [], Promise.resolve(stream))
  await assertRejects(() => command.finally(final))
  assertEquals(packets, [])
  assertSpyCalls(final, 1)
  assertSpyCalls(release, 1)
  assertSpyCallArg(release, 0, 0, 'I')
})

Deno.test('iterator api return (early)', async () => {
  const release = spy()
  const packets: BackendPacket[] = [
    { code: '1' },
    { code: '2' },
    { code: 'T', data: [] },
    { code: 'D', data: [] },
    { code: 'D', data: [] },
    { code: 'D', data: [] },
    { code: 'C', data: '' },
    { code: '3' },
    { code: 'Z', data: 'I' },
  ]
  const stream = createStream(packets, release)
  const command = Command.create('', [], Promise.resolve(stream))
  for await (const _ of command) {
    break
  }
  assertEquals(packets, [])
  assertSpyCalls(release, 1)
  assertSpyCallArg(release, 0, 0, 'I')
})

Deno.test('iterator api return (after release)', async () => {
  const release = spy()
  const packets: BackendPacket[] = [
    { code: '1' },
    { code: '2' },
    { code: 'T', data: [] },
    { code: 'D', data: [] },
    { code: 'D', data: [] },
    { code: 'C', data: '' },
    { code: '3' },
    { code: 'Z', data: 'I' },
  ]
  const stream = createStream(packets, release)
  const command = Command.create('', [], Promise.resolve(stream))
  await command.next()
  await command.next()
  for await (const _ of command) {
    break
  }
  assertEquals(packets, [])
  assertSpyCalls(release, 1)
  assertSpyCallArg(release, 0, 0, 'I')
})

Deno.test('mapped output', async () => {
  const release = spy()
  const packets: BackendPacket[] = [
    { code: '1' },
    { code: '2' },
    { code: 'T', data: [] },
    { code: 'D', data: [] },
    { code: 'D', data: [] },
    { code: 'C', data: '' },
    { code: '3' },
    { code: 'Z', data: 'I' },
  ]
  const stream = createStream(packets, release)
  const command = Command.create('', [], Promise.resolve(stream)).map(() => 2)
  assertEquals(await command, [2, 2])
  assertEquals(await command, null)
  assertEquals(packets, [])
  assertSpyCalls(release, 1)
  assertSpyCallArg(release, 0, 0, 'I')
})
