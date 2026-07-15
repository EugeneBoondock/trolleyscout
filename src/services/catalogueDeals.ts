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
const barePricePattern = /\b([0-9]{1,6}[.,][0-9]{2})\b/g
const invalidVisionTitles = /^(?:save|saving|deal|special|from|only|each|price|promotion|discount)s?[!:.\s-]*$/i
// Reject scene descriptions and banner fragments the vision model sometimes
// emits instead of a real product name. Real titles are noun phrases (brand +
// product + size); these patterns signal a sentence describing the picture,
// e.g. "red boxed product displayed at the top right", "container of Remora
// coffee priced at 64.99", "Special Item: In the top right corner...".
const describedVisionTitle =
  /\b(?:displayed|shown|show(?:s|ing)|located|positioned|pictured|depicted|visible|appears?|priced\s+at|offered|listed|features?|centrally|corner|top (?:right|left)|bottom (?:right|left)|left side|right side|various|assorted|selection of|premium cut|is (?:a|an|the|shown|offered|listed|priced)|are (?:shown|offered|listed|priced)|boxed product|branded product)\b/i
const bannerFragmentTitle =
  /^(?:any\s*\d|buy\s*\d|mix|deal for|promotion(?:al)?\b|combo|special item|two\b|a (?:pack|bag|bottle|jar|box|container|selection)\b|container of|selection of)/i

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
    // A title carried over from a prior line still needs the same cleanup
    // (trailing commas, leading articles) that inline titles get.
    const title = isProductText(inlineTitle) ? inlineTitle : cleanProductTitle(priorText)
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

export function extractVisionCatalogueDeals(
  input: CatalogueDealInput,
  limit = 80,
): DiscoveredDeal[] {
  const payload = parseVisionPayload(input.markdown)

  if (!payload) {
    return []
  }

  const deals: DiscoveredDeal[] = []
  const seen = new Set<string>()

  for (const item of payload.deals) {
    if (deals.length >= limit || !isRecord(item)) {
      break
    }

    const title = typeof item.title === 'string'
      ? cleanProductTitle(item.title)
      : ''
    const priceText = normalizeVisionPrice(item.price)
    const previousPriceText = normalizeVisionPrice(item.previousPrice)

    if (
      !isProductText(title) ||
      invalidVisionTitles.test(title) ||
      describedVisionTitle.test(title) ||
      bannerFragmentTitle.test(title) ||
      !priceText
    ) {
      continue
    }

    const key = `${title.toLowerCase()}::${priceText}`

    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    deals.push({
      capturedAt: input.capturedAt,
      evidenceText: JSON.stringify(item),
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

function parseVisionPayload(value: string) {
  const normalized = value
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')

  try {
    const parsed: unknown = JSON.parse(normalized)

    if (Array.isArray(parsed)) {
      return { deals: parsed }
    }

    if (isRecord(parsed) && Array.isArray(parsed.deals)) {
      return { deals: parsed.deals }
    }
  } catch {
    return undefined
  }

  return undefined
}

function normalizeVisionPrice(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return undefined
  }

  const match = String(value).match(/(?:R|ZAR)?\s*([0-9]+(?:[\s,][0-9]{3})*(?:[.,][0-9]{1,2})?)/i)

  return match ? normalizeRandPrice(match[1]) : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
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

  if (prices.length === 0 && /\bprice|priced\b|\bfor\b/i.test(line)) {
    barePricePattern.lastIndex = 0

    while ((match = barePricePattern.exec(line)) !== null) {
      prices.push({
        end: match.index + match[0].length,
        index: match.index,
        text: normalizeRandPrice(match[1]),
      })
    }
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
    .replace(/^[^:]{2,24}:\s*(?=(?:a|an|two|various)\b)/i, '')
    .replace(/\b(?:priced?|available)\s+(?:at|for)\s*$/i, '')
    .replace(/^an?\s+.*?\bpromotion for (?:a|an|the)\s+/i, '')
    .replace(/^an?\s+(?:bag|pack|bottle|box|jar|case)\s+of\s+/i, '')
    .replace(/^an?\s+/i, '')
    .replace(/\b(?:now|only|each|per pack|special)\s*$/i, '')
    // Strip trailing punctuation even when whitespace trails it (e.g. "Beans, ").
    .replace(/[\s,;:.–—-]+$/g, '')
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
