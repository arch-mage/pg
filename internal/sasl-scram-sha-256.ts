import { base64 } from '../deps.ts'
import { SASLError } from '../errors.ts'
import { Protocol } from '../protocol/mod.ts'
import { AuthCode } from '../types.ts'
import { extract, extractAuth, must } from './assert.ts'
import { hmac256, pbkdf2, xorBuffer } from './crypto.ts'

export async function sasl(proto: Protocol, password: string) {
  const clientNonce = base64.encode(crypto.getRandomValues(new Uint8Array(18)))
  const message = `n,,n=*,r=${clientNonce}`
  await proto.saslInit('SCRAM-SHA-256', message).send()
  const serverFirstMessage = await proto
    .recv()
    .then(extract('R'))
    .then(extractAuth(AuthCode.SASLContinue))
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
  const clientFInalMessage = clientFinalMessageWithoutProof + ',p=' + clientProof
  await proto.sasl(clientFInalMessage).send()

  const serverFinalMessage = await proto
    .recv()
    .then(extract('R'))
    .then(extractAuth(AuthCode.SASLFinal))

  if (serverFinalMessage !== 'v=' + serverSignature) {
    throw new SASLError('mismatch server signature')
  }

  await proto.recv().then(extract('R')).then(extractAuth(AuthCode.Ok))
}
