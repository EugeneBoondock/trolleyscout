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

export type MassmartRetailerId = 'builders' | 'game' | 'makro'

export interface MassmartFeedContext extends RetailerFeedContext {
  retailerId: MassmartRetailerId
  validFrom?: string
  validTo?: string
}

const retailerOrigins: Record<MassmartRetailerId, string> = {
  builders: 'https://www.builders.co.za',
  game: 'https://www.game.co.za',
  makro: 'https://www.makro.co.za',
}
const massmartRetailerIds = {
  builders: retailerSlug('builders'),
  game: retailerSlug('game'),
  makro: retailerSlug('makro'),
}
const massmartScope = { type: 'online' } as const

export function parseMassmartFeed(
  payload: unknown,
  context: MassmartFeedContext,
): RetailerFeedPage {
  if (!isRecord(payload) || !Array.isArray(payload.products)) {
    throw new TypeError('Invalid Massmart feed payload')
  }

  if (payload.pagination !== undefined && !isRecord(payload.pagination)) {
    throw new TypeError('Invalid Massmart feed payload')
  }

  const products = payload.products
  const candidates = context.retailerId === 'game'
    ? parseGameProducts(products, context)
    : context.retailerId === 'builders'
      ? parseBuildersProducts(products, context)
      : parseMakroProducts(products, context)
  const pagination = isRecord(payload.pagination) ? payload.pagination : undefined
  const currentPage = integerValue(pagination, 'currentPage')
  const totalPages = integerValue(pagination, 'totalPages')

  return {
    candidates,
    catalogues: [],
    nextCursor: currentPage !== undefined && totalPages !== undefined && currentPage + 1 < totalPages
      ? { kind: 'page', page: currentPage + 1 }
      : undefined,
    totalCount: firstInteger(pagination, ['totalResults', 'totalNumberOfResults']),
  }
}

function parseMakroProducts(
  products: unknown[],
  context: MassmartFeedContext,
): RetailerDealCandidate[] {
  const candidates: RetailerDealCandidate[] = []

  for (const product of products) {
    const productId = firstText(product, ['productId', 'id', 'code'])
    const title = firstText(product, ['title', 'name'])
    const path = firstText(product, ['url', 'productUrl'])
    const priceCents = positiveMoneyToCents(isRecord(product) ? product.finalPrice : undefined)
    const mrpCents = positiveMoneyToCents(isRecord(product) ? product.mrp : undefined)
    const totalDiscount = finiteNumber(isRecord(product) ? product.totalDiscount : undefined)
    const hasReducedMrp = priceCents !== undefined && mrpCents !== undefined && mrpCents > priceCents
    const hasDiscount = totalDiscount !== undefined && totalDiscount > 0
    const promotionMarker = hasReducedMrp ? 'mrp>finalPrice' : 'totalDiscount>0'

    if (
      !productId ||
      !title ||
      !path ||
      priceCents === undefined ||
      (!hasReducedMrp && !hasDiscount) ||
      !isStructuredDealActive(context)
    ) {
      continue
    }

    candidates.push({
      capturedAt: context.capturedAt,
      evidenceText: buildRetailerEvidence({
        priceCents,
        previousPriceCents: hasReducedMrp ? mrpCents : undefined,
        promotionMarker,
        scope: massmartScope,
        sourceId: productId,
        validFrom: context.validFrom,
        validTo: context.validTo,
      }),
      imageUrl: productImageUrl(product, context.retailerId),
      priceCents,
      previousPriceCents: hasReducedMrp ? mrpCents : undefined,
      productId,
      productUrl: absoluteUrl(path, retailerOrigins.makro) ?? path,
      promotionId: productId,
      retailerId: massmartRetailerIds.makro,
      scope: massmartScope,
      sourceKind: 'structured',
      sourceUrl: context.sourceUrl,
      title,
      validFrom: context.validFrom,
      validTo: context.validTo,
    })
  }

  return candidates
}

function parseBuildersProducts(
  products: unknown[],
  context: MassmartFeedContext,
): RetailerDealCandidate[] {
  const candidates: RetailerDealCandidate[] = []

  for (const product of products) {
    const productId = firstText(product, ['itemId', 'code'])
    const title = textValue(product, 'name')
    const path = textValue(product, 'url')
    const price = recordValue(product, 'price')
    const wasPrice = recordValue(product, 'wasPrice')
    const priceCents = positiveMoneyToCents(price?.value ?? price?.formattedValue)
    const previousPriceCents = positiveMoneyToCents(wasPrice?.value ?? wasPrice?.formattedValue)
    const dealSash = textValue(product, 'dealSash')
    const validFrom = firstText(product, ['startDate', 'validFrom']) || context.validFrom
    const validTo = firstText(product, ['expiry', 'expiryDate', 'validTo', 'endDate']) || context.validTo

    if (
      price?.isPromotion !== true ||
      !productId ||
      !title ||
      !path ||
      !dealSash ||
      priceCents === undefined ||
      previousPriceCents === undefined ||
      previousPriceCents <= priceCents ||
      !validTo ||
      !isStructuredDealActive({ capturedAt: context.capturedAt, validFrom, validTo })
    ) {
      continue
    }

    candidates.push({
      capturedAt: context.capturedAt,
      evidenceText: buildRetailerEvidence({
        priceCents,
        previousPriceCents,
        promotionMarker: dealSash,
        scope: massmartScope,
        sourceId: productId,
        validFrom,
        validTo,
      }),
      imageUrl: productImageUrl(product, context.retailerId),
      priceCents,
      previousPriceCents,
      productId,
      productUrl: absoluteUrl(path, retailerOrigins.builders) ?? path,
      promotionId: dealSash,
      retailerId: massmartRetailerIds.builders,
      savingText: dealSash,
      scope: massmartScope,
      sourceKind: 'structured',
      sourceUrl: context.sourceUrl,
      title,
      validFrom,
      validTo,
    })
  }

  return candidates
}

function parseGameProducts(
  products: unknown[],
  context: MassmartFeedContext,
): RetailerDealCandidate[] {
  const candidates: RetailerDealCandidate[] = []

  for (const product of products) {
    const promotions = arrayValue(product, 'potentialPromotions')
    const promotion = promotions
      .filter(isRecord)
      .find((value) => firstText(value, ['code', 'description']) !== '')
    const productId = textValue(product, 'code')
    const title = textValue(product, 'name')
    const path = textValue(product, 'url')
    const price = recordValue(product, 'price')
    const priceCents = positiveMoneyToCents(price?.value ?? price?.formattedValue)
    const mrp = recordValue(product, 'mrp')
    const previousPriceCents = positiveMoneyToCents(mrp?.value ?? mrp?.formattedValue)
    const hasMrpSaving = priceCents !== undefined &&
      previousPriceCents !== undefined &&
      previousPriceCents > priceCents
    const explicitPromotionId = firstText(promotion, ['code', 'description'])
    const promotionId = explicitPromotionId || (hasMrpSaving
      ? `mrp-saving-${productId}`
      : '')
    const validFrom = firstText(promotion, ['startDate', 'validFrom']) || context.validFrom
    const validTo = firstText(promotion, ['endDate', 'validTo']) || context.validTo

    if (
      !promotionId ||
      !productId ||
      !title ||
      !path ||
      priceCents === undefined ||
      !isStructuredDealActive({ capturedAt: context.capturedAt, validFrom, validTo })
    ) {
      continue
    }

    candidates.push({
      capturedAt: context.capturedAt,
      evidenceText: buildRetailerEvidence({
        priceCents,
        previousPriceCents: hasMrpSaving ? previousPriceCents : undefined,
        promotionMarker: explicitPromotionId || 'mrp>price',
        scope: massmartScope,
        sourceId: productId,
        validFrom,
        validTo,
      }),
      imageUrl: productImageUrl(product, context.retailerId),
      priceCents,
      previousPriceCents: hasMrpSaving ? previousPriceCents : undefined,
      productId,
      productUrl: absoluteUrl(path, retailerOrigins.game) ?? path,
      promotionId,
      retailerId: massmartRetailerIds.game,
      savingText: firstText(promotion, ['description', 'code']) || (
        hasMrpSaving && previousPriceCents !== undefined
          ? `Save R${((previousPriceCents - priceCents) / 100).toFixed(2)}`
          : undefined
      ),
      scope: massmartScope,
      sourceKind: 'structured',
      sourceUrl: context.sourceUrl,
      title,
      validFrom,
      validTo,
    })
  }

  return candidates
}

function productImageUrl(product: unknown, retailerId: MassmartRetailerId) {
  const image = recordValue(product, 'image')
  const directUrl = textValue(image, 'url') || textValue(product, 'imageUrl')

  if (directUrl) {
    return absoluteUrl(directUrl, retailerOrigins[retailerId])
  }

  const images = arrayValue(product, 'images').filter(isRecord)
  const preferredFormats = ['product', 'listing', 'thumbnail']

  for (const format of preferredFormats) {
    const candidate = images.find((value) => textValue(value, 'format') === format)
    const path = textValue(candidate, 'url')

    if (path) {
      return absoluteUrl(path, retailerOrigins[retailerId])
    }
  }

  return undefined
}

function positiveMoneyToCents(value: unknown) {
  const cents = moneyToCents(value)
  return cents !== undefined && cents > 0 ? cents : undefined
}

function finiteNumber(value: unknown) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined
  }

  if (typeof value === 'string' && value.trim()) {
    const number = Number(value)
    return Number.isFinite(number) ? number : undefined
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
