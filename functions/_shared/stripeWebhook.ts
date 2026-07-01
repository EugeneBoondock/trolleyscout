interface ParsedStripeSignature {
  signatures: string[]
  timestamp: number
}

export async function verifyStripeWebhookSignature(options: {
  header: string | null
  nowSeconds?: number
  payload: string
  secret?: string
  toleranceSeconds?: number
}) {
  if (!options.secret || !options.header) {
    return false
  }

  const parsed = parseStripeSignatureHeader(options.header)

  if (!parsed) {
    return false
  }

  const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000)
  const toleranceSeconds = options.toleranceSeconds ?? 300

  if (Math.abs(nowSeconds - parsed.timestamp) > toleranceSeconds) {
    return false
  }

  const expected = await createStripeWebhookSignature({
    payload: options.payload,
    secret: options.secret,
    timestamp: parsed.timestamp,
  })

  return parsed.signatures.some((signature) => safeHexEqual(expected, signature))
}

export async function createStripeWebhookSignature(options: {
  payload: string
  secret: string
  timestamp: number
}) {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(options.secret),
    {
      hash: 'SHA-256',
      name: 'HMAC',
    },
    false,
    ['sign'],
  )
  const bytes = await crypto.subtle.sign('HMAC', key, encoder.encode(`${options.timestamp}.${options.payload}`))

  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function parseStripeSignatureHeader(header: string): ParsedStripeSignature | undefined {
  const parts = header.split(',').map((part) => part.trim())
  const timestampPart = parts.find((part) => part.startsWith('t='))
  const timestamp = Number(timestampPart?.slice(2))
  const signatures = parts
    .filter((part) => part.startsWith('v1='))
    .map((part) => part.slice(3))
    .filter(Boolean)

  if (!Number.isFinite(timestamp) || signatures.length === 0) {
    return undefined
  }

  return {
    signatures,
    timestamp,
  }
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
