export type FeedCursor =
  | { kind: 'offset'; offset: number }
  | { kind: 'page'; page: number }
  | { kind: 'token'; token: string }

export type RetailerPriceScope = 'national' | 'online' | 'province' | 'store'

export type NonEmptyStringArray = [string, ...string[]]

export type RetailerDealScope =
  | { type: 'national'; excludedStoreIds?: NonEmptyStringArray }
  | { type: 'online' }
  | {
    type: 'province'
    regionIds: NonEmptyStringArray
    excludedStoreIds?: NonEmptyStringArray
  }
  | {
    type: 'store'
    storeIds: NonEmptyStringArray
    excludedStoreIds?: NonEmptyStringArray
  }

declare const retailerSlugBrand: unique symbol

export type RetailerSlug = string & { readonly [retailerSlugBrand]: true }

export const MAX_RETAILER_EVIDENCE_LENGTH = 512

export function parseRetailerSlug(value: unknown): RetailerSlug | undefined {
  return typeof value === 'string' &&
    value.length <= 100 &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
    ? value as RetailerSlug
    : undefined
}

export function retailerSlug(value: string): RetailerSlug {
  const parsed = parseRetailerSlug(value)

  if (!parsed) {
    throw new TypeError(`Invalid retailer slug: ${value}`)
  }

  return parsed
}

export interface RetailerActiveWindow {
  capturedAt: string
  validFrom?: string
  validTo?: string
}

export interface RetailerEvidenceInput {
  priceCents?: number
  previousPriceCents?: number
  promotionMarker: string
  scope: RetailerDealScope
  sourceId: string
  validFrom?: string
  validTo?: string
}

export function isStructuredDealActive(window: RetailerActiveWindow) {
  const capturedAt = parseIsoInstant(window.capturedAt)
  const validFrom = parseWindowBoundary(window.validFrom, 'start')
  const validTo = parseWindowBoundary(window.validTo, 'end')

  if (
    capturedAt === undefined ||
    validFrom === null ||
    validTo === null ||
    (validFrom !== undefined && validTo !== undefined && validFrom > validTo)
  ) {
    return false
  }

  return (validFrom === undefined || capturedAt >= validFrom) &&
    (validTo === undefined || capturedAt <= validTo)
}

export function isCatalogueWindowRelevant(window: RetailerActiveWindow) {
  const capturedAt = parseIsoInstant(window.capturedAt)
  const validFrom = parseWindowBoundary(window.validFrom, 'start')
  const validTo = parseWindowBoundary(window.validTo, 'end')

  if (
    capturedAt === undefined ||
    validFrom === null ||
    validTo === null ||
    (validFrom !== undefined && validTo !== undefined && validFrom > validTo)
  ) {
    return false
  }

  return validTo === undefined || capturedAt <= validTo
}

export function buildRetailerEvidence(input: RetailerEvidenceInput) {
  const evidence = JSON.stringify({
    priceCents: input.priceCents,
    previousPriceCents: input.previousPriceCents,
    promotionMarker: cappedText(input.promotionMarker, 120),
    scope: cappedText(scopeSignal(input.scope), 160),
    sourceId: cappedText(input.sourceId, 80),
    validFrom: input.validFrom,
    validTo: input.validTo,
  })

  if (evidence.length > MAX_RETAILER_EVIDENCE_LENGTH) {
    throw new RangeError('Retailer evidence exceeded its fixed field budget')
  }

  return evidence
}

function parseIsoInstant(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    return undefined
  }

  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function parseWindowBoundary(value: string | undefined, boundary: 'end' | 'start') {
  if (value === undefined) {
    return undefined
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    if (!isCalendarDate(value)) {
      return null
    }

    return Date.parse(
      `${value}T${boundary === 'start' ? '00:00:00.000' : '23:59:59.999'}+02:00`,
    )
  }

  const parsed = parseIsoInstant(value)
  return parsed === undefined ? null : parsed
}

function isCalendarDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
}

function scopeSignal(scope: RetailerDealScope) {
  if (scope.type === 'online') {
    return 'online'
  }

  const excluded = scope.excludedStoreIds?.length
    ? `;exclude=${scope.excludedStoreIds.slice(0, 12).join(',')}`
    : ''

  if (scope.type === 'national') {
    return `national${excluded}`
  }

  if (scope.type === 'province') {
    return `province:${scope.regionIds.slice(0, 12).join(',')}${excluded}`
  }

  return `store:${scope.storeIds.slice(0, 12).join(',')}${excluded}`
}

function cappedText(value: string, limit: number) {
  return value.length <= limit ? value : value.slice(0, limit)
}

export interface RetailerFeedPrice {
  listId: string
  priceCents: number
  previousPriceCents?: number
}

export interface RetailerDealCandidate {
  capturedAt: string
  evidenceText: string
  imageUrl?: string
  priceCents: number
  previousPriceCents?: number
  prices?: RetailerFeedPrice[]
  productId: string
  productUrl: string
  promotionId: string
  retailerId: RetailerSlug
  savingText?: string
  scope: RetailerDealScope
  sourceKind: 'catalogue' | 'structured'
  sourceUrl: string
  termsText?: string
  title: string
  unitText?: string
  validFrom?: string
  validTo?: string
}

export interface RetailerCatalogueRecord {
  capturedAt: string
  catalogueId: string
  documentUrl: string
  evidenceText: string
  format: 'pdf'
  imageUrl?: string
  retailerId: RetailerSlug
  scope: RetailerDealScope
  sourceUrl: string
  termsText?: string
  title: string
  validFrom?: string
  validTo?: string
}

export interface RetailerFeedPage {
  candidates: RetailerDealCandidate[]
  catalogues: RetailerCatalogueRecord[]
  nextCursor?: FeedCursor
  totalCount?: number
}

export interface RetailerFeedContext {
  capturedAt: string
  sourceUrl: string
}
