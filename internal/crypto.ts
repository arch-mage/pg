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

export function xorBuffer(a: Uint8Array, b: Uint8Array) {
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
