import { BackendPacket } from '../decoder/packet-decoder.ts'
import { base64 } from '../deps.ts'
import { FrontendPacket } from '../encoder/packet-encoder.ts'
import { SASLError, UnexpectedAuth } from '../errors.ts'
import { assertRejects, packets } from '../testing.ts'
import { hmac256, pbkdf2, sasl } from './sasl.ts'

async function createPackets(
  password: string,
  clientNonce: string,
  serverNonce: string,
  salt: string,
  iter: number
): Promise<BackendPacket[]> {
  const enc = new TextEncoder()

  const nonce = `${clientNonce}${serverNonce}`
  const clientFirstMessageBare = `n=*,r=${clientNonce}`
  const clientFinalMessageWithoutProof = `c=biws,r=${nonce}`
  const serverFirstMessage = `r=${nonce},s=${salt},i=${iter}`
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
  return [
    {
      code: 'R',
      data: { code: 11, data: serverFirstMessage },
    },
    {
      code: 'R',
      data: { code: 12, data: serverFinalMessage },
    },
    {
      code: 'R',
      data: { code: 0 },
    },
  ]
}

function randomString(): string {
  return base64.encode(crypto.getRandomValues(new Uint8Array(18)))
}

Deno.test('sasl', async () => {
  for (let i = 1; i <= 100; ++i) {
    const password = randomString()
    const clientNonce = randomString()
    const devnull = new WritableStream<FrontendPacket[]>()
    const reader = packets(
      await createPackets(
        password,
        clientNonce,
        randomString(),
        randomString(),
        i
      )
    )
    await sasl(devnull.getWriter(), reader.getReader(), password, clientNonce)
  }
})

Deno.test('sasl errors', async () => {
  function saslTest(packs: BackendPacket[]) {
    const devnull = new WritableStream<FrontendPacket[]>()
    const reader = packets(packs)
    return sasl(devnull.getWriter(), reader.getReader(), 'password', 'client')
  }

  function pack(code: 11 | 12, data: string): BackendPacket {
    return { code: 'R', data: { code, data } }
  }

  await assertRejects(
    () => saslTest([pack(11, 's=salt,i=4096')]),
    SASLError,
    'missing server nonce'
  )

  await assertRejects(
    () => saslTest([pack(11, 'r=clientserver,i=4096')]),
    SASLError,
    'missing server salt'
  )

  await assertRejects(
    () => saslTest([pack(11, 'r=clientserver,s=salt')]),
    SASLError,
    'missing iteration count'
  )

  await assertRejects(
    () => saslTest([pack(11, 'r=server,s=salt,i=4096')]),
    SASLError,
    'invalid server nonce'
  )

  await assertRejects(
    () => saslTest([pack(11, 'r=client,s=salt,i=4096')]),
    SASLError,
    'invalid server nonce'
  )

  await assertRejects(
    () =>
      saslTest([pack(11, 'r=clientserver,s=salt,i=4096'), pack(11, 'v=wew')]),
    UnexpectedAuth,
    'unexpected auth response: 11. expected: 12'
  )

  await assertRejects(
    () =>
      saslTest([pack(11, 'r=clientserver,s=salt,i=4096'), pack(12, 'v=wew')]),
    SASLError,
    'mismatch server signature'
  )
})
