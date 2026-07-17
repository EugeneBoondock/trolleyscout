import {
  buildRetailerEvidence,
  isStructuredDealActive,
  retailerSlug,
} from './types'
import type {
  RetailerDealCandidate,
  RetailerFeedContext,
  RetailerFeedPage,
  RetailerFeedPrice,
} from './types'

export interface WoolworthsFeedContext extends RetailerFeedContext {
  offset?: number
  pageSize?: number
  priceList?: string
}

const woolworthsOrigin = 'https://www.woolworths.co.za'
const woolworthsRetailerId = retailerSlug('woolworths')
const woolworthsScope = { type: 'online' } as const

export function parseWoolworthsFeed(
  payload: unknown,
  context: WoolworthsFeedContext,
): RetailerFeedPage {
  if (!isRecord(payload) || !isRecord(payload.response)) {
    throw new TypeError('Invalid Woolworths feed payload')
  }

  const response = payload.response

  if (!Array.isArray(response.results) || nonNegativeInteger(response.total_num_results) === undefined) {
    throw new TypeError('Invalid Woolworths feed payload')
  }

  const results = response.results
  const totalCount = response.total_num_results as number
  const reportedCountValue = firstDefined(response, [
    'num_results',
    'returned_num_results',
    'page_size',
  ])
  const reportedCount = reportedCountValue === undefined
    ? undefined
    : nonNegativeInteger(reportedCountValue)

  if (reportedCountValue !== undefined && reportedCount === undefined) {
    throw new TypeError('Invalid Woolworths feed payload')
  }

  const candidates: RetailerDealCandidate[] = []

  for (const result of results) {
    const data = recordValue(result, 'data')
    const productId = textValue(data, 'id')
    const title = textValue(data, 'description')
    const path = textValue(data, 'url')
    const promotion = recordValue(data, 'promo')
    const promotionValue = data?.promo
    const promotionId = typeof promotionValue === 'string' || typeof promotionValue === 'number'
      ? String(promotionValue).trim()
      : firstText(promotion, ['id', 'code', 'promotionId'])
    const prices = readPriceLists(data)
    const selectedPrice = prices.find((price) => price.listId === context.priceList) ?? prices[0]
    const validFrom = firstText(promotion, ['startDate', 'validFrom']) || undefined
    const validTo = firstText(promotion, ['endDate', 'validTo']) || undefined

    if (
      !productId ||
      !title ||
      !path ||
      !promotionId ||
      !selectedPrice ||
      !isStructuredDealActive({ capturedAt: context.capturedAt, validFrom, validTo })
    ) {
      continue
    }

    candidates.push({
      capturedAt: context.capturedAt,
      evidenceText: buildRetailerEvidence({
        priceCents: selectedPrice.priceCents,
        previousPriceCents: selectedPrice.previousPriceCents,
        promotionMarker: promotionId,
        scope: woolworthsScope,
        sourceId: productId,
        validFrom,
        validTo,
      }),
      imageUrl: absoluteUrl(textValue(data, 'image_url'), woolworthsOrigin),
      priceCents: selectedPrice.priceCents,
      previousPriceCents: selectedPrice.previousPriceCents,
      prices,
      productId,
      productUrl: absoluteUrl(path, woolworthsOrigin) ?? path,
      promotionId,
      retailerId: woolworthsRetailerId,
      savingText: firstText(promotion, ['description', 'name', 'text']) || undefined,
      scope: woolworthsScope,
      sourceKind: 'structured',
      sourceUrl: context.sourceUrl,
      title,
      validFrom,
      validTo,
    })
  }

  const offset = nonNegativeInteger(context.offset) ?? 0
  const returnedCount = results.length === 0 ? 0 : reportedCount ?? results.length
  const nextOffset = offset + returnedCount

  return {
    candidates,
    catalogues: [],
    nextCursor: returnedCount > 0 && nextOffset < totalCount
      ? { kind: 'offset', offset: nextOffset }
      : undefined,
    totalCount,
  }
}

function readPriceLists(data: Record<string, unknown> | undefined): RetailerFeedPrice[] {
  if (!data) {
    return []
  }

  const listIds = Object.keys(data)
    .filter((key) => /^p\d+$/i.test(key))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
  const prices: RetailerFeedPrice[] = []

  for (const listId of listIds) {
    const priceCents = moneyToCents(data[listId])

    if (priceCents === undefined) {
      continue
    }

    const previousPriceCents = moneyToCents(data[`${listId}_wp`])
    prices.push({
      listId,
      priceCents,
      ...(previousPriceCents !== undefined ? { previousPriceCents } : {}),
    })
  }

  return prices
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

function nonNegativeInteger(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : undefined
}

function firstDefined(value: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (value[key] !== undefined) {
      return value[key]
    }
  }

  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
