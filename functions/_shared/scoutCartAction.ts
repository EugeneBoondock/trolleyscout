import type {
  ScoutCartAction,
  ScoutCartActionItem,
  ScoutChatDealCard,
} from '../../src/types'

/**
 * Turns "add the cheapest 5kg braai pack to my picknpay cart" into something
 * the app can act on.
 *
 * Mr Scout can genuinely fill a shop's cart now — the app opens that shop in
 * its own browser, in the shopper's signed-in session, and presses the shop's
 * add-to-cart. This is what tells the app which product to drive to. Nothing
 * runs until the shopper taps it.
 */

/// "add ... to my cart", "put it in the basket", "chuck it in my trolley".
/// The window is wide because a real request names the product in between:
/// "Add the cheapest 5kg chicken braai pack to my picknpay cart" puts 51
/// characters between the verb and the noun.
const CART_INTENT =
  /\b(add|put|chuck|throw|place|load|stick)\b[^.?!]{0,90}\b(cart|basket|trolley|bag)\b/i

/// Shoppers type "picknpay", "pnp" and "Pick 'n Pay" for the same shop.
/// Retailer ids as the product retrieval knows them, so a store the shopper
/// names can be searched directly rather than guessed at from a category.
const RETAILER_IDS: Record<string, string> = {
  'pick n pay': 'pick-n-pay',
  checkers: 'checkers',
  shoprite: 'shoprite',
  woolworths: 'woolworths',
  makro: 'makro',
  game: 'game',
  takealot: 'takealot',
  'dis-chem': 'dis-chem',
  clicks: 'clicks',
  spar: 'spar',
  boxer: 'boxer',
  'mr price': 'mrp',
}

/**
 * Where to search a shop that has no deal feed.
 *
 * Most shops reach the app through their specials, so a cart request is
 * answered from a deal we already hold. Uber Eats, Mr D and Sixty60 publish no
 * feed at all, which meant Mr Scout could only say it could not find a
 * McFeast — while the agent it was speaking for drives a real browser and
 * could simply search for one.
 *
 * `{q}` is replaced with what the shopper asked for. The agent opens the
 * results, picks the closest match and adds it, the way a person would.
 */
const STORE_SEARCH_URLS: Record<string, string> = {
  'uber eats': 'https://www.ubereats.com/za/search?q={q}',
  'mr d': 'https://www.mrdfood.com/search?q={q}',
  sixty60: 'https://www.sixty60.co.za/search?q={q}',
  checkers: 'https://www.checkers.co.za/search/all?q={q}',
  'pick n pay': 'https://www.pnp.co.za/search/{q}',
  woolworths: 'https://www.woolworths.co.za/cat?Ntt={q}',
  takealot: 'https://www.takealot.com/all?qsearch={q}',
  makro: 'https://www.makro.co.za/search/?text={q}',
  'dis-chem': 'https://www.dischem.co.za/catalogsearch/result?q={q}',
  clicks: 'https://clicks.co.za/search?q={q}',
}

const STORE_DISPLAY_NAMES: Record<string, string> = {
  'uber eats': 'Uber Eats',
  'mr d': 'Mr D Food',
  sixty60: 'Checkers Sixty60',
  checkers: 'Checkers',
  'pick n pay': 'Pick n Pay',
  woolworths: 'Woolworths',
  takealot: 'Takealot',
  makro: 'Makro',
  'dis-chem': 'Dis-Chem',
  clicks: 'Clicks',
}

const STORE_ALIASES: ReadonlyArray<readonly [string, RegExp]> = [
  ['pick n pay', /\b(pick\s*'?\s*n\s*'?\s*pay|picknpay|pnp)\b/i],
  ['checkers', /\bcheckers\b/i],
  ['shoprite', /\bshoprite\b/i],
  ['woolworths', /\b(woolworths|woolies)\b/i],
  ['makro', /\bmakro\b/i],
  ['game', /\bgame\b/i],
  ['takealot', /\btakealot\b/i],
  ['dis-chem', /\b(dis-?\s?chem)\b/i],
  ['clicks', /\bclicks\b/i],
  ['spar', /\bspar\b/i],
  ['boxer', /\bboxer\b/i],
  ['mr price', /\b(mr\s*price|mrp)\b/i],
  // Delivery apps. No deal feed reaches the app from any of these, so a cart
  // request naming one is always answered by searching the shop itself.
  ['uber eats', /\b(uber\s*eats|ubereats)\b/i],
  ['mr d', /\bmr\s*d(\s*food)?\b/i],
  ['sixty60', /\b(sixty\s*60|sixty60)\b/i],
]

const MAX_QUANTITY = 12

export function buildScoutCartAction(
  message: string,
  deals: readonly ScoutChatDealCard[],
): ScoutCartAction | undefined {
  if (!CART_INTENT.test(message)) return undefined

  // A shopper who names a shop means that shop. Filling a different cart
  // would be worse than doing nothing.
  const namedStore = STORE_ALIASES.find(([, pattern]) => pattern.test(message))

  const usable = deals.filter(
    (deal) =>
      deal.soldOut !== true &&
      typeof deal.productUrl === 'string' &&
      /^https?:\/\//i.test(deal.productUrl) &&
      deal.title.trim().length > 0,
  )
  // No deal to point at. If the shopper named a shop the agent can search,
  // send it there instead of answering that the item does not exist — a shop
  // with no deal feed still has the product on its shelf.
  if (usable.length === 0) return searchAction(message, namedStore?.[0])

  const scoped = namedStore
    ? usable.filter((deal) => namedStore[1].test(deal.retailerName))
    : usable
  if (scoped.length === 0) return searchAction(message, namedStore?.[0])

  const ordered = /\b(cheapest|lowest|best)\s*(price|priced)?\b/i.test(message)
    ? [...scoped].sort((left, right) => priceOf(left) - priceOf(right))
    : scoped

  // A shopper who lists several things wants all of them, added one after the
  // other, without being asked again between each. The agent already drives a
  // list; this is what stops the answer collapsing to the first thing they
  // said.
  const requested = requestedItems(message)
  const items: ScoutCartActionItem[] = []
  const taken = new Set<string>()

  if (requested.length > 1) {
    for (const phrase of requested) {
      const match = bestMatch(phrase, ordered, taken)
      if (!match) continue
      taken.add(match.productUrl)
      items.push({
        priceText: match.priceText,
        productUrl: match.productUrl,
        quantity: quantityIn(phrase),
        title: match.title,
      })
      if (items.length >= MAX_ITEMS) break
    }
  }

  // One thing asked for, or nothing in the list could be matched: fall back to
  // the single best candidate rather than offering an empty cart.
  if (items.length === 0) {
    const chosen = ordered[0]
    items.push({
      priceText: chosen.priceText,
      productUrl: chosen.productUrl,
      quantity: quantityIn(message),
      title: chosen.title,
    })
  }

  const retailer =
    ordered.find((deal) => deal.productUrl === items[0].productUrl) ?? ordered[0]
  return {
    items,
    retailerId: slug(retailer.retailerName),
    retailerName: retailer.retailerName,
  }
}

/// Never open more than this in one run. A runaway list is a long, silent
/// session driving someone's live store account.
const MAX_ITEMS = 12

/**
 * The separate things a shopper asked for.
 *
 * "add milk, bread and 2kg of rice to my picknpay cart" is three items, not
 * one. The leading verb and the trailing "to my ... cart" are stripped first
 * so neither can be mistaken for a product.
 */
export function requestedItems(message: string): string[] {
  const body = message
    .replace(/^.*?\b(add|put|chuck|throw|place|load|stick)\b/i, '')
    .replace(
      /\b(to|in|into|on)\b\s+(my|the)?\s*[\w'\s-]{0,24}\b(cart|basket|trolley|bag|order)\b.*$/i,
      '',
    )
    .trim()
  if (!body) return []
  return body
    .split(/\s*,\s*|\s+and\s+|\s*&\s*|\s*\+\s*/i)
    .map((part) => part.replace(/^(a|an|the|some|my)\s+/i, '').trim())
    .filter((part) => part.length > 1)
}

/// The deal that best answers one phrase, or nothing when none really does.
function bestMatch(
  phrase: string,
  deals: readonly ScoutChatDealCard[],
  taken: ReadonlySet<string>,
): ScoutChatDealCard | undefined {
  const words = meaningfulWords(phrase)
  if (words.length === 0) return undefined

  let best: ScoutChatDealCard | undefined
  let bestScore = 0
  for (const deal of deals) {
    if (taken.has(deal.productUrl)) continue
    const title = deal.title.toLowerCase()
    const score = words.filter((word) => title.includes(word)).length
    // A short phrase has to match in full. "Half the words" of "basmati rice"
    // is one word, which hands rice cakes to someone who asked for basmati.
    // Longer phrases carry enough detail that half is a fair bar.
    const required =
      words.length <= 2 ? words.length : Math.ceil(words.length / 2)
    if (score > bestScore && score >= required) {
      best = deal
      bestScore = score
    }
  }
  return best
}

const FILLER = new Set([
  'cheapest',
  'best',
  'lowest',
  'price',
  'priced',
  'for',
  'get',
  'please',
  'also',
  'some',
  'any',
])

function meaningfulWords(phrase: string): string[] {
  return phrase
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(
      (word) => word.length > 2 && !FILLER.has(word) && !/^\d+$/.test(word),
    )
}

/// "2x", "x2", "two packs" — anything else is one.
function quantityIn(message: string): number {
  const match =
    message.match(/\b(\d{1,2})\s*x\b/i) ??
    message.match(/\bx\s*(\d{1,2})\b/i) ??
    message.match(/\b(\d{1,2})\s+(?:of|packs?|bags?|boxes|units?)\b/i)
  const value = match ? Number(match[1]) : 1
  if (!Number.isFinite(value) || value < 1) return 1
  return Math.min(value, MAX_QUANTITY)
}

/// A price to sort by. An unreadable one sorts last rather than first, so a
/// missing price can never win a "cheapest" request.
function priceOf(deal: ScoutChatDealCard): number {
  const digits = deal.priceText.replace(/[^\d.,]/g, '').replace(/,/g, '')
  const value = Number.parseFloat(digits)
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY
}

function slug(retailerName: string): string {
  return retailerName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * The shop the shopper named, if any.
 *
 * Used to point a live product search at that one shop. Without it, "add
 * basmati rice to my picknpay cart" searches five retailers, ranks whichever
 * answered first, and then the Pick n Pay filter finds nothing — so the
 * shopper is told there is no basmati rice at a shop that stocks it.
 */
export function namedRetailerId(message: string): string | undefined {
  const match = STORE_ALIASES.find(([, pattern]) => pattern.test(message))
  return match ? RETAILER_IDS[match[0]] : undefined
}

/** True when the shopper is asking for something to be put in a cart. */
export function hasCartIntent(message: string): boolean {
  return CART_INTENT.test(message)
}

/**
 * A cart action that searches the shop rather than opening a known product.
 *
 * Carries no price, because there is none to carry until the agent is looking
 * at the shop's own page. The app says as much on the button.
 */
function searchAction(
  message: string,
  storeKey: string | undefined,
): ScoutCartAction | undefined {
  if (!storeKey) return undefined
  const template = STORE_SEARCH_URLS[storeKey]
  if (!template) return undefined

  const wanted = requestedItems(message)
  if (wanted.length === 0) return undefined

  const items: ScoutCartActionItem[] = wanted
    .slice(0, MAX_ITEMS)
    .map((phrase) => ({
      productUrl: template.replace('{q}', encodeURIComponent(phrase)),
      quantity: quantityIn(phrase),
      searchTerm: phrase,
      title: phrase,
    }))

  return {
    items,
    retailerId: slug(storeKey),
    retailerName: STORE_DISPLAY_NAMES[storeKey] ?? storeKey,
  }
}
