import {
  buildRetailerEvidence,
  isCatalogueWindowRelevant,
  isStructuredDealActive,
  retailerSlug,
} from './types'
import type {
  NonEmptyStringArray,
  RetailerCatalogueRecord,
  RetailerDealCandidate,
  RetailerDealScope,
  RetailerFeedContext,
  RetailerFeedPage,
} from './types'

const foodLoversRetailerId = retailerSlug('food-lovers')

export function parseFoodLoversFeed(
  payload: unknown,
  context: RetailerFeedContext,
): RetailerFeedPage {
  const records = readRecords(payload)
  const candidates: RetailerDealCandidate[] = []
  const catalogues: RetailerCatalogueRecord[] = []

  for (const record of records) {
    if (!isRecord(record)) {
      continue
    }

    const id = recordValue(record, 'id')
    const productId = firstText(id, ['ID', 'id']) || firstText(record, ['ID', 'id'])
    const scope = readScope(record)
    const window = readSourceWindow(record)

    if (!scope || !window.valid) {
      continue
    }

    if (textValue(record, 'type') === 'PDF') {
      const title = textValue(record, 'title') || textValue(id, 'post_title')
      const documentUrl = textValue(record, 'pdf_url')

      if (
        !productId ||
        !title ||
        !documentUrl ||
        !isCatalogueWindowRelevant({
          capturedAt: context.capturedAt,
          validFrom: window.validFrom,
          validTo: window.validTo,
        })
      ) {
        continue
      }

      catalogues.push({
        capturedAt: context.capturedAt,
        catalogueId: productId,
        documentUrl,
        evidenceText: buildRetailerEvidence({
          promotionMarker: 'PDF',
          scope,
          sourceId: productId,
          validFrom: window.validFrom,
          validTo: window.validTo,
        }),
        format: 'pdf',
        imageUrl: textValue(record, 'pdf_thumb') || undefined,
        retailerId: foodLoversRetailerId,
        scope,
        sourceUrl: context.sourceUrl,
        termsText: textValue(record, 'small_print') || undefined,
        title,
        validFrom: window.validFrom,
        validTo: window.validTo,
      })
      continue
    }

    if (textValue(record, 'type') !== 'Data') {
      continue
    }

    const title = textValue(record, 'description')
    const priceCents = moneyToCents(record.price)

    if (
      !productId ||
      !title ||
      priceCents === undefined ||
      !isStructuredDealActive({
        capturedAt: context.capturedAt,
        validFrom: window.validFrom,
        validTo: window.validTo,
      })
    ) {
      continue
    }

    candidates.push({
      capturedAt: context.capturedAt,
      evidenceText: buildRetailerEvidence({
        priceCents,
        promotionMarker: productId,
        scope,
        sourceId: productId,
        validFrom: window.validFrom,
        validTo: window.validTo,
      }),
      imageUrl: textValue(record, 'image') || undefined,
      priceCents,
      productId,
      productUrl: context.sourceUrl,
      promotionId: productId,
      retailerId: foodLoversRetailerId,
      scope,
      sourceKind: 'structured',
      sourceUrl: context.sourceUrl,
      termsText: textValue(record, 'small_print') || undefined,
      title,
      unitText: textValue(record, 'units') || undefined,
      validFrom: window.validFrom,
      validTo: window.validTo,
    })
  }

  return {
    candidates,
    catalogues,
    totalCount: records.length,
  }
}

function readRecords(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload
  }

  if (typeof payload !== 'string') {
    throw new TypeError('Invalid Food Lovers feed payload')
  }

  try {
    const parsed: unknown = JSON.parse(decodeHtml(payload))
    if (!Array.isArray(parsed)) {
      throw new TypeError('Invalid Food Lovers feed payload')
    }

    return parsed
  } catch {
    throw new TypeError('Invalid Food Lovers feed payload')
  }
}

function readScope(record: Record<string, unknown>): RetailerDealScope | undefined {
  const scopeName = textValue(record, 'scope').toLocaleLowerCase()
  const excludedStoreIds = nonEmptyStringList(record.exclude_stores)

  if (scopeName === 'store') {
    const storeIds = nonEmptyStringList(record.stores)
    return storeIds
      ? { type: 'store', storeIds, ...(excludedStoreIds ? { excludedStoreIds } : {}) }
      : undefined
  }

  if (scopeName === 'regional' || scopeName === 'province') {
    const regionIds = nonEmptyStringList(record.regions)
    return regionIds
      ? { type: 'province', regionIds, ...(excludedStoreIds ? { excludedStoreIds } : {}) }
      : undefined
  }

  if (scopeName === 'national') {
    return {
      type: 'national',
      ...(excludedStoreIds ? { excludedStoreIds } : {}),
    }
  }

  if (scopeName === 'online') {
    return { type: 'online' }
  }

  return undefined
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&(?:apos|#0*39);/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
}

function compactDate(value: string) {
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(value)
  return match ? `${match[1]}-${match[2]}-${match[3]}` : undefined
}

function readSourceWindow(record: Record<string, unknown>) {
  const rawValidFrom = textValue(record, 'start_date')
  const rawValidTo = textValue(record, 'end_date')
  const validFrom = compactDate(rawValidFrom)
  const validTo = compactDate(rawValidTo)

  return {
    valid: (!rawValidFrom || validFrom !== undefined) && (!rawValidTo || validTo !== undefined),
    validFrom,
    validTo,
  }
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

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value
      .filter((item) => typeof item === 'string' || typeof item === 'number')
      .map((item) => String(item).trim())
      .filter(Boolean)
    : []
}

function nonEmptyStringList(value: unknown): NonEmptyStringArray | undefined {
  const values = stringList(value)
  return values.length > 0 ? values as NonEmptyStringArray : undefined
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
