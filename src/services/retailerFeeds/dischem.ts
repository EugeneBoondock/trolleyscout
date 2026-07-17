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

export interface DischemFeedContext extends RetailerFeedContext {
  page?: number
}

const DISCHEM_ORIGIN = 'https://www.dischem.co.za'
const dischemRetailerId = retailerSlug('dis-chem')
const dischemScope = { type: 'online' } as const

export function parseDischemFeed(
  payload: unknown,
  context: DischemFeedContext,
): RetailerFeedPage {
  if (typeof payload !== 'string') {
    throw new TypeError('Invalid Dis-Chem promotion response')
  }

  const cards = extractProductCards(payload)
  const candidates: RetailerDealCandidate[] = []

  for (const card of cards) {
    const candidate = parseProductCard(card, context)
    if (candidate) {
      candidates.push(candidate)
    }
  }

  return {
    candidates,
    catalogues: [],
    nextCursor: nextPageCursor(payload, context.page ?? 0),
    totalCount: cards.length,
  }
}

function parseProductCard(card: string, context: DischemFeedContext) {
  const openingTag = /^<li\b[^>]*>/i.exec(card)?.[0] ?? ''
  const link = findElement(card, 'a', 'product-item-link')
  const href = link ? attributeValue(link.attributes, 'href') : ''
  const productUrl = officialProductUrl(href)
  const title = decodeHtml(
    (link && attributeValue(link.attributes, 'title')) || stripTags(link?.body ?? ''),
  ).replace(/\s+/g, ' ').trim()
  const productId = firstAttribute(openingTag, ['data-product-id', 'data-product-sku']) ||
    productIdFromUrl(productUrl)
  const oldPriceCents = moneyToCents(
    dataPriceAmount(card, 'oldPrice') || classText(card, 'old-price'),
  )
  const specialPriceCents = moneyToCents(
    dataPriceAmount(card, 'finalPrice') || classText(card, 'special-price'),
  )
  const rawValidFrom = firstAttribute(openingTag, ['data-valid-from', 'data-start-date'])
  const rawValidTo = firstAttribute(openingTag, ['data-valid-to', 'data-end-date'])
  const validFrom = normalizeDate(rawValidFrom)
  const validTo = normalizeDate(rawValidTo)

  if (
    !productUrl ||
    !productId ||
    !title ||
    oldPriceCents === undefined ||
    specialPriceCents === undefined ||
    oldPriceCents <= specialPriceCents ||
    (rawValidFrom && !validFrom) ||
    (rawValidTo && !validTo) ||
    !isStructuredDealActive({ capturedAt: context.capturedAt, validFrom, validTo })
  ) {
    return undefined
  }

  const image = findVoidElement(card, 'img', 'product-image-photo')
  const imagePath = image
    ? firstAttribute(image.attributes, ['data-src', 'data-original', 'src'])
    : ''
  const priceSaving = oldPriceCents - specialPriceCents

  return {
    capturedAt: context.capturedAt,
    evidenceText: buildRetailerEvidence({
      priceCents: specialPriceCents,
      previousPriceCents: oldPriceCents,
      promotionMarker: 'old-price>special-price',
      scope: dischemScope,
      sourceId: productId,
      validFrom,
      validTo,
    }),
    imageUrl: publicUrl(imagePath),
    priceCents: specialPriceCents,
    previousPriceCents: oldPriceCents,
    productId,
    productUrl,
    promotionId: `on-promotion:${productId}`,
    retailerId: dischemRetailerId,
    savingText: `Save R${formatMoney(priceSaving)}`,
    scope: dischemScope,
    sourceKind: 'structured',
    sourceUrl: context.sourceUrl,
    title,
    validFrom,
    validTo,
  } satisfies RetailerDealCandidate
}

function extractProductCards(html: string) {
  return Array.from(html.matchAll(
    /<li\b[^>]*class\s*=\s*(["'])[^"']*\bproduct-item\b[^"']*\1[^>]*>[\s\S]*?<\/li>/gi,
  ), (match) => match[0])
}

function findElement(html: string, tag: string, className: string) {
  const pattern = new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)<\\/${tag}>`, 'gi')
  for (const match of html.matchAll(pattern)) {
    if (!className || hasClass(match[1], className)) {
      return { attributes: match[1], body: match[2] }
    }
  }
  return undefined
}

function findVoidElement(html: string, tag: string, className: string) {
  const pattern = new RegExp(`<${tag}\\b([^>]*)>`, 'gi')
  for (const match of html.matchAll(pattern)) {
    if (hasClass(match[1], className)) {
      return { attributes: match[1] }
    }
  }
  return undefined
}

function classText(html: string, className: string) {
  const pattern = /<(span|div)\b([^>]*)>/gi
  for (const match of html.matchAll(pattern)) {
    if (hasClass(match[2], className)) {
      const bodyStart = (match.index ?? 0) + match[0].length
      const bodyEnd = html.toLocaleLowerCase().indexOf(`</${match[1].toLocaleLowerCase()}>`, bodyStart)
      const body = bodyEnd < 0 ? '' : html.slice(bodyStart, bodyEnd)
      return decodeHtml(stripTags(body)).replace(/\s+/g, ' ').trim()
    }
  }
  return ''
}

function dataPriceAmount(html: string, priceType: string) {
  for (const match of html.matchAll(/<[a-z][^>]*>/gi)) {
    if (attributeValue(match[0], 'data-price-type') === priceType) {
      return attributeValue(match[0], 'data-price-amount')
    }
  }
  return ''
}

function hasClass(attributes: string, className: string) {
  const classes = attributeValue(attributes, 'class').split(/\s+/)
  return classes.includes(className)
}

function attributeValue(attributes: string, name: string) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(
    `(?:^|\\s)${escapedName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    'i',
  ).exec(attributes)
  return decodeHtml(match?.[1] ?? match?.[2] ?? match?.[3] ?? '').trim()
}

function firstAttribute(attributes: string, names: string[]) {
  for (const name of names) {
    const value = attributeValue(attributes, name)
    if (value) {
      return value
    }
  }
  return ''
}

function officialProductUrl(value: string) {
  const url = parsedPublicUrl(value)
  if (!url) {
    return undefined
  }
  const host = url.hostname.toLocaleLowerCase()
  if (host !== 'dischem.co.za' && !host.endsWith('.dischem.co.za')) {
    return undefined
  }
  url.protocol = 'https:'
  return url.toString()
}

function publicUrl(value: string) {
  const url = parsedPublicUrl(value)
  if (!url) {
    return undefined
  }
  url.protocol = 'https:'
  return url.toString()
}

function parsedPublicUrl(value: string) {
  if (!value) {
    return undefined
  }
  try {
    const url = new URL(value, DISCHEM_ORIGIN)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : undefined
  } catch {
    return undefined
  }
}

function productIdFromUrl(value: string | undefined) {
  if (!value) {
    return ''
  }
  try {
    const segments = new URL(value).pathname.split('/').filter(Boolean)
    return decodeURIComponent(segments.at(-1) ?? '').slice(0, 120)
  } catch {
    return ''
  }
}

function nextPageCursor(html: string, currentPage: number) {
  const next = findElement(html, 'li', 'pages-item-next')
  const link = next ? findElement(next.body, 'a', '') : undefined
  const href = link ? attributeValue(link.attributes, 'href') : ''
  try {
    const page = Number(new URL(href, DISCHEM_ORIGIN).searchParams.get('p'))
    return Number.isSafeInteger(page) && page > currentPage + 1
      ? { kind: 'page' as const, page: page - 1 }
      : undefined
  } catch {
    return undefined
  }
}

function normalizeDate(value: string) {
  if (!value) {
    return undefined
  }
  const match = /^(\d{4})[/-](\d{2})[/-](\d{2})$/.exec(value)
  if (match) {
    const normalized = `${match[1]}-${match[2]}-${match[3]}`
    const [year, month, day] = normalized.split('-').map(Number)
    const date = new Date(Date.UTC(year, month - 1, day))
    return date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
      ? normalized
      : undefined
  }
  return /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value))
    ? value
    : undefined
}

function moneyToCents(value: string) {
  if (!value) {
    return undefined
  }
  const cleaned = value.replace(/[^\d,.-]/g, '')
  const normalized = cleaned.includes('.')
    ? cleaned.replace(/,/g, '')
    : cleaned.replace(',', '.')
  const amount = Number(normalized)
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : undefined
}

function formatMoney(cents: number) {
  const [whole, fraction] = (cents / 100).toFixed(2).split('.')
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction}`
}

function stripTags(value: string) {
  return value.replace(/<[^>]*>/g, ' ')
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&(?:apos|#0*39);/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_match, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)))
}

// ---------------------------------------------------------------------------
// Klevu lane. Dis-Chem's own storefront queries this public search index
// (the ticket ships in their client JS); unlike www.dischem.co.za it is not
// WAF-blocked, so Workers can read promotions directly. The scout first
// discovers the active promo discount buckets, then pages through each one.

const KLEVU_SEARCH_URL = 'https://eucs7.ksearchnet.com/cloud-search/n-search/search'
const KLEVU_TICKET = 'klevu-15264750100467933'
const KLEVU_PAGE_SIZE = 100
const KLEVU_MAX_DISCOUNT_BUCKETS = 25

export interface DischemKlevuCursorState {
  phase: 'discover' | 'page'
  values?: string[]
  valueIndex?: number
  offset?: number
}

export function parseDischemKlevuCursor(token: string | undefined): DischemKlevuCursorState {
  if (!token) {
    return { phase: 'discover' }
  }

  try {
    const parsed = JSON.parse(token) as DischemKlevuCursorState
    if (parsed && (parsed.phase === 'discover' || parsed.phase === 'page')) {
      return parsed
    }
  } catch {
    // Fall through to a fresh discovery pass.
  }

  return { phase: 'discover' }
}

export function buildDischemKlevuUrl(state: DischemKlevuCursorState): string {
  const url = new URL(KLEVU_SEARCH_URL)
  url.searchParams.set('ticket', KLEVU_TICKET)
  url.searchParams.set('term', '*')
  url.searchParams.set('responseType', 'json')
  url.searchParams.set('showOutOfStockProducts', 'false')

  if (state.phase === 'discover') {
    url.searchParams.set('noOfResults', '1')
    url.searchParams.set('paginationStartsFrom', '0')
    url.searchParams.set('enableFilters', 'true')
    return url.toString()
  }

  const value = state.values?.[state.valueIndex ?? 0] ?? ''
  url.searchParams.set('noOfResults', String(KLEVU_PAGE_SIZE))
  url.searchParams.set('paginationStartsFrom', String(state.offset ?? 0))
  url.searchParams.set('filterResults', `promo_discount_sap:${value}`)
  return url.toString()
}

export interface DischemKlevuContext extends RetailerFeedContext {
  cursorToken?: string
}

export function parseDischemKlevuFeed(
  payload: unknown,
  context: DischemKlevuContext,
): RetailerFeedPage {
  if (typeof payload !== 'object' || payload === null) {
    throw new TypeError('Invalid Dis-Chem Klevu response')
  }

  const body = payload as {
    filters?: Array<{ key?: string; options?: Array<{ name?: string; count?: number }> }>
    meta?: { totalResultsFound?: number }
    result?: Array<Record<string, unknown>>
  }
  const state = parseDischemKlevuCursor(context.cursorToken)

  if (state.phase === 'discover') {
    const filter = (body.filters ?? []).find((entry) => entry.key === 'promo_discount_sap')
    const values = (filter?.options ?? [])
      .map((option) => String(option.name ?? '').trim())
      .filter((name) => name && name !== '0')
      .slice(0, KLEVU_MAX_DISCOUNT_BUCKETS)

    return {
      candidates: [],
      catalogues: [],
      nextCursor: values.length > 0
        ? { kind: 'token', token: JSON.stringify({ phase: 'page', values, valueIndex: 0, offset: 0 }) }
        : undefined,
      totalCount: 0,
    }
  }

  const rows = Array.isArray(body.result) ? body.result : []
  const totalForBucket = body.meta?.totalResultsFound ?? rows.length
  const candidates: RetailerDealCandidate[] = []

  for (const row of rows) {
    const candidate = klevuRowToCandidate(row, context)
    if (candidate) {
      candidates.push(candidate)
    }
  }

  const values = state.values ?? []
  const valueIndex = state.valueIndex ?? 0
  const offset = (state.offset ?? 0) + rows.length
  let nextState: DischemKlevuCursorState | undefined

  if (rows.length > 0 && offset < totalForBucket) {
    nextState = { phase: 'page', values, valueIndex, offset }
  } else if (valueIndex + 1 < values.length) {
    nextState = { phase: 'page', values, valueIndex: valueIndex + 1, offset: 0 }
  }

  return {
    candidates,
    catalogues: [],
    nextCursor: nextState
      ? { kind: 'token', token: JSON.stringify(nextState) }
      : undefined,
    totalCount: totalForBucket,
  }
}

function klevuRowToCandidate(
  row: Record<string, unknown>,
  context: DischemKlevuContext,
): RetailerDealCandidate | undefined {
  const title = klevuText(row.name)
  const productUrl = officialProductUrl(klevuText(row.url))
  const productId = klevuText(row.sku) || klevuText(row.id)
  const priceCents = moneyToCents(klevuText(row.salePrice) || klevuText(row.price))

  if (!title || !productUrl || !productId || priceCents === undefined) {
    return undefined
  }

  const oldCents = moneyToCents(klevuText(row.oldPrice))
  const baseCents = moneyToCents(klevuText(row.basePrice))
  const previousPriceCents = oldCents !== undefined && oldCents > priceCents
    ? oldCents
    : baseCents !== undefined && baseCents > priceCents
      ? baseCents
      : undefined

  const promoWindow = klevuPromoWindow(klevuText(row.promo_category_sap))
  const validFrom = promoWindow?.validFrom
  const validTo = promoWindow?.validTo

  if (!isStructuredDealActive({ capturedAt: context.capturedAt, validFrom, validTo })) {
    return undefined
  }

  const discount = klevuText(row.promo_discount_sap)
  const promotionId = klevuText(row.promo_number_sap) || `klevu-${discount || 'promo'}-${productId}`
  const savingText = /^\d{1,2}$/.test(discount)
    ? `${discount}% off`
    : previousPriceCents !== undefined
      ? `Save R${formatMoney(previousPriceCents - priceCents)}`
      : 'On promotion'

  return {
    capturedAt: context.capturedAt,
    evidenceText: buildRetailerEvidence({
      priceCents,
      previousPriceCents,
      promotionMarker: promotionId,
      scope: dischemScope,
      sourceId: productId,
      validFrom,
      validTo,
    }),
    imageUrl: publicUrl(klevuText(row.imageUrl) || klevuText(row.image)) || undefined,
    priceCents,
    previousPriceCents,
    productId,
    productUrl,
    promotionId,
    retailerId: dischemRetailerId,
    savingText,
    scope: dischemScope,
    sourceKind: 'structured',
    sourceUrl: context.sourceUrl,
    title,
    validFrom,
    validTo,
  }
}

// "bsheet july health 14/07/26-09/08/26 s" -> 2026-07-14 .. 2026-08-09
function klevuPromoWindow(text: string) {
  const match = /(\d{2})\/(\d{2})\/(\d{2})\s*-\s*(\d{2})\/(\d{2})\/(\d{2})/.exec(text)

  if (!match) {
    return undefined
  }

  const validFrom = normalizeDate(`20${match[3]}-${match[2]}-${match[1]}`)
  const validTo = normalizeDate(`20${match[6]}-${match[5]}-${match[4]}`)

  return validFrom && validTo ? { validFrom, validTo } : undefined
}

function klevuText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : ''
}
