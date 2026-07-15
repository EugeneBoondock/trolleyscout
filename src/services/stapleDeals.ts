import type { DiscoveredDeal } from '../types'

// Staple foods and household basics that decide whether a month is survivable.
// Matched as whole words so "rice" does not match "price".
const STAPLE_PATTERNS: RegExp[] = [
  /\bmilk\b/i,
  /\brice\b/i,
  /\bmaize\b/i,
  /\bmealie\b/i,
  /\bpap\b/i,
  /\bsamp\b/i,
  /\bbread\b/i,
  /\brolls?\b/i,
  /\beggs?\b/i,
  /\b(cooking|sunflower|vegetable) oil\b/i,
  /\bsugar\b/i,
  /\bbeans\b/i,
  /\blentils?\b/i,
  /\bpilchards?\b/i,
  /\bflour\b/i,
  /\btea\b/i,
  /\bamasi\b/i,
  /\bsoap\b/i,
  /\bwashing powder\b/i,
]

export function isStapleTitle(title: string): boolean {
  return STAPLE_PATTERNS.some((pattern) => pattern.test(title))
}

// Picks staple rows from a discovery run for the home page strip.
// Rows with a previous price (a visible saving) come first.
export function pickStapleDeals(deals: DiscoveredDeal[], limit = 6): DiscoveredDeal[] {
  const staples = deals.filter((deal) => Boolean(deal.priceText) && isStapleTitle(deal.title))

  const withSaving = staples.filter((deal) => Boolean(deal.previousPriceText))
  const withoutSaving = staples.filter((deal) => !deal.previousPriceText)
  const ordered = [...withSaving, ...withoutSaving]

  const seenTitles = new Set<string>()
  const picked: DiscoveredDeal[] = []

  for (const deal of ordered) {
    if (picked.length >= limit) {
      break
    }

    const titleKey = deal.title.toLowerCase()

    if (seenTitles.has(titleKey)) {
      continue
    }

    seenTitles.add(titleKey)
    picked.push(deal)
  }

  return picked
}
