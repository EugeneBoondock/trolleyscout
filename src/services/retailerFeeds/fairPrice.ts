import { buildRetailerEvidence, isStructuredDealActive, retailerSlug } from './types'
import type {
  RetailerDealCandidate,
  RetailerFeedContext,
  RetailerFeedPage,
} from './types'

// Fair Price publishes its active offers on a Magento promotions page. Each
// product card carries a stable product id, image, product link, final price,
// and regular price. Parsing that public page avoids the GraphQL route that
// rejects scheduled Cloudflare requests.

const fairPriceRetailerId = retailerSlug('fair-price')
const FAIR_PRICE_ORIGIN = 'https://www.fairprice.co.za'

export const FAIR_PRICE_PROMOTIONS_URL =
  `${FAIR_PRICE_ORIGIN}/promotions?product_list_limit=100`

export function parseFairPricePromotionPage(
  payload: unknown,
  context: RetailerFeedContext,
): RetailerFeedPage {
  if (typeof payload !== 'string') {
    throw new TypeError('Invalid Fair Price promotions response')
  }

  const productBlocks = Array.from(payload.matchAll(
    /<li\b[^>]*\bclass\s*=\s*["'][^"']*\bproduct-item\b[^"']*["'][^>]*>[\s\S]*?<\/li>/gi,
  ), (match) => match[0])

  if (productBlocks.length === 0) {
    throw new TypeError('Invalid Fair Price promotions response')
  }

  const candidates: RetailerDealCandidate[] = []

  for (const block of productBlocks) {
    const productId = productIdentifier(block)
    const link = elementWithClass(block, 'a', 'product-item-link')
    const image = openingTagWithClass(block, 'img', 'product-image-photo')
    const title = link ? htmlText(link.inner) : ''
    const productUrl = link
      ? officialFairPriceUrl(attributeValue(link.opening, 'href'))
      : undefined
    const imageUrl = image
      ? officialFairPriceUrl(
          attributeValue(image, 'src') || attributeValue(image, 'data-src'),
        )
      : undefined
    const priceCents = priceAmountCents(block, 'finalPrice')
    const regularCents = priceAmountCents(block, 'oldPrice')

    if (
      !productId ||
      !title ||
      !productUrl ||
      priceCents === undefined ||
      regularCents === undefined ||
      regularCents <= priceCents ||
      !isStructuredDealActive({ capturedAt: context.capturedAt })
    ) {
      continue
    }

    const canonicalProductId = `fair-price-${productId}`
    const scope = { type: 'national' as const }

    candidates.push({
      capturedAt: context.capturedAt,
      evidenceText: buildRetailerEvidence({
        priceCents,
        previousPriceCents: regularCents,
        promotionMarker: 'magento-promotion-page',
        scope,
        sourceId: productId,
      }),
      imageUrl,
      priceCents,
      previousPriceCents: regularCents,
      productId: canonicalProductId,
      productUrl,
      promotionId: canonicalProductId,
      retailerId: fairPriceRetailerId,
      savingText: `Save R${((regularCents - priceCents) / 100).toFixed(2)}`,
      scope,
      sourceKind: 'structured',
      sourceUrl: context.sourceUrl,
      title,
    })
  }

  return {
    candidates,
    catalogues: [],
    totalCount: productBlocks.length,
  }
}

function productIdentifier(block: string) {
  const dataProductId = firstMatch(
    block,
    /\bdata-product-id\s*=\s*["'](\d{1,20})["']/i,
  )

  if (dataProductId) {
    return dataProductId
  }

  for (const match of block.matchAll(/<input\b[^>]*>/gi)) {
    if (attributeValue(match[0], 'name') === 'product') {
      const value = attributeValue(match[0], 'value')
      if (/^\d{1,20}$/.test(value)) {
        return value
      }
    }
  }

  return ''
}

function priceAmountCents(block: string, priceType: string) {
  for (const match of block.matchAll(/<[a-z][^>]*>/gi)) {
    if (attributeValue(match[0], 'data-price-type') !== priceType) {
      continue
    }

    const amount = Number(attributeValue(match[0], 'data-price-amount').replace(/,/g, ''))
    if (Number.isFinite(amount) && amount >= 0) {
      return Math.round(amount * 100)
    }
  }

  return undefined
}

function elementWithClass(html: string, tag: string, className: string) {
  const pattern = new RegExp(
    `<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`,
    'gi',
  )

  for (const match of html.matchAll(pattern)) {
    const openingEnd = match[0].indexOf('>')
    const closingStart = match[0].toLocaleLowerCase().lastIndexOf(`</${tag}>`)
    const opening = match[0].slice(0, openingEnd + 1)
    if (!hasClass(opening, className)) {
      continue
    }

    return {
      inner: match[0].slice(openingEnd + 1, closingStart),
      opening,
    }
  }

  return undefined
}

function openingTagWithClass(html: string, tag: string, className: string) {
  const pattern = new RegExp(`<${tag}\\b[^>]*>`, 'gi')
  for (const match of html.matchAll(pattern)) {
    if (hasClass(match[0], className)) {
      return match[0]
    }
  }
  return undefined
}

function hasClass(openingTag: string, className: string) {
  return attributeValue(openingTag, 'class')
    .split(/\s+/)
    .includes(className)
}

function attributeValue(openingTag: string, name: string) {
  const safeName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = openingTag.match(
    new RegExp(`(?:^|\\s)${safeName}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'),
  )
  return decodeHtmlEntities(match?.[1] ?? match?.[2] ?? '').trim()
}

function htmlText(value: string) {
  return decodeHtmlEntities(value.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

function decodeHtmlEntities(value: string) {
  const named: Record<string, string> = {
    amp: '&',
    apos: '’',
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  }

  return value
    .replace(/&#x([0-9a-f]+);?/gi, (entity, digits: string) =>
      codePointEntity(entity, Number.parseInt(digits, 16)))
    .replace(/&#(\d+);?/g, (entity, digits: string) =>
      codePointEntity(entity, Number.parseInt(digits, 10)))
    .replace(/&([a-z]+);/gi, (entity, name: string) =>
      named[name.toLocaleLowerCase()] ?? entity)
}

function codePointEntity(entity: string, codePoint: number) {
  try {
    return codePoint >= 0 && codePoint <= 0x10_FFFF
      ? String.fromCodePoint(codePoint)
      : entity
  } catch {
    return entity
  }
}

function officialFairPriceUrl(value: string) {
  if (!value) {
    return undefined
  }

  try {
    const url = new URL(value, FAIR_PRICE_ORIGIN)
    if (
      url.protocol !== 'https:' ||
      !['fairprice.co.za', 'www.fairprice.co.za'].includes(url.hostname)
    ) {
      return undefined
    }
    return url.toString()
  } catch {
    return undefined
  }
}

function firstMatch(value: string, pattern: RegExp) {
  return value.match(pattern)?.[1] ?? ''
}
