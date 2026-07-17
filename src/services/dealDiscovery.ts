import { retailers } from '../data/retailers'
import type {
  DiscoveredDeal,
  DiscoveryParserId,
  DiscoverySourceResult,
  DiscoverySourceTarget,
  Retailer,
  RetailerSource,
} from '../types'

export interface ResolvedDiscoveryTarget extends DiscoverySourceTarget {
  retailer: Retailer
  source: RetailerSource
}

export const discoveryTargets: DiscoverySourceTarget[] = [
  {
    parserId: 'pnp-promotions',
    retailerId: 'pick-n-pay',
    sourceLabel: 'On promotion',
  },
  {
    parserId: 'clicks-promotions',
    retailerId: 'clicks',
    sourceLabel: 'Promotions',
  },
  {
    parserId: 'clicks-promotions',
    retailerId: 'clicks',
    sourceLabel: 'Health promotions',
  },
  {
    parserId: 'clicks-promotions',
    retailerId: 'clicks',
    sourceLabel: 'Baby promotions',
  },
  {
    parserId: 'dischem-promotion',
    retailerId: 'dis-chem',
    sourceLabel: 'On promotion',
  },
  {
    parserId: 'yuppiechef-specials',
    retailerId: 'yuppiechef',
    sourceLabel: 'Specials',
  },
  {
    parserId: 'takealot-deals',
    retailerId: 'takealot',
    sourceLabel: 'Deals',
  },
  {
    parserId: 'takealot-deals',
    retailerId: 'takealot',
    sourceLabel: 'Household deals',
  },
  {
    parserId: 'amazon-deals',
    retailerId: 'amazon-za',
    sourceLabel: 'Deals',
  },
  {
    parserId: 'amazon-vouchers',
    retailerId: 'amazon-za',
    sourceLabel: 'Vouchers',
  },
]

export function getDiscoveryTargets(): ResolvedDiscoveryTarget[] {
  return discoveryTargets.flatMap((target) => {
    const retailer = retailers.find((candidate) => candidate.id === target.retailerId)
    const source = retailer?.sources.find((candidate) => candidate.label === target.sourceLabel)

    if (!retailer || !source) {
      return []
    }

    return [
      {
        ...target,
        retailer,
        source,
      },
    ]
  })
}

export function extractDealsFromHtml(
  target: ResolvedDiscoveryTarget,
  html: string,
  capturedAt: string,
  limit = 24,
): DiscoveredDeal[] {
  if (target.parserId === 'dischem-promotion') {
    return extractDischemPromotionDeals(target, html, capturedAt, limit)
  }

  if (target.parserId === 'yuppiechef-specials') {
    return extractYuppiechefSpecials(target, html, capturedAt, limit)
  }

  if (target.parserId === 'amazon-deals') {
    return extractAmazonProductDeals(target, html, capturedAt, limit, 'deals')
  }

  if (target.parserId === 'amazon-vouchers') {
    return extractAmazonProductDeals(target, html, capturedAt, limit, 'vouchers')
  }

  return []
}

export function buildTakealotDealsApiUrl(sourceUrl: string) {
  const apiUrl = new URL(
    'https://api.takealot.com/rest/v-1-17-0/searches/products',
  )
  apiUrl.searchParams.set('context', 'deals')

  try {
    const url = new URL(sourceUrl)
    const promotionMatch = /\/deals\/(\d+)/.exec(url.pathname)

    if (promotionMatch) {
      apiUrl.searchParams.append('filter', `Promotions:${promotionMatch[1]}`)
    }

    for (const filter of url.searchParams.getAll('filter')) {
      apiUrl.searchParams.append('filter', filter)
    }
  } catch {
    return apiUrl.toString()
  }

  return apiUrl.toString()
}

export function extractTakealotProductDeals(
  target: ResolvedDiscoveryTarget,
  payload: unknown,
  capturedAt: string,
  limit = 8,
) {
  const results = getPath(payload, ['sections', 'products', 'results'])
  const deals: DiscoveredDeal[] = []
  const seenProducts = new Set<string>()

  if (!Array.isArray(results)) {
    return deals
  }

  for (const result of results) {
    if (deals.length >= limit) {
      break
    }

    const view = recordValue(result, 'product_views')
    const core = recordValue(view, 'core')
    const productId = recordValue(core, 'id')
    const title = normalizeText(stringValue(core, 'title'))
    const priceText = takealotPriceText(view)
    const savingText = takealotSavingText(view)
    const productUrl = takealotProductUrl(view, target.source.url)
    const imageUrl = takealotImageUrl(view)
    const dedupeKey = `${productId || title}-${priceText || ''}`

    if (!title || !priceText || seenProducts.has(dedupeKey)) {
      continue
    }

    seenProducts.add(dedupeKey)
    deals.push({
      capturedAt,
      evidenceText: evidenceText(title, priceText, undefined, savingText),
      id: dealId(target.retailer.id, title, priceText, deals.length),
      imageUrl,
      priceText,
      productUrl,
      retailerId: target.retailer.id,
      retailerName: target.retailer.name,
      savingText,
      sourceLabel: target.source.label,
      sourceUrl: target.source.url,
      title,
    })
  }

  return deals
}

// Pick n Pay's storefront reads promotions from its OCC commerce API. The
// endpoint answers anonymous POST requests; WC21 is the national online
// store used by the site itself before a shopper picks a branch.
export function buildPnpPromotionsApiUrl(pageSize = 100, page = 0) {
  const fields =
    'products(code,name,price(FULL),potentialPromotions(FULL),inStockIndicator,images(FULL)),pagination(DEFAULT)'
  const query = ':relevance:allCategories:pnpbase:isOnPromotion:On%20Promotion'

  return (
    'https://www.pnp.co.za/pnphybris/v2/pnp-spa/products/search' +
    `?fields=${encodeURIComponent(fields)}` +
    `&query=${encodeURIComponent(query)}` +
    `&pageSize=${pageSize}&currentPage=${page}&storeCode=WC21&lang=en&curr=ZAR`
  )
}

export function extractPnpPromotionDeals(
  target: ResolvedDiscoveryTarget,
  payload: unknown,
  capturedAt: string,
  limit = 60,
) {
  const products = recordValue(payload, 'products')
  const deals: DiscoveredDeal[] = []
  const seenCodes = new Set<string>()

  if (!Array.isArray(products)) {
    return deals
  }

  for (const product of products) {
    if (deals.length >= limit) {
      break
    }

    const code = stringValue(product, 'code')
    const title = normalizeText(stringValue(product, 'name'))
    const inStock = recordValue(product, 'inStockIndicator')

    const price = recordValue(product, 'price')
    const priceText = normalizeText(stringValue(price, 'formattedValue'))
    const oldPrice = recordValue(price, 'oldPrice')
    const hasOldPrice = typeof oldPrice === 'number' && oldPrice > 0
    const previousPriceText = hasOldPrice
      ? normalizeText(stringValue(price, 'oldPriceFormattedValue')) || undefined
      : undefined
    const savings = recordValue(price, 'savings')
    const savingsText = normalizeText(stringValue(price, 'savingsFormattedValue'))
    const hasSavings = typeof savings === 'number' && savings > 0 && savingsText !== ''

    const promotions = recordValue(product, 'potentialPromotions')
    const promotionDescription = Array.isArray(promotions)
      ? normalizeText(stringValue(promotions[0], 'description'))
      : ''
    const savingText = hasSavings ? `Save ${savingsText}` : promotionDescription || undefined
    const imageUrl = productImageUrl(product, 'https://www.pnp.co.za/', [
      'product',
      'carousel',
      'listing',
      'thumbnail',
    ])

    if (!code || seenCodes.has(code) || !title || !priceText || inStock === false) {
      continue
    }

    seenCodes.add(code)
    deals.push({
      capturedAt,
      evidenceText: evidenceText(title, priceText, previousPriceText, savingText),
      id: dealId(target.retailer.id, title, priceText, deals.length),
      imageUrl,
      previousPriceText,
      priceText,
      productUrl: `https://www.pnp.co.za/${slug(title)}/p/${code}`,
      retailerId: target.retailer.id,
      retailerName: target.retailer.name,
      savingText,
      sourceLabel: target.source.label,
      sourceUrl: target.source.url,
      title,
    })
  }

  return deals
}

// Clicks renders its promotion listings client-side from a public Hybris
// results endpoint. OH1 is the root "all products" category; the
// promoStickerplp facet limits rows to items with an active promotion.
// Category pages (e.g. /health-and-pharmacy/c/OH10005) narrow the feed.
export function buildClicksPromotionsApiUrl(sourceUrl?: string, page = 0) {
  let categoryId = 'OH1'

  if (sourceUrl) {
    const categoryMatch = /\/c\/(OH\d+)/.exec(sourceUrl)

    if (categoryMatch) {
      categoryId = categoryMatch[1]
    }
  }

  return `https://clicks.co.za/products/c/${categoryId}/results?q=%3Arelevance%3ApromoStickerplp%3A1&page=${page}`
}

export function extractClicksPromotionDeals(
  target: ResolvedDiscoveryTarget,
  payload: unknown,
  capturedAt: string,
  limit = 24,
) {
  const results = recordValue(payload, 'results')
  const deals: DiscoveredDeal[] = []
  const seenCodes = new Set<string>()

  if (!Array.isArray(results)) {
    return deals
  }

  for (const result of results) {
    if (deals.length >= limit) {
      break
    }

    const code = stringValue(result, 'code')
    const brand = normalizeText(stringValue(result, 'brand'))
    const name = normalizeText(stringValue(result, 'name'))
    const title = name.toLowerCase().startsWith(brand.toLowerCase())
      ? name
      : [brand, name].filter(Boolean).join(' ')
    const path = stringValue(result, 'url')
    const stockCode = stringValue(recordValue(recordValue(result, 'stock'), 'stockLevelStatus'), 'code')

    const price = recordValue(result, 'price')
    const listedPriceText = normalizeText(stringValue(price, 'formattedValue'))
    // Match the "R 249.95" convention Clicks uses in formattedValue.
    const promoPrice = recordValue(price, 'grossPriceWithPromotionApplied')
    const promoPriceText =
      typeof promoPrice === 'number' && Number.isFinite(promoPrice)
        ? `R ${promoPrice.toFixed(2)}`
        : undefined

    const promotions = recordValue(result, 'potentialPromotions')
    const promotionDescription = Array.isArray(promotions)
      ? normalizeText(stringValue(promotions[0], 'description'))
      : ''

    if (!code || seenCodes.has(code) || !title || !listedPriceText || stockCode === 'outOfStock') {
      continue
    }

    const priceText = promoPriceText ?? listedPriceText
    const previousPriceText = promoPriceText && promoPriceText !== listedPriceText ? listedPriceText : undefined
    const savingText = promotionDescription || undefined
    const imageUrl = productImageUrl(result, 'https://clicks.co.za/', [
      'productListing',
      'product',
      'thumbnail',
    ])

    seenCodes.add(code)
    deals.push({
      capturedAt,
      evidenceText: evidenceText(title, priceText, previousPriceText, savingText),
      id: dealId(target.retailer.id, title, priceText, deals.length),
      imageUrl,
      previousPriceText,
      priceText,
      productUrl: absoluteUrl(path || target.source.url, 'https://clicks.co.za/'),
      retailerId: target.retailer.id,
      retailerName: target.retailer.name,
      savingText,
      sourceLabel: target.source.label,
      sourceUrl: target.source.url,
      title,
    })
  }

  return deals
}

export function buildSourceResult(
  target: ResolvedDiscoveryTarget,
  checkedAt: string,
  itemCount: number,
  options: {
    httpStatus?: number
    parserId?: DiscoveryParserId
    unavailable?: boolean
  } = {},
): DiscoverySourceResult {
  if (options.unavailable) {
    return {
      checkedAt,
      httpStatus: options.httpStatus,
      itemCount,
      retailerId: target.retailer.id,
      retailerName: target.retailer.name,
      sourceLabel: target.source.label,
      sourceUrl: target.source.url,
      status: 'unavailable',
      statusText: 'Source could not be read.',
    }
  }

  if (itemCount > 0) {
    return {
      checkedAt,
      httpStatus: options.httpStatus,
      itemCount,
      retailerId: target.retailer.id,
      retailerName: target.retailer.name,
      sourceLabel: target.source.label,
      sourceUrl: target.source.url,
      status: 'found',
      statusText: 'Source-backed rows found.',
    }
  }

  return {
    checkedAt,
    httpStatus: options.httpStatus,
    itemCount,
    retailerId: target.retailer.id,
    retailerName: target.retailer.name,
    sourceLabel: target.source.label,
    sourceUrl: target.source.url,
    status: options.parserId === 'metadata-only' ? 'unsupported' : 'checked_no_static_rows',
    statusText:
      options.parserId === 'metadata-only'
        ? 'Official page checked. Product rows need browser rendering.'
        : options.parserId === 'takealot-deals'
          ? 'Official deals source checked. No product rows matched.'
        : 'Official page checked. No static product rows matched.',
  }
}

function extractDischemPromotionDeals(
  target: ResolvedDiscoveryTarget,
  html: string,
  capturedAt: string,
  limit: number,
) {
  const blocks = html.match(/<li[^>]*class="[^"]*product-item[\s\S]*?<\/li>/gi) ?? []
  const deals: DiscoveredDeal[] = []

  for (const block of blocks) {
    if (deals.length >= limit || !block.includes('product-item-name')) {
      continue
    }

    const linkMatch = block.match(/<strong[^>]*class="[^"]*product-item-name[^"]*"[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i)
    const prices = Array.from(block.matchAll(/<span[^>]*class="price"[^>]*>([\s\S]*?)<\/span>/gi), (match) =>
      normalizeText(match[1]),
    ).filter(Boolean)

    const title = normalizeText(linkMatch?.[2] ?? '')
    const productUrl = absoluteUrl(linkMatch?.[1] ?? target.source.url, target.source.url)
    const imageUrl = htmlImageUrl(block, target.source.url)
    const priceText = prices.at(-1)
    const previousPriceText = prices.length > 1 ? prices[0] : undefined

    if (!title || !priceText) {
      continue
    }

    deals.push({
      capturedAt,
      evidenceText: evidenceText(title, priceText, previousPriceText),
      id: dealId(target.retailer.id, title, priceText, deals.length),
      imageUrl,
      previousPriceText,
      priceText,
      productUrl,
      retailerId: target.retailer.id,
      retailerName: target.retailer.name,
      sourceLabel: target.source.label,
      sourceUrl: target.source.url,
      title,
    })
  }

  return deals
}

function extractYuppiechefSpecials(
  target: ResolvedDiscoveryTarget,
  html: string,
  capturedAt: string,
  limit: number,
) {
  const blocks = html.match(/<article[^>]*class="[^"]*product-card[\s\S]*?<\/article>/gi) ?? []
  const deals: DiscoveredDeal[] = []

  for (const block of blocks) {
    if (deals.length >= limit) {
      continue
    }

    const linkMatch = block.match(/<a[^>]*href="([^"]+)"[^>]*class="u-block-link"/i)
    const brand = normalizeText(firstClassText(block, 'product-card__brand'))
    const name = normalizeText(firstClassText(block, 'product-card__name'))
    const title = [brand, name].filter(Boolean).join(' ')
    const priceText = normalizeText(firstClassText(block, 'card-price-list__item--now'))
    const previousPriceText = normalizeText(firstClassText(block, 'card-price-list__item--was')) || undefined
    const savingText = normalizeText(firstClassText(block, 'card-sticker--price')) || undefined
    const imageUrl = htmlImageUrl(block, target.source.url)

    if (!title || !priceText || !linkMatch?.[1]) {
      continue
    }

    deals.push({
      capturedAt,
      evidenceText: evidenceText(title, priceText, previousPriceText, savingText),
      id: dealId(target.retailer.id, title, priceText, deals.length),
      imageUrl,
      previousPriceText,
      priceText,
      productUrl: absoluteUrl(linkMatch[1], target.source.url),
      retailerId: target.retailer.id,
      retailerName: target.retailer.name,
      savingText,
      sourceLabel: target.source.label,
      sourceUrl: target.source.url,
      title,
    })
  }

  return deals
}

function extractAmazonProductDeals(
  target: ResolvedDiscoveryTarget,
  html: string,
  capturedAt: string,
  limit: number,
  mode: 'deals' | 'vouchers',
) {
  const products = extractJsonObjectsWithKey(html, '"asin":"')
  const deals: DiscoveredDeal[] = []
  const seenAsins = new Set<string>()

  for (const product of products) {
    if (deals.length >= limit) {
      break
    }

    const asin = stringValue(product, 'asin')
    const title = normalizeText(stringValue(product, 'title'))
    const link = stringValue(product, 'link')
    const priceText = amazonPriceText(product, mode)
    const previousPriceText = amazonPreviousPriceText(product, mode)
    const savingText = amazonSavingText(product, mode)
    const imageUrl = objectImageUrl(product, target.source.url)

    if (!asin || seenAsins.has(asin) || !title || !link || !priceText) {
      continue
    }

    if (mode === 'vouchers' && !hasObject(product, 'coupon')) {
      continue
    }

    if (mode === 'deals' && !hasObject(product, 'dealBadge')) {
      continue
    }

    seenAsins.add(asin)
    deals.push({
      capturedAt,
      evidenceText: evidenceText(title, priceText, previousPriceText, savingText),
      id: dealId(target.retailer.id, title, priceText, deals.length),
      imageUrl,
      previousPriceText,
      priceText,
      productUrl: absoluteUrl(link, target.source.url),
      retailerId: target.retailer.id,
      retailerName: target.retailer.name,
      savingText,
      sourceLabel: target.source.label,
      sourceUrl: target.source.url,
      title,
    })
  }

  return deals
}

function extractJsonObjectsWithKey(html: string, key: string) {
  const objects: unknown[] = []
  let searchFrom = 0

  while (searchFrom < html.length) {
    const index = html.indexOf(`{${key}`, searchFrom)

    if (index === -1) {
      break
    }

    const objectText = balancedJsonObject(html, index)
    searchFrom = index + key.length + 1

    if (!objectText) {
      continue
    }

    try {
      objects.push(JSON.parse(objectText) as unknown)
    } catch {
      // Amazon can include nearby JS snippets that are not strict JSON.
    }
  }

  return objects
}

function takealotPriceText(view: unknown) {
  const buybox = recordValue(view, 'buybox_summary')
  const prettyPrice = normalizeText(stringValue(buybox, 'pretty_price'))
  const appPrettyPrice = normalizeText(stringValue(buybox, 'app_pretty_price'))

  if (prettyPrice) {
    return prettyPrice
  }

  if (appPrettyPrice) {
    return appPrettyPrice
  }

  const impressionPrice = recordValue(getPath(view, ['enhanced_ecommerce_impression', 'ecommerce', 'impressions', '0']), 'price')

  if (typeof impressionPrice === 'string' || typeof impressionPrice === 'number') {
    return formatRandAmount(impressionPrice)
  }

  return undefined
}

function takealotSavingText(view: unknown) {
  const badges = getPath(view, ['badges', 'entries'])

  if (Array.isArray(badges)) {
    for (const badge of badges) {
      const type = stringValue(badge, 'type')
      const value = normalizeText(stringValue(badge, 'value'))

      if (type === 'saving' && value) {
        return value
      }
    }
  }

  const saving = normalizeText(stringValue(recordValue(view, 'buybox_summary'), 'saving'))

  return saving ? `${saving} off` : undefined
}

function takealotProductUrl(view: unknown, baseUrl: string) {
  const core = recordValue(view, 'core')
  const productId = recordValue(core, 'id')
  const slug = stringValue(core, 'slug')

  if ((typeof productId === 'string' || typeof productId === 'number') && slug) {
    return `https://www.takealot.com/${slug}/PLID${productId}`
  }

  return baseUrl
}

function takealotImageUrl(view: unknown) {
  const images = recordValue(recordValue(view, 'gallery'), 'images')

  if (!Array.isArray(images)) {
    return undefined
  }

  const image = images.find((value): value is string => typeof value === 'string' && value.startsWith('https://'))
  return image?.replace('{size}', '300')
}

function balancedJsonObject(value: string, start: number) {
  let depth = 0
  let inString = false
  let isEscaped = false

  for (let index = start; index < value.length; index += 1) {
    const character = value[index]

    if (inString) {
      if (isEscaped) {
        isEscaped = false
      } else if (character === '\\') {
        isEscaped = true
      } else if (character === '"') {
        inString = false
      }

      continue
    }

    if (character === '"') {
      inString = true
      continue
    }

    if (character === '{') {
      depth += 1
    } else if (character === '}') {
      depth -= 1

      if (depth === 0) {
        return value.slice(start, index + 1)
      }
    }
  }

  return undefined
}

function amazonPriceText(product: unknown, mode: 'deals' | 'vouchers') {
  if (mode === 'vouchers') {
    const couponAmount = moneyAmount(getPath(product, ['coupon', 'label', 'fragments']))

    if (couponAmount) {
      return `Voucher price ${couponAmount}`
    }
  }

  return priceWithLabel(getPath(product, ['price', 'priceToPay']))
}

function amazonPreviousPriceText(product: unknown, mode: 'deals' | 'vouchers') {
  if (mode === 'vouchers') {
    return priceWithLabel(getPath(product, ['price', 'priceToPay']))
  }

  return priceWithLabel(getPath(product, ['price', 'basisPrice']))
}

function amazonSavingText(product: unknown, mode: 'deals' | 'vouchers') {
  if (mode === 'vouchers') {
    const message = normalizeText(stringValue(getPath(product, ['coupon', 'messaging']), 'text'))

    return message ? sentenceCase(message) : 'Voucher available'
  }

  return fragmentText(getPath(product, ['dealBadge', 'label', 'content', 'fragments']))
}

function priceWithLabel(value: unknown) {
  const price = recordValue(value, 'price')

  if (typeof price !== 'string' && typeof price !== 'number') {
    return undefined
  }

  const formattedPrice = formatRandAmount(price)
  const label = normalizeText(stringValue(value, 'label')).replace(/:$/, '')

  return label ? `${label} ${formattedPrice}` : formattedPrice
}

function moneyAmount(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined
  }

  for (const fragment of value) {
    const money = recordValue(fragment, 'money')
    const amount = recordValue(money, 'amount')

    if (typeof amount === 'string' || typeof amount === 'number') {
      return formatRandAmount(amount)
    }
  }

  return undefined
}

function fragmentText(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined
  }

  const text = value
    .map((fragment) => normalizeText(stringValue(fragment, 'text')))
    .filter(Boolean)
    .join(' ')

  return text || undefined
}

function formatRandAmount(value: string | number) {
  const amount = Number(value)

  if (!Number.isFinite(amount)) {
    return normalizeText(String(value))
  }

  return new Intl.NumberFormat('en-ZA', {
    currency: 'ZAR',
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: 'currency',
  }).format(amount)
}

function sentenceCase(value: string) {
  const normalized = normalizeText(value)

  return normalized ? `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}` : ''
}

function getPath(value: unknown, path: string[]) {
  return path.reduce<unknown>((current, key) => recordValue(current, key), value)
}

function recordValue(value: unknown, key: string) {
  return typeof value === 'object' && value !== null && key in value
    ? (value as Record<string, unknown>)[key]
    : undefined
}

function stringValue(value: unknown, key: string) {
  const current = recordValue(value, key)

  return typeof current === 'string' ? current : ''
}

function hasObject(value: unknown, key: string) {
  const current = recordValue(value, key)

  return typeof current === 'object' && current !== null
}

function productImageUrl(
  product: unknown,
  baseUrl: string,
  preferredFormats: string[],
) {
  const images = recordValue(product, 'images')

  if (!Array.isArray(images)) {
    return undefined
  }

  const records = images.filter((image): image is Record<string, unknown> =>
    typeof image === 'object' && image !== null,
  )
  const selected = preferredFormats
    .map((format) => records.find((image) => image.format === format && image.imageType === 'PRIMARY'))
    .find(Boolean) ?? records.find((image) => image.imageType === 'PRIMARY')
  const path = selected?.url

  if (typeof path !== 'string' || path.length === 0) {
    return undefined
  }

  const imageUrl = absoluteUrl(path, baseUrl)
  return /^https:\/\//.test(imageUrl) ? imageUrl : undefined
}

function htmlImageUrl(html: string, baseUrl: string) {
  const match = /<img[^>]+(?:src|data-src)=["']([^"']+)["']/i.exec(html)

  if (!match?.[1]) {
    return undefined
  }

  const imageUrl = absoluteUrl(match[1], baseUrl)
  return /^https:\/\//.test(imageUrl) ? imageUrl : undefined
}

function objectImageUrl(value: unknown, baseUrl: string) {
  const nestedImage = recordValue(value, 'image')
  const path = [
    stringValue(value, 'imageUrl'),
    typeof nestedImage === 'string' ? nestedImage : '',
    stringValue(nestedImage, 'url'),
    stringValue(nestedImage, 'src'),
    // Amazon nests renditions as {lowRes|hiRes: {baseUrl, extension}}.
    amazonRenditionUrl(recordValue(nestedImage, 'lowRes')),
    amazonRenditionUrl(recordValue(nestedImage, 'hiRes')),
  ].find(Boolean)

  if (!path) {
    return undefined
  }

  const imageUrl = absoluteUrl(path, baseUrl)
  return /^https:\/\//.test(imageUrl) ? imageUrl : undefined
}

function amazonRenditionUrl(rendition: unknown) {
  const base = stringValue(rendition, 'baseUrl')

  if (!base) {
    return ''
  }

  return `${base}.${stringValue(rendition, 'extension') || 'jpg'}`
}

function firstClassText(html: string, className: string) {
  const pattern = new RegExp(`<([a-z0-9]+)[^>]*class="[^"]*${escapeRegExp(className)}[^"]*"[^>]*>([\\s\\S]*?)<\\/\\1>`, 'i')
  return pattern.exec(html)?.[2] ?? ''
}

function evidenceText(title: string, priceText: string, previousPriceText?: string, savingText?: string) {
  return [title, labelPrice('Now', priceText), previousPriceText ? labelPrice('Was', previousPriceText) : '', savingText]
    .filter(Boolean)
    .join('. ')
}

function labelPrice(label: 'Now' | 'Was', value: string) {
  const normalizedValue = normalizeText(value)

  if (normalizedValue.toLowerCase().startsWith(label.toLowerCase())) {
    return normalizedValue
  }

  return `${label} ${normalizedValue}`
}

function dealId(retailerId: string, title: string, priceText: string, index: number) {
  return `${retailerId}-${slug(title)}-${slug(priceText)}-${index + 1}`
}

function slug(value: string) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64)
}

function absoluteUrl(value: string, baseUrl: string) {
  try {
    return new URL(decodeHtml(value), baseUrl).toString()
  } catch {
    return baseUrl
  }
}

function normalizeText(value: string) {
  return stripTags(decodeHtml(value))
    .replace(/'/g, '’')
    .replace(/\u00e2\u20ac\u2122/g, '’')
    .replace(/\u00e2\u20ac\u0153/g, '“')
    .replace(/\u00e2\u20ac\ufffd/g, '”')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripTags(value: string) {
  return value.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]*>/g, ' ')
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, '’')
    .replace(/&#39;/g, '’')
    .replace(/&rsquo;/g, '’')
    .replace(/&ldquo;/g, '“')
    .replace(/&rdquo;/g, '”')
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
