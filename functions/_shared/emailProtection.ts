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

export function normalizePhone(phone: string): string {
  const normalized = phone.trim().replace(/[\s().-]/g, '')
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) throw new Error('Use an international WhatsApp number, for example +263771234567.')
  return normalized
}

export async function phoneLookup(env: TrolleyScoutEnv, phone: string): Promise<string> {
  return lookupValue(env, normalizePhone(phone), new TextEncoder().encode('phone-lookup-hmac'))
}

export async function identityOtpHash(env: TrolleyScoutEnv, destinationLookup: string, code: string): Promise<string> {
  return lookupValue(env, `${destinationLookup}:${code}`, new TextEncoder().encode('identity-otp-hmac'))
}

export async function protectPhone(env: TrolleyScoutEnv, phone: string): Promise<string> {
  return protectValue(env, normalizePhone(phone), 'enc:phone:v1:', new TextEncoder().encode('phone-aes-gcm'), new TextEncoder().encode('trolley-scout:phone:v1'))
}

export async function revealPhone(env: TrolleyScoutEnv, stored: string): Promise<string> {
  return revealValue(env, stored, 'enc:phone:v1:', new TextEncoder().encode('phone-aes-gcm'), new TextEncoder().encode('trolley-scout:phone:v1'))
}

async function lookupValue(env: TrolleyScoutEnv, value: string, label: Uint8Array): Promise<string> {
  const key = await deriveKey(env, label, 'HMAC', ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))
  return bytesToBase64Url(new Uint8Array(signature))
}

async function protectValue(env: TrolleyScoutEnv, value: string, prefix: string, label: Uint8Array, aad: Uint8Array): Promise<string> {
  const key = await deriveKey(env, label, 'AES-GCM', ['encrypt'])
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt({ additionalData: aad, iv, name: 'AES-GCM' }, key, new TextEncoder().encode(value))
  return `${prefix}${bytesToBase64Url(iv)}:${bytesToBase64Url(new Uint8Array(ciphertext))}`
}

async function revealValue(env: TrolleyScoutEnv, stored: string, prefix: string, label: Uint8Array, aad: Uint8Array): Promise<string> {
  if (!stored.startsWith(prefix)) return stored
  const parts = stored.split(':')
  if (parts.length !== 4 || !parts[2] || !parts[3]) throw new Error('Stored phone ciphertext is malformed.')
  const key = await deriveKey(env, label, 'AES-GCM', ['decrypt'])
  const plaintext = await crypto.subtle.decrypt({ additionalData: aad, iv: base64UrlToBytes(parts[2]), name: 'AES-GCM' }, key, base64UrlToBytes(parts[3]))
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
