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
import { FrontendPacket, PacketEncoder } from '../encoder/packet-encoder.ts'
import { Command, Stream } from './stream.ts'
import { PostgresError, UnexpectedBackendPacket } from '../errors.ts'
import type { RawValue } from './types.ts'

function createStream(packs: BackendPacket[], wbuff?: number[]): Stream {
  const buff = Array.isArray(wbuff) ? wbuff : []
  const enc = new PacketEncoder()
  const readable = packets(packs)
  const writable = new WritableStream<FrontendPacket>({
    write(chunk, controller) {
      try {
        enc.reset()
        enc.encode(chunk)
        buff.push(...enc.buff)
      } catch (error) {
        controller.error(error)
      }
    },
  })

  return new Stream(writable.getWriter(), readable.getReader())
}

function toStream(
  writable: WritableStream<FrontendPacket>,
  readable: ReadableStream<BackendPacket>
): Stream {
  const writer = writable.getWriter()
  const reader = readable.getReader()

  return new Stream(writer, reader)
}

function query(query: string, params: RawValue[] = []): FrontendPacket[] {
  return [parse(query), bind(params), describe(), execute(), close(), sync()]

  function parse(query: string, name = ''): FrontendPacket {
    return { code: 'P', data: { name, query, formats: [] } }
  }

  function bind(params: RawValue[], stmt = ''): FrontendPacket {
    return {
      code: 'B',
      data: {
        stmt,
        portal: '',
        params,
        paramFormats: [],
        resultFormats: [],
      },
    }
  }

  function describe(): FrontendPacket {
    return { code: 'D', data: { kind: 'P', name: '' } }
  }

  function execute(): FrontendPacket {
    return { code: 'E', data: { max: 0, name: '' } }
  }

  function close(): FrontendPacket {
    return { code: 'C', data: { kind: 'P', name: '' } }
  }

  function sync(): FrontendPacket {
    return { code: 'S' }
  }
}

Deno.test('command init error', async () => {
  const release = spy()
  const packets: BackendPacket[] = [{ code: '1' }, { code: '2' }, { code: '3' }]
  const stream = createStream(packets)
  const command = Command.create(
    Promise.resolve(stream),
    query('', []),
    release
  )
  await assertRejects(
    () => command,
    UnexpectedBackendPacket,
    'unexpected backend packet: 3. expected: T, n'
  )
  assertEquals(packets, [])
  assertSpyCalls(release, 1)
  assertSpyCallArg(release, 0, 0, null)
})

Deno.test('command init send error', async () => {
  const writable = new WritableStream<FrontendPacket>({
    write() {
      throw new Error('failed')
    },
  })
  const release = spy()
  const stream = toStream(writable, packets([]))
  const command = Command.create(
    Promise.resolve(stream),
    query('', []),
    release
  )
  await assertRejects(() => command, Error, 'failed')
})

Deno.test('command await error (before command complete)', async () => {
  const release = spy()
  const packets: BackendPacket[] = [
    { code: '1' },
    { code: '2' },
    { code: 'T', data: [] },
    { code: 'D', data: [] },
    { code: '1' },
    { code: 'Z', data: 'I' },
  ]
  const stream = createStream(packets)
  const command = Command.create(
    Promise.resolve(stream),
    query('', []),
    release
  )
  await assertRejects(
    () => command,
    UnexpectedBackendPacket,
    'unexpected backend packet: 1. expected: C, D'
  )
  assertEquals(packets, [])
  assertSpyCalls(release, 1)
  assertSpyCallArg(release, 0, 0, 'I')
})

Deno.test('command await error (after command complete)', async () => {
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
  const stream = createStream(packets)
  const command = Command.create(
    Promise.resolve(stream),
    query('', []),
    release
  )
  await assertRejects(
    () => command,
    UnexpectedBackendPacket,
    'unexpected backend packet: 1. expected: 3'
  )
  assertEquals(packets, [])
  assertSpyCalls(release, 1)
  assertSpyCallArg(release, 0, 0, 'I')
})

Deno.test('command await error (after close complete)', async () => {
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
  const stream = createStream(packets)
  const command = Command.create(
    Promise.resolve(stream),
    query('', []),
    release
  )
  await assertRejects(() => command, PostgresError, 'error')
  assertEquals(packets, [])
  assertSpyCalls(release, 1)
  assertSpyCallArg(release, 0, 0, 'E')
})

Deno.test('command await data', async () => {
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
  const stream = createStream(packets)
  const command = Command.create(
    Promise.resolve(stream),
    query('', []),
    release
  )
  assertEquals(await command, [
    [[], []],
    [[], []],
  ])
  assertEquals(await command, null)
  assertEquals(packets, [])
  assertSpyCalls(release, 1)
  assertSpyCallArg(release, 0, 0, 'I')
})

Deno.test('command await no data', async () => {
  const release = spy()
  const packets: BackendPacket[] = [
    { code: '1' },
    { code: '2' },
    { code: 'n' },
    { code: 'C', data: '' },
    { code: '3' },
    { code: 'Z', data: 'I' },
  ]
  const stream = createStream(packets)
  const command = Command.create(
    Promise.resolve(stream),
    query('', []),
    release
  )
  assertEquals(await command, null)
  assertEquals(await command, null)
  assertEquals(packets, [])
  assertSpyCalls(release, 1)
  assertSpyCallArg(release, 0, 0, 'I')
})

Deno.test('command iter error (before command complete)', async () => {
  const release = spy()
  const packets: BackendPacket[] = [
    { code: '1' },
    { code: '2' },
    { code: 'T', data: [] },
    { code: 'D', data: [] },
    { code: '1' },
    { code: 'Z', data: 'I' },
  ]
  const stream = createStream(packets)
  const command = Command.create(
    Promise.resolve(stream),
    query('', []),
    release
  )
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

Deno.test('command iter error (after command complete)', async () => {
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
  const stream = createStream(packets)
  const command = Command.create(
    Promise.resolve(stream),
    query('', []),
    release
  )
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

Deno.test('command iter error (after close complete)', async () => {
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
  const stream = createStream(packets)
  const command = Command.create(
    Promise.resolve(stream),
    query('', []),
    release
  )
  assertEquals(await command.next(), { done: false, value: [[], []] })
  await assertRejects(() => command.next(), PostgresError, 'error')
  assertEquals(packets, [])
  assertSpyCalls(release, 1)
  assertSpyCallArg(release, 0, 0, 'E')
  assertEquals(await command.next(), { done: true, value: null })
})

Deno.test('command iter data', async () => {
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
  const stream = createStream(packets)
  const command = Command.create(
    Promise.resolve(stream),
    query('', []),
    release
  )
  assertEquals(await command.next(), { done: false, value: [[], []] })
  assertEquals(await command.next(), { done: false, value: [[], []] })
  assertEquals(await command.next(), { done: true, value: null })
  assertEquals(await command.next(), { done: true, value: null })
  assertEquals(packets, [])
  assertSpyCalls(release, 1)
  assertSpyCallArg(release, 0, 0, 'I')
})

Deno.test('command await no data', async () => {
  const release = spy()
  const packets: BackendPacket[] = [
    { code: '1' },
    { code: '2' },
    { code: 'n' },
    { code: 'C', data: '' },
    { code: '3' },
    { code: 'Z', data: 'I' },
  ]
  const stream = createStream(packets)
  const command = Command.create(
    Promise.resolve(stream),
    query('', []),
    release
  )
  assertEquals(await command.next(), { done: true, value: null })
  assertEquals(await command.next(), { done: true, value: null })
  assertEquals(packets, [])
  assertSpyCalls(release, 1)
  assertSpyCallArg(release, 0, 0, 'I')
})

Deno.test('command promise api catch', async () => {
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
  const stream = createStream(packets)
  const command = Command.create(
    Promise.resolve(stream),
    query('', []),
    release
  )
  assertEquals(
    await command.catch(catcher),
    'unexpected backend packet: 1. expected: C, D'
  )
  assertEquals(packets, [])
  assertSpyCalls(catcher, 1)
  assertSpyCalls(release, 1)
  assertSpyCallArg(release, 0, 0, 'I')
})

Deno.test('command promise api finally', async () => {
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
  const stream = createStream(packets)
  const command = Command.create(
    Promise.resolve(stream),
    query('', []),
    release
  )
  await assertRejects(() => command.finally(final))
  assertEquals(packets, [])
  assertSpyCalls(final, 1)
  assertSpyCalls(release, 1)
  assertSpyCallArg(release, 0, 0, 'I')
})

Deno.test('command iterator api return (early)', async () => {
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
  const stream = createStream(packets)
  const command = Command.create(
    Promise.resolve(stream),
    query('', []),
    release
  )
  for await (const _ of command) {
    break
  }
  assertEquals(packets, [])
  assertSpyCalls(release, 1)
  assertSpyCallArg(release, 0, 0, 'I')
})

Deno.test('command iterator api return (after release)', async () => {
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
  const stream = createStream(packets)
  const command = Command.create(
    Promise.resolve(stream),
    query('', []),
    release
  )
  await command.next()
  await command.next()
  for await (const _ of command) {
    break
  }
  assertEquals(packets, [])
  assertSpyCalls(release, 1)
  assertSpyCallArg(release, 0, 0, 'I')
})

Deno.test('command mapped output', async () => {
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
  const stream = createStream(packets)
  const command = Command.create(
    Promise.resolve(stream),
    query('', []),
    release
  ).map(() => 2)
  assertEquals(await command, [2, 2])
  assertEquals(await command, null)
  assertEquals(packets, [])
  assertSpyCalls(release, 1)
  assertSpyCallArg(release, 0, 0, 'I')
})

Deno.test('conn query', async () => {
  const conn = createStream([
    { code: '1' },
    { code: '2' },
    { code: 'n' },
    { code: 'C', data: '' },
    { code: '3' },
    { code: 'Z', data: 'T' },
    { code: '1' },
    { code: '2' },
    { code: 'n' },
    { code: 'C', data: '' },
    { code: '3' },
    { code: 'Z', data: 'I' },
  ])

  const q1 = conn.command(query('', []))
  const q2 = conn.command(query('', []))
  assertEquals(await q1, null)
  assertEquals(await q2.next(), { done: true, value: null })
})
