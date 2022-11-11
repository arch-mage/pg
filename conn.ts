import {
  SASLError,
  UnexpectedAuthError,
  UnexpectedResponseError,
} from './error.ts'
import { Protocol } from './protocol.ts'
import { AuthCode, Param } from './types.ts'
import {
  mustPacket,
  extract,
  extractAuth,
  must,
  pbkdf2,
  hmac256,
  xorBuffer,
} from './internal.ts'
import { QueryResult } from './result.ts'
import { base64 } from './deps.ts'

export interface Options {
  user: string
  host?: string
  port?: number
  database?: string
  password?: string
}

export class Conn {
  readonly #proto: Protocol

  static async connect(opts: Options) {
    const conn = new Conn(
      Protocol.fromConn(
        await Deno.connect({ port: opts.port ?? 5432, hostname: opts.host })
      )
    )

    const startup: Record<string, string> = {}
    if (opts.database) {
      startup.database = opts.database
    }
    if (opts.password) {
      startup.password = opts.password
    }
    await conn.#startup(opts.user, startup)
    return conn
  }

  constructor(proto: Protocol) {
    this.#proto = proto
  }

  async #sasl(password: string) {
    const clientNonce = base64.encode(
      crypto.getRandomValues(new Uint8Array(18))
    )
    const message = `n,,n=*,r=${clientNonce}`
    await this.#proto.saslInit('SCRAM-SHA-256', message).send()
    const serverFirstMessage = await this.#proto
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
    const clientFInalMessageWithoutProof = `c=biws,r=${serverNonce}`
    const authMessage = enc.encode(
      [
        clientFirstMessageBare,
        serverFirstMessage,
        clientFInalMessageWithoutProof,
      ].join(',')
    )
    const clientSignature = await hmac256(storedKey, authMessage)
    const clientProof = base64.encode(xorBuffer(clientKey, clientSignature))
    const serverKey = await hmac256(saltedPassword, enc.encode('Server Key'))
    const serverSignature = await hmac256(serverKey, authMessage).then(
      base64.encode
    )

    // prettier-ignore
    const clientFInalMessage = clientFInalMessageWithoutProof + ',p=' + clientProof
    await this.#proto.sasl(clientFInalMessage).send()

    const serverFinalMessage = await this.#proto
      .recv()
      .then(extract('R'))
      .then(extractAuth(AuthCode.SASLFinal))

    if (serverFinalMessage !== 'v=' + serverSignature) {
      throw new SASLError('mismatch server signature')
    }

    await this.#proto.recv().then(extract('R')).then(extractAuth(AuthCode.Ok))
  }

  async #startup(user: string, opts: Record<string, string>) {
    await this.#proto.startup(user, opts).send()
    const auth = await this.#proto.recv().then(extract('R'))

    if (auth.code === 10) {
      await this.#sasl(opts.password)
    } else if (auth.code === 0) {
      /* empty */
    } else {
      throw new UnexpectedAuthError(auth.code, 0)
    }

    for await (const packet of this.#proto) {
      if (packet.code === 'K') {
        break
      }
      extract('S', packet)
    }

    await this.#proto.recv().then(extract('Z'))
  }

  async batch(query: string) {
    await this.#proto.query(query).send()

    for await (const packet of this.#proto) {
      if (packet.code === 'Z') {
        break
      }
    }
  }

  async query(
    query: string,
    params: Param[] = []
  ): Promise<QueryResult | null> {
    await this.#proto
      .parse(query)
      .bind(params, undefined, undefined, [0], [1])
      .describe('P')
      .execute()
      .close('P')
      .sync()
      .send()

    await this.#proto.recv().then(extract('1'))
    await this.#proto.recv().then(extract('2'))
    const packet = await this.#proto.recv().then(mustPacket)
    if (packet.code === 'n') {
      await this.#proto.recv().then(extract('C'))
      await this.#proto.recv().then(extract('3'))
      await this.#proto.recv().then(extract('Z'))
      return null
    }
    if (packet.code === 'T') {
      return new QueryResult(this.#proto, packet.data)
    }

    throw new UnexpectedResponseError(packet.code)
  }
}
