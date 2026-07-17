// Parses South African multi-buy promotions ("2 for R30", "Buy 2 Get 1 Free",
// "R30 when you buy 2") out of a deal's price/saving text, and works out what a
// basket line really costs — and really saves — when the shopper buys in those
// quantities. This is the "buy 2 for X" savings maths the naive was/now delta
// misses entirely.

export type MultibuyOffer =
  | { kind: 'bundle'; quantity: number; priceCents: number }
  | { kind: 'getFree'; payFor: number; total: number }

const MAX_BUNDLE_QUANTITY = 24

// Rand text like "R30", "R 29,99", "R1 299.50" → whole cents.
function randToCents(raw: string): number | undefined {
  const cleaned = raw.replace(/\s/g, '')
  const lastComma = cleaned.lastIndexOf(',')
  const lastDot = cleaned.lastIndexOf('.')
  let normalized = cleaned.replace(/[,.]/g, '')

  if (lastComma > -1 && (lastDot === -1 || lastComma > lastDot)) {
    const centsPart = cleaned.slice(lastComma + 1)
    if (/^\d{2}$/.test(centsPart)) {
      normalized = `${cleaned.slice(0, lastComma).replace(/[,.]/g, '')}.${centsPart}`
    }
  } else if (lastDot > -1) {
    const centsPart = cleaned.slice(lastDot + 1)
    if (/^\d{2}$/.test(centsPart)) {
      normalized = `${cleaned.slice(0, lastDot).replace(/[,.]/g, '')}.${centsPart}`
    }
  }

  const amount = Number(normalized)
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : undefined
}

export function parseMultibuy(...texts: Array<string | undefined>): MultibuyOffer | undefined {
  const text = texts.filter(Boolean).join(' ').toLowerCase()

  if (!text) {
    return undefined
  }

  // "buy 2 get 1 free", "buy 2 get 2 free"
  const getFree = /buy\s*(\d+)\s*(?:and\s*)?get\s*(\d+)\s*(?:free|for free)/.exec(text)
  if (getFree) {
    const payFor = Number(getFree[1])
    const free = Number(getFree[2])
    if (payFor > 0 && free > 0 && payFor + free <= MAX_BUNDLE_QUANTITY) {
      return { kind: 'getFree', payFor, total: payFor + free }
    }
  }

  // "3 for 2" (pay for 2, take 3)
  const forFewer = /\b(\d+)\s*for\s*(\d+)\b(?!\s*r)/.exec(text)
  if (forFewer) {
    const total = Number(forFewer[1])
    const payFor = Number(forFewer[2])
    if (total > payFor && payFor > 0 && total <= MAX_BUNDLE_QUANTITY) {
      return { kind: 'getFree', payFor, total }
    }
  }

  // "2 for R30", "any 2 for R30", "2 x R30"? no — "N for RP"
  const bundle = /(\d+)\s*for\s*r\s*([\d\s,.]+)/.exec(text)
  if (bundle) {
    const quantity = Number(bundle[1])
    const priceCents = randToCents(bundle[2])
    if (quantity > 1 && quantity <= MAX_BUNDLE_QUANTITY && priceCents !== undefined) {
      return { kind: 'bundle', priceCents, quantity }
    }
  }

  // "R30 when you buy 2", "R30 for any 2"
  const priceFirst = /r\s*([\d\s,.]+?)\s*(?:when you buy|for any|for)\s*(\d+)/.exec(text)
  if (priceFirst) {
    const priceCents = randToCents(priceFirst[1])
    const quantity = Number(priceFirst[2])
    if (quantity > 1 && quantity <= MAX_BUNDLE_QUANTITY && priceCents !== undefined) {
      return { kind: 'bundle', priceCents, quantity }
    }
  }

  return undefined
}

export interface LineEconomics {
  linePriceCents?: number
  lineSavingCents?: number
}

// The true cost and saving for `quantity` units, honouring a multibuy offer.
// unitPriceCents is the current single price; previousUnitPriceCents is the
// "was" price used as the savings baseline when present.
export function computeLineEconomics(input: {
  quantity: number
  unitPriceCents?: number
  previousUnitPriceCents?: number
  multibuy?: MultibuyOffer
}): LineEconomics {
  const { quantity, unitPriceCents, previousUnitPriceCents, multibuy } = input

  if (quantity <= 0) {
    return {}
  }

  // No parseable single price: fall back to the simple was/now delta only.
  if (unitPriceCents === undefined) {
    if (multibuy?.kind === 'bundle') {
      // We can still price full bundles even without a single price.
      const bundles = Math.floor(quantity / multibuy.quantity)
      const remainder = quantity % multibuy.quantity
      const perUnit = Math.round(multibuy.priceCents / multibuy.quantity)
      return {
        linePriceCents: bundles * multibuy.priceCents + remainder * perUnit,
      }
    }
    return {}
  }

  const regularBaseline =
    previousUnitPriceCents !== undefined && previousUnitPriceCents > unitPriceCents
      ? previousUnitPriceCents
      : unitPriceCents

  if (multibuy?.kind === 'bundle') {
    const bundles = Math.floor(quantity / multibuy.quantity)
    const remainder = quantity % multibuy.quantity
    const linePriceCents = bundles * multibuy.priceCents + remainder * unitPriceCents
    const saving = regularBaseline * quantity - linePriceCents
    return { linePriceCents, lineSavingCents: saving > 0 ? saving : undefined }
  }

  if (multibuy?.kind === 'getFree') {
    // Charged for `payFor` out of every `total` taken.
    const groups = Math.floor(quantity / multibuy.total)
    const remainder = quantity % multibuy.total
    const chargedUnits = groups * multibuy.payFor + Math.min(remainder, multibuy.payFor)
    const linePriceCents = chargedUnits * unitPriceCents
    const saving = regularBaseline * quantity - linePriceCents
    return { linePriceCents, lineSavingCents: saving > 0 ? saving : undefined }
  }

  // No multibuy: straightforward was/now delta.
  const linePriceCents = unitPriceCents * quantity
  const saving =
    previousUnitPriceCents !== undefined && previousUnitPriceCents > unitPriceCents
      ? (previousUnitPriceCents - unitPriceCents) * quantity
      : undefined

  return { linePriceCents, lineSavingCents: saving }
}
