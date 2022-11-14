import { BackendPacket } from '../decoder/packet-decoder.ts'
import { base64 } from '../deps.ts'
import { FrontendPacket } from '../encoder/packet-encoder.ts'
import { packets } from '../testing.ts'
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
    const devnil = new WritableStream<FrontendPacket>()
    const reader = packets(
      await createPackets(
        password,
        clientNonce,
        randomString(),
        randomString(),
        i
      )
    )
    await sasl(devnil.getWriter(), reader.getReader(), password, clientNonce)
  }
})
