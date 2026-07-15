import { md5 } from '@noble/hashes/legacy.js'
import { bytesToHex } from '@noble/hashes/utils.js'

export type PayFastMode = 'sandbox' | 'live'

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
