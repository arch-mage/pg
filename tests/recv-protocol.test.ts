import { assertEquals, assertRejects } from './deps.ts'
import { Buffer, PartialReadError, concat } from '../deps.ts'
import { AuthCode, ReadyState } from '../types.ts'
import { Protocol } from '../protocol.ts'
import { ProtocolError } from '../error.ts'

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

function decode2(buff: Buffer) {
  return new Protocol(buff, buff).recv()
}

Deno.test('insufficient data', async () => {
  assertEquals(await decode2(buffer()), null)
  await assertRejects(
    () => decode2(buffer('X', [0, 0])),
    PartialReadError,
    'Encountered UnexpectedEof, data only partially read'
  )
  await assertRejects(
    () => decode2(buffer('X', [0, 0, 0, 5])),
    ProtocolError,
    'insufficient data to read'
  )
})

Deno.test('unrecognized', async () => {
  await assertRejects(
    () => decode2(buffer('.', [0, 0, 0, 4])),
    ProtocolError,
    'unrecognized server response: .'
  )
})

Deno.test('AuthCode', async () => {
  assertRejects(() => decode2(buffer('R', [0, 0, 0, 8], [0, 0, 0, 1])))
  assertEquals(await decode2(buffer('R', [0, 0, 0, 8], [0, 0, 0, 0])), {
    code: 'R' as const,
    data: AuthCode.Ok,
  })
})

Deno.test('parameterStatus', async () => {
  assertRejects(
    () => decode2(buffer('S', [0, 0, 0, 12], 'app', [0], 'name')),
    ProtocolError,
    'not cstr'
  )
  assertEquals(
    await decode2(buffer('S', [0, 0, 0, 14], 'app', [0], 'name', [0, 0])),
    { code: 'S' as const, data: ['app', 'name'] }
  )
})

Deno.test('backendKeyData', async () => {
  assertRejects(
    () => decode2(buffer('K', [0, 0, 0, 11], [0, 0, 0, 1], [0, 0, 0])),
    ProtocolError,
    'not int32'
  )
  assertEquals(
    await decode2(buffer('K', [0, 0, 0, 12], [0, 0, 0, 1], [0, 0, 0, 2])),
    { code: 'K' as const, data: [1, 2] }
  )
})

Deno.test('readyForQuery', async () => {
  assertRejects(() => decode2(buffer('Z', [0, 0, 0, 5], 'A')))
  assertEquals(await decode2(buffer('Z', [0, 0, 0, 5], 'I')), {
    code: 'Z' as const,
    data: ReadyState.Idle,
  })
  assertEquals(await decode2(buffer('Z', [0, 0, 0, 5], 'T')), {
    code: 'Z' as const,
    data: ReadyState.Transaction,
  })
  assertEquals(await decode2(buffer('Z', [0, 0, 0, 5], 'E')), {
    code: 'Z' as const,
    data: ReadyState.Error,
  })
})

Deno.test('parseComplete', async () => {
  assertEquals(await decode2(buffer('1', [0, 0, 0, 4])), {
    code: '1' as const,
    data: null,
  })
})

Deno.test('bindComplete', async () => {
  assertEquals(await decode2(buffer('2', [0, 0, 0, 4])), {
    code: '2' as const,
    data: null,
  })
})

Deno.test('closeComplete', async () => {
  assertEquals(await decode2(buffer('3', [0, 0, 0, 4])), {
    code: '3' as const,
    data: null,
  })
})

Deno.test('noData', async () => {
  assertEquals(await decode2(buffer('n', [0, 0, 0, 4])), {
    code: 'n' as const,
    data: null,
  })
})

Deno.test('rowDescription', async () => {
  assertRejects(() =>
    decode2(
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
    await decode2(
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
    await decode2(
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
    () => decode2(buffer('t', [0, 0, 0, 5], [0])),
    ProtocolError,
    'not int16'
  )
  assertEquals(
    await decode2(buffer('t', [0, 0, 0, 10], [0, 1], [0, 0, 0, 1])),
    {
      code: 't',
      data: [1],
    }
  )
})

Deno.test('dataRow', async () => {
  assertRejects(() =>
    decode2(buffer('D', [0, 0, 0, 11], [0, 1], [0, 0, 0, 2], [97]))
  )
  assertEquals(
    await decode2(
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
  assertEquals(await decode2(buffer('C', [0, 0, 0, 13], 'SELECT 1', [0])), {
    code: 'C',
    data: 'SELECT 1',
  })
})

Deno.test('errorResponse', async () => {
  assertEquals(
    await decode2(buffer('E', [0, 0, 0, 12], 'M', 'error', [0, 0])),
    {
      code: 'E',
      data: { M: 'error' },
    }
  )
})
