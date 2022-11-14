import { Buffer, BufReader } from '../deps.ts'
import { assertRejects } from '../testing.ts'
import { DecodeError } from '../errors.ts'
import { readPacket } from './utils.ts'

Deno.test('insufficient', async () => {
  const buff = new Buffer([0x41, 0x00, 0x00, 0x00, 0x10])
  await assertRejects(
    () => readPacket(new BufReader(buff)),
    DecodeError,
    'insufficient data to read'
  )
})

Deno.test('partial read', async () => {
  const buff = new Buffer([0x41, 0x00, 0x00, 0x00, 0x10, 0x00])
  await assertRejects(() => readPacket(new BufReader(buff)), DecodeError)
})
