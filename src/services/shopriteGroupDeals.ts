// Shoprite Group storefronts (Shoprite, Checkers) expose an anonymous
// browse-by-store API: given a branch's store id, their on-promotion feed
// returns each product with a `bonusBuys[]` promotion (e.g. "Buy 2 For R16")
// carrying real start/end dates and per-branch store scoping. That lets a
// store discovered near a shopper surface ITS OWN current specials — not just
// the shared national catalogue. Pure request builders + parsers here; the
// Worker does the fetching. No auth, no cookies — a browser UA is the only
// requirement (see functions/_shared/storeScout.ts for the call site).

export interface ShopriteGroupConfig {
  host: string
  // Branch names to trust for this chain; excludes LiquorShop etc.
  brandPattern: RegExp
}

export const SHOPRITE_GROUP_CHAINS: Record<string, ShopriteGroupConfig> = {
  checkers: { brandPattern: /^checkers(?:\s+(?:hyper|fx))?$/i, host: 'www.checkers.co.za' },
  shoprite: { brandPattern: /^shoprite$/i, host: 'www.shoprite.co.za' },
}

export interface ShopriteGroupPromotion {
  title: string
  priceText?: string
  previousPriceText?: string
  savingText?: string
  productUrl: string
  imageUrl?: string
  validFrom?: string
  validTo?: string
}

export function storesByLocationRequest(host: string, lat: number, lon: number) {
  return {
    body: JSON.stringify({ payload: { latitude: lat, longitude: lon } }),
    url: `https://${host}/api/browse-by-store/get-stores-by-location`,
  }
}

// Picks the nearest branch of this chain from a get-stores-by-location
// response. Stores arrive distance-sorted; we take the first whose brand or
// name identifies it as the chain (not a LiquorShop).
export function selectNearestBranchId(
  payload: unknown,
  config: ShopriteGroupConfig,
): string | undefined {
  const stores = storeList(payload)
  for (const store of stores) {
    if (!isRecord(store)) {
      continue
    }
    const brand = textValue(store, 'brand')
    const name = textValue(store, 'name')
    const id = textValue(store, 'id')
    if (!id) {
      continue
    }
    const identifiesChain =
      config.brandPattern.test(brand) ||
      (config.brandPattern.test(name) && !/liquor/i.test(name))
    if (identifiesChain) {
      return id
    }
  }
  return undefined
}

export function onPromotionRequest(host: string, storeId: string, pageSize = 60) {
  return {
    body: JSON.stringify({
      payload: {
        filter: {
          paginationOptions: { page: 0, pageSize },
          productListSource: { onPromotion: true },
        },
        userContext: { storeIds: [storeId] },
      },
    }),
    url: `https://${host}/api/browse-by-store/get-products-filter`,
  }
}

// Turns the on-promotion feed into this branch's real specials: only products
// carrying an active bonusBuy that is (a) scoped to this store and (b) still
// within its date window are emitted, so "specials" always means a genuine,
// dated, in-branch deal.
export function parseShopriteGroupPromotions(
  host: string,
  storeId: string,
  payload: unknown,
  nowMs: number,
  limit = 24,
): ShopriteGroupPromotion[] {
  const products = isRecord(payload) && Array.isArray(payload.products) ? payload.products : []
  const promotions: ShopriteGroupPromotion[] = []
  const seen = new Set<string>()

  for (const product of products) {
    if (promotions.length >= limit || !isRecord(product)) {
      continue
    }
    const title = textValue(product, 'name') || textValue(product, 'displayName')
    const id = textValue(product, 'id')
    if (!title || !id) {
      continue
    }
    const bonusBuy = activeBonusBuyForStore(product.bonusBuys, storeId, nowMs)
    if (!bonusBuy) {
      continue
    }
    if (seen.has(id)) {
      continue
    }
    seen.add(id)

    const priceCents = productPriceCents(product)
    promotions.push({
      imageUrl: httpsOrUndefined(textValue(product, 'imagePDPURL') || textValue(product, 'imageURL')),
      priceText: priceCents !== undefined ? randText(priceCents) : undefined,
      productUrl: `https://${host}/product/${encodeURIComponent(id)}`,
      savingText: (bonusBuy.shortDescription || bonusBuy.name || '').trim() || undefined,
      title,
      validFrom: isoDate(bonusBuy.startDate),
      validTo: isoDate(bonusBuy.endDate),
    })
  }

  return promotions
}

interface ActiveBonusBuy {
  shortDescription: string
  name: string
  startDate?: number
  endDate?: number
}

function activeBonusBuyForStore(
  value: unknown,
  storeId: string,
  nowMs: number,
): ActiveBonusBuy | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }
  for (const entry of value) {
    if (!isRecord(entry) || entry.active === false) {
      continue
    }
    const endDate = numberValue(entry.endDate)
    if (endDate !== undefined && endDate < nowMs) {
      continue
    }
    const scoped = scopedStoreIds(entry.browseStoreIds) ?? scopedStoreIds(entry.storeIds)
    if (scoped && !scoped.includes(storeId)) {
      continue
    }
    return {
      endDate,
      name: textValue(entry, 'Name') || textValue(entry, 'name'),
      shortDescription: textValue(entry, 'shortDescription'),
      startDate: numberValue(entry.startDate),
    }
  }
  return undefined
}

function scopedStoreIds(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.length > 0
    ? value.filter((id): id is string => typeof id === 'string')
    : undefined
}

function productPriceCents(product: Record<string, unknown>): number | undefined {
  const direct = product.discountedPrice ?? product.price
  if (typeof direct === 'number' && direct > 0) {
    return Math.round(direct * 100)
  }
  const factor = typeof product.priceFactor === 'number' && product.priceFactor > 0
    ? product.priceFactor
    : 100
  const whole = product.priceWithoutDecimal
  return typeof whole === 'number' && whole > 0 ? Math.round((whole / factor) * 100) : undefined
}

function randText(cents: number): string {
  return `R${(cents / 100).toFixed(2)}`
}

function isoDate(value: number | undefined): string | undefined {
  if (value === undefined || !Number.isFinite(value)) {
    return undefined
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 10)
}

function httpsOrUndefined(value: string): string | undefined {
  return /^https:\/\//i.test(value) ? value : undefined
}

function storeList(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload
  }
  if (isRecord(payload)) {
    if (Array.isArray(payload.stores)) return payload.stores
    if (Array.isArray(payload.data)) return payload.data
  }
  return []
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function textValue(value: unknown, key: string): string {
  if (!isRecord(value)) {
    return ''
  }
  const nested = value[key]
  return typeof nested === 'string' || typeof nested === 'number' ? String(nested).trim() : ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
