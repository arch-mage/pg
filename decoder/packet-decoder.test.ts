import { assertEquals, assertThrows, uint8 } from '../testing.ts'
import {
  DecodeError,
  UnrecognizedAuth,
  UnrecognizedFormatCode,
  UnrecognizedBackendPacket,
} from '../errors.ts'
import { PacketDecoder } from './packet-decoder.ts'

Deno.test('authentication', () => {
  const dec = new PacketDecoder()
  dec.feed(
    uint8(
      'R',
      [
        0, 0, 0, 23, 0, 0, 0, 10, 83, 67, 82, 65, 77, 45, 83, 72, 65, 45, 50,
        53, 54, 0, 0,
      ],
      'R',
      [0, 0, 0, 16, 0, 0, 0, 11, 99, 111, 110, 116, 105, 110, 117, 101],
      'R',
      [
        0, 0, 0, 54, 0, 0, 0, 12, 118, 61, 70, 103, 48, 56, 70, 111, 73, 71,
        120, 109, 116, 121, 85, 78, 48, 55, 71, 86, 75, 107, 111, 118, 70, 66,
        71, 98, 69, 56, 82, 43, 50, 81, 104, 100, 83, 102, 57, 65, 111, 73, 70,
        120, 65, 61,
      ],
      'R',
      [0, 0, 0, 8, 0, 0, 0, 0]
    )
  )
  assertEquals(dec.decode(), {
    code: 'R' as const,
    data: { code: 10, data: ['SCRAM-SHA-256'] },
  })
  assertEquals(dec.decode(), {
    code: 'R' as const,
    data: { code: 11, data: 'continue' },
  })
  assertEquals(dec.decode(), {
    code: 'R' as const,
    data: {
      code: 12,
      data: 'v=Fg08FoIGxmtyUN07GVKkovFBGbE8R+2QhdSf9AoIFxA=',
    },
  })
  assertEquals(dec.decode(), { code: 'R' as const, data: { code: 0 } })
  assertThrows(
    () => new PacketDecoder(uint8('R', [0, 0, 0, 8], [0, 0, 0, 1])).decode(),
    UnrecognizedAuth,
    'unrecognized auth response: 1'
  )
})

Deno.test('parameterStatus', () => {
  assertThrows(
    () =>
      new PacketDecoder(uint8('S', [0, 0, 0, 12], 'app', [0], 'name')).decode(),
    DecodeError,
    'not a null terminated string'
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
    'not an int32'
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
  })
})

Deno.test('bindComplete', () => {
  assertEquals(new PacketDecoder(uint8('2', [0, 0, 0, 4])).decode(), {
    code: '2' as const,
  })
})

Deno.test('closeComplete', () => {
  assertEquals(new PacketDecoder(uint8('3', [0, 0, 0, 4])).decode(), {
    code: '3' as const,
  })
})

Deno.test('portalSuspended', () => {
  assertEquals(new PacketDecoder(uint8('s', [0, 0, 0, 4])).decode(), {
    code: 's' as const,
  })
})

Deno.test('noData', () => {
  assertEquals(new PacketDecoder(uint8('n', [0, 0, 0, 4])).decode(), {
    code: 'n' as const,
  })
})

Deno.test('rowDescription', () => {
  assertThrows(
    () =>
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
      ).decode(),
    UnrecognizedFormatCode,
    'unrecognized format code: 2'
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
    'not an int16'
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
      data: { process: 1, channel: 'info', payload: 'info' },
    }
  )
})

Deno.test('unrecognized', () => {
  const dec = new PacketDecoder(uint8('0', 0, 0, 0, 4))
  assertThrows(
    () => dec.decode(),
    UnrecognizedBackendPacket,
    'unrecognized backend packet: 0'
  )
})

Deno.test('chunked', () => {
  const dec = new PacketDecoder()

  dec.feed(uint8('1', 0, 0, 0, 4, '2'))
  assertEquals(dec.decode(), { code: '1' })
  assertEquals(dec.decode(), null)
  // assertEquals(dec.data, uint8('2'))
  dec.feed(uint8(0, 0, 0))
  assertEquals(dec.decode(), null)
  // assertEquals(dec.data, uint8('2', 0, 0, 0))
  dec.feed(uint8(4))
  // assertEquals(dec.data, uint8('2', 0, 0, 0, 4))
  assertEquals(dec.decode(), { code: '2' })
  assertEquals(dec.decode(), null)
  // assertEquals(dec.data, uint8())

  dec.feed(uint8('R', 0, 0, 0, 8, 0))
  assertEquals(dec.decode(), null)
  dec.feed(uint8(0, 0))
  assertEquals(dec.decode(), null)
  dec.feed(uint8(0, 'S'))
  assertEquals(dec.decode(), { code: 'R', data: { code: 0 } })
  assertEquals(dec.decode(), null)
  // assertEquals(dec.data, uint8('S'))
})

Deno.test('iterator', () => {
  // prettier-ignore
  const dec = new PacketDecoder(
    uint8(
      '1', 0, 0, 0, 4,
      '2', 0, 0, 0, 4,
      'n', 0, 0, 0, 4,
      'C', 0, 0, 0, 11, 'SELECT', 0,
      '3', 0, 0, 0, 4,
      'Z', 0, 0, 0, 5, 'I'
    )
  )

  assertEquals(
    [...dec],
    [
      { code: '1' },
      { code: '2' },
      { code: 'n' },
      { code: 'C', data: 'SELECT' },
      { code: '3' },
      { code: 'Z', data: 'I' },
    ]
  )
})

Deno.test('copyInResponse', () => {
  assertThrows(
    () => {
      new PacketDecoder(
        uint8([71, 0, 0, 0, 13, 2, 0, 3, 0, 0, 0, 0, 0, 0])
      ).decode()
    },
    UnrecognizedFormatCode,
    'unrecognized format code: 2'
  )
  assertThrows(
    () => {
      new PacketDecoder(
        uint8([71, 0, 0, 0, 13, 0, 0, 3, 0, 2, 0, 0, 0, 0])
      ).decode()
    },
    UnrecognizedFormatCode,
    'unrecognized format code: 2'
  )
  assertEquals(
    new PacketDecoder(
      uint8([71, 0, 0, 0, 13, 0, 0, 3, 0, 0, 0, 0, 0, 0])
    ).decode(),
    {
      code: 'G',
      data: { format: 0, formats: [0, 0, 0] },
    }
  )
})

Deno.test('copyOutResponse', () => {
  assertThrows(
    () => {
      new PacketDecoder(
        uint8([72, 0, 0, 0, 13, 2, 0, 3, 0, 0, 0, 0, 0, 0])
      ).decode()
    },
    UnrecognizedFormatCode,
    'unrecognized format code: 2'
  )
  assertThrows(
    () => {
      new PacketDecoder(
        uint8([72, 0, 0, 0, 13, 0, 0, 3, 0, 2, 0, 0, 0, 0])
      ).decode()
    },
    UnrecognizedFormatCode,
    'unrecognized format code: 2'
  )
  assertEquals(
    new PacketDecoder(
      uint8([72, 0, 0, 0, 13, 0, 0, 3, 0, 0, 0, 0, 0, 0])
    ).decode(),
    {
      code: 'H',
      data: { format: 0, formats: [0, 0, 0] },
    }
  )
})

Deno.test('copyData', () => {
  const dec = new PacketDecoder(
    uint8([
      100, 0, 0, 0, 15, 49, 9, 65, 115, 115, 101, 116, 9, 92, 78, 10, 100, 0, 0,
      0, 19, 49, 48, 49, 9, 83, 105, 109, 112, 97, 110, 97, 110, 9, 49, 10,
    ])
  )

  assertEquals(dec.decode(), {
    code: 'd',
    data: uint8([49, 9, 65, 115, 115, 101, 116, 9, 92, 78, 10]),
  })
  assertEquals(dec.decode(), {
    code: 'd',
    data: uint8([
      49, 48, 49, 9, 83, 105, 109, 112, 97, 110, 97, 110, 9, 49, 10,
    ]),
  })
})

Deno.test('copyDone', () => {
  const dec = new PacketDecoder(uint8('c', [0, 0, 0, 4]))

  assertEquals(dec.decode(), { code: 'c' })
})
