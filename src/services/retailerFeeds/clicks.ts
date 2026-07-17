import {
  buildRetailerEvidence,
  isStructuredDealActive,
  retailerSlug,
} from './types'
import type {
  RetailerDealCandidate,
  RetailerFeedContext,
  RetailerFeedPage,
} from './types'

const clicksOrigin = 'https://clicks.co.za'
const clicksRetailerId = retailerSlug('clicks')
const clicksScope = { type: 'online' } as const

export function parseClicksFeed(
  payload: unknown,
  context: RetailerFeedContext,
): RetailerFeedPage {
  if (!isRecord(payload) || !Array.isArray(payload.results)) {
    throw new TypeError('Invalid Clicks feed payload')
  }

  if (payload.pagination !== undefined && !isRecord(payload.pagination)) {
    throw new TypeError('Invalid Clicks feed payload')
  }

  const results = payload.results
  const pagination = isRecord(payload.pagination) ? payload.pagination : undefined
  const candidates: RetailerDealCandidate[] = []

  for (const result of results) {
    const promotions = arrayValue(result, 'potentialPromotions')
    const promotion = promotions.find(isRecord)
    const promotionId = firstText(promotion, ['code', 'id', 'promotionId'])
    const productId = textValue(result, 'code')
    const brand = textValue(result, 'brand')
    const name = textValue(result, 'name')
    const title = brand && !name.toLocaleLowerCase().startsWith(brand.toLocaleLowerCase())
      ? `${brand} ${name}`.trim()
      : name
    const path = textValue(result, 'url')
    const price = recordValue(result, 'price')
    const listedPriceCents = moneyToCents(price?.formattedValue ?? price?.value)
    const promotedPriceCents = moneyToCents(price?.grossPriceWithPromotionApplied)
    const priceCents = promotedPriceCents ?? listedPriceCents
    const stock = recordValue(result, 'stock')
    const stockLevel = recordValue(stock, 'stockLevelStatus')
    const validFrom = firstText(promotion, ['startDate', 'validFrom']) || undefined
    const validTo = firstText(promotion, ['endDate', 'validTo']) || undefined

    if (
      !promotionId ||
      !productId ||
      !title ||
      !path ||
      priceCents === undefined ||
      textValue(stockLevel, 'code') === 'outOfStock' ||
      !isStructuredDealActive({ capturedAt: context.capturedAt, validFrom, validTo })
    ) {
      continue
    }

    const previousPriceCents = promotedPriceCents !== undefined &&
      listedPriceCents !== undefined &&
      promotedPriceCents < listedPriceCents
      ? listedPriceCents
      : undefined

    candidates.push({
      capturedAt: context.capturedAt,
      evidenceText: buildRetailerEvidence({
        priceCents,
        previousPriceCents,
        promotionMarker: promotionId,
        scope: clicksScope,
        sourceId: productId,
        validFrom,
        validTo,
      }),
      imageUrl: productImageUrl(result),
      priceCents,
      previousPriceCents,
      productId,
      productUrl: absoluteUrl(path, clicksOrigin) ?? path,
      promotionId,
      retailerId: clicksRetailerId,
      savingText: firstText(promotion, ['description', 'name', 'text']) || undefined,
      scope: clicksScope,
      sourceKind: 'structured',
      sourceUrl: context.sourceUrl,
      title,
      validFrom,
      validTo,
    })
  }

  const currentPage = integerValue(pagination, 'currentPage')
  const totalPages = integerValue(pagination, 'totalPages')
  const totalCount = firstInteger(pagination, [
    'totalNumberOfResults',
    'totalResults',
  ])
  const nextPage = currentPage !== undefined &&
    totalPages !== undefined &&
    currentPage + 1 < totalPages
    ? currentPage + 1
    : undefined

  return {
    candidates,
    catalogues: [],
    nextCursor: nextPage !== undefined
      ? { kind: 'page', page: nextPage }
      : undefined,
    totalCount,
  }
}

function productImageUrl(result: unknown) {
  const images = arrayValue(result, 'images').filter(isRecord)
  const preferredFormats = ['productListing', 'product', 'thumbnail']

  for (const format of preferredFormats) {
    const image = images.find((candidate) => textValue(candidate, 'format') === format)
    const path = textValue(image, 'url')

    if (path) {
      return absoluteUrl(path, clicksOrigin)
    }
  }

  return undefined
}

function moneyToCents(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value * 100)
  }

  if (typeof value !== 'string') {
    return undefined
  }

  const cleaned = value.replace(/[^\d,.-]/g, '')
  const normalized = cleaned.includes('.')
    ? cleaned.replace(/,/g, '')
    : cleaned.replace(',', '.')
  const amount = Number(normalized)

  return Number.isFinite(amount) ? Math.round(amount * 100) : undefined
}

function recordValue(value: unknown, key: string) {
  if (!isRecord(value)) {
    return undefined
  }

  const nested = value[key]
  return isRecord(nested) ? nested : undefined
}

function arrayValue(value: unknown, key: string) {
  if (!isRecord(value)) {
    return []
  }

  const nested = value[key]
  return Array.isArray(nested) ? nested : []
}

function textValue(value: unknown, key: string) {
  if (!isRecord(value)) {
    return ''
  }

  const nested = value[key]
  return typeof nested === 'string' || typeof nested === 'number'
    ? String(nested).trim()
    : ''
}

function firstText(value: unknown, keys: string[]) {
  for (const key of keys) {
    const text = textValue(value, key)

    if (text) {
      return text
    }
  }

  return ''
}

function integerValue(value: unknown, key: string) {
  if (!isRecord(value)) {
    return undefined
  }

  const nested = value[key]
  return typeof nested === 'number' && Number.isInteger(nested)
    ? nested
    : undefined
}

function firstInteger(value: unknown, keys: string[]) {
  for (const key of keys) {
    const integer = integerValue(value, key)

    if (integer !== undefined) {
      return integer
    }
  }

  return undefined
}

function absoluteUrl(value: string, origin: string) {
  if (!value) {
    return undefined
  }

  try {
    return new URL(value, origin).toString()
  } catch {
    return undefined
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
