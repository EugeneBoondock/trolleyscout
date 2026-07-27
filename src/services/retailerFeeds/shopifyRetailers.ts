import { parseShopifyDeals } from '../commonCommerceDeals'
import { buildRetailerEvidence, retailerSlug } from './types'
import type {
  RetailerDealCandidate,
  RetailerFeedContext,
  RetailerFeedPage,
  RetailerSlug,
} from './types'
import { officialUrl, percentOffText } from './values'

// Some named shops turn out to be plain Shopify underneath, and Shopify hands
// its whole catalogue to anyone who asks: /products.json, no key, no session.
// Edgars and Under Armour were both showing zero deals — not because they were
// hard to read, but because nobody had ever asked them.
//
// The existing generic parser already knows how to read a Shopify payload and
// what counts as a markdown there (compare_at_price above price, per variant),
// so this only maps its output onto a named retailer instead of an anonymous
// discovered store. That naming is the point: a deal filed under
// "store-online:za:edgars.co.za" never appears when a shopper picks Edgars.

export interface ShopifyRetailer {
  host: string
  name: string
  retailerId: RetailerSlug
}

export const SHOPIFY_RETAILER_PAGE_SIZE = 250
export const MAX_SHOPIFY_RETAILER_PAGES = 4

export const SHOPIFY_RETAILERS: readonly ShopifyRetailer[] = [
  {
    host: 'www.bathu.co.za',
    name: 'Bathu',
    retailerId: retailerSlug('bathu'),
  },
  {
    host: 'www.edgars.co.za',
    name: 'Edgars',
    retailerId: retailerSlug('edgars'),
  },
  {
    host: 'www.underarmour.co.za',
    name: 'Under Armour',
    retailerId: retailerSlug('under-armour'),
  },
]

export function buildShopifyRetailerUrl(shop: ShopifyRetailer, page = 1): string {
  const safePage = Math.max(1, Math.trunc(page) || 1)
  return `https://${shop.host}/products.json` +
    `?limit=${SHOPIFY_RETAILER_PAGE_SIZE}&page=${safePage}`
}

export function parseShopifyRetailerFeed(
  payload: unknown,
  context: RetailerFeedContext,
  shop: ShopifyRetailer,
): RetailerFeedPage {
  const origin = `https://${shop.host}`
  const hosts = [shop.host, shop.host.replace(/^www\./, '')]
  const deals = parseShopifyDeals(payload, origin)
  const candidates: RetailerDealCandidate[] = []
  const seen = new Set<string>()

  for (const deal of deals) {
    const productUrl = officialUrl(deal.productUrl ?? '', origin, hosts)

    // The product link doubles as the identity here: Shopify handles are
    // unique per shop and stable across a price change, which a variant id is
    // not.
    const productId = productUrl
      ? decodeURIComponent(new URL(productUrl).pathname.split('/').filter(Boolean).pop() ?? '')
      : ''

    if (
      !productUrl ||
      !productId ||
      !deal.title ||
      deal.previousPriceCents === undefined ||
      deal.previousPriceCents <= deal.priceCents ||
      seen.has(productId)
    ) {
      continue
    }

    seen.add(productId)

    candidates.push({
      capturedAt: context.capturedAt,
      evidenceText: buildRetailerEvidence({
        priceCents: deal.priceCents,
        previousPriceCents: deal.previousPriceCents,
        promotionMarker: 'shopify-markdown',
        scope: { type: 'online' },
        sourceId: productId,
      }),
      imageUrl: deal.imageUrl,
      priceCents: deal.priceCents,
      previousPriceCents: deal.previousPriceCents,
      productId,
      productUrl,
      promotionId: 'shopify-markdown',
      retailerId: shop.retailerId,
      savingText: percentOffText(deal.priceCents, deal.previousPriceCents),
      scope: { type: 'online' },
      ...(deal.soldOut ? { soldOut: true } : {}),
      sourceKind: 'structured',
      sourceUrl: context.sourceUrl,
      title: deal.title,
    })
  }

  const totalCount = typeof payload === 'object' &&
    payload !== null &&
    Array.isArray((payload as { products?: unknown }).products)
    ? (payload as { products: unknown[] }).products.length
    : 0

  return { candidates, catalogues: [], totalCount }
}
