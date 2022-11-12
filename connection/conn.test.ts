import { base64 } from '../deps.ts'
import { hmac256, pbkdf2 } from '../internal/crypto.ts'
import { Encoder } from '../protocol/encoder.ts'
import { Conn } from './mod.ts'
import { TestBuffer } from '../testing.ts'

Deno.test('auth ok', async () => {
  const buff = new TestBuffer()

  // prettier-ignore
  const enc = new Encoder()
    // authentication ok
    .str('R').int32(8).int32(0)
    // parameter status
    .str('S').int32(8).cstr('a').cstr('b')
    // backend key data
    .str('K').int32(12).int32(1).int32(2)
    // ready for query
    .str('Z').int32(5).str('I')

  buff.reader.writeSync(enc.buff as Uint8Array)
  await Conn.fromConn(buff, { user: 'postgres', database: 'postgres' })
})

Deno.test('auth sasl', async () => {
  async function createBuff(
    password: string,
    clientNonce: string,
    serverNonce: string
  ) {
    const enc = new TextEncoder()
    const salt = 'salt'
    const iter = 4096
    serverNonce = clientNonce + serverNonce
    const clientFirstMessageBare = `n=*,r=${clientNonce}`
    const clientFinalMessageWithoutProof = `c=biws,r=${serverNonce}`
    const serverFirstMessage = `r=${serverNonce},s=${salt},i=${iter}`
    const authMessage = enc.encode(
      [
        clientFirstMessageBare,
        serverFirstMessage,
        clientFinalMessageWithoutProof,
      ].join(',')
    )

    const saltedPassword = await pbkdf2(
      enc.encode(password),
      base64.decode(salt),
      iter
    )
    const serverKey = await hmac256(saltedPassword, enc.encode('Server Key'))
    const serverSignature = await hmac256(serverKey, authMessage).then(
      base64.encode
    )
    const serverFinalMessage = `v=${serverSignature}`

    const buff = new TestBuffer()
    // prettier-ignore
    const data = new Encoder()
      // authentication sasl
      .str('R').int32(23).int32(10).cstr('SCRAM-SHA-256').byte(0)
      // authentication sasl continue
      .str('R').int32(serverFirstMessage.length + 8).int32(11).str(serverFirstMessage)
      // authentication sasl final
      .str('R').int32(serverFinalMessage.length + 8).int32(12).str(serverFinalMessage)
      // authentication ok
      .str('R').int32(8).int32(0)
      // parameter status
      .str('S').int32(8).cstr('a').cstr('b')
      // backend key data
      .str('K').int32(12).int32(1).int32(2)
      // ready for query
      .str('Z').int32(5).str('I')
    buff.reader.writeSync(data.buff as Uint8Array)
    return buff
  }

  const rand = () => base64.encode(crypto.getRandomValues(new Uint8Array(18)))
  const tests: Array<[string, string, string]> = [
    ['postgres', 'client', 'server'],
    [rand(), rand(), rand()],
    [rand(), rand(), rand()],
    [rand(), rand(), rand()],
    [rand(), rand(), rand()],
  ]

  for (const test of tests) {
    const opts = {
      user: 'postgres',
      password: test[0],
      database: 'postgres',
      nonce: test[1],
    }
    const buff = await createBuff(opts.password, opts.nonce, test[2])
    await Conn.fromConn(buff, opts)
  }
})
