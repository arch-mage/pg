import { PostgresError } from '../errors.ts'
import { Encoder } from '../protocol/encoder.ts'
import { ReadWriteProtocol } from '../protocol/mod.ts'
import {
  assertEquals,
  assertRejects,
  assertSpyCalls,
  spy,
  TestBuffer,
} from '../testing.ts'
import { ColumnDescription, Row } from '../types.ts'
import { Conn } from './mod.ts'

Deno.test('query not awaited', () => {
  const buff = new TestBuffer()
  const proto = ReadWriteProtocol.fromConn(buff)
  const conn = new Conn(proto)
  conn.query('SELECT')

  assertEquals(buff.writer.length, 0)
})

Deno.test('query awaited', async () => {
  const buff = new TestBuffer()
  // prettier-ignore
  const data = new Encoder()
    // parse complete
    .str('1').int32(4)
    // bind complete
    .str('2').int32(4)
    // row description
    .str('T').int32(48).int16(2)
    .cstr('id').int32(0).int16(0).int32(23).int16(4).int32(0).int16(0)
    .cstr('no').int32(0).int16(0).int32(23).int16(4).int32(0).int16(0)
    // data row
    .str('D').int32(18).int16(2).int32(4).int32(1).int32(-1)
    // data row
    .str('D').int32(18).int16(2).int32(4).int32(1).int32(-1)
    // command complete
    .str('C').int32(13).cstr('SELECT 1')
    // close complete
    .str('3').int32(4)
    // ready for query
    .str('Z').int32(5).str('I')
  buff.reader.writeSync(data.buff as Uint8Array)
  const proto = ReadWriteProtocol.fromConn(buff)
  const conn = new Conn(proto)
  assertEquals(
    (await conn.query('SELECT 1 as id, null as no')) as [
      Row[],
      ColumnDescription[]
    ],
    [
      [
        [new Uint8Array([0, 0, 0, 1]), null],
        [new Uint8Array([0, 0, 0, 1]), null],
      ],
      [
        {
          name: 'id',
          table: null,
          attNum: null,
          oid: 23,
          typelen: 4,
          typemod: 0,
          format: 0,
        },
        {
          name: 'no',
          table: null,
          attNum: null,
          oid: 23,
          typelen: 4,
          typemod: 0,
          format: 0,
        },
      ],
    ]
  )
})

Deno.test('query iterated', async () => {
  const buff = new TestBuffer()
  // prettier-ignore
  const data = new Encoder()
    // parse complete
    .str('1').int32(4)
    // bind complete
    .str('2').int32(4)
    // row description
    .str('T').int32(48).int16(2)
    .cstr('id').int32(0).int16(0).int32(23).int16(4).int32(0).int16(0)
    .cstr('no').int32(0).int16(0).int32(23).int16(4).int32(0).int16(0)
    // data row
    .str('D').int32(18).int16(2).int32(4).int32(1).int32(-1)
    // data row
    .str('D').int32(18).int16(2).int32(4).int32(1).int32(-1)
    // command complete
    .str('C').int32(13).cstr('SELECT 1')
    // close complete
    .str('3').int32(4)
    // ready for query
    .str('Z').int32(5).str('I')
  buff.reader.writeSync(data.buff as Uint8Array)
  const proto = ReadWriteProtocol.fromConn(buff)
  const conn = new Conn(proto)
  const query = conn.query('SELECT 1 as id, null as no')
  const desc = [
    {
      name: 'id',
      table: null,
      attNum: null,
      oid: 23,
      typelen: 4,
      typemod: 0,
      format: 0 as const,
    },
    {
      name: 'no',
      table: null,
      attNum: null,
      oid: 23,
      typelen: 4,
      typemod: 0,
      format: 0 as const,
    },
  ]
  const row = [new Uint8Array([0, 0, 0, 1]), null]
  assertEquals(await query.next(), {
    done: false,
    value: [row, desc],
  })
  assertEquals(await query.next(), {
    done: false,
    value: [row, desc],
  })
  assertEquals(await query.next(), { done: true, value: null })
})

Deno.test('awaited error', async () => {
  const buff = new TestBuffer()
  // prettier-ignore
  const data = new Encoder()
    // error response
    .str('E').int32(40).str('C').cstr('code').str('S').cstr('ERROR').str('M').cstr('an error is expected').byte(0)
    // ready for query
    .str('Z').int32(5).str('I')
  buff.reader.writeSync(data.buff as Uint8Array)
  const proto = ReadWriteProtocol.fromConn(buff)
  const conn = new Conn(proto)
  const task = conn.query('SELECT')
  const onClose = spy(function onClose() {})
  task.onClose(onClose)

  await assertRejects(() => task, PostgresError, 'an error is expected')
  assertSpyCalls(onClose, 1)
})

Deno.test('iterated error', async () => {
  const buff = new TestBuffer()
  // prettier-ignore
  const data = new Encoder()
    // error response
    .str('E').int32(40).str('C').cstr('code').str('S').cstr('ERROR').str('M').cstr('an error is expected').byte(0)
    // ready for query
    .str('Z').int32(5).str('I')
  buff.reader.writeSync(data.buff as Uint8Array)
  const proto = ReadWriteProtocol.fromConn(buff)
  const conn = new Conn(proto)
  const task = conn.query('SELECT')
  const onClose = spy(function onClose() {})
  task.onClose(onClose)

  await assertRejects(() => task.next(), PostgresError, 'an error is expected')
  assertSpyCalls(onClose, 1)
})
