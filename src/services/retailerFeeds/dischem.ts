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
