const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
}

const QUERY_STOP_WORDS = new Set([
  'a',
  'about',
  'and',
  'any',
  'affordable',
  'available',
  'best',
  'below',
  'buy',
  'can',
  'cheap',
  'cheaper',
  'cheapest',
  'could',
  'current',
  'deal',
  'deals',
  'do',
  'find',
  'for',
  'from',
  'get',
  'give',
  'have',
  'hello',
  'hey',
  'hi',
  'i',
  'in',
  'inexpensive',
  'is',
  'item',
  'items',
  'just',
  'kg',
  'kgs',
  'kilo',
  'kilogram',
  'kilograms',
  'kilos',
  'latest',
  'less',
  'like',
  'looking',
  'lowest',
  'marketplace',
  'me',
  'need',
  'of',
  'ok',
  'okay',
  'on',
  'please',
  'price',
  'priced',
  'prices',
  'product',
  'products',
  'search',
  'show',
  'special',
  'specials',
  'some',
  'the',
  'to',
  'under',
  'want',
  'what',
  'with',
  'would',
  'you',
])

const ACCESSORY_TERMS: Record<string, readonly string[]> = {
  chicken: [
    'cat',
    'costume',
    'dog',
    'feed',
    'pet',
    'plush',
    'toy',
  ],
  rice: [
    'cracker',
    'crackers',
    'cake',
    'cakes',
    'cereal',
    'cooker',
    'flour',
    'krispies',
    'milk',
    'noodle',
    'noodles',
    'pudding',
    'shampoo',
  ],
  spaghetti: [
    'bra',
    'dress',
    'shirt',
    'spoon',
    'strap',
  ],
}

export interface MarketplaceProductQuery {
  productName?: string
  productTerms: string[]
  requestedPackGrams?: number
  requestedPackText?: string
  sort: 'price-asc' | 'relevance'
}

interface MarketplaceProductDeal {
  evidenceText?: string
  id: string
  priceCents?: number
  priceText?: string
  productUrl: string
  retailerName?: string
  soldOut?: boolean
  status?: string
  title: string
}

export interface RankedMarketplaceProductDeals<T> {
  deals: T[]
  exactPackAvailable: boolean
}

export function parseMarketplaceProductQuery(
  message: string,
): MarketplaceProductQuery | undefined {
  const normalized = normalizeText(message)
  const requestedPackGrams = extractPackSizeGrams(normalized)
  const words = normalized
    .replace(/\b\d+(?:[.,]\d+)?\s*x\s*\d+(?:[.,]\d+)?\s*(?:kg|kgs?|kilos?|kilograms?|g|grams?)\b/gu, ' ')
    .replace(/\b(?:\d+(?:[.,]\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\s*(?:kg|kgs?|kilos?|kilograms?|g|grams?)\b/gu, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(/\s+/)
    .filter((word) =>
      word.length >= 2 &&
      !QUERY_STOP_WORDS.has(word) &&
      !(word in NUMBER_WORDS) &&
      !/^\d+(?:[.,]\d+)?$/u.test(word) &&
      !/^(?:r|zar|usd|zwg)\d+(?:[.,]\d+)?$/u.test(word),
    )

  const productTerms = Array.from(new Set(words)).slice(0, 5)
  if (productTerms.length === 0) return undefined

  const wantsCheapest =
    /\b(?:cheap(?:er|est)?|affordable|inexpensive|lowest(?:\s+price)?|price\s+low\s+to\s+high)\b/u
      .test(normalized)
  return {
    productTerms,
    ...(requestedPackGrams === undefined
      ? {}
      : {
          requestedPackGrams,
          requestedPackText: formatPackSize(requestedPackGrams),
        }),
    sort: wantsCheapest ? 'price-asc' : 'relevance',
  }
}

export function extractPackSizeGrams(value: string): number | undefined {
  const normalized = normalizeText(value)
  const multiplierMatch = normalized.match(
    /\b(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)\s*(kg|kgs?|kilos?|kilograms?|g|grams?)\b/u,
  )
  if (multiplierMatch) {
    const quantity = parseDecimal(multiplierMatch[1])
    const size = parseDecimal(multiplierMatch[2])
    return toGrams(quantity * size, multiplierMatch[3])
  }

  const wordAlternation = Object.keys(NUMBER_WORDS).join('|')
  const wordMatch = normalized.match(
    new RegExp(`\\b(${wordAlternation})\\s*(kg|kgs?|kilos?|kilograms?|g|grams?)\\b`, 'u'),
  )
  if (wordMatch) {
    return toGrams(NUMBER_WORDS[wordMatch[1]], wordMatch[2])
  }

  const numberMatch = normalized.match(
    /\b(\d+(?:[.,]\d+)?)\s*(kg|kgs?|kilos?|kilograms?|g|grams?)\b/u,
  )
  if (!numberMatch) return undefined
  return toGrams(parseDecimal(numberMatch[1]), numberMatch[2])
}

export function rankMarketplaceProductDeals<T extends MarketplaceProductDeal>(
  deals: readonly T[],
  query: MarketplaceProductQuery,
  limit = 120,
): RankedMarketplaceProductDeals<T> {
  const requestedPack = query.requestedPackGrams
  const boundedLimit = Math.max(1, Math.min(200, Math.floor(limit)))
  const ranked = deals
    .map((deal, index) => {
      const title = normalizeText(deal.title)
      const searchText = normalizeText([
        deal.title,
        deal.evidenceText,
        deal.retailerName,
      ].filter(Boolean).join(' '))
      const priceCents = currentPriceCents(deal)
      const packGrams = extractPackSizeGrams(deal.title)
      const titleMatches = query.productTerms.every((term) => hasWord(title, term))
      const searchMatches = query.productTerms.every((term) => hasWord(searchText, term))
      const blocked = query.productTerms.some((term) =>
        (ACCESSORY_TERMS[term] ?? []).some((accessory) =>
          !query.productTerms.includes(accessory) &&
          hasWord(title, accessory),
        ),
      )

      return {
        blocked,
        deal,
        index,
        packGrams,
        priceCents,
        searchMatches,
        titleMatches,
      }
    })
    .filter((item) =>
      item.searchMatches &&
      !item.blocked &&
      item.priceCents !== undefined &&
      !item.deal.soldOut &&
      (!item.deal.status || item.deal.status === 'active') &&
      isHttpUrl(item.deal.productUrl),
    )
    .sort((a, b) => {
      if (a.titleMatches !== b.titleMatches) return a.titleMatches ? -1 : 1
      if (requestedPack !== undefined) {
        const aExact = a.packGrams === requestedPack
        const bExact = b.packGrams === requestedPack
        if (aExact !== bExact) return aExact ? -1 : 1
        const aDistance = a.packGrams === undefined
          ? Number.POSITIVE_INFINITY
          : Math.abs(a.packGrams - requestedPack)
        const bDistance = b.packGrams === undefined
          ? Number.POSITIVE_INFINITY
          : Math.abs(b.packGrams - requestedPack)
        if (aDistance !== bDistance) return aDistance - bDistance
      }
      if (query.sort === 'price-asc' || a.packGrams === b.packGrams) {
        const priceDifference = (a.priceCents ?? 0) - (b.priceCents ?? 0)
        if (priceDifference !== 0) return priceDifference
      }
      return a.index - b.index
    })

  return {
    deals: ranked.slice(0, boundedLimit).map(({ deal }) => deal),
    exactPackAvailable: requestedPack !== undefined &&
      ranked.some(({ packGrams }) => packGrams === requestedPack),
  }
}

function currentPriceCents(deal: MarketplaceProductDeal): number | undefined {
  if (
    typeof deal.priceCents === 'number' &&
    Number.isFinite(deal.priceCents) &&
    deal.priceCents > 0
  ) {
    return Math.round(deal.priceCents)
  }
  const matches = deal.priceText?.match(/\d[\d\s.,]*/gu)
  const raw = matches?.at(-1)?.trim()
  if (!raw) return undefined
  const compact = raw.replace(/\s/g, '')
  let normalized = compact
  if (/^\d{1,3}(?:[.,]\d{3})+$/u.test(compact)) {
    normalized = compact.replace(/[.,]/g, '')
  } else if (compact.includes(',') && !compact.includes('.')) {
    normalized = compact.replace(',', '.')
  } else if (compact.includes(',') && compact.includes('.')) {
    const decimal = compact.lastIndexOf(',') > compact.lastIndexOf('.') ? ',' : '.'
    normalized = compact
      .replaceAll(decimal === ',' ? '.' : ',', '')
      .replace(decimal, '.')
  }
  const amount = Number(normalized)
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : undefined
}

function formatPackSize(grams: number): string {
  if (grams >= 1_000) {
    return `${Number((grams / 1_000).toFixed(3))} kg`
  }
  return `${grams} g`
}

function hasWord(value: string, term: string): boolean {
  return value
    .split(/[^\p{L}\p{N}]+/u)
    .some((word) => word === term || word.startsWith(`${term}s`))
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function normalizeText(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase().replace(/[‐‑‒–—-]+/gu, ' ')
}

function parseDecimal(value: string): number {
  return Number(value.replace(',', '.'))
}

function toGrams(value: number, unit: string): number | undefined {
  if (!Number.isFinite(value) || value <= 0) return undefined
  const multiplier = /^(?:kg|kgs?|kilos?|kilograms?)$/u.test(unit) ? 1_000 : 1
  return Math.round(value * multiplier)
}
