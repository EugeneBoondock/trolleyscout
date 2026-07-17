import { parseMassmartFeed } from './massmart'
import type { RetailerFeedContext, RetailerFeedPage } from './types'

export function parseBuildersFeed(
  payload: unknown,
  context: RetailerFeedContext,
): RetailerFeedPage {
  if (!isRecord(payload) || !Array.isArray(payload.products)) {
    throw new TypeError('Invalid Builders feed payload')
  }

  const products = payload.products.flatMap((product) => {
    if (!isRecord(product) || !isOfficialProductUrl(product.url)) {
      return []
    }

    const price = isRecord(product.price) ? product.price : undefined
    const rawValidFrom = firstText(product, ['startDate', 'validFrom'])
    const rawValidTo = firstText(product, ['expiry', 'expiryDate', 'validTo', 'endDate']) ||
      firstText(price, ['priceValidUntil', 'validTo', 'endDate'])
    const validFrom = normalizeSourceDate(rawValidFrom)
    const validTo = normalizeSourceDate(rawValidTo)

    return [{
      ...product,
      ...(rawValidFrom ? { startDate: validFrom ?? rawValidFrom } : {}),
      expiry: validTo ?? rawValidTo,
    }]
  })

  return parseMassmartFeed(
    { ...payload, products },
    { ...context, retailerId: 'builders' },
  )
}

function normalizeSourceDate(value: string) {
  if (!value) {
    return undefined
  }

  const compact = /^(\d{4})[/-](\d{2})[/-](\d{2})$/.exec(value)
  if (compact) {
    const normalized = `${compact[1]}-${compact[2]}-${compact[3]}`
    return isCalendarDate(normalized) ? normalized : undefined
  }

  return /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value))
    ? value
    : undefined
}

function isCalendarDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
}

function isOfficialProductUrl(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) {
    return false
  }

  try {
    const url = new URL(value, 'https://www.builders.co.za')
    const host = url.hostname.toLocaleLowerCase()
    return (url.protocol === 'https:' || url.protocol === 'http:') &&
      (host === 'builders.co.za' || host.endsWith('.builders.co.za'))
  } catch {
    return false
  }
}

function firstText(value: Record<string, unknown> | undefined, keys: string[]) {
  if (!value) {
    return ''
  }

  for (const key of keys) {
    const candidate = value[key]
    if (typeof candidate === 'string' || typeof candidate === 'number') {
      const text = String(candidate).trim()
      if (text) {
        return text
      }
    }
  }

  return ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
