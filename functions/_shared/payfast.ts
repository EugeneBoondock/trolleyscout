import { md5 } from '@noble/hashes/legacy.js'
import { bytesToHex } from '@noble/hashes/utils.js'

export type PayFastMode = 'sandbox' | 'live'

export interface PayFastConfig {
  merchantId: string
  merchantKey: string
  passphrase?: string
  mode: PayFastMode
}

interface PayFastEnvLike {
  PAYFAST_MERCHANT_ID?: string
  PAYFAST_MERCHANT_KEY?: string
  PAYFAST_PASSPHRASE?: string
  PAYFAST_MODE?: string
}

// PayFast's public sandbox merchant. Lets checkout work end-to-end for testing
// before live credentials are set. Live mode always requires the real secrets.
const SANDBOX_MERCHANT_ID = '10000100'
const SANDBOX_MERCHANT_KEY = '46f0cd694581a'
const SANDBOX_PASSPHRASE = 'jt7NOE43FZPn'

// Resolves the PayFast credentials to use. In sandbox (the default when
// PAYFAST_MODE is unset) it falls back to the public sandbox merchant so the
// flow is testable immediately. Passphrase is optional — PayFast accounts can
// run without one, so we never block checkout on a missing passphrase.
// A PayFast merchant id is numeric and the key is alphanumeric. Terminals can
// silently capture a control character instead of a pasted value (a Ctrl+V
// keystroke arrives as \x16), which would otherwise send real shoppers to a
// broken PayFast page. Reject anything that is not a plausible credential.
function isPlausibleMerchantId(value: string | undefined): value is string {
  return typeof value === 'string' && /^\d{5,20}$/.test(value.trim())
}

function isPlausibleMerchantKey(value: string | undefined): value is string {
  return typeof value === 'string' && /^[a-z0-9]{8,40}$/i.test(value.trim())
}

export function resolvePayFastConfig(env: PayFastEnvLike): PayFastConfig | undefined {
  const mode: PayFastMode = env.PAYFAST_MODE === 'live' ? 'live' : 'sandbox'

  if (mode === 'live') {
    if (!isPlausibleMerchantId(env.PAYFAST_MERCHANT_ID) || !isPlausibleMerchantKey(env.PAYFAST_MERCHANT_KEY)) {
      return undefined
    }

    return {
      merchantId: env.PAYFAST_MERCHANT_ID.trim(),
      merchantKey: env.PAYFAST_MERCHANT_KEY.trim(),
      mode,
      passphrase: env.PAYFAST_PASSPHRASE?.trim() || undefined,
    }
  }

  const usingPublicSandbox = !env.PAYFAST_MERCHANT_ID
  const passphrase = env.PAYFAST_PASSPHRASE || (usingPublicSandbox ? SANDBOX_PASSPHRASE : undefined)

  return {
    merchantId: env.PAYFAST_MERCHANT_ID || SANDBOX_MERCHANT_ID,
    merchantKey: env.PAYFAST_MERCHANT_KEY || SANDBOX_MERCHANT_KEY,
    mode,
    passphrase,
  }
}

export function createPayFastParameterString(fields: URLSearchParams, passphrase?: string) {
  const pairs: string[] = []

  fields.forEach((value, key) => {
    if (key !== 'signature' && value !== '') {
      pairs.push(`${key}=${encodePayFastValue(value)}`)
    }
  })

  if (passphrase) {
    pairs.push(`passphrase=${encodePayFastValue(passphrase)}`)
  }

  return pairs.join('&')
}

export function createPayFastSignature(fields: URLSearchParams, passphrase?: string) {
  return bytesToHex(md5(new TextEncoder().encode(createPayFastParameterString(fields, passphrase))))
}

export function verifyPayFastSignature(fields: URLSearchParams, passphrase?: string) {
  const actual = fields.get('signature')?.toLowerCase()

  if (!actual || !/^[a-f0-9]{32}$/.test(actual)) {
    return false
  }

  return safeHexEqual(actual, createPayFastSignature(fields, passphrase))
}

export function getPayFastEndpoints(mode: PayFastMode) {
  const host = mode === 'live' ? 'www.payfast.co.za' : 'sandbox.payfast.co.za'

  return {
    engineUrl: `https://${host}/onsite/engine.js`,
    onsiteUrl: `https://${host}/onsite/process`,
    // Classic redirect checkout — works for any account, used as the fallback
    // when onsite payments are not enabled on the merchant account.
    processUrl: `https://${host}/eng/process`,
    validationUrl: `https://${host}/eng/query/validate`,
  }
}

function encodePayFastValue(value: string) {
  return encodeURIComponent(value.trim())
    .replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%20/g, '+')
}

function safeHexEqual(left: string, right: string) {
  if (left.length !== right.length) {
    return false
  }

  let result = 0

  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }

  return result === 0
}
