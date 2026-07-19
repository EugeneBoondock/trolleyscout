// Normalizers for four South African deal/flash-sale platforms into a single
// shape the app already renders. Each site was reverse-engineered from its own
// public data (logged-out browsing works on all four):
//   - OneDayOnly: Next.js — products live in the page's __NEXT_DATA__ blob.
//   - Hyperli: Shopify — the public /products.json feed.
//   - Daddy's Deals: WordPress — the `product` custom post type via wp-json.
//   - MyRunway: a REST API (/v1/products) that accepts a self-issued guest token.
// Parsing is kept pure and injectable here; fetching lives in the scout.

export type DealSiteId = 'onedayonly' | 'hyperli' | 'daddysdeals' | 'myrunway'

export interface DealSiteItem {
  id: string
  source: DealSiteId
  retailerName: string
  sourceLabel: string
  title: string
  priceText?: string
  previousPriceText?: string
  savingText?: string
  productUrl: string
  imageUrl?: string
  images?: string[]
  category?: string
  expiresAt?: string
}

const SITE_LABEL: Record<DealSiteId, string> = {
  onedayonly: 'OneDayOnly',
  hyperli: 'Hyperli',
  daddysdeals: "Daddy's Deals",
  myrunway: 'MyRunway',
}

// ---------- OneDayOnly ----------

export function parseOneDayOnly(html: string): DealSiteItem[] {
  const data = extractNextData(html)
  if (!data) return []

  const items = pathValue(data, ['props', 'pageProps', 'homePage', 'items'])
  if (!Array.isArray(items)) return []

  const products: Record<string, unknown>[] = []
  collectObjects(items, (obj) => {
    if (obj.realId !== undefined && obj.name && obj.price) {
      products.push(obj)
    }
  }, 6)

  const seen = new Set<string>()
  const out: DealSiteItem[] = []

  for (const product of products) {
    const realId = String(product.realId ?? product.id ?? '')
    if (!realId || seen.has(realId)) continue
    seen.add(realId)
    if (product.isSoldOut === true) continue

    const slug = typeof product.id === 'string' ? product.id : realId
    const externalListingUrl = webUrl(product.externalListingLink)
    const price = moneyText(pathValue(product, ['price', 'formattedValue']))
    const wasPrice = moneyText(pathValue(product, ['retailPrice', 'formattedValue']))
    const saving = oneDayOnlySaving(product.saving)
    const gallery = uniqueImageUrls([
      pathValue(product, ['image', 'url']),
      ...(Array.isArray(product.gallery)
        ? [...product.gallery]
            .filter((entry) =>
              pathValue(entry, ['type']) === 'IMAGE' &&
              pathValue(entry, ['file', 'isCensored']) !== true,
            )
            .sort((left, right) =>
              numberValue(pathValue(left, ['position'])) - numberValue(pathValue(right, ['position'])),
            )
            .map((entry) => pathValue(entry, ['file', 'url']))
        : []),
    ])

    out.push({
      category: firstString(product.topLevelCategories) ?? undefined,
      expiresAt: typeof product.activeToDate === 'string' ? product.activeToDate : undefined,
      id: `onedayonly-${realId}`,
      imageUrl: gallery[0],
      images: gallery.length > 0 ? gallery : undefined,
      previousPriceText: wasPrice,
      priceText: price,
      productUrl: externalListingUrl ?? `https://www.onedayonly.co.za/products/${slug}`,
      retailerName: SITE_LABEL.onedayonly,
      savingText: saving,
      source: 'onedayonly',
      sourceLabel: SITE_LABEL.onedayonly,
      title: String(product.name),
    })
  }

  return out
}

function oneDayOnlySaving(saving: unknown): string | undefined {
  if (!saving || typeof saving !== 'object') return undefined
  const record = saving as Record<string, unknown>
  const percent = typeof record.percent === 'number' ? record.percent : undefined
  const fixed = moneyText(pathValue(record, ['fixed', 'formattedValue']))
  if (fixed && percent) return `Save ${fixed} (${percent}% off)`
  if (percent) return `${percent}% off`
  if (fixed) return `Save ${fixed}`
  return undefined
}

function webUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined
  const candidate = value.trim()
  try {
    const parsed = new URL(candidate)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
      ? candidate
      : undefined
  } catch {
    return undefined
  }
}

// ---------- Hyperli (Shopify) ----------

export function parseHyperli(payload: unknown): DealSiteItem[] {
  const products = pathValue(payload, ['products'])
  if (!Array.isArray(products)) return []

  const out: DealSiteItem[] = []
  for (const raw of products) {
    if (!raw || typeof raw !== 'object') continue
    const product = raw as Record<string, unknown>
    const variants = Array.isArray(product.variants) ? product.variants : []
    const variant = (variants[0] ?? {}) as Record<string, unknown>
    const price = randFromDecimal(variant.price)
    const compare = randFromDecimal(variant.compare_at_price)
    const priceCents = decimalToCents(variant.price)
    const compareCents = decimalToCents(variant.compare_at_price)
    const images = Array.isArray(product.images) ? product.images : []
    const gallery = uniqueImageUrls(
      [...images]
        .sort((left, right) =>
          numberValue(pathValue(left, ['position'])) - numberValue(pathValue(right, ['position'])),
        )
        .map((image) => pathValue(image, ['src'])),
    )
    const handle = typeof product.handle === 'string' ? product.handle : ''
    if (!product.title || !handle) continue
    if (variant.available === false) continue

    out.push({
      category: typeof product.product_type === 'string' ? product.product_type : undefined,
      id: `hyperli-${String(product.id ?? handle)}`,
      imageUrl: gallery[0],
      images: gallery.length > 0 ? gallery : undefined,
      previousPriceText: compare,
      priceText: price,
      productUrl: `https://hyperli.com/products/${handle}`,
      retailerName: SITE_LABEL.hyperli,
      savingText:
        priceCents !== undefined && compareCents !== undefined && compareCents > priceCents
          ? `Save R${((compareCents - priceCents) / 100).toFixed(0)}`
          : undefined,
      source: 'hyperli',
      sourceLabel:
        typeof product.vendor === 'string' && product.vendor
          ? `Hyperli · ${product.vendor}`
          : SITE_LABEL.hyperli,
      title: String(product.title),
    })
  }
  return out
}

// ---------- Daddy's Deals (WordPress) ----------

export function parseDaddysDeals(payload: unknown): DealSiteItem[] {
  if (!Array.isArray(payload)) return []

  const out: DealSiteItem[] = []
  for (const raw of payload) {
    if (!raw || typeof raw !== 'object') continue
    const post = raw as Record<string, unknown>
    const title = decodeEntities(String(pathValue(post, ['title', 'rendered']) ?? '')).trim()
    const link = typeof post.link === 'string' ? post.link : ''
    if (!title || !link) continue

    const excerpt = decodeEntities(
      String(pathValue(post, ['excerpt', 'rendered']) ?? '').replace(/<[^>]+>/g, ''),
    ).replace(/\s+/g, ' ').trim()
    const image = embeddedImage(post)
    const price = firstRand(`${title} ${excerpt}`)

    out.push({
      category: embeddedTerm(post),
      id: `daddysdeals-${String(post.id ?? link)}`,
      imageUrl: image,
      images: image ? [image] : undefined,
      priceText: price,
      productUrl: link,
      retailerName: SITE_LABEL.daddysdeals,
      savingText: undefined,
      source: 'daddysdeals',
      sourceLabel: SITE_LABEL.daddysdeals,
      title,
    })
  }
  return out
}

// ---------- MyRunway ----------

export function parseMyRunway(payload: unknown): DealSiteItem[] {
  const products = pathValue(payload, ['products']) ?? payload
  if (!Array.isArray(products)) return []

  const out: DealSiteItem[] = []
  for (const raw of products) {
    if (!raw || typeof raw !== 'object') continue
    const product = raw as Record<string, unknown>
    const name = typeof product.name === 'string'
      ? product.name
      : typeof product.title === 'string'
        ? product.title
        : ''
    if (!name || product.is_sold_out === true) continue

    const sellingCents = decimalToCents(product.selling_price)
    const retailCents = decimalToCents(product.retail_price)
    const id = String(product.id ?? product.sku ?? '')
    const productImages = Array.isArray(product.product_images)
      ? [...product.product_images]
          .filter((entry) =>
            entry !== null &&
            typeof entry === 'object' &&
            pathValue(entry, ['is_include']) !== 0 &&
            pathValue(entry, ['deleteflag']) !== 1,
          )
          .sort((left, right) =>
            numberValue(pathValue(left, ['position'])) - numberValue(pathValue(right, ['position'])),
          )
          .map((entry) => pathValue(entry, ['image_url']))
      : []
    const gallery = uniqueImageUrls([product.image_url, ...productImages])

    out.push({
      category: firstString(product.product_category_name) ??
        firstString(pathValue(product, ['product_category', 'name'])) ?? undefined,
      id: `myrunway-${id}`,
      imageUrl: gallery[0],
      images: gallery.length > 0 ? gallery : undefined,
      previousPriceText:
        retailCents !== undefined && (sellingCents === undefined || retailCents > sellingCents)
          ? `R${(retailCents / 100).toFixed(0)}`
          : undefined,
      priceText: sellingCents !== undefined ? `R${(sellingCents / 100).toFixed(0)}` : undefined,
      productUrl: myRunwayUrl(product),
      retailerName: firstString(pathValue(product, ['brand', 'name'])) ?? SITE_LABEL.myrunway,
      savingText: myRunwaySaving(product, sellingCents, retailCents),
      source: 'myrunway',
      sourceLabel: SITE_LABEL.myrunway,
      title: name,
    })
  }
  return out
}

function myRunwaySaving(
  product: Record<string, unknown>,
  sellingCents: number | undefined,
  retailCents: number | undefined,
): string | undefined {
  // The percentage computed from the two prices is authoritative. (MyRunway's
  // `discount` field is the rand amount saved, not a percentage — using it
  // directly reads as e.g. "241% off".)
  if (sellingCents !== undefined && retailCents !== undefined && retailCents > sellingCents) {
    const percent = Math.round(((retailCents - sellingCents) / retailCents) * 100)
    if (percent > 0) return `${percent}% off`
  }
  const discount = decimalToCents(product.discount)
  if (discount !== undefined && discount > 0) {
    return `Save R${(discount / 100).toFixed(0)}`
  }
  return undefined
}

function myRunwayUrl(product: Record<string, unknown>): string {
  const sku = typeof product.sku === 'string' ? product.sku.trim() : ''
  if (sku) return `https://myrunway.co.za/product/${encodeURIComponent(sku)}`

  const params = product.url_params
  if (typeof params === 'string' && params.trim()) {
    const routeKey = params
      .trim()
      .replace(/^https?:\/\/(?:www\.)?myrunway\.co\.za\//i, '')
      .replace(/^\/+/, '')
      .replace(/^products?\//i, '')
      .replace(/[?#].*$/, '')
    if (routeKey) return `https://myrunway.co.za/product/${routeKey}`
  }
  return 'https://myrunway.co.za/'
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER
}

function uniqueImageUrls(values: unknown[]): string[] {
  const seen = new Set<string>()
  const urls: string[] = []
  for (const value of values) {
    if (typeof value !== 'string') continue
    const url = value.trim()
    if (!/^https?:\/\//i.test(url) || seen.has(url)) continue
    seen.add(url)
    urls.push(url)
  }
  return urls
}

// ---------- shared helpers ----------

export function extractNextData(html: string): unknown {
  const match = html.match(
    /<script id="__NEXT_DATA__" type="application\/json"[^>]*>([\s\S]*?)<\/script>/,
  )
  if (!match) return undefined
  try {
    return JSON.parse(match[1])
  } catch {
    return undefined
  }
}

function collectObjects(
  value: unknown,
  visit: (obj: Record<string, unknown>) => void,
  maxDepth: number,
  depth = 0,
): void {
  if (depth > maxDepth || !value || typeof value !== 'object') return
  if (Array.isArray(value)) {
    for (const item of value) collectObjects(item, visit, maxDepth, depth + 1)
    return
  }
  const obj = value as Record<string, unknown>
  visit(obj)
  for (const key of Object.keys(obj)) {
    collectObjects(obj[key], visit, maxDepth, depth + 1)
  }
}

function pathValue(value: unknown, path: string[]): unknown {
  let current: unknown = value
  for (const key of path) {
    if (!current || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

function firstString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstString(item)
      if (found) return found
    }
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return firstString(record.name) ?? firstString(record.title)
  }
  return undefined
}

function moneyText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function randFromDecimal(value: unknown): string | undefined {
  const cents = decimalToCents(value)
  if (cents === undefined) return undefined
  return `R${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`
}

function decimalToCents(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value * 100)
  if (typeof value === 'string') {
    const amount = Number(value.replace(/[^0-9.]/g, ''))
    if (Number.isFinite(amount) && amount > 0) return Math.round(amount * 100)
  }
  return undefined
}

function firstRand(text: string): string | undefined {
  const match = /R\s?\d[\d\s,.]*/.exec(text)
  return match ? match[0].replace(/\s+/g, '').replace(/(\d)R/, '$1') : undefined
}

function embeddedImage(post: Record<string, unknown>): string | undefined {
  const media = pathValue(post, ['_embedded', 'wp:featuredmedia'])
  if (Array.isArray(media)) {
    const src = pathValue(media[0], ['source_url'])
    if (typeof src === 'string') return src
  }
  return undefined
}

function embeddedTerm(post: Record<string, unknown>): string | undefined {
  const terms = pathValue(post, ['_embedded', 'wp:term'])
  if (Array.isArray(terms)) {
    for (const group of terms) {
      if (Array.isArray(group)) {
        for (const term of group) {
          const name = pathValue(term, ['name'])
          if (typeof name === 'string' && name && name.toLowerCase() !== 'uncategorized') {
            return decodeEntities(name)
          }
        }
      }
    }
  }
  return undefined
}

export function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&#8217;/g, '’')
    .replace(/&#8216;/g, '‘')
    .replace(/&#8220;/g, '“')
    .replace(/&#8221;/g, '”')
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/&#038;/g, '&')
    .replace(/&hellip;/g, '…')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}
