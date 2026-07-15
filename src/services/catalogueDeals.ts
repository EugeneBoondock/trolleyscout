import type { DiscoveredDeal } from '../types'

export interface CatalogueDealInput {
  capturedAt: string
  imageUrl?: string
  markdown: string
  retailerId: DiscoveredDeal['retailerId']
  retailerName: string
  sourceUrl: string
}

interface PriceMatch {
  end: number
  index: number
  text: string
}

const pricePattern = /\b(?:R|ZAR)\s*([0-9]+(?:[\s,][0-9]{3})*(?:[.,][0-9]{2})?)\b/gi

export function extractCatalogueDeals(
  input: CatalogueDealInput,
  limit = 80,
): DiscoveredDeal[] {
  const lines = input.markdown
    .split(/\r?\n/)
    .map(cleanCatalogueText)
    .filter(Boolean)
  const deals: DiscoveredDeal[] = []
  const seen = new Set<string>()
  let priorText = ''

  for (const line of lines) {
    if (deals.length >= limit) {
      break
    }

    const prices = extractPrices(line)

    if (prices.length === 0) {
      priorText = isProductText(line) ? line : ''
      continue
    }

    const inlineTitle = cleanProductTitle(line.slice(0, prices[0].index))
    const title = isProductText(inlineTitle) ? inlineTitle : priorText
    priorText = ''

    if (!isProductText(title)) {
      continue
    }

    const priceText = prices[0].text
    const priorPriceContext = line.slice(prices[0].end).toLowerCase()
    const previousPriceText = prices.length > 1 && /\bwas\b|\bfrom\b|normal price/.test(priorPriceContext)
      ? prices[1].text
      : undefined
    const key = `${title.toLowerCase()}::${priceText}`

    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    deals.push({
      capturedAt: input.capturedAt,
      evidenceText: line,
      id: `${input.retailerId}-catalogue-${hashString(key)}`,
      imageUrl: input.imageUrl,
      previousPriceText,
      priceText,
      productUrl: input.sourceUrl,
      retailerId: input.retailerId,
      retailerName: input.retailerName,
      sourceLabel: 'Catalogue scan',
      sourceUrl: input.sourceUrl,
      title,
    })
  }

  return deals
}

function extractPrices(line: string): PriceMatch[] {
  const prices: PriceMatch[] = []
  let match: RegExpExecArray | null

  pricePattern.lastIndex = 0
  while ((match = pricePattern.exec(line)) !== null) {
    prices.push({
      end: match.index + match[0].length,
      index: match.index,
      text: normalizeRandPrice(match[1]),
    })
  }

  return prices
}

function normalizeRandPrice(amount: string) {
  const compact = amount.replace(/\s/g, '')
  const decimalComma = /,\d{2}$/.test(compact)
  const normalized = decimalComma
    ? compact.replace(/\./g, '').replace(',', '.')
    : compact.replace(/,/g, '')

  return `R${normalized}`
}

function cleanCatalogueText(value: string) {
  return value
    .replace(/^\s{0,3}(?:#{1,6}|[-*+]|\d+[.)])\s*/, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanProductTitle(value: string) {
  return cleanCatalogueText(value)
    .replace(/\b(?:now|only|each|per pack|special)\s*$/i, '')
    .replace(/[-:]+$/g, '')
    .trim()
}

function isProductText(value: string) {
  return value.length >= 4 && value.length <= 160 && /\p{L}/u.test(value)
}

function hashString(value: string) {
  let hash = 0

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index)
    hash |= 0
  }

  return Math.abs(hash).toString(36)
}
