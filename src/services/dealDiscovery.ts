import { retailers } from '../data/retailers'
import type {
  DiscoveredDeal,
  DiscoveryParserId,
  DiscoverySourceResult,
  DiscoverySourceTarget,
  Retailer,
  RetailerSource,
} from '../types'

export interface ResolvedDiscoveryTarget extends DiscoverySourceTarget {
  retailer: Retailer
  source: RetailerSource
}

export const discoveryTargets: DiscoverySourceTarget[] = [
  {
    parserId: 'dischem-promotion',
    retailerId: 'dis-chem',
    sourceLabel: 'On promotion',
  },
  {
    parserId: 'yuppiechef-specials',
    retailerId: 'yuppiechef',
    sourceLabel: 'Specials',
  },
  {
    parserId: 'metadata-only',
    retailerId: 'takealot',
    sourceLabel: 'Deals',
  },
  {
    parserId: 'metadata-only',
    retailerId: 'amazon-za',
    sourceLabel: 'Deals',
  },
  {
    parserId: 'metadata-only',
    retailerId: 'amazon-za',
    sourceLabel: 'Vouchers',
  },
]

export function getDiscoveryTargets(): ResolvedDiscoveryTarget[] {
  return discoveryTargets.flatMap((target) => {
    const retailer = retailers.find((candidate) => candidate.id === target.retailerId)
    const source = retailer?.sources.find((candidate) => candidate.label === target.sourceLabel)

    if (!retailer || !source) {
      return []
    }

    return [
      {
        ...target,
        retailer,
        source,
      },
    ]
  })
}

export function extractDealsFromHtml(
  target: ResolvedDiscoveryTarget,
  html: string,
  capturedAt: string,
  limit = 8,
): DiscoveredDeal[] {
  if (target.parserId === 'dischem-promotion') {
    return extractDischemPromotionDeals(target, html, capturedAt, limit)
  }

  if (target.parserId === 'yuppiechef-specials') {
    return extractYuppiechefSpecials(target, html, capturedAt, limit)
  }

  return []
}

export function buildSourceResult(
  target: ResolvedDiscoveryTarget,
  checkedAt: string,
  itemCount: number,
  options: {
    httpStatus?: number
    parserId?: DiscoveryParserId
    unavailable?: boolean
  } = {},
): DiscoverySourceResult {
  if (options.unavailable) {
    return {
      checkedAt,
      httpStatus: options.httpStatus,
      itemCount,
      retailerId: target.retailer.id,
      retailerName: target.retailer.name,
      sourceLabel: target.source.label,
      sourceUrl: target.source.url,
      status: 'unavailable',
      statusText: 'Source could not be read.',
    }
  }

  if (itemCount > 0) {
    return {
      checkedAt,
      httpStatus: options.httpStatus,
      itemCount,
      retailerId: target.retailer.id,
      retailerName: target.retailer.name,
      sourceLabel: target.source.label,
      sourceUrl: target.source.url,
      status: 'found',
      statusText: 'Source-backed rows found.',
    }
  }

  return {
    checkedAt,
    httpStatus: options.httpStatus,
    itemCount,
    retailerId: target.retailer.id,
    retailerName: target.retailer.name,
    sourceLabel: target.source.label,
    sourceUrl: target.source.url,
    status: options.parserId === 'metadata-only' ? 'unsupported' : 'checked_no_static_rows',
    statusText:
      options.parserId === 'metadata-only'
        ? 'Official page checked. Product rows need browser rendering.'
        : 'Official page checked. No static product rows matched.',
  }
}

function extractDischemPromotionDeals(
  target: ResolvedDiscoveryTarget,
  html: string,
  capturedAt: string,
  limit: number,
) {
  const blocks = html.match(/<li[^>]*class="[^"]*product-item[\s\S]*?<\/li>/gi) ?? []
  const deals: DiscoveredDeal[] = []

  for (const block of blocks) {
    if (deals.length >= limit || !block.includes('product-item-name')) {
      continue
    }

    const linkMatch = block.match(/<strong[^>]*class="[^"]*product-item-name[^"]*"[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i)
    const prices = Array.from(block.matchAll(/<span[^>]*class="price"[^>]*>([\s\S]*?)<\/span>/gi), (match) =>
      normalizeText(match[1]),
    ).filter(Boolean)

    const title = normalizeText(linkMatch?.[2] ?? '')
    const productUrl = absoluteUrl(linkMatch?.[1] ?? target.source.url, target.source.url)
    const priceText = prices.at(-1)
    const previousPriceText = prices.length > 1 ? prices[0] : undefined

    if (!title || !priceText) {
      continue
    }

    deals.push({
      capturedAt,
      evidenceText: evidenceText(title, priceText, previousPriceText),
      id: dealId(target.retailer.id, title, priceText, deals.length),
      previousPriceText,
      priceText,
      productUrl,
      retailerId: target.retailer.id,
      retailerName: target.retailer.name,
      sourceLabel: target.source.label,
      sourceUrl: target.source.url,
      title,
    })
  }

  return deals
}

function extractYuppiechefSpecials(
  target: ResolvedDiscoveryTarget,
  html: string,
  capturedAt: string,
  limit: number,
) {
  const blocks = html.match(/<article[^>]*class="[^"]*product-card[\s\S]*?<\/article>/gi) ?? []
  const deals: DiscoveredDeal[] = []

  for (const block of blocks) {
    if (deals.length >= limit) {
      continue
    }

    const linkMatch = block.match(/<a[^>]*href="([^"]+)"[^>]*class="u-block-link"/i)
    const brand = normalizeText(firstClassText(block, 'product-card__brand'))
    const name = normalizeText(firstClassText(block, 'product-card__name'))
    const title = [brand, name].filter(Boolean).join(' ')
    const priceText = normalizeText(firstClassText(block, 'card-price-list__item--now'))
    const previousPriceText = normalizeText(firstClassText(block, 'card-price-list__item--was')) || undefined
    const savingText = normalizeText(firstClassText(block, 'card-sticker--price')) || undefined

    if (!title || !priceText || !linkMatch?.[1]) {
      continue
    }

    deals.push({
      capturedAt,
      evidenceText: evidenceText(title, priceText, previousPriceText, savingText),
      id: dealId(target.retailer.id, title, priceText, deals.length),
      previousPriceText,
      priceText,
      productUrl: absoluteUrl(linkMatch[1], target.source.url),
      retailerId: target.retailer.id,
      retailerName: target.retailer.name,
      savingText,
      sourceLabel: target.source.label,
      sourceUrl: target.source.url,
      title,
    })
  }

  return deals
}

function firstClassText(html: string, className: string) {
  const pattern = new RegExp(`<([a-z0-9]+)[^>]*class="[^"]*${escapeRegExp(className)}[^"]*"[^>]*>([\\s\\S]*?)<\\/\\1>`, 'i')
  return pattern.exec(html)?.[2] ?? ''
}

function evidenceText(title: string, priceText: string, previousPriceText?: string, savingText?: string) {
  return [title, labelPrice('Now', priceText), previousPriceText ? labelPrice('Was', previousPriceText) : '', savingText]
    .filter(Boolean)
    .join('. ')
}

function labelPrice(label: 'Now' | 'Was', value: string) {
  const normalizedValue = normalizeText(value)

  if (normalizedValue.toLowerCase().startsWith(label.toLowerCase())) {
    return normalizedValue
  }

  return `${label} ${normalizedValue}`
}

function dealId(retailerId: string, title: string, priceText: string, index: number) {
  return `${retailerId}-${slug(title)}-${slug(priceText)}-${index + 1}`
}

function slug(value: string) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64)
}

function absoluteUrl(value: string, baseUrl: string) {
  try {
    return new URL(decodeHtml(value), baseUrl).toString()
  } catch {
    return baseUrl
  }
}

function normalizeText(value: string) {
  return stripTags(decodeHtml(value))
    .replace(/'/g, '’')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripTags(value: string) {
  return value.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]*>/g, ' ')
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, '’')
    .replace(/&#39;/g, '’')
    .replace(/&rsquo;/g, '’')
    .replace(/&ldquo;/g, '“')
    .replace(/&rdquo;/g, '”')
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
