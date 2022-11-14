import { putVarnum, base64 } from '../deps.ts'
import { SASLError } from '../errors.ts'
import { Encoder } from '../protocol/encoder.ts'
import { Protocol } from '../types.ts'
import { extract, extractAuth, must } from './assert.ts'
import { hmac256, pbkdf2, xorBuffer } from './crypto.ts'

export async function sasl(
  proto: Protocol,
  password: string,
  clientNonce: string
) {
  await proto.send({ code: 'p', data: encodeInit(clientNonce) })
  const serverFirstMessage = await proto
    .recv()
    .then(extract('R'))
    .then(extractAuth(11))
  const attrs = new Map(
    serverFirstMessage
      .split(',')
      .map((item) => item.split('=', 2) as [string, string])
  )
  const serverNonce = must(
    attrs.get('r'),
    new SASLError('missing server nonce')
  )
  const salt = must(attrs.get('s'), new SASLError('missing server salt'))
  const iterations = must(
    attrs.get('i'),
    new SASLError('missing iteration count')
  )

  if (!serverNonce.startsWith(clientNonce)) {
    throw new SASLError('invalid server nonce')
  }

  if (serverNonce.length <= clientNonce.length) {
    throw new SASLError('invalid server nonce')
  }
  const enc = new TextEncoder()

  const saltedPassword = await pbkdf2(
    enc.encode(password),
    base64.decode(salt),
    parseInt(iterations, 10)
  )

  const clientKey = await hmac256(saltedPassword, enc.encode('Client Key'))
  const storedKey = new Uint8Array(
    await crypto.subtle.digest('SHA-256', clientKey)
  )
  const clientFirstMessageBare = `n=*,r=${clientNonce}`
  const clientFinalMessageWithoutProof = `c=biws,r=${serverNonce}`
  const authMessage = enc.encode(
    [
      clientFirstMessageBare,
      serverFirstMessage,
      clientFinalMessageWithoutProof,
    ].join(',')
  )
  const clientSignature = await hmac256(storedKey, authMessage)
  const clientProof = base64.encode(xorBuffer(clientKey, clientSignature))
  const serverKey = await hmac256(saltedPassword, enc.encode('Server Key'))
  const serverSignature = await hmac256(serverKey, authMessage).then(
    base64.encode
  )

  // prettier-ignore
  const clientFinalMessage = clientFinalMessageWithoutProof + ',p=' + clientProof
  await proto.send({ code: 'p', data: enc.encode(clientFinalMessage) })

  const serverFinalMessage = await proto
    .recv()
    .then(extract('R'))
    .then(extractAuth(12))

  if (serverFinalMessage !== 'v=' + serverSignature) {
    throw new SASLError('mismatch server signature')
  }

  await proto.recv().then(extract('R')).then(extractAuth(0))
}

function encodeInit(nonce: string): Uint8Array {
  const enc = new Encoder()
  enc.cstr('SCRAM-SHA-256')
  const size = enc.alloc(4)
  const pos = enc.pos
  enc.str(`n,,n=*,r=${nonce}`)
  putVarnum(size, enc.pos - pos)
  return enc.buff
}
