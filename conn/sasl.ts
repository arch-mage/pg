import { Authentication, BackendPacket } from '../decoder/packet-decoder.ts'
import { base64 } from '../deps.ts'
import { Encoder } from '../encoder/encoder.ts'
import { FrontendPacket } from '../encoder/packet-encoder.ts'
import { SASLError, UnexpectedAuth } from '../errors.ts'
import { hasProp, putInt32 } from '../utils.ts'
import { extract } from './extract.ts'

export async function sasl(
  writer: WritableStreamDefaultWriter<FrontendPacket>,
  reader: ReadableStreamDefaultReader<BackendPacket>,
  password: string,
  nonce: string
) {
  await writer.ready
  await writer.write({ code: 'p', data: encodeInit(nonce) })
  const serverFirstMessage = extractAuth(11, extract('R', await reader.read()))
  const attrs = new Map(
    serverFirstMessage
      .split(',')
      .map((item) => item.split('=', 2) as [string, string])
  )
  const serverNonce = attrs.get('r')
  const salt = attrs.get('s')
  const iterations = attrs.get('i')

  if (!serverNonce) {
    throw new SASLError('missing server nonce')
  }

  if (!salt) {
    throw new SASLError('missing server salt')
  }

  if (!iterations) {
    throw new SASLError('missing iteration count')
  }

  if (!serverNonce.startsWith(nonce)) {
    throw new SASLError('invalid server nonce')
  }

  if (serverNonce.length <= nonce.length) {
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
  const clientFirstMessageBare = `n=*,r=${nonce}`
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
  await writer.write({ code: 'p', data: enc.encode(clientFinalMessage) })

  const serverFinalMessage = extractAuth(12, extract('R', await reader.read()))

  if (serverFinalMessage !== 'v=' + serverSignature) {
    throw new SASLError('mismatch server signature')
  }

  extractAuth(0, extract('R', await reader.read()))
}

function encodeInit(nonce: string): Uint8Array {
  const enc = new Encoder()
  enc.cstr('SCRAM-SHA-256')
  const size = enc.alloc(4)
  const pos = enc.pos
  enc.str(`n,,n=*,r=${nonce}`)
  putInt32(size, enc.pos - pos)
  return enc.buff
}

function extractAuth(code: 0, data: Authentication['data']): void
function extractAuth(code: 10, data: Authentication['data']): string[]
function extractAuth(code: 11, data: Authentication['data']): string
function extractAuth(code: 12, data: Authentication['data']): string
function extractAuth(code: number, data: Authentication['data']): unknown {
  if (data.code !== code) {
    throw new UnexpectedAuth(data, code)
  }
  if (hasProp(data, 'data')) {
    return data.data
  }
}

export async function pbkdf2(
  password: Uint8Array,
  salt: Uint8Array,
  iterations: number
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    password,
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  )

  const buff = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    32 * 8
  )

  return new Uint8Array(buff)
}

export async function hmac256(password: Uint8Array, message: Uint8Array) {
  const key = await crypto.subtle.importKey(
    'raw',
    password,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const buff = await crypto.subtle.sign('HMAC', key, message)
  return new Uint8Array(buff)
}

function xorBuffer(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) {
    throw new TypeError('mismatch array length')
  }
  if (a.length === 0) {
    throw new TypeError('empty array')
  }

  const c = new Uint8Array(a.length)
  for (let i = 0; i < a.length; ++i) {
    c[i] = a[i] ^ b[i]
  }
  return c
}
