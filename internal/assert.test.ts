// deno-lint-ignore-file no-explicit-any
import {
  PostgresError,
  ConnectionClosedError,
  UnexpectedResponseError,
  UnexpectedAuthCodeError,
} from '../errors.ts'
import { assertEquals, assertThrows } from '../testing.ts'
import { extract, extractAuth, must, mustPacket } from './assert.ts'

Deno.test('must-packet', () => {
  assertThrows(() => mustPacket(null))
  assertEquals(mustPacket({ code: '1', data: null }), {
    code: '1',
    data: null,
  })
})

Deno.test('must', () => {
  class CustomError extends Error {
    constructor() {
      super('custom')
    }
  }
  assertThrows(() => must(null, new CustomError()), CustomError, 'custom')
  assertThrows(() => must(undefined, new CustomError()), CustomError, 'custom')

  assertEquals(must('test', new CustomError()), 'test')
})

Deno.test('extract', () => {
  assertThrows(
    () => extract('1', null),
    ConnectionClosedError,
    'no data: connection closed'
  )
  assertThrows(
    () =>
      extract('1' as any, {
        code: 'E',
        data: {
          C: 'C',
          S: 'S',
          M: 'M',
        },
      }),
    PostgresError,
    'M'
  )
  assertThrows(
    () =>
      extract('2' as any, {
        code: '1',
        data: null,
      }),
    UnexpectedResponseError,
    'unexpected server response: 1. expected: 2'
  )

  assertEquals(
    extract('E', {
      code: 'E',
      data: {
        C: 'C',
        S: 'S',
        M: 'M',
      },
    }),
    {
      C: 'C',
      S: 'S',
      M: 'M',
    }
  )
})

Deno.test('extractAuth', () => {
  assertThrows(
    () => extractAuth(10 as any, { code: 0, data: null }),
    UnexpectedAuthCodeError,
    'unexpected auth response: 0'
  )

  assertEquals(extractAuth(0, { code: 0, data: null }), null)
})
