import { assertEquals, assertThrows, uint8 } from '../testing.ts'
import { Decoder, PacketDecoder } from './decoder.ts'
import { DecodeError, UnrecognizedResponseError } from '../errors.ts'

Deno.test('int16', () => {
  const dec = new Decoder(new Uint8Array([0x00, 0x01, 0x00]))
  assertEquals(dec.int16(), 1)
  assertThrows(() => dec.int16(), DecodeError, 'not int16')
})

Deno.test('int32', () => {
  const dec = new Decoder(new Uint8Array([0x00, 0x00, 0x00, 0x01, 0x00]))
  assertEquals(dec.int32(), 1)
  assertThrows(() => dec.int32(), DecodeError, 'not int32')
})

Deno.test('bytes', () => {
  const dec = new Decoder(new Uint8Array([0x00, 0x00, 0x00]))
  assertEquals(dec.bytes(2), new Uint8Array([0x00, 0x00]))
  assertThrows(() => dec.bytes(2), DecodeError, 'not a buff with length of 2')
})

Deno.test('byte', () => {
  const dec = new Decoder(new Uint8Array([0x00]))
  assertEquals(dec.byte(), 0)
  assertThrows(() => dec.byte(), DecodeError, 'not byte')
})

Deno.test('char', () => {
  const dec = new Decoder(new Uint8Array([0x41]))
  assertEquals(dec.char(), 'A')
  assertThrows(() => dec.char(), DecodeError, 'not char')
})

Deno.test('cstr', () => {
  const dec = new Decoder(new Uint8Array([0x00, 0x41, 0x00, 0x42]))
  assertEquals(dec.cstr(), '')
  assertEquals(dec.cstr(), 'A')
  assertThrows(() => dec.cstr(), DecodeError, 'not cstr')
})

Deno.test('str', () => {
  const dec = new Decoder(new Uint8Array([0x41, 0x00, 0x42, 0x43]))
  assertEquals(dec.str(), 'A')
  assertThrows(() => dec.str(), DecodeError, 'empty string')
  dec.byte()
  assertEquals(dec.str(), 'BC')
  assertThrows(() => dec.str(), DecodeError, 'empty string')
})

Deno.test('authentication', () => {
  assertThrows(() =>
    new PacketDecoder(uint8('R', [0, 0, 0, 8], [0, 0, 0, 1])).decode()
  )

  assertEquals(
    new PacketDecoder(uint8('R', [0, 0, 0, 8], [0, 0, 0, 0])).decode(),
    {
      code: 'R' as const,
      data: {
        code: 0,
        data: null,
      },
    }
  )

  assertEquals(
    new PacketDecoder(
      uint8('R', [0, 0, 0, 23], [0, 0, 0, 10], 'SCRAM-SHA-256', [0], [0])
    ).decode(),
    {
      code: 'R' as const,
      data: {
        code: 10,
        data: ['SCRAM-SHA-256'],
      },
    }
  )

  assertEquals(
    new PacketDecoder(
      uint8('R', [0, 0, 0, 16], [0, 0, 0, 11], 'continue')
    ).decode(),
    {
      code: 'R' as const,
      data: {
        code: 11,
        data: 'continue',
      },
    }
  )

  assertEquals(
    new PacketDecoder(
      uint8('R', [0, 0, 0, 13], [0, 0, 0, 12], 'final')
    ).decode(),
    {
      code: 'R' as const,
      data: {
        code: 12,
        data: 'final',
      },
    }
  )
})

Deno.test('parameterStatus', () => {
  assertThrows(
    () =>
      new PacketDecoder(uint8('S', [0, 0, 0, 12], 'app', [0], 'name')).decode(),
    DecodeError,
    'not cstr'
  )
  assertEquals(
    new PacketDecoder(
      uint8('S', [0, 0, 0, 14], 'app', [0], 'name', [0, 0])
    ).decode(),
    { code: 'S' as const, data: ['app', 'name'] }
  )
})

Deno.test('backendKeyData', () => {
  assertThrows(
    () =>
      new PacketDecoder(
        uint8('K', [0, 0, 0, 11], [0, 0, 0, 1], [0, 0, 0])
      ).decode(),
    DecodeError,
    'not int32'
  )
  assertEquals(
    new PacketDecoder(
      uint8('K', [0, 0, 0, 12], [0, 0, 0, 1], [0, 0, 0, 2])
    ).decode(),
    { code: 'K' as const, data: [1, 2] }
  )
})

Deno.test('readyForQuery', () => {
  assertThrows(() => new PacketDecoder(uint8('Z', [0, 0, 0, 5], 'A')).decode())

  assertEquals(new PacketDecoder(uint8('Z', [0, 0, 0, 5], 'I')).decode(), {
    code: 'Z' as const,
    data: 'I',
  })
  assertEquals(new PacketDecoder(uint8('Z', [0, 0, 0, 5], 'T')).decode(), {
    code: 'Z' as const,
    data: 'T',
  })
  assertEquals(new PacketDecoder(uint8('Z', [0, 0, 0, 5], 'E')).decode(), {
    code: 'Z' as const,
    data: 'E',
  })
})

Deno.test('parseComplete', () => {
  assertEquals(new PacketDecoder(uint8('1', [0, 0, 0, 4])).decode(), {
    code: '1' as const,
    data: null,
  })
})

Deno.test('bindComplete', () => {
  assertEquals(new PacketDecoder(uint8('2', [0, 0, 0, 4])).decode(), {
    code: '2' as const,
    data: null,
  })
})

Deno.test('closeComplete', () => {
  assertEquals(new PacketDecoder(uint8('3', [0, 0, 0, 4])).decode(), {
    code: '3' as const,
    data: null,
  })
})

Deno.test('portalSuspended', () => {
  assertEquals(new PacketDecoder(uint8('s', [0, 0, 0, 4])).decode(), {
    code: 's' as const,
    data: null,
  })
})

Deno.test('noData', () => {
  assertEquals(new PacketDecoder(uint8('n', [0, 0, 0, 4])).decode(), {
    code: 'n' as const,
    data: null,
  })
})

Deno.test('rowDescription', () => {
  assertThrows(() =>
    new PacketDecoder(
      uint8(
        'T',
        [0, 0, 0, 27],
        [0, 1],
        'id',
        0,
        [0, 0, 0, 1],
        [0, 1],
        [0, 0, 0, 1],
        [0, 1],
        [0, 0, 0, 1],
        [0, 2]
      )
    ).decode()
  )
  assertEquals(
    new PacketDecoder(
      uint8(
        'T',
        [0, 0, 0, 27],
        [0, 1],
        'id',
        0,
        [0, 0, 0, 1],
        [0, 1],
        [0, 0, 0, 1],
        [0, 1],
        [0, 0, 0, 1],
        [0, 1]
      )
    ).decode(),
    {
      code: 'T',
      data: [
        {
          name: 'id',
          table: 1,
          attNum: 1,
          oid: 1,
          typelen: 1,
          typemod: 1,
          format: 1,
        },
      ],
    }
  )

  assertEquals(
    new PacketDecoder(
      uint8(
        'T',
        [0, 0, 0, 27],
        [0, 1],
        'id',
        0,
        [0, 0, 0, 0],
        [0, 0],
        [0, 0, 0, 1],
        [0, 1],
        [0, 0, 0, 1],
        [0, 1]
      )
    ).decode(),
    {
      code: 'T',
      data: [
        {
          name: 'id',
          table: null,
          attNum: null,
          oid: 1,
          typelen: 1,
          typemod: 1,
          format: 1,
        },
      ],
    }
  )
})

Deno.test('parameterDescription', () => {
  assertThrows(
    () => new PacketDecoder(uint8('t', [0, 0, 0, 5], [0])).decode(),
    DecodeError,
    'not int16'
  )
  assertEquals(
    new PacketDecoder(uint8('t', [0, 0, 0, 10], [0, 1], [0, 0, 0, 1])).decode(),
    {
      code: 't',
      data: [1],
    }
  )
})

Deno.test('dataRow', () => {
  assertThrows(() =>
    new PacketDecoder(
      uint8('D', [0, 0, 0, 11], [0, 1], [0, 0, 0, 2], [97])
    ).decode()
  )
  assertEquals(
    new PacketDecoder(
      uint8(
        'D',
        [0, 0, 0, 15],
        [0, 2],
        [0xff, 0xff, 0xff, 0xff],
        [0, 0, 0, 1],
        [97]
      )
    ).decode(),
    {
      code: 'D',
      data: [null, new Uint8Array([97])],
    }
  )
})

Deno.test('commandComplete', () => {
  assertEquals(
    new PacketDecoder(uint8('C', [0, 0, 0, 13], 'SELECT 1', [0])).decode(),
    {
      code: 'C',
      data: 'SELECT 1',
    }
  )
})

Deno.test('errorResponse', () => {
  assertEquals(
    new PacketDecoder(
      uint8(
        'E',
        [0, 0, 0, 22],
        'C',
        '0',
        [0],
        'S',
        'error',
        [0],
        'M',
        'error',
        [0, 0]
      )
    ).decode(),
    {
      code: 'E',
      data: { C: '0', S: 'error', M: 'error' },
    }
  )
})

Deno.test('noticeResponse', () => {
  assertEquals(
    new PacketDecoder(
      uint8(
        'N',
        [0, 0, 0, 24],
        'C',
        '0',
        [0],
        'S',
        'notice',
        [0],
        'M',
        'notice',
        [0, 0]
      )
    ).decode(),
    {
      code: 'N',
      data: { C: '0', S: 'notice', M: 'notice' },
    }
  )
})

Deno.test('notificationResponse', () => {
  assertEquals(
    new PacketDecoder(
      uint8('A', [0, 0, 0, 18], [0, 0, 0, 1], 'info', [0], 'info', [0])
    ).decode(),
    {
      code: 'A',
      data: { processId: 1, channel: 'info', payload: 'info' },
    }
  )
})

Deno.test('iterator', () => {
  const dec = new PacketDecoder(uint8('1', [0, 0, 0, 4], '2', [0, 0, 0, 4]))
  const iterator = dec[Symbol.iterator]()

  assertEquals(iterator.next(), {
    done: false,
    value: { code: '1' as const, data: null },
  })

  assertEquals(iterator.next(), {
    done: false,
    value: { code: '2' as const, data: null },
  })

  assertEquals(iterator.next(), { done: true, value: null })

  assertEquals(dec.decode(), null)
})

Deno.test('unrecognized', () => {
  const dec = new PacketDecoder(uint8('0', 0, 0, 0, 4))
  assertThrows(
    () => dec.decode(),
    UnrecognizedResponseError,
    'unrecognized server response: 0'
  )
})

Deno.test('chunked', () => {
  const dec = new PacketDecoder()

  dec.feed(uint8('1', 0, 0, 0, 4, '2'))
  assertEquals(dec.decode(), { code: '1', data: null })
  assertEquals(dec.decode(), null)
  assertEquals(dec.data, uint8('2'))
  dec.feed(uint8(0, 0, 0))
  assertEquals(dec.decode(), null)
  assertEquals(dec.data, uint8('2', 0, 0, 0))
  dec.feed(uint8(4))
  assertEquals(dec.data, uint8('2', 0, 0, 0, 4))
  assertEquals(dec.decode(), { code: '2', data: null })
  assertEquals(dec.decode(), null)
  assertEquals(dec.data, uint8())

  dec.feed(uint8('R', 0, 0, 0, 8, 0))
  assertEquals(dec.decode(), null)
  dec.feed(uint8(0, 0))
  assertEquals(dec.decode(), null)
  dec.feed(uint8(0, 'S'))
  assertEquals(dec.decode(), {
    code: 'R',
    data: { code: 0, data: null },
  })
  assertEquals(dec.decode(), null)
  assertEquals(dec.data, uint8('S'))
})
