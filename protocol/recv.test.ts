import { Buffer, concat, assertEquals, assertRejects } from '../deps.ts'
import { AuthCode, ReadyState } from '../types.ts'
import { Protocol } from './mod.ts'
import { DecodeError, UnrecognizedResponseError } from '../errors.ts'

function buffer(...source: Array<string | number | number[]>) {
  return new Buffer(
    concat(
      ...source.map((source) =>
        Array.isArray(source)
          ? new Uint8Array(source)
          : typeof source === 'string'
          ? new TextEncoder().encode(source)
          : new Uint8Array([source])
      )
    )
  )
}

function decode(buff: Buffer) {
  return Protocol.fromPair(buff, buff).recv()
}

Deno.test('insufficient data', async () => {
  assertEquals(await decode(buffer()), null)
  await assertRejects(
    () => decode(buffer('X', [0, 0])),
    DecodeError,
    'Encountered UnexpectedEof, data only partially read'
  )
  await assertRejects(
    () => decode(buffer('X', [0, 0, 0, 5])),
    DecodeError,
    'insufficient data to read'
  )
})

Deno.test('unrecognized', async () => {
  await assertRejects(
    () => decode(buffer('.', [0, 0, 0, 4])),
    UnrecognizedResponseError,
    'unrecognized server response: .'
  )
})

Deno.test('authentication', async () => {
  assertRejects(() => decode(buffer('R', [0, 0, 0, 8], [0, 0, 0, 1])))

  assertEquals(await decode(buffer('R', [0, 0, 0, 8], [0, 0, 0, 0])), {
    code: 'R' as const,
    data: {
      code: AuthCode.Ok,
      data: null,
    },
  })

  assertEquals(
    await decode(
      buffer('R', [0, 0, 0, 23], [0, 0, 0, 10], 'SCRAM-SHA-256', [0], [0])
    ),
    {
      code: 'R' as const,
      data: {
        code: AuthCode.SASL,
        data: ['SCRAM-SHA-256'],
      },
    }
  )

  assertEquals(
    await decode(buffer('R', [0, 0, 0, 16], [0, 0, 0, 11], 'continue')),
    {
      code: 'R' as const,
      data: {
        code: AuthCode.SASLContinue,
        data: 'continue',
      },
    }
  )

  assertEquals(
    await decode(buffer('R', [0, 0, 0, 13], [0, 0, 0, 12], 'final')),
    {
      code: 'R' as const,
      data: {
        code: AuthCode.SASLFinal,
        data: 'final',
      },
    }
  )
})

Deno.test('parameterStatus', async () => {
  assertRejects(
    () => decode(buffer('S', [0, 0, 0, 12], 'app', [0], 'name')),
    DecodeError,
    'not cstr'
  )
  assertEquals(
    await decode(buffer('S', [0, 0, 0, 14], 'app', [0], 'name', [0, 0])),
    { code: 'S' as const, data: ['app', 'name'] }
  )
})

Deno.test('backendKeyData', async () => {
  assertRejects(
    () => decode(buffer('K', [0, 0, 0, 11], [0, 0, 0, 1], [0, 0, 0])),
    DecodeError,
    'not int32'
  )
  assertEquals(
    await decode(buffer('K', [0, 0, 0, 12], [0, 0, 0, 1], [0, 0, 0, 2])),
    { code: 'K' as const, data: [1, 2] }
  )
})

Deno.test('readyForQuery', async () => {
  assertRejects(() => decode(buffer('Z', [0, 0, 0, 5], 'A')))
  assertEquals(await decode(buffer('Z', [0, 0, 0, 5], 'I')), {
    code: 'Z' as const,
    data: ReadyState.Idle,
  })
  assertEquals(await decode(buffer('Z', [0, 0, 0, 5], 'T')), {
    code: 'Z' as const,
    data: ReadyState.Transaction,
  })
  assertEquals(await decode(buffer('Z', [0, 0, 0, 5], 'E')), {
    code: 'Z' as const,
    data: ReadyState.Error,
  })
})

Deno.test('parseComplete', async () => {
  assertEquals(await decode(buffer('1', [0, 0, 0, 4])), {
    code: '1' as const,
    data: null,
  })
})

Deno.test('bindComplete', async () => {
  assertEquals(await decode(buffer('2', [0, 0, 0, 4])), {
    code: '2' as const,
    data: null,
  })
})

Deno.test('closeComplete', async () => {
  assertEquals(await decode(buffer('3', [0, 0, 0, 4])), {
    code: '3' as const,
    data: null,
  })
})

Deno.test('portalSuspended', async () => {
  assertEquals(await decode(buffer('s', [0, 0, 0, 4])), {
    code: 's' as const,
    data: null,
  })
})

Deno.test('noData', async () => {
  assertEquals(await decode(buffer('n', [0, 0, 0, 4])), {
    code: 'n' as const,
    data: null,
  })
})

Deno.test('rowDescription', async () => {
  assertRejects(() =>
    decode(
      buffer(
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
    )
  )
  assertEquals(
    await decode(
      buffer(
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
    ),
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
    await decode(
      buffer(
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
    ),
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

Deno.test('parameterDescription', async () => {
  assertRejects(
    () => decode(buffer('t', [0, 0, 0, 5], [0])),
    DecodeError,
    'not int16'
  )
  assertEquals(await decode(buffer('t', [0, 0, 0, 10], [0, 1], [0, 0, 0, 1])), {
    code: 't',
    data: [1],
  })
})

Deno.test('dataRow', async () => {
  assertRejects(() =>
    decode(buffer('D', [0, 0, 0, 11], [0, 1], [0, 0, 0, 2], [97]))
  )
  assertEquals(
    await decode(
      buffer(
        'D',
        [0, 0, 0, 15],
        [0, 2],
        [0xff, 0xff, 0xff, 0xff],
        [0, 0, 0, 1],
        [97]
      )
    ),
    {
      code: 'D',
      data: [null, new Uint8Array([97])],
    }
  )
})

Deno.test('commandComplete', async () => {
  assertEquals(await decode(buffer('C', [0, 0, 0, 13], 'SELECT 1', [0])), {
    code: 'C',
    data: 'SELECT 1',
  })
})

Deno.test('errorResponse', async () => {
  assertEquals(
    await decode(
      buffer(
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
    ),
    {
      code: 'E',
      data: {
        C: '0',
        S: 'error',
        M: 'error',
      },
    }
  )
})

Deno.test('iterator', async () => {
  const proto = Protocol.fromConn(buffer('1', [0, 0, 0, 4], '2', [0, 0, 0, 4]))
  const iterator = proto[Symbol.asyncIterator]()

  assertEquals(await iterator.next(), {
    done: false,
    value: { code: '1' as const, data: null },
  })

  assertEquals(await iterator.next(), {
    done: false,
    value: { code: '2' as const, data: null },
  })

  assertEquals(await iterator.next(), { done: true, value: null })

  assertEquals(await proto.recv(), null)
})
