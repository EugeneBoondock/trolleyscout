// Reads a fashion storefront's whole catalogue, not just its markdowns.
//
// commonCommerceDeals.ts answers "what is on sale here?" and drops anything
// without a discount. A fitting room needs the opposite: every garment a shop
// sells, priced, pictured and linked, whether or not it happens to be cheap
// today. The request URLs are the same public endpoints; only the reading of
// them differs.

export type ClothingPlatform = 'shopify' | 'woocommerce' | 'vtex'

export interface ClothingProduct {
  /// Stable per-store id, so a re-sweep updates rather than duplicates.
  externalId: string
  title: string
  priceCents: number
  previousPriceCents?: number
  imageUrl: string
  productUrl: string
  inStock: boolean
  /// Whatever the shop calls this: "Womens > Dresses", tags, product_type.
  categoryText: string
}

export const MAX_CLOTHING_PAGE_SIZE = 250
export const MAX_CLOTHING_PAGES = 4
/// VTEX answers a window of items and refuses a span wider than 50.
export const VTEX_WINDOW = 50

export function buildClothingCatalogueUrl(
  platform: ClothingPlatform,
  origin: string,
  page = 1,
  pageSize = MAX_CLOTHING_PAGE_SIZE,
): string | undefined {
  const base = safeOrigin(origin)
  if (!base) return undefined
  const size = Math.min(Math.max(1, pageSize), MAX_CLOTHING_PAGE_SIZE)
  const index = Math.max(1, page)

  if (platform === 'shopify') {
    const url = new URL('/products.json', base)
    url.searchParams.set('limit', String(size))
    url.searchParams.set('page', String(index))
    return url.toString()
  }
  if (platform === 'vtex') {
    const from = (index - 1) * VTEX_WINDOW
    const url = new URL('/api/catalog_system/pub/products/search', base)
    // The window is inclusive at both ends, so _to is the last index, not
    // the count — asking for 50 more than _from is a 400.
    url.searchParams.set('_from', String(from))
    url.searchParams.set('_to', String(from + VTEX_WINDOW - 1))
    return url.toString()
  }
  const url = new URL('/wp-json/wc/store/v1/products', base)
  url.searchParams.set('per_page', String(Math.min(size, 100)))
  url.searchParams.set('page', String(index))
  return url.toString()
}

export function parseClothingCatalogue(
  platform: ClothingPlatform,
  payload: unknown,
  origin: string,
  options: { imageIndex?: number } = {},
): ClothingProduct[] {
  if (platform === 'shopify') {
    return parseShopifyCatalogue(payload, origin, options)
  }
  if (platform === 'vtex') return parseVtexCatalogue(payload, origin)
  return parseWooCommerceCatalogue(payload, origin)
}

/// VTEX products carry their sellers' live offers; the first seller with a
/// price is the one the shopper would buy from.
export function parseVtexCatalogue(
  payload: unknown,
  origin: string,
): ClothingProduct[] {
  const base = safeOrigin(origin)
  if (!base || !Array.isArray(payload)) return []

  const products: ClothingProduct[] = []
  for (const row of payload) {
    if (!isRecord(row)) continue
    const title = text(row.productName)
    if (!title) continue

    const items = Array.isArray(row.items) ? row.items : []
    const item = items.find(isRecord)
    if (!item) continue

    const sellers = Array.isArray(item.sellers) ? item.sellers : []
    const offer = sellers
      .filter(isRecord)
      .map((seller) => seller.commertialOffer)
      .find(isRecord)
    if (!offer) continue

    const priceCents = randToCents(offer.Price)
    if (priceCents === undefined || priceCents <= 0) continue
    const previous = randToCents(offer.ListPrice)

    const images = Array.isArray(item.images) ? item.images : []
    const image = text((images.find(isRecord) as Record<string, unknown> | undefined)?.imageUrl)
    if (!image) continue

    const categories = Array.isArray(row.categories) ? row.categories : []
    products.push({
      categoryText: [
        text(row.brand),
        categories.filter((value): value is string => typeof value === 'string')
          .join(' ')
          .replace(/\//g, ' '),
      ].filter(Boolean).join(' ').slice(0, 300),
      externalId: text(row.productId) || text(item.itemId) || title,
      imageUrl: absolute(image, base),
      inStock: typeof offer.AvailableQuantity === 'number'
        ? offer.AvailableQuantity > 0
        : true,
      previousPriceCents:
        previous !== undefined && previous > priceCents ? previous : undefined,
      priceCents,
      productUrl: text(row.link) || text(row.linkText)
        ? (text(row.link) || new URL(`/${text(row.linkText)}/p`, base).toString())
        : base,
      title,
    })
  }
  return products
}

export function parseShopifyCatalogue(
  payload: unknown,
  origin: string,
  options: { imageIndex?: number } = {},
): ClothingProduct[] {
  const base = safeOrigin(origin)
  const rows = isRecord(payload) && Array.isArray(payload.products)
    ? payload.products
    : []
  if (!base) return []

  const products: ClothingProduct[] = []
  for (const row of rows) {
    if (!isRecord(row)) continue
    const title = text(row.title)
    const handle = text(row.handle)
    if (!title || !handle) continue

    const variants = Array.isArray(row.variants) ? row.variants : []
    const variant = variants.find(isRecord)
    if (!variant) continue

    const priceCents = randToCents(variant.price)
    if (priceCents === undefined || priceCents <= 0) continue
    const previous = randToCents(variant.compare_at_price)

    const image = shopifyImage(row, options.imageIndex ?? 0)
    // A fitting room without a picture has nothing to fit, so an imageless
    // product is not worth keeping.
    if (!image) continue

    products.push({
      categoryText: [
        text(row.product_type),
        Array.isArray(row.tags) ? row.tags.filter((tag) => typeof tag === 'string').join(' ') : text(row.tags),
      ].filter(Boolean).join(' ').slice(0, 300),
      externalId: text(row.id) || handle,
      imageUrl: absolute(image, base),
      inStock: variant.available !== false,
      previousPriceCents:
        previous !== undefined && previous > priceCents ? previous : undefined,
      priceCents,
      productUrl: new URL(`/products/${encodeURIComponent(handle)}`, base).toString(),
      title,
    })
  }
  return products
}

export function parseWooCommerceCatalogue(
  payload: unknown,
  origin: string,
): ClothingProduct[] {
  const base = safeOrigin(origin)
  if (!base || !Array.isArray(payload)) return []

  const products: ClothingProduct[] = []
  for (const row of payload) {
    if (!isRecord(row) || !isRecord(row.prices)) continue
    const title = text(row.name)
    if (!title) continue

    const minorUnit = typeof row.prices.currency_minor_unit === 'number'
      ? row.prices.currency_minor_unit
      : 2
    const priceCents = minorToCents(
      text(row.prices.sale_price) || text(row.prices.price),
      minorUnit,
    )
    if (priceCents === undefined || priceCents <= 0) continue
    const previous = minorToCents(text(row.prices.regular_price), minorUnit)

    const images = Array.isArray(row.images) ? row.images : []
    const image = text((images.find(isRecord) as Record<string, unknown> | undefined)?.src)
    if (!image) continue

    const categories = Array.isArray(row.categories) ? row.categories : []
    products.push({
      categoryText: categories
        .filter(isRecord)
        .map((category) => text(category.name))
        .filter(Boolean)
        .join(' ')
        .slice(0, 300),
      externalId: text(row.id) || text(row.slug) || title,
      imageUrl: absolute(image, base),
      inStock: row.is_in_stock !== false,
      previousPriceCents:
        previous !== undefined && previous > priceCents ? previous : undefined,
      priceCents,
      productUrl: text(row.permalink) || base,
      title,
    })
  }
  return products
}

/// [preferred] lets a store skip a lifestyle banner it puts first — Bathu
/// leads with a campaign shot that would try a billboard onto the shopper.
function shopifyImage(row: Record<string, unknown>, preferred: number): string {
  const images = Array.isArray(row.images) ? row.images : []
  const sources = images
    .map((image) => (typeof image === 'string' ? image : isRecord(image) ? text(image.src) : ''))
    .filter(Boolean)
  if (sources.length > 0) {
    return sources[Math.min(preferred, sources.length - 1)]
  }
  const featured = row.featured_image
  if (typeof featured === 'string') return featured
  if (isRecord(featured)) return text(featured.src)
  return ''
}

/** Shopify prices are rand strings ("499.00"); Woo sends minor units. */
function randToCents(value: unknown): number | undefined {
  const raw = typeof value === 'number' ? String(value) : text(value)
  if (!raw) return undefined
  const amount = Number(raw.replace(/[^\d.]/g, ''))
  return Number.isFinite(amount) ? Math.round(amount * 100) : undefined
}

function minorToCents(value: string, minorUnit: number): number | undefined {
  if (!value) return undefined
  const amount = Number(value)
  if (!Number.isFinite(amount)) return undefined
  const factor = 10 ** Math.max(0, minorUnit - 2)
  return Math.round(amount / (factor || 1))
}

function safeOrigin(value: string): string | undefined {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.origin
      : undefined
  } catch {
    return undefined
  }
}

function absolute(value: string, origin: string): string {
  try {
    return new URL(value, origin).toString()
  } catch {
    return value
  }
}

function text(value: unknown): string {
  return typeof value === 'string'
    ? value.trim()
    : typeof value === 'number'
      ? String(value)
      : ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
