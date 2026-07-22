import type { TrolleyScoutEnv } from './env'

const EMAIL_PREFIX = 'enc:v1:'
const AAD = new TextEncoder().encode('trolley-scout:email:v1')
const AES_LABEL = new TextEncoder().encode('aes-gcm')
const LOOKUP_LABEL = new TextEncoder().encode('lookup-hmac')
type EmailKeyUsage = 'decrypt' | 'encrypt' | 'sign'

export class EmailProtectionConfigurationError extends Error {
  constructor() {
    super('Email protection is not configured.')
    this.name = 'EmailProtectionConfigurationError'
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function isProtectedEmail(value: string): boolean {
  return value.startsWith(EMAIL_PREFIX)
}

export function hasEmailProtection(env: TrolleyScoutEnv): boolean {
  try {
    readRootKey(env)
    return true
  } catch {
    return false
  }
}

export async function emailLookup(env: TrolleyScoutEnv, email: string): Promise<string> {
  const key = await deriveKey(env, LOOKUP_LABEL, 'HMAC', ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(normalizeEmail(email)))
  return bytesToBase64Url(new Uint8Array(signature))
}

export async function protectEmail(env: TrolleyScoutEnv, email: string): Promise<string> {
  const key = await deriveKey(env, AES_LABEL, 'AES-GCM', ['encrypt'])
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { additionalData: AAD, iv, name: 'AES-GCM' },
    key,
    new TextEncoder().encode(normalizeEmail(email)),
  )

  return `${EMAIL_PREFIX}${bytesToBase64Url(iv)}:${bytesToBase64Url(new Uint8Array(ciphertext))}`
}

export async function revealEmail(env: TrolleyScoutEnv, stored: string): Promise<string> {
  if (!isProtectedEmail(stored)) {
    return normalizeEmail(stored)
  }

  const parts = stored.split(':')
  if (parts.length !== 4 || !parts[2] || !parts[3]) {
    throw new Error('Stored email ciphertext is malformed.')
  }

  const key = await deriveKey(env, AES_LABEL, 'AES-GCM', ['decrypt'])
  const plaintext = await crypto.subtle.decrypt(
    { additionalData: AAD, iv: base64UrlToBytes(parts[2]), name: 'AES-GCM' },
    key,
    base64UrlToBytes(parts[3]),
  )

  return new TextDecoder().decode(plaintext)
}

async function deriveKey(
  env: TrolleyScoutEnv,
  label: Uint8Array,
  algorithm: 'AES-GCM' | 'HMAC',
  usages: EmailKeyUsage[],
): Promise<CryptoKey> {
  const root = readRootKey(env)
  const material = new Uint8Array(root.length + label.length)
  material.set(root)
  material.set(label, root.length)
  const digest = await crypto.subtle.digest('SHA-256', material)

  return crypto.subtle.importKey(
    'raw',
    digest,
    algorithm === 'AES-GCM' ? { name: algorithm } : { hash: 'SHA-256', name: algorithm },
    false,
    usages,
  )
}

function readRootKey(env: TrolleyScoutEnv): Uint8Array {
  const encoded = env.EMAIL_ENCRYPTION_KEY?.trim()
  if (!encoded) {
    throw new EmailProtectionConfigurationError()
  }

  const key = base64UrlToBytes(encoded)
  if (key.length !== 32) {
    throw new EmailProtectionConfigurationError()
  }

  return key
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlToBytes(value: string): Uint8Array {
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
    const binary = atob(padded)
    return Uint8Array.from(binary, (character) => character.charCodeAt(0))
  } catch {
    throw new EmailProtectionConfigurationError()
  }
}
