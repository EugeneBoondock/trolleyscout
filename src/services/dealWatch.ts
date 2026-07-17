// Pure matching logic for deal watches: a shopper's searched item ("peanut
// butter 1kg") matched against deal titles as they flow in from any scout.
// Kept dependency-free so the web app, Pages functions, and the cron Worker
// all share exactly the same idea of what counts as a match.

export interface WatchableDeal {
  title: string
  retailerName?: string
  priceText?: string
  productUrl?: string
  sourceUrl?: string
  imageUrl?: string
}

export interface DealWatchMatch {
  title: string
  retailerName?: string
  priceText?: string
  productUrl?: string
  imageUrl?: string
}

const STOP_WORDS = new Set(['a', 'an', 'and', 'de', 'for', 'of', 'or', 'the', 'with'])
const MAX_MATCHES_PER_WATCH = 5

// "Peanut Butter, 1kg!" -> "peanut butter 1kg". Stable across runs so it can
// double as the uniqueness key for a member's watches.
export function normalizeWatchQuery(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token && !STOP_WORDS.has(token))
    .slice(0, 8)
    .join(' ')
}

export function isWatchQueryValid(normalizedQuery: string): boolean {
  // At least one token of 3+ characters, so "1" or "e" never becomes a watch.
  return normalizedQuery.split(' ').some((token) => token.length >= 3)
}

// Every query token must appear in the deal title (word-start match, so
// "chick" matches "chicken" but "hen" does not match "kitchen").
export function dealMatchesWatch(normalizedQuery: string, dealTitle: string): boolean {
  const title = ` ${dealTitle.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ')} `
  const tokens = normalizedQuery.split(' ').filter(Boolean)

  if (tokens.length === 0) {
    return false
  }

  return tokens.every((token) => title.includes(` ${token}`))
}

export function findWatchMatches(
  normalizedQuery: string,
  deals: WatchableDeal[],
): DealWatchMatch[] {
  const matches: DealWatchMatch[] = []
  const seenTitles = new Set<string>()

  for (const deal of deals) {
    if (matches.length >= MAX_MATCHES_PER_WATCH) {
      break
    }

    if (!dealMatchesWatch(normalizedQuery, deal.title)) {
      continue
    }

    const key = deal.title.toLowerCase()

    if (seenTitles.has(key)) {
      continue
    }

    seenTitles.add(key)
    matches.push({
      imageUrl: deal.imageUrl,
      priceText: deal.priceText,
      productUrl: deal.productUrl ?? deal.sourceUrl,
      retailerName: deal.retailerName,
      title: deal.title,
    })
  }

  return matches
}
