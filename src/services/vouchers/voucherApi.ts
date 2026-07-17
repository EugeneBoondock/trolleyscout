import { retailers } from '../../data/retailers'
import type { Voucher, VoucherKind, VoucherRedemptionMode } from './types'

const MAX_VOUCHERS_PER_RESPONSE = 200
const voucherKinds = new Set<VoucherKind>(['loyalty_offer', 'product_coupon', 'public_code'])
const redemptionModes = new Set<VoucherRedemptionMode>(['automatic', 'clip', 'code', 'loyalty'])
const voucherStatuses = new Set<Voucher['status']>(['active', 'expired', 'inactive'])

const officialRetailerHosts = new Map<string, string[]>(
  retailers.map((retailer) => [
    retailer.id,
    [...new Set(retailer.sources.flatMap((source) => {
      try {
        return [new URL(source.url).hostname.toLowerCase().replace(/^www\./, '')]
      } catch {
        return []
      }
    }))],
  ]),
)

export async function loadVouchers(options: {
  retailerId?: string
  signal?: AbortSignal
} = {}): Promise<Voucher[]> {
  const params = new URLSearchParams()
  if (options.retailerId?.trim()) {
    const retailerId = options.retailerId.trim()
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(retailerId)) {
      throw new Error('Retailer ID is invalid.')
    }
    params.set('retailerId', retailerId)
  }
  const suffix = params.size > 0 ? '?' + params.toString() : ''
  const data = await request('/api/vouchers' + suffix, {
    method: 'GET',
    signal: options.signal,
  })
  if (!Array.isArray(data.vouchers) || data.vouchers.length > MAX_VOUCHERS_PER_RESPONSE) {
    throw malformedDataError()
  }
  return data.vouchers.map(parseVoucher)
}

export async function claimVoucher(voucherId: string) {
  const normalizedId = voucherActionId(voucherId)
  const data = await request('/api/vouchers', {
    body: JSON.stringify({ voucherId: normalizedId }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  if (data.claimed !== true) {
    throw malformedDataError()
  }
  return true
}

export async function removeVoucherClaim(voucherId: string) {
  const normalizedId = voucherActionId(voucherId)
  const data = await request(
    '/api/vouchers?voucherId=' + encodeURIComponent(normalizedId),
    { method: 'DELETE' },
  )
  if (data.removed !== true) {
    throw malformedDataError()
  }
  return true
}

async function request(path: string, init: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(path, {
    ...init,
    headers: {
      accept: 'application/json',
      ...init.headers,
    },
  })
  const responseText = await response.text()
  let envelope: unknown
  try {
    envelope = JSON.parse(responseText)
  } catch {
    if (!response.ok) {
      throw new Error('Voucher API returned ' + response.status + '.')
    }
    throw malformedDataError()
  }

  if (!isRecord(envelope)) {
    if (!response.ok) {
      throw new Error('Voucher API returned ' + response.status + '.')
    }
    throw malformedDataError()
  }

  const data = isRecord(envelope.data) ? envelope.data : undefined
  if (!response.ok) {
    const issues = Array.isArray(data?.issues)
      ? data.issues.filter((issue): issue is string => typeof issue === 'string')
      : []
    const envelopeError = typeof envelope.error === 'string' ? envelope.error : undefined
    throw new Error(issues[0] ?? envelopeError ?? 'Voucher API returned ' + response.status + '.')
  }
  if (!data) {
    throw malformedDataError()
  }
  return data
}

function parseVoucher(value: unknown): Voucher {
  if (!isRecord(value)) {
    throw malformedDataError()
  }

  const retailerId = requiredString(value.retailerId, 100)
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(retailerId)) {
    throw malformedDataError()
  }
  const voucherKind = requiredString(value.voucherKind, 40) as VoucherKind
  const redemptionMode = requiredString(value.redemptionMode, 40) as VoucherRedemptionMode
  const status = requiredString(value.status, 20) as Voucher['status']
  if (!voucherKinds.has(voucherKind) ||
    !redemptionModes.has(redemptionMode) ||
    !voucherStatuses.has(status)) {
    throw malformedDataError()
  }

  const publicReusable = requiredBoolean(value.publicReusable)
  const code = optionalString(value.code, 100)
  if ((code && !publicReusable) || (publicReusable && !code) ||
    (voucherKind === 'public_code' && !publicReusable) ||
    (code && hasUnsafeDisplayCharacters(code))) {
    throw malformedDataError()
  }

  const sourceUrl = safeVoucherRetailerUrl(requiredString(value.sourceUrl, 2_048), retailerId)
  const redemptionUrl = safeVoucherRetailerUrl(
    requiredString(value.redemptionUrl, 2_048),
    retailerId,
  )
  if (!sourceUrl || !redemptionUrl) {
    throw malformedDataError()
  }

  const imageValue = optionalString(value.imageUrl, 2_048)
  const imageUrl = imageValue ? safeVoucherImageUrl(imageValue) : undefined
  if (imageValue && !imageUrl) {
    throw malformedDataError()
  }

  const validFrom = optionalDateBoundary(value.validFrom)
  const validTo = optionalDateBoundary(value.validTo)
  if (validFrom && validTo && Date.parse(validFrom) > Date.parse(validTo)) {
    throw malformedDataError()
  }

  return {
    accountRequired: requiredBoolean(value.accountRequired),
    benefitText: requiredString(value.benefitText, 1_000),
    capturedAt: requiredTimestamp(value.capturedAt),
    claimed: requiredBoolean(value.claimed),
    ...(code ? { code } : {}),
    createdAt: requiredTimestamp(value.createdAt),
    evidenceText: requiredString(value.evidenceText, 4_000),
    expiresAt: requiredTimestamp(value.expiresAt),
    externalId: requiredString(value.externalId, 300),
    id: requiredString(value.id, 200),
    ...(imageUrl ? { imageUrl } : {}),
    lastSeenAt: requiredTimestamp(value.lastSeenAt),
    ...(optionalString(value.productId, 300) ? {
      productId: optionalString(value.productId, 300),
    } : {}),
    ...(optionalString(value.productTitle, 500) ? {
      productTitle: optionalString(value.productTitle, 500),
    } : {}),
    publicReusable,
    redemptionMode,
    redemptionUrl,
    retailerId,
    sourceUrl,
    status,
    ...(optionalString(value.termsText, 4_000) ? {
      termsText: optionalString(value.termsText, 4_000),
    } : {}),
    title: requiredString(value.title, 500),
    updatedAt: requiredTimestamp(value.updatedAt),
    ...(validFrom ? { validFrom } : {}),
    ...(validTo ? { validTo } : {}),
    voucherKind,
  }
}

function voucherActionId(value: string) {
  const normalized = value.trim()
  if (!normalized || normalized.length > 200) {
    throw new Error('Voucher ID is required.')
  }
  return normalized
}

function requiredBoolean(value: unknown) {
  if (typeof value !== 'boolean') {
    throw malformedDataError()
  }
  return value
}

function requiredString(value: unknown, maxLength: number) {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
    throw malformedDataError()
  }
  return value
}

function optionalString(value: unknown, maxLength: number) {
  if (value === undefined || value === null) {
    return undefined
  }
  return requiredString(value, maxLength)
}

function requiredTimestamp(value: unknown) {
  const timestamp = requiredString(value, 64)
  if (!Number.isFinite(Date.parse(timestamp))) {
    throw malformedDataError()
  }
  return timestamp
}

function optionalDateBoundary(value: unknown) {
  const boundary = optionalString(value, 64)
  if (!boundary) {
    return undefined
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(boundary)) {
    const [year, month, day] = boundary.split('-').map(Number)
    const date = new Date(Date.UTC(year, month - 1, day))
    if (date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day) {
      throw malformedDataError()
    }
    return boundary
  }
  if (!Number.isFinite(Date.parse(boundary))) {
    throw malformedDataError()
  }
  return boundary
}

export function safeVoucherRetailerUrl(value: string, retailerId: string) {
  const safeUrl = safeVoucherImageUrl(value)
  if (!safeUrl) {
    return undefined
  }
  const allowedHosts = officialRetailerHosts.get(retailerId)
  if (!allowedHosts || allowedHosts.length === 0) {
    return safeUrl
  }
  const hostname = new URL(safeUrl).hostname.toLowerCase().replace(/^www\./, '')
  return allowedHosts.some((allowedHost) =>
    hostname === allowedHost || hostname.endsWith('.' + allowedHost))
    ? safeUrl
    : undefined
}

export function safeVoucherImageUrl(value: string) {
  try {
    const url = new URL(value)
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
    if (url.protocol !== 'https:' || url.username || url.password ||
      !hostname.includes('.') || hostname === 'localhost' || hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') || /^[\d.]+$/.test(hostname) || hostname.includes(':')) {
      return undefined
    }
    return url.toString()
  } catch {
    return undefined
  }
}

function hasUnsafeDisplayCharacters(value: string) {
  return value.includes('\u00e2\u20ac\u201d') ||
    value.includes('\u2014') ||
    /[\u202a-\u202e\u2066-\u2069]/i.test(value) ||
    hasAsciiControlCharacter(value)
}

function hasAsciiControlCharacter(value: string) {
  for (const character of value) {
    const code = character.charCodeAt(0)
    if (code <= 31 || code === 127) {
      return true
    }
  }
  return false
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function malformedDataError() {
  return new Error('Voucher API returned malformed data.')
}
