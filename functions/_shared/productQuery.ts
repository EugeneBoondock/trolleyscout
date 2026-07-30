/**
 * Query understanding for product search.
 *
 * The old filter demanded that every word a shopper typed appear literally in
 * the product title (`tokens.every((token) => title.includes(token))`). That
 * threw away correct results at scale: "50 inch television" rejected every
 * real 50" TV because retailers write "TV", not "television", and write the
 * size into a model code ("TCL QD GOOGLE TV 50S5K").
 *
 * This module reads the shopper's phrase the way a shop assistant would —
 * what product is it, what size, what colour, what budget — and then scores
 * candidate titles against that understanding instead of matching substrings.
 */

export type ProductCategory =
  | 'appliance'
  | 'electronics'
  | 'furniture'
  | 'grocery'
  | 'homeware'
  | 'outdoor'
  | 'personal-care'
  | 'tools'
  | 'toys'
  | 'unknown'

export interface ProductSpec {
  /** Appliance drum or oven capacity, in litres or kilograms. */
  capacity?: { unit: 'kg' | 'l'; value: number }
  /** Pack or tier count: "10 pack", "3-tier". */
  count?: number
  /** Screen or frame size in inches: "50 inch", "18 inch". */
  inches?: number
  /** Grocery pack size: "2L", "500g". */
  packSize?: { unit: 'g' | 'kg' | 'l' | 'ml'; value: number }
}

export interface ParsedProductQuery {
  category: ProductCategory
  colour?: string
  /** Accepted names for the thing itself — "television" also accepts "tv". */
  headTerms: string[]
  /** Meaningful describing words: "cordless", "gluten-free", "stainless". */
  modifiers: string[]
  priceCeilingCents?: number
  raw: string
  /** True when the shopper asked for cheap/budget — sort price-ascending. */
  sortCheapest: boolean
  spec: ProductSpec
  /** Trimmed phrase to hand to a retailer's own search engine. */
  storefrontQuery: string
}

export interface CandidateScore {
  /** Human-readable scoring notes, surfaced in retrieval logs. */
  reasons: string[]
  /** True when the candidate is the wrong product, not merely a weak match. */
  rejected: boolean
  score: number
}

/**
 * Products we know by name, with the words retailers actually use for them.
 * Keeping the first entry as the canonical name lets the reranker explain
 * itself ("matched product type: television").
 */
const PRODUCT_LEXICON: ReadonlyArray<{
  category: ProductCategory
  terms: readonly string[]
}> = [
  { category: 'electronics', terms: ['television', 'tv', 'tvs', 'telly'] },
  { category: 'electronics', terms: ['laptop', 'notebook'] },
  { category: 'electronics', terms: ['cellphone', 'phone', 'smartphone', 'mobile'] },
  { category: 'electronics', terms: ['headphones', 'earphones', 'earbuds'] },
  { category: 'appliance', terms: ['washing machine', 'washer', 'washing-machine'] },
  { category: 'appliance', terms: ['fridge', 'refrigerator'] },
  { category: 'appliance', terms: ['microwave', 'microwave oven'] },
  { category: 'appliance', terms: ['pizza oven'] },
  { category: 'appliance', terms: ['oven', 'stove'] },
  { category: 'appliance', terms: ['kettle'] },
  { category: 'appliance', terms: ['air fryer', 'airfryer'] },
  { category: 'appliance', terms: ['dishwasher'] },
  { category: 'appliance', terms: ['tumble dryer', 'dryer'] },
  { category: 'furniture', terms: ['office chair', 'desk chair'] },
  { category: 'furniture', terms: ['bunk bed'] },
  { category: 'furniture', terms: ['bed', 'base set'] },
  { category: 'furniture', terms: ['couch', 'sofa', 'lounge suite'] },
  { category: 'furniture', terms: ['table'] },
  { category: 'homeware', terms: ['curtains', 'curtain', 'drapes'] },
  { category: 'homeware', terms: ['duvet', 'comforter'] },
  { category: 'homeware', terms: ['towel', 'towels'] },
  { category: 'tools', terms: ['drill', 'drill driver', 'drills'] },
  { category: 'tools', terms: ['angle grinder', 'grinder'] },
  { category: 'tools', terms: ['lawnmower', 'lawn mower'] },
  { category: 'outdoor', terms: ['bicycle', 'bike', 'bicycles'] },
  { category: 'outdoor', terms: ['braai', 'grill', 'barbecue'] },
  { category: 'outdoor', terms: ['tent'] },
  { category: 'grocery', terms: ['milk'] },
  { category: 'grocery', terms: ['bread', 'loaf'] },
  { category: 'grocery', terms: ['eggs', 'egg'] },
  { category: 'grocery', terms: ['sugar'] },
  { category: 'grocery', terms: ['rice'] },
  { category: 'grocery', terms: ['maize meal', 'mielie meal', 'pap'] },
  { category: 'grocery', terms: ['chicken'] },
  { category: 'grocery', terms: ['boerewors', 'wors'] },
  { category: 'grocery', terms: ['cooking oil', 'sunflower oil'] },
  // Accessories are products in their own right when the shopper asks for
  // one. Listed last so a longer, more specific product ("duvet") wins ties.
  { category: 'electronics', terms: ['phone case', 'case', 'cover'] },
  { category: 'electronics', terms: ['screen protector'] },
]

/**
 * Nouns that name a *different kind of thing* from the product itself. A
 * "Bread Bin" is not bread; a "Chicken Feeder" is not chicken; a "2L Milk
 * Canister" is not milk. These only count against a candidate when the
 * shopper did NOT ask for one — "iPhone 15 case" legitimately wants a case.
 */
const WRONG_TYPE_MARKERS: readonly string[] = [
  // Vessels and containers — the "2L Milk Canister for a milk query" class.
  'bin', 'canister', 'container', 'holder', 'dispenser', 'jug', 'flask',
  'bottle', 'mug', 'tumbler', 'carafe',
  // Fixtures and hardware.
  'feeder', 'mount', 'bracket', 'tripod', 'pump', 'lock', 'saddle', 'pedal',
  'tyre', 'tube', 'chain', 'spoke', 'handlebar',
  // Equipment that makes or shapes the product rather than being it.
  'mould', 'mold', 'cutter', 'press', 'maker', 'machine', 'grinder', 'slicer',
  'peeler', 'opener', 'scoop', 'whisk', 'proofing', 'peel', 'turner',
  'accessory', 'accessories',
  // Companion devices — a "TV stick" is not a TV.
  'stick', 'dongle', 'player', 'projector', 'antenna', 'decoder',
  // Clothing and merchandise — "Rib Bike Short" is not a bicycle.
  'short', 'shorts', 'shirt', 'jersey', 'glove', 'gloves', 'helmet', 'sock',
  'socks', 'apron', 'costume', 'plush',
  // Print, novelty and spares.
  'replacement', 'spare', 'decal', 'poster', 'puzzle', 'figurine', 'keyring',
  'sticker', 'ornament', 'seeds', 'seed',
]

/** Softer signals — usually an accessory or a derivative, not the thing. */
const WEAK_TYPE_MARKERS: readonly string[] = [
  'case', 'cover', 'sleeve', 'stand', 'rack', 'hook', 'basket', 'tray', 'kit',
  'refill', 'cartridge', 'filter', 'cable', 'charger', 'adapter', 'remote',
  'battery', 'bag', 'toy', 'book', 'magazine', 'flavour', 'flavoured',
  'flavored', 'scented', 'essence', 'extract', 'powder', 'sauce', 'spice',
  'seasoning', 'stock', 'soup',
]

/** Words that describe intent or price, never the product. */
const INTENT_WORDS = new Set([
  'a', 'an', 'and', 'any', 'best', 'budget', 'buy', 'cheap', 'cheapest', 'find',
  'for', 'get', 'good', 'in', 'me', 'my', 'need', 'of', 'on', 'or', 'please',
  'quality', 'some', 'the', 'to', 'under', 'want', 'with', 'without',
])

const CHEAP_WORDS = new Set(['cheap', 'cheapest', 'budget', 'affordable', 'value'])

const COLOURS = new Set([
  'beige', 'black', 'blue', 'brown', 'charcoal', 'cream', 'gold', 'green',
  'grey', 'gray', 'ivory', 'navy', 'orange', 'pink', 'purple', 'red', 'rose',
  'silver', 'teal', 'white', 'yellow',
])

export function parseProductQuery(raw: string): ParsedProductQuery {
  const text = raw.toLowerCase().trim().replace(/\s+/g, ' ')
  const priceCeilingCents = extractPriceCeiling(text)
  const spec = extractSpec(text)
  const entry = matchLexicon(text)
  const tokens = tokenize(stripPriceClause(text))
  const colour = tokens.find((token) => COLOURS.has(token))

  const headTerms = entry
    ? [...entry.terms]
    : fallbackHeadTerms(tokens)
  const headTokens = new Set(headTerms.flatMap((term) => term.split(' ')))

  const modifiers = tokens.filter((token) =>
    !INTENT_WORDS.has(token) &&
    !headTokens.has(token) &&
    token !== colour &&
    !isSpecToken(token))

  return {
    category: entry?.category ?? 'unknown',
    colour,
    headTerms,
    modifiers,
    priceCeilingCents,
    raw,
    sortCheapest: tokens.some((token) => CHEAP_WORDS.has(token)),
    spec,
    storefrontQuery: buildStorefrontQuery(headTerms, modifiers, colour, spec),
  }
}

/**
 * How well a product title answers the shopper's query. Positive scores are
 * matches; `rejected` means the candidate is a different product entirely and
 * must never be shown, no matter how few results survive.
 */
export function scoreProductCandidate(
  title: string,
  query: ParsedProductQuery,
  priceCents?: number,
): CandidateScore {
  const reasons: string[] = []
  const normalized = normalizeUnits(title)
  const tokens = tokenize(normalized)
  const tokenSet = new Set(tokens)

  const headHit = query.headTerms.find((term) => term.includes(' ')
    ? normalized.includes(term)
    : tokenSet.has(term))
  if (!headHit) {
    return { reasons: ['no product-type match'], rejected: true, score: 0 }
  }
  reasons.push(`product type: ${headHit}`)
  let score = 100

  const typePenalty = wrongTypePenalty(tokens, query)
  if (typePenalty.rejected) {
    return {
      reasons: [`different product type: ${typePenalty.marker}`],
      rejected: true,
      score: 0,
    }
  }
  score -= typePenalty.penalty
  if (typePenalty.marker) reasons.push(`weak type signal: ${typePenalty.marker}`)

  const specResult = scoreSpec(normalized, tokens, query.spec)
  if (specResult.rejected) {
    return { reasons: [specResult.reason], rejected: true, score: 0 }
  }
  score += specResult.score
  if (specResult.reason) reasons.push(specResult.reason)

  if (priceCents !== undefined && query.priceCeilingCents !== undefined
    && priceCents > query.priceCeilingCents) {
    return { reasons: ['over budget'], rejected: true, score: 0 }
  }

  for (const modifier of query.modifiers) {
    if (tokenSet.has(modifier) || normalized.includes(modifier)) {
      score += 12
      reasons.push(`matched "${modifier}"`)
    } else {
      // "Cordless" drill vs "impact" drill: a describing word the shopper
      // asked for and the title does not carry is a genuinely weaker answer.
      score -= 10
    }
  }

  if (query.colour) {
    if (tokenSet.has(query.colour)) {
      score += 12
      reasons.push(`colour ${query.colour}`)
    } else if (tokens.some((token) => COLOURS.has(token))) {
      score -= 8
      reasons.push('different colour')
    }
  }

  // Shorter titles that still match are usually the plain product; long ones
  // are bundles and variety packs.
  score -= Math.min(15, Math.max(0, tokens.length - 8))

  return { reasons, rejected: false, score }
}

function wrongTypePenalty(
  tokens: readonly string[],
  query: ParsedProductQuery,
): { marker?: string; penalty: number; rejected: boolean } {
  const asked = new Set([
    ...query.modifiers,
    ...query.headTerms.flatMap((term) => term.split(' ')),
  ])

  for (const token of tokens) {
    if (asked.has(token)) continue
    if (WRONG_TYPE_MARKERS.includes(token)) {
      return { marker: token, penalty: 0, rejected: true }
    }
  }
  for (const token of tokens) {
    if (asked.has(token)) continue
    if (WEAK_TYPE_MARKERS.includes(token)) {
      return { marker: token, penalty: 45, rejected: false }
    }
  }
  return { penalty: 0, rejected: false }
}

function scoreSpec(
  normalized: string,
  tokens: readonly string[],
  spec: ProductSpec,
): { reason: string; rejected: boolean; score: number } {
  if (spec.inches !== undefined) {
    const sizes = screenSizes(tokens)
    if (sizes.length > 0) {
      return sizes.includes(spec.inches)
        ? { reason: `${spec.inches}" size match`, rejected: false, score: 60 }
        : { reason: `wrong size (${sizes.join('/')}" not ${spec.inches}")`, rejected: true, score: 0 }
    }
    // The shopper named a size, so a title that never states one is a weaker
    // answer than one that states the right size — not a rejection, because
    // some listings put the size only in the description.
    return { reason: 'size not stated', rejected: false, score: -35 }
  }

  if (spec.packSize) {
    const wanted = `${spec.packSize.value}${spec.packSize.unit}`
    return hasMeasure(normalized, wanted)
      ? { reason: `pack size ${wanted}`, rejected: false, score: 50 }
      : { reason: `different pack size to ${wanted}`, rejected: false, score: -30 }
  }

  if (spec.capacity) {
    const wanted = `${spec.capacity.value}${spec.capacity.unit}`
    return hasMeasure(normalized, wanted)
      ? { reason: `capacity ${wanted}`, rejected: false, score: 50 }
      : { reason: `different capacity to ${wanted}`, rejected: false, score: -25 }
  }

  if (spec.count !== undefined && new RegExp(`\\b${spec.count}\\b`).test(normalized)) {
    return { reason: `${spec.count}-count match`, rejected: false, score: 25 }
  }

  return { reason: '', rejected: false, score: 0 }
}

/**
 * Whether a title states exactly this measurement. Bounded on both sides so
 * "2l" does not match the "2LT" in "Milk Jug 2LT" or the "2L" inside "12L".
 */
function hasMeasure(normalized: string, wanted: string): boolean {
  const [, value, unit] = /^(\d+(?:\.\d+)?)([a-z]+)$/.exec(wanted) ?? []
  if (!value || !unit) return false
  return new RegExp(`(?<![\\d.])${value}\\s*${unit}(?![a-z0-9])`).test(normalized)
}

/**
 * Screen sizes a title advertises. Retailers write them plainly ("50 inch",
 * `55"`) and inside model codes ("50S5K", "55C655"), where the leading two
 * digits are the panel size by industry convention.
 */
function screenSizes(tokens: readonly string[]): number[] {
  const sizes = new Set<number>()
  for (const token of tokens) {
    const match = /^(\d{2,3})(?:inch|in|")?$/.exec(token)
      ?? /^(\d{2})[a-z][a-z0-9]*$/.exec(token)
    if (!match) continue
    const value = Number(match[1])
    if (value >= 15 && value <= 120) sizes.add(value)
  }
  return [...sizes]
}

function extractPriceCeiling(text: string): number | undefined {
  const match = /(?:under|below|less than|max|up to|cheaper than)\s*r?\s*(\d[\d\s,.]*)/i.exec(text)
  if (!match) return undefined
  const amount = Number(match[1].replace(/[\s,]/g, ''))
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : undefined
}

function stripPriceClause(text: string): string {
  return text.replace(/(?:under|below|less than|max|up to|cheaper than)\s*r?\s*\d[\d\s,.]*/gi, ' ')
}

function extractSpec(text: string): ProductSpec {
  const spec: ProductSpec = {}
  const normalized = normalizeUnits(text)

  const inches = /(\d{2,3})\s*(?:inch|in\b|")/.exec(normalized)
  if (inches) spec.inches = Number(inches[1])

  const tier = /(\d+)[\s-]*(?:tier|seater|piece|pack|drawer)/.exec(normalized)
  if (tier) spec.count = Number(tier[1])

  // "9kg washing machine" and "30L microwave" are capacities; "2L milk" and
  // "500g sugar" are pack sizes. The product decides which — appliances have
  // capacity, groceries have pack size.
  const measure = /(\d+(?:[.,]\d+)?)\s*(kg|l|ml|g)\b/.exec(normalized)
  if (measure) {
    const value = Number(measure[1].replace(',', '.'))
    const unit = measure[2] as 'g' | 'kg' | 'l' | 'ml'
    const entry = matchLexicon(text)
    if (entry?.category === 'appliance' && (unit === 'kg' || unit === 'l')) {
      spec.capacity = { unit, value }
    } else {
      spec.packSize = { unit, value }
    }
  }

  return spec
}

function matchLexicon(
  text: string,
): { category: ProductCategory; terms: readonly string[] } | undefined {
  const normalized = ` ${normalizeUnits(text)} `
  let best: { category: ProductCategory; length: number; terms: readonly string[] } | undefined

  for (const entry of PRODUCT_LEXICON) {
    for (const term of entry.terms) {
      if (!normalized.includes(` ${term} `) && !normalized.includes(` ${term}s `)) continue
      // Longest match wins so "pizza oven" beats "oven".
      if (!best || term.length > best.length) {
        best = { category: entry.category, length: term.length, terms: entry.terms }
      }
    }
  }

  return best ? { category: best.category, terms: best.terms } : undefined
}

/** Unknown products: the head noun of an English phrase is its last word. */
function fallbackHeadTerms(tokens: readonly string[]): string[] {
  const meaningful = tokens.filter((token) =>
    !INTENT_WORDS.has(token) && !COLOURS.has(token) && !isSpecToken(token))
  const head = meaningful[meaningful.length - 1]
  if (!head) return []
  return head.endsWith('s') && head.length > 3 ? [head, head.slice(0, -1)] : [head, `${head}s`]
}

function buildStorefrontQuery(
  headTerms: readonly string[],
  modifiers: readonly string[],
  colour: string | undefined,
  spec: ProductSpec,
): string {
  // Retailer engines rank best on a short noun phrase. Send the product and
  // its strongest describing words, never the shopper's whole sentence.
  const size = spec.inches !== undefined
    ? `${spec.inches} inch`
    : spec.packSize
      ? `${spec.packSize.value}${spec.packSize.unit}`
      : spec.capacity
        ? `${spec.capacity.value}${spec.capacity.unit}`
        : ''
  return [size, ...modifiers.slice(0, 2), headTerms[0], colour]
    .filter(Boolean)
    .join(' ')
    .trim()
}

function isSpecToken(token: string): boolean {
  return /^\d/.test(token) || /^(?:inch|in|kg|g|ml|l|tier|pack|piece|seater)$/.test(token)
}

function tokenize(value: string): string[] {
  return normalizeUnits(value)
    .split(/[^a-z0-9"]+/)
    .map((token) => token.replace(/"$/, ''))
    .filter((token) => token.length > 0)
}

/** Fold unit spellings so "2 Litre", "2l" and "2L" are one size. */
export function normalizeUnits(value: string): string {
  return value
    .toLowerCase()
    .replace(/[″”]/g, '"')
    .replace(/\b(litres?|liters?)\b/g, 'l')
    .replace(/\b(kilograms?|kgs)\b/g, 'kg')
    .replace(/\b(grams?)\b/g, 'g')
    .replace(/\b(millilitres?|milliliters?|mls)\b/g, 'ml')
    .replace(/\b(inches|inch)\b/g, 'inch')
    .replace(/(\d)\s+(l|kg|g|ml|inch)\b/g, '$1$2')
    .replace(/(\d)\s*"/g, '$1inch')
    .replace(/(\d)-(inch|tier|seater|piece|pack)/g, '$1 $2')
}
