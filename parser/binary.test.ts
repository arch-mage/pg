import { assertEquals, uint8 } from '../testing.ts'
import { numeric, parse } from './binary.ts'

Deno.test('null', () => {
  assertEquals(parse(16, null), null)
})

Deno.test('bool', () => {
  assertEquals(parse(16, uint8(0)), false)
  assertEquals(parse(16, uint8(1)), true)
  assertEquals(parse(16, uint8(2)), true)
  assertEquals(parse(16, uint8(3)), true)
})

Deno.test('char', () => {
  assertEquals(parse(18, uint8(0x41)), 'A')
  assertEquals(parse(18, uint8(0x42)), 'B')
  assertEquals(parse(18, uint8(0x43)), 'C')
})

Deno.test('text', () => {
  assertEquals(parse(19, uint8(0x41, 0x42, 0x43)), 'ABC')
})

Deno.test('int2', () => {
  assertEquals(parse(21, uint8(0x00, 0x01)), 1)
  assertEquals(parse(21, uint8(0xff, 0xff)), -1)
  assertEquals(parse(21, uint8(0x00, 0x01, 0x00, 0x00)), 1)
  assertEquals(parse(21, uint8(0xff, 0xff, 0x00, 0x00)), -1)
})

Deno.test('int4', () => {
  assertEquals(parse(23, uint8(0x00, 0x00, 0x00, 0x01)), 1)
  assertEquals(parse(23, uint8(0xff, 0xff, 0xff, 0xff)), -1)
  assertEquals(parse(23, uint8(0x00, 0x00, 0x00, 0x01, 0x00)), 1)
  assertEquals(parse(23, uint8(0xff, 0xff, 0xff, 0xff, 0x00)), -1)
})

Deno.test('int8', () => {
  assertEquals(
    parse(20, uint8(0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01)),
    1n
  )
  assertEquals(
    parse(20, uint8(0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff)),
    -1n
  )
  assertEquals(
    parse(20, uint8(0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00)),
    1n
  )
  assertEquals(
    parse(20, uint8(0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x00)),
    -1n
  )
})

Deno.test('oid', () => {
  assertEquals(parse(24, uint8(0x00, 0x00, 0x00, 0x01)), 1)
  assertEquals(parse(24, uint8(0xff, 0xff, 0xff, 0xff)), 4294967295)
  assertEquals(parse(24, uint8(0x00, 0x00, 0x00, 0x01, 0x00)), 1)
  assertEquals(parse(24, uint8(0xff, 0xff, 0xff, 0xff, 0x00)), 4294967295)
})

Deno.test('timestamp', () => {
  assertEquals(
    parse(1114, uint8(255, 252, 162, 254, 196, 200, 32, 0)),
    new Date('1970-01-01T00:00:00Z')
  )
  assertEquals(
    parse(1114, uint8(0, 0, 0, 0, 0, 0, 0, 0)),
    new Date('2000-01-01T00:00:00Z')
  )
  assertEquals(
    parse(1114, uint8(0, 3, 93, 21, 89, 15, 64, 0)),
    new Date('2030-01-01T00:00:00Z')
  )
})

Deno.test('timestamptz', () => {
  assertEquals(
    parse(1184, uint8(255, 252, 162, 254, 196, 200, 32, 0)),
    new Date('1970-01-01T00:00:00Z')
  )
  assertEquals(
    parse(1184, uint8(0, 0, 0, 0, 0, 0, 0, 0)),
    new Date('2000-01-01T00:00:00Z')
  )
  assertEquals(
    parse(1184, uint8(0, 3, 93, 21, 89, 15, 64, 0)),
    new Date('2030-01-01T00:00:00Z')
  )
})

Deno.test('numeric', () => {
  const tests = [
    {
      output: '1',
      input: [0, 1, 0, 0, 0, 0, 0, 0, 0, 1],
    },
    {
      output: '12',
      input: [0, 1, 0, 0, 0, 0, 0, 0, 0, 12],
    },
    {
      output: '123',
      input: [0, 1, 0, 0, 0, 0, 0, 0, 0, 123],
    },
    {
      output: '1234',
      input: [0, 1, 0, 0, 0, 0, 0, 0, 4, 210],
    },
    {
      output: '12345',
      input: [0, 2, 0, 1, 0, 0, 0, 0, 0, 1, 9, 41],
    },
    {
      output: '123456',
      input: [0, 2, 0, 1, 0, 0, 0, 0, 0, 12, 13, 128],
    },
    {
      output: '1234567',
      input: [0, 2, 0, 1, 0, 0, 0, 0, 0, 123, 17, 215],
    },
    {
      output: '12345678',
      input: [0, 2, 0, 1, 0, 0, 0, 0, 4, 210, 22, 46],
    },
    {
      output: '123456789',
      input: [0, 3, 0, 2, 0, 0, 0, 0, 0, 1, 9, 41, 26, 133],
    },
    {
      output: '1.1',
      input: [0, 2, 0, 0, 0, 0, 0, 1, 0, 1, 3, 232],
    },
    {
      output: '1.12',
      input: [0, 2, 0, 0, 0, 0, 0, 2, 0, 1, 4, 176],
    },
    {
      output: '1.123',
      input: [0, 2, 0, 0, 0, 0, 0, 3, 0, 1, 4, 206],
    },
    {
      output: '1.1234',
      input: [0, 2, 0, 0, 0, 0, 0, 4, 0, 1, 4, 210],
    },
    {
      output: '1.12345',
      input: [0, 3, 0, 0, 0, 0, 0, 5, 0, 1, 4, 210, 19, 136],
    },
    {
      output: '1.123456',
      input: [0, 3, 0, 0, 0, 0, 0, 6, 0, 1, 4, 210, 21, 224],
    },
    {
      output: '1.1234567',
      input: [0, 3, 0, 0, 0, 0, 0, 7, 0, 1, 4, 210, 22, 38],
    },
    {
      output: '1.12345678',
      input: [0, 3, 0, 0, 0, 0, 0, 8, 0, 1, 4, 210, 22, 46],
    },
    {
      output: '1.123456789',
      input: [0, 4, 0, 0, 0, 0, 0, 9, 0, 1, 4, 210, 22, 46, 35, 40],
    },
    {
      output: '1',
      input: [0, 1, 0, 0, 0, 0, 0, 0, 0, 1],
    },
    {
      output: '10',
      input: [0, 1, 0, 0, 0, 0, 0, 0, 0, 10],
    },
    {
      output: '100',
      input: [0, 1, 0, 0, 0, 0, 0, 0, 0, 100],
    },
    {
      output: '1000',
      input: [0, 1, 0, 0, 0, 0, 0, 0, 3, 232],
    },
    {
      output: '10000',
      input: [0, 1, 0, 1, 0, 0, 0, 0, 0, 1],
    },
    {
      output: '100000',
      input: [0, 1, 0, 1, 0, 0, 0, 0, 0, 10],
    },
    {
      output: '1000000',
      input: [0, 1, 0, 1, 0, 0, 0, 0, 0, 100],
    },
    {
      output: '10000000',
      input: [0, 1, 0, 1, 0, 0, 0, 0, 3, 232],
    },
    {
      output: '100000000',
      input: [0, 1, 0, 2, 0, 0, 0, 0, 0, 1],
    },
    {
      output: '1.1',
      input: [0, 2, 0, 0, 0, 0, 0, 1, 0, 1, 3, 232],
    },
    {
      output: '1.01',
      input: [0, 2, 0, 0, 0, 0, 0, 2, 0, 1, 0, 100],
    },
    {
      output: '1.001',
      input: [0, 2, 0, 0, 0, 0, 0, 3, 0, 1, 0, 10],
    },
    {
      output: '1.0001',
      input: [0, 2, 0, 0, 0, 0, 0, 4, 0, 1, 0, 1],
    },
    {
      output: '1.00001',
      input: [0, 3, 0, 0, 0, 0, 0, 5, 0, 1, 0, 0, 3, 232],
    },
    {
      output: '1.000001',
      input: [0, 3, 0, 0, 0, 0, 0, 6, 0, 1, 0, 0, 0, 100],
    },
    {
      output: '1.0000001',
      input: [0, 3, 0, 0, 0, 0, 0, 7, 0, 1, 0, 0, 0, 10],
    },
    {
      output: '1.00000001',
      input: [0, 3, 0, 0, 0, 0, 0, 8, 0, 1, 0, 0, 0, 1],
    },
    {
      output: '1.000000001',
      input: [0, 4, 0, 0, 0, 0, 0, 9, 0, 1, 0, 0, 0, 0, 3, 232],
    },
  ]

  for (const test of tests) {
    const input = new Uint8Array(test.input)
    assertEquals(numeric(input, 'S'), test.output)
    assertEquals(numeric(input, 'N'), parseFloat(test.output))
  }
})
