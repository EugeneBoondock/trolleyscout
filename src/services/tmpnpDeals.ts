import type { PlatformDeal } from './dealPlatform'

// TM Pick n Pay (Zimbabwe) runs its storefront on a custom Laravel commerce
// API (api.tmpnponline.co.zw). The main storefront bot-walls datacenter
// fetches with a redirect loop, but the API subdomain answers plain JSON, so
// we read its deals directly rather than scraping the Next.js page.
//
// The /products/sections feed returns curated groups (top_sellers,
// new_arrivals, trending, biggest_discounts). Every product carries a regular
// `price` and a `sale_price`. A product is genuinely on promotion ONLY when
// sale_price is a positive number strictly below price:
//   - sale_price: 0 is the feed's "no active special" sentinel, and
//   - an on_sale item has been seen with sale_price ABOVE price (a data-entry
//     slip), so neither the on_sale flag nor a non-zero sale_price alone is
//     trusted.
// Prices are quoted in USD regardless of the shopper's local currency.

export const TMPNP_STORE_HOST = 'tmpnponline.co.zw'
export const TMPNP_CURRENCY = 'USD'

const TMPNP_API_BASE = 'https://api.tmpnponline.co.zw/api/v1'
const TMPNP_IMAGE_BASE = 'https://cdn-s7m8bx8sebjz.vultrcdn.com/product_images/'
const TMPNP_PRODUCT_BASE = `https://${TMPNP_STORE_HOST}/products/`
const MAX_TMPNP_DEALS = 40

export function buildTmpnpSectionsUrl(): string {
  return `${TMPNP_API_BASE}/products/sections`
}

// Parses the sections feed into real, in-date discounts. Deduplicates the
// curated groups (a discounted product can appear in several of them).
export function parseTmpnpSectionDeals(
  payload: unknown,
  nowMs: number,
  limit = MAX_TMPNP_DEALS,
): PlatformDeal[] {
  if (!isRecord(payload)) {
    return []
  }

  const deals: PlatformDeal[] = []
  const seen = new Set<string>()
  const today = new Date(nowMs).toISOString().slice(0, 10)
  const maximum = Math.max(0, Math.min(MAX_TMPNP_DEALS, Math.floor(limit)))

  for (const group of Object.values(payload)) {
    if (!Array.isArray(group)) {
      continue
    }

    for (const row of group) {
      if (deals.length >= maximum) {
        return deals
      }
      const deal = tmpnpDeal(row, today)
      if (!deal) {
        continue
      }
      const key = deal.productUrl ?? deal.title.toLowerCase()
      if (seen.has(key)) {
        continue
      }
      seen.add(key)
      deals.push(deal)
    }
  }

  return deals
}

function tmpnpDeal(row: unknown, today: string): PlatformDeal | undefined {
  if (!isRecord(row)) {
    return undefined
  }

  const title = textValue(row.name)
  const priceCents = moneyToCents(row.price)
  const saleCents = moneyToCents(row.sale_price)

  if (
    !title ||
    priceCents === undefined ||
    saleCents === undefined ||
    saleCents <= 0 ||
    saleCents >= priceCents
  ) {
    return undefined
  }

  // Respect an explicit sale window: skip a special that has already ended.
  const validFrom = dateValue(row.start_sale_date)
  const validTo = dateValue(row.end_sale_date)
  if (validTo && validTo < today) {
    return undefined
  }

  const slug = textValue(row.slug)

  return {
    currencyCode: TMPNP_CURRENCY,
    imageUrl: tmpnpImageUrl(row.image),
    previousPriceCents: priceCents,
    priceCents: saleCents,
    productUrl: slug ? `${TMPNP_PRODUCT_BASE}${encodeURIComponent(slug)}` : undefined,
    title,
    validFrom,
    validTo,
  }
}

function tmpnpImageUrl(value: unknown): string | undefined {
  const path = textValue(value)
  if (!path) {
    return undefined
  }
  if (/^https?:\/\//i.test(path)) {
    return path
  }
  return `${TMPNP_IMAGE_BASE}${path.replace(/^\/+/, '')}`
}

function moneyToCents(value: unknown): number | undefined {
  const amount =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value.trim())
        ? Number(value.trim())
        : Number.NaN
  if (!Number.isFinite(amount) || amount < 0) {
    return undefined
  }
  const cents = Math.round(amount * 100)
  return Number.isSafeInteger(cents) ? cents : undefined
}

function dateValue(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const match = /^\d{4}-\d{2}-\d{2}/.exec(value.trim())
  return match ? match[0] : undefined
}

function textValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
