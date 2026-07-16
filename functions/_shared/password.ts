// Password hashing for member accounts, built on WebCrypto (available in
// Workers). PBKDF2-SHA256 with a per-password random salt. Stored format:
//   pbkdf2$<iterations>$<saltBase64>$<hashBase64>
// Verification is constant-time so a wrong password cannot be timed out.

// Cloudflare Workers' WebCrypto rejects PBKDF2 above 100k iterations
// ("iteration counts above 100000 are not supported"), so this is the platform
// maximum. Verification still accepts whatever count a stored hash records.
const ITERATIONS = 100_000
const KEY_LENGTH_BITS = 256
const SALT_BYTES = 16

export const MIN_PASSWORD_LENGTH = 8

export function validatePassword(password: string): string | undefined {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`
  }

  if (password.length > 256) {
    return 'That password is too long.'
  }

  return undefined
}

async function deriveHash(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { hash: 'SHA-256', iterations, name: 'PBKDF2', salt: salt as BufferSource },
    key,
    KEY_LENGTH_BITS,
  )

  return new Uint8Array(bits)
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const hash = await deriveHash(password, salt, ITERATIONS)

  return `pbkdf2$${ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) {
    return false
  }

  const parts = stored.split('$')

  if (parts.length !== 4 || parts[0] !== 'pbkdf2') {
    return false
  }

  const iterations = Number(parts[1])

  if (!Number.isFinite(iterations) || iterations <= 0) {
    return false
  }

  try {
    const salt = fromBase64(parts[2])
    const expected = fromBase64(parts[3])
    const actual = await deriveHash(password, salt, iterations)

    return timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false
  }

  let result = 0

  for (let index = 0; index < left.length; index += 1) {
    result |= left[index] ^ right[index]
  }

  return result === 0
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''

  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary)
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes
}
