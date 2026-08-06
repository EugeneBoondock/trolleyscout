import type { ScoutCartAction, ScoutChatDealCard } from '../../src/types'

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
]

const MAX_QUANTITY = 12

export function buildScoutCartAction(
  message: string,
  deals: readonly ScoutChatDealCard[],
): ScoutCartAction | undefined {
  if (!CART_INTENT.test(message)) return undefined

  const usable = deals.filter(
    (deal) =>
      deal.soldOut !== true &&
      typeof deal.productUrl === 'string' &&
      /^https?:\/\//i.test(deal.productUrl) &&
      deal.title.trim().length > 0,
  )
  if (usable.length === 0) return undefined

  // A shopper who names a shop means that shop. Filling a different cart
  // would be worse than doing nothing, so an unmatched name yields no action.
  const namedStore = STORE_ALIASES.find(([, pattern]) => pattern.test(message))
  const scoped = namedStore
    ? usable.filter((deal) => namedStore[1].test(deal.retailerName))
    : usable
  if (scoped.length === 0) return undefined

  const ordered = /\b(cheapest|lowest|best)\s*(price|priced)?\b/i.test(message)
    ? [...scoped].sort((left, right) => priceOf(left) - priceOf(right))
    : scoped

  const chosen = ordered[0]
  return {
    items: [
      {
        priceText: chosen.priceText,
        productUrl: chosen.productUrl,
        quantity: quantityIn(message),
        title: chosen.title,
      },
    ],
    retailerId: slug(chosen.retailerName),
    retailerName: chosen.retailerName,
  }
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
