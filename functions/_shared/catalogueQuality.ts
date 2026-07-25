import type { DiscoveredDeal } from '../../src/types'

// Where the candidate's text came from decides how far it can be trusted.
// 'vision' read the rendered page, so the printed typography (superscript cents,
// column layout) was still visible to the model. 'pdf-text' is a flattened text
// layer: the converter concatenates every design run of a page in stream order,
// which loses both the column layout and the font sizes that carry meaning.
export type CatalogueTextSource = 'pdf-text' | 'vision'

export type CatalogueRejection =
  | 'ambiguous-price'
  | 'boilerplate'
  | 'brand-banner'
  | 'embedded-price'
  | 'page-furniture'
  | 'qualifier-only'
  | 'too-long'
  | 'unpriced'
  | 'unreadable'
  | 'welded-run'

export interface CatalogueQualityDeal {
  previousPriceText?: string
  priceText?: string
  title: string
}

const MAX_TITLE_LENGTH = 120
// The converter emits a "Page 4" marker between pages. When the welded page text
// that follows is too long to be a title, extraction falls back to the previous
// line and stores the marker as a product.
const PAGE_FURNITURE = /^(?:page|pg|p)\s*\d{1,3}$/i
const LEGAL_BOILERPLATE =
  /\b(?:terms and conditions|t&cs?|full disclaimer|disclaimer|e&oe|errors and omissions|reserve the right|prices? (?:are|is) indicative|prices valid|valid (?:from|until|while)|while stocks last|subject to availability|actual colou?rs?|accurately represent|printing limitations?|photographic images?|advertis(?:ing|ed|ement)|customer protection insurance|card fees|monthly instalments?|total repayment|interest (?:at|rate)|credit provider|national credit|delivery charges|display purposes|trading hours|no traders)\b/i
// A real product name never carries a rand amount. "R10999R9999" is two prices
// welded into the name; "R13each" is a price line mistaken for a name. The
// amount must be glued to the R unless it spells out cents, so a product code
// like "Panado-R 20s" is left alone.
const EMBEDDED_PRICE = /(?:^|[^A-Za-z])R\d{2}|\dR\d|\bR\s?\d+[.,]\d{2}/
// A price qualifier is the small print beside a price, never the product.
const QUALIFIER_ONLY = /^(?:per|each|ea|from|only|now|was|save|price[ds]?|for)\s/i
// Design runs concatenated without a separator, e.g. "ORANGESFamily Pocket",
// "PocketCLOVER", "(831582)4 kg" or "Cheese900 g". Real names keep their
// spaces; the digit guard keeps pack multipliers such as "6x330ml" readable.
const WELDED_RUN =
  /[a-z][A-Z]{3,}|[A-Z]{4,}[a-z]|[A-Z]{3,}\d|\)[^\s,;.]|(?<!\d)[a-z]\d{2,}/
// One capital in the middle of a word is a brand ("iPhone", "McCain"); two or
// more are separate design runs glued together ("CokeAuto WashingPowder").
const CAMEL_WELD = /[a-z][A-Z]/g
const MAX_CAMEL_WELDS = 1
const READABLE_WORD = /\p{L}{3}/u
const LOWERCASE_LETTER = /\p{Ll}/u
// The rand run and the superscript cents run are separate text objects, so a
// flattened "R2995" is either R29.95 or R2 995 and nothing in the text says
// which. Only an explicit separator, or a run too short to hide two cents
// digits, is safe to store.
const EXPLICIT_CENTS = /\d[.,]\d{2}$/
const MAX_UNAMBIGUOUS_DIGITS = 2

const SEGMENT_PRICE = /(?<![A-Za-z0-9])(?:R|ZAR)\s?\d+(?:[\s,]\d{3})*(?:[.,]\d{2})?/g
// The unit is welded straight onto the amount and often onto the next product
// too ("R49.99eachSunfoil Sunflower Oil 2L").
// Case-sensitive on purpose: the "not followed by a lowercase letter" guard is
// what separates the unit from the product name welded onto it, and an
// ignore-case flag would make that guard reject every letter.
const PRICE_UNIT =
  /^\s*(?:(?:each|Each|EACH|ea|Ea|EA)(?![a-z])|(?:per|Per|PER)(?:\s+[\w/-]+|\b))/
// "R29.99 was R39.99" is one product with a was/now pair, not two products.
const PRICE_CONNECTOR = /^[\s,;:.–—-]*(?:was|now|from|only|save|normal(?:\s+price)?|reg(?:ular)?|instead(?:\s+of)?|or)?[\s,;:.–—-]*$/i
// The same converter that drops the column layout also glues a price onto the
// text before it ("Rice 2kgR29.99each"). Splitting there is what lets a genuine
// product and its price come out as one deal instead of a run-on title.
// Breaking after a capital is only safe when the amount carries cents, so a
// brand that ends in R ("CLOVER40% Fat Spread") is never split into a price.
const WELDED_PRICE_BOUNDARY =
  /(?<=[a-z0-9’”'")\]])(?=R\d)|(?<=[A-Z])(?=R\d+[.,]\d{2})/g

export function segmentCatalogueMarkdown(markdown: string): string {
  return markdown
    .split(/\r?\n/)
    .flatMap((line) => line.split(WELDED_PRICE_BOUNDARY))
    .flatMap(segmentLine)
    .join('\n')
}

export function catalogueDealRejection(
  deal: CatalogueQualityDeal,
  source: CatalogueTextSource,
): CatalogueRejection | undefined {
  const title = deal.title.trim()

  if (PAGE_FURNITURE.test(title)) {
    return 'page-furniture'
  }
  if (!READABLE_WORD.test(title)) {
    return 'unreadable'
  }
  if (title.length > MAX_TITLE_LENGTH) {
    return 'too-long'
  }
  if (LEGAL_BOILERPLATE.test(title)) {
    return 'boilerplate'
  }
  if (EMBEDDED_PRICE.test(title)) {
    return 'embedded-price'
  }
  if (QUALIFIER_ONLY.test(title)) {
    return 'qualifier-only'
  }
  if (source === 'pdf-text' && isWeldedRun(title)) {
    return 'welded-run'
  }
  // Brand lettering is set in capitals and sits in its own text run, so a
  // flattened all-capitals title is a logo caption next to a price, not the
  // product that price belongs to.
  if (source === 'pdf-text' && !LOWERCASE_LETTER.test(title)) {
    return 'brand-banner'
  }
  if (!deal.priceText) {
    return 'unpriced'
  }
  if (source === 'pdf-text' && isAmbiguousRandAmount(deal.priceText)) {
    return 'ambiguous-price'
  }
  return undefined
}

export function keepTrustworthyCatalogueDeals<Deal extends DiscoveredDeal>(
  deals: Deal[],
  source: CatalogueTextSource,
): Deal[] {
  return deals.flatMap((deal) => {
    if (catalogueDealRejection(deal, source)) {
      return []
    }
    // A trustworthy selling price must not be paired with a was-price we cannot
    // read: the saving would be invented.
    if (
      deal.previousPriceText !== undefined &&
      source === 'pdf-text' &&
      isAmbiguousRandAmount(deal.previousPriceText)
    ) {
      return [{ ...deal, previousPriceText: undefined }]
    }
    return [deal]
  })
}

export function isAmbiguousRandAmount(value: string): boolean {
  const amount = value.replace(/[^\d.,]/g, '')

  if (EXPLICIT_CENTS.test(amount)) {
    return false
  }
  return amount.replace(/\D/g, '').length > MAX_UNAMBIGUOUS_DIGITS
}

function isWeldedRun(title: string) {
  return WELDED_RUN.test(title) || (title.match(CAMEL_WELD)?.length ?? 0) > MAX_CAMEL_WELDS
}

function segmentLine(line: string): string[] {
  const matches = [...line.matchAll(SEGMENT_PRICE)]

  if (matches.length === 0) {
    return [line]
  }

  const segments: string[] = []
  let current = ''
  let cursor = 0
  let hasPrice = false

  for (const match of matches) {
    const index = match.index ?? 0
    const between = line.slice(cursor, index)

    if (hasPrice && !PRICE_CONNECTOR.test(between)) {
      segments.push(current)
      current = between
    } else {
      current += between
    }
    const unit = line.slice(index + match[0].length).match(PRICE_UNIT)?.[0] ?? ''
    // The amount and its unit must stay separated: the price reader ends a
    // match on a word boundary, so "R49.99each" would be read as R49.
    current += `${match[0]} ${unit.trim()}`.trimEnd()
    cursor = index + match[0].length + unit.length
    hasPrice = true
  }

  const tail = line.slice(cursor)
  if (tail.trim()) {
    segments.push(current)
    current = tail
  }
  segments.push(current)
  return segments.map((segment) => segment.trim()).filter(Boolean)
}
