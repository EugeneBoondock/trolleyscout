// Reads a fashion storefront's whole catalogue, not just its markdowns.
//
// commonCommerceDeals.ts answers "what is on sale here?" and drops anything
// without a discount. A fitting room needs the opposite: every garment a shop
// sells, priced, pictured and linked, whether or not it happens to be cheap
// today. The request URLs are the same public endpoints; only the reading of
// them differs.

export type ClothingPlatform =
  | 'shopify'
  | 'woocommerce'
  | 'vtex'
  | 'takealot'
  | 'magento-mrp'

/// Not every catalogue answers a plain GET. Mr Price is a Magento GraphQL
/// endpoint that needs a POST and a store header; Takealot is a search API on
/// its own host. The sweep asks for a request, not a URL, so those fit
/// alongside the shops that do answer a GET.
export interface ClothingCatalogueRequest {
  url: string
  method: 'GET' | 'POST'
  headers?: Record<string, string>
  body?: string
}

/// Mr Price's storefront API. `store: en_za` is the South African store view —
/// without the header the endpoint 404s, and with the wrong one it answers
/// "Requested store is not found".
const MRP_ENDPOINT = 'https://apiprd.omni.mrpg.com/graphql'

/// One endpoint serves the whole Mr Price Group; the store view header picks
/// the brand. Mr Price is `en_za`, Mr Price Sport is `mrpsport_en_za`.
const MRP_STORE_VIEWS: Record<string, string> = {
  'www.mrp.com': 'en_za',
  'mrp.com': 'en_za',
  'www.mrpsport.com': 'mrpsport_en_za',
  'mrpsport.com': 'mrpsport_en_za',
}

function mrpStoreView(origin: string): string {
  try {
    return MRP_STORE_VIEWS[new URL(origin).host] ?? 'en_za'
  } catch {
    return 'en_za'
  }
}

/// Product images are not in the GraphQL payload — it serves a placeholder —
/// but they are derived from the SKU on the group's image CDN.
const MRP_IMAGE_BASE = 'https://cdn.media.amplience.net/i/mrpricegroup'

/// Magento wants a search term or a filter; a catalogue-wide sweep has
/// neither. Walking the words shoppers actually search covers the rail
/// without needing category ids that change with every merchandising change.
const MRP_SWEEP_TERMS = [
  't-shirt',
  'jeans',
  'dress',
  'jacket',
  'shirt',
  'shorts',
  'skirt',
  'hoodie',
  'jersey',
  'trousers',
  'top',
  'sneakers',
]

const TAKEALOT_SEARCH =
  'https://api.takealot.com/rest/v-1-11-0/searches/products'
const TAKEALOT_ROWS = 100

/// Takealot pages by an opaque cursor, which a page-numbered sweep cannot
/// carry, and it ignores `start`/`page`/`offset` outright. Walking search
/// terms inside the fashion department gets the same coverage from a stateless
/// request. The parameter is `qsearch`; `search` is silently ignored.
const TAKEALOT_SWEEP_TERMS = [
  'jeans',
  't-shirt',
  'dress',
  'jacket',
  'shirt',
  'shorts',
  'skirt',
  'hoodie',
  'jersey',
  'trousers',
  'sneakers',
  'boots',
]

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

/// How to ask a shop for page `page` of its catalogue.
export function buildClothingCatalogueRequest(
  platform: ClothingPlatform,
  origin: string,
  page = 1,
  pageSize = MAX_CLOTHING_PAGE_SIZE,
): ClothingCatalogueRequest | undefined {
  const index = Math.max(1, page)
  if (platform === 'magento-mrp') {
    const term = MRP_SWEEP_TERMS[(index - 1) % MRP_SWEEP_TERMS.length]
    const size = Math.min(Math.max(1, pageSize), MAX_CLOTHING_PAGE_SIZE)
    return {
      url: MRP_ENDPOINT,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        store: mrpStoreView(origin),
      },
      body: JSON.stringify({
        query: `{products(search:${JSON.stringify(term)},pageSize:${size},currentPage:1){items{sku name url_key stock_status price_range{minimum_price{final_price{value} regular_price{value}}}}}}`,
      }),
    }
  }
  if (platform === 'takealot') {
    const url = new URL(TAKEALOT_SEARCH)
    url.searchParams.set('department_slug', 'fashion')
    url.searchParams.set('rows', String(TAKEALOT_ROWS))
    url.searchParams.set('sort', 'Relevance')
    url.searchParams.set(
      'qsearch',
      TAKEALOT_SWEEP_TERMS[(index - 1) % TAKEALOT_SWEEP_TERMS.length],
    )
    return { url: url.toString(), method: 'GET' }
  }
  const url = buildClothingCatalogueUrl(platform, origin, page, pageSize)
  return url ? { url, method: 'GET' } : undefined
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
  if (platform === 'takealot') return parseTakealotCatalogue(payload)
  if (platform === 'magento-mrp') return parseMrPriceCatalogue(payload, origin)
  return parseWooCommerceCatalogue(payload, origin)
}

/// Takealot answers a search envelope: the products live under
/// `sections.products.results[].product_views`, and the buybox holds the price
/// the shopper would actually pay.
export function parseTakealotCatalogue(payload: unknown): ClothingProduct[] {
  if (!isRecord(payload)) return []
  const sections = isRecord(payload.sections) ? payload.sections : undefined
  const products = sections && isRecord(sections.products)
    ? sections.products
    : undefined
  const results = products && Array.isArray(products.results)
    ? products.results
    : []

  const out: ClothingProduct[] = []
  for (const row of results) {
    if (!isRecord(row)) continue
    const views = isRecord(row.product_views) ? row.product_views : undefined
    const core = views && isRecord(views.core) ? views.core : undefined
    if (!core) continue
    const id = typeof core.id === 'number' ? core.id : undefined
    const title = typeof core.title === 'string' ? core.title.trim() : ''
    const slug = typeof core.slug === 'string' ? core.slug : ''
    if (!id || !title || !slug) continue

    const buybox =
      views && isRecord(views.buybox_summary) ? views.buybox_summary : undefined
    const prices = buybox && Array.isArray(buybox.prices) ? buybox.prices : []
    const price = typeof prices[0] === 'number' ? prices[0] : undefined
    if (price === undefined) continue
    const wasPrice = typeof prices[1] === 'number' ? prices[1] : undefined

    const gallery = views && isRecord(views.gallery) ? views.gallery : undefined
    const images = gallery && Array.isArray(gallery.images) ? gallery.images : []
    const imageUrl = typeof images[0] === 'string' ? images[0] : ''
    if (!imageUrl) continue

    const stock = views && isRecord(views.stock_availability_summary)
      ? views.stock_availability_summary
      : undefined
    const status = stock && typeof stock.status === 'string' ? stock.status : ''

    out.push({
      externalId: `PLID${id}`,
      title,
      priceCents: Math.round(price * 100),
      previousPriceCents:
        wasPrice !== undefined && wasPrice > price
          ? Math.round(wasPrice * 100)
          : undefined,
      // The gallery hands back a templated URL; ask for a real size.
      imageUrl: imageUrl.replace('{size}', 'pdpxl'),
      productUrl: `https://www.takealot.com/${slug}/PLID${id}`,
      inStock: status !== 'out_of_stock',
      categoryText: [
        title,
        typeof core.brand === 'string' ? core.brand : '',
        'fashion',
      ]
        .filter(Boolean)
        .join(' '),
    })
  }
  return out
}

/// Mr Price's Magento payload. The image is rebuilt from the SKU because the
/// API serves a placeholder for every product.
export function parseMrPriceCatalogue(
  payload: unknown,
  origin = 'https://www.mrp.com',
): ClothingProduct[] {
  if (!isRecord(payload)) return []
  const data = isRecord(payload.data) ? payload.data : undefined
  const products = data && isRecord(data.products) ? data.products : undefined
  const items = products && Array.isArray(products.items) ? products.items : []

  const out: ClothingProduct[] = []
  for (const row of items) {
    if (!isRecord(row)) continue
    const sku = typeof row.sku === 'string' ? row.sku.trim() : ''
    const title = typeof row.name === 'string' ? row.name.trim() : ''
    const urlKey = typeof row.url_key === 'string' ? row.url_key.trim() : ''
    if (!sku || !title || !urlKey) continue

    const range = isRecord(row.price_range) ? row.price_range : undefined
    const minimum =
      range && isRecord(range.minimum_price) ? range.minimum_price : undefined
    const finalPrice =
      minimum && isRecord(minimum.final_price) ? minimum.final_price : undefined
    const regular =
      minimum && isRecord(minimum.regular_price)
        ? minimum.regular_price
        : undefined
    const price = finalPrice && typeof finalPrice.value === 'number'
      ? finalPrice.value
      : undefined
    if (price === undefined || price <= 0) continue
    const was = regular && typeof regular.value === 'number'
      ? regular.value
      : undefined

    out.push({
      externalId: sku,
      title,
      priceCents: Math.round(price * 100),
      previousPriceCents:
        was !== undefined && was > price ? Math.round(was * 100) : undefined,
      imageUrl: `${MRP_IMAGE_BASE}/${encodeURIComponent(sku)}_SI_00?$preset$&fmt=auto`,
      productUrl: `${origin.replace(/\/$/, '')}/${urlKey}`,
      inStock: row.stock_status !== 'OUT_OF_STOCK',
      categoryText: title,
    })
  }
  return out
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
