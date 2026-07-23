import type { PlatformDeal } from './dealPlatform'

export type { PlatformDeal } from './dealPlatform'

// These public endpoints describe a retailer’s online catalogue. They do not
// prove that a price or stock level applies to a nearby physical branch.
export const COMMON_COMMERCE_DEAL_SCOPE = 'online-catalogue' as const
export const MAX_COMMON_COMMERCE_PAGE_SIZE = 100
export const MAX_COMMON_COMMERCE_DEALS = 40
export const MAX_COMMON_COMMERCE_PAGES = 3
export const DEFAULT_COMMON_COMMERCE_PAGE_SIZE = 50

export type CommonCommercePlatform = 'shopify' | 'woocommerce' | 'magento'

export interface CommonCommerceDetection {
  platform: CommonCommercePlatform
  scope: typeof COMMON_COMMERCE_DEAL_SCOPE
}

export interface CommonCommerceRequestDescriptor {
  init: {
    body?: string
    headers: Record<string, string>
    method: 'GET' | 'POST'
  }
  platform: CommonCommercePlatform
  scope: typeof COMMON_COMMERCE_DEAL_SCOPE
  url: string
}

const SHOPIFY_SIGNATURE =
  /cdn\.shopify\.com|\.myshopify\.com|\/cdn\/shop\/|shopify-section|\b(?:window\.)?Shopify\.(?:shop|theme)\b/i
const WOOCOMMERCE_SIGNATURE =
  /\/wp-content\/plugins\/woocommerce\/|\/wp-json\/wc\/store\/|\bwoocommerce-(?:page|product|shop)\b|\bwc-block-components\b/i
const MAGENTO_SIGNATURE =
  /\bdata-mage-init\b|text\/x-magento-init|\bMagento_(?:Catalog|Checkout|Customer|Theme|Ui)\b|\/static\/[^"'\s>]*\/Magento_[A-Za-z]+\//i

export function detectCommonCommercePlatform(
  html: string,
): CommonCommerceDetection | undefined {
  if (SHOPIFY_SIGNATURE.test(html)) {
    return { platform: 'shopify', scope: COMMON_COMMERCE_DEAL_SCOPE }
  }
  if (WOOCOMMERCE_SIGNATURE.test(html)) {
    return { platform: 'woocommerce', scope: COMMON_COMMERCE_DEAL_SCOPE }
  }
  if (MAGENTO_SIGNATURE.test(html)) {
    return { platform: 'magento', scope: COMMON_COMMERCE_DEAL_SCOPE }
  }
  return undefined
}

export function buildCommonCommerceDealsRequest(
  platform: CommonCommercePlatform,
  verifiedStoreOrigin: string,
  pageSize = DEFAULT_COMMON_COMMERCE_PAGE_SIZE,
  page = 1,
): CommonCommerceRequestDescriptor | undefined {
  switch (platform) {
    case 'shopify':
      return buildShopifyDealsRequest(verifiedStoreOrigin, pageSize, page)
    case 'woocommerce':
      return buildWooCommerceDealsRequest(verifiedStoreOrigin, pageSize, page)
    case 'magento':
      return buildMagentoDealsRequest(verifiedStoreOrigin, pageSize, page)
  }
}

export function buildShopifyDealsRequest(
  verifiedStoreOrigin: string,
  pageSize = DEFAULT_COMMON_COMMERCE_PAGE_SIZE,
  page = 1,
): CommonCommerceRequestDescriptor | undefined {
  const origin = storeOrigin(verifiedStoreOrigin)
  if (!origin) {
    return undefined
  }

  const url = new URL('/products.json', origin)
  url.searchParams.set('limit', String(boundedPageSize(pageSize)))
  url.searchParams.set('page', String(boundedPage(page)))

  return getDescriptor('shopify', url.toString())
}

export function buildWooCommerceDealsRequest(
  verifiedStoreOrigin: string,
  pageSize = DEFAULT_COMMON_COMMERCE_PAGE_SIZE,
  page = 1,
): CommonCommerceRequestDescriptor | undefined {
  const origin = storeOrigin(verifiedStoreOrigin)
  if (!origin) {
    return undefined
  }

  const url = new URL('/wp-json/wc/store/v1/products', origin)
  url.searchParams.set('on_sale', 'true')
  url.searchParams.set('per_page', String(boundedPageSize(pageSize)))
  url.searchParams.set('page', String(boundedPage(page)))
  url.searchParams.set('_fields', 'id,name,slug,permalink,prices,images')

  return getDescriptor('woocommerce', url.toString())
}

export function buildMagentoDealsRequest(
  verifiedStoreOrigin: string,
  pageSize = DEFAULT_COMMON_COMMERCE_PAGE_SIZE,
  page = 1,
): CommonCommerceRequestDescriptor | undefined {
  const origin = storeOrigin(verifiedStoreOrigin)
  if (!origin) {
    return undefined
  }

  const query = `
    query TrolleyScoutDeals($pageSize: Int!, $currentPage: Int!) {
      products(
        filter: { price: { from: "0.01" } }
        pageSize: $pageSize
        currentPage: $currentPage
      ) {
        items {
          name
          url_key
          url_suffix
          small_image { url }
          price_range {
            minimum_price {
              regular_price { value currency }
              final_price { value currency }
            }
          }
        }
      }
    }
  `

  return {
    init: {
      body: JSON.stringify({
        query,
        variables: {
          currentPage: boundedPage(page),
          pageSize: boundedPageSize(pageSize),
        },
      }),
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      method: 'POST',
    },
    platform: 'magento',
    scope: COMMON_COMMERCE_DEAL_SCOPE,
    url: new URL('/graphql', origin).toString(),
  }
}

export function commonCommercePayloadItemCount(
  platform: CommonCommercePlatform,
  payload: unknown,
): number {
  if (platform === 'shopify') {
    return isRecord(payload) && Array.isArray(payload.products) ? payload.products.length : 0
  }
  if (platform === 'woocommerce') {
    return Array.isArray(payload) ? payload.length : 0
  }
  const data = isRecord(payload) && isRecord(payload.data) ? payload.data : undefined
  const products = data && isRecord(data.products) ? data.products : undefined
  return products && Array.isArray(products.items) ? products.items.length : 0
}

export function parseCommonCommerceDeals(
  platform: CommonCommercePlatform,
  payload: unknown,
  verifiedStoreOrigin: string,
  limit = MAX_COMMON_COMMERCE_DEALS,
): PlatformDeal[] {
  switch (platform) {
    case 'shopify':
      return parseShopifyDeals(payload, verifiedStoreOrigin, limit)
    case 'woocommerce':
      return parseWooCommerceDeals(payload, verifiedStoreOrigin, limit)
    case 'magento':
      return parseMagentoDeals(payload, verifiedStoreOrigin, limit)
  }
}

export function parseShopifyDeals(
  payload: unknown,
  verifiedStoreOrigin: string,
  limit = MAX_COMMON_COMMERCE_DEALS,
): PlatformDeal[] {
  const origin = storeOrigin(verifiedStoreOrigin)
  const rows = isRecord(payload) && Array.isArray(payload.products) ? payload.products : []
  if (!origin) {
    return []
  }

  const deals: PlatformDeal[] = []
  const maximum = boundedOutputLimit(limit)

  for (const row of rows) {
    if (deals.length >= maximum || !isRecord(row)) {
      continue
    }

    const title = textValue(row.title)
    const prices = shopifyDiscount(row)
    if (!title || !prices) {
      continue
    }

    const handle = textValue(row.handle)
    const suppliedProductUrl = textValue(row.url)
    const productPath = handle ? `/products/${encodeURIComponent(handle)}` : suppliedProductUrl

    deals.push(dealFromDiscount(
      title,
      prices,
      sameOriginUrl(productPath, origin),
      publicUrl(shopifyImage(row), origin),
    ))
  }

  return deals
}

export function parseWooCommerceDeals(
  payload: unknown,
  verifiedStoreOrigin: string,
  limit = MAX_COMMON_COMMERCE_DEALS,
): PlatformDeal[] {
  const origin = storeOrigin(verifiedStoreOrigin)
  if (!origin || !Array.isArray(payload)) {
    return []
  }

  const deals: PlatformDeal[] = []
  const maximum = boundedOutputLimit(limit)

  for (const row of payload) {
    if (deals.length >= maximum || !isRecord(row) || !isRecord(row.prices)) {
      continue
    }

    const title = textValue(row.name)
    const minorUnit = currencyMinorUnit(row.prices.currency_minor_unit)
    const current = minorMoneyToCents(
      nonEmptyValue(row.prices.sale_price) ?? row.prices.price,
      minorUnit,
    )
    const previous = minorMoneyToCents(row.prices.regular_price, minorUnit)

    if (!title || current === undefined || previous === undefined || previous <= current) {
      continue
    }

    const images = Array.isArray(row.images) ? row.images : []
    const firstImage = images.find(isRecord)
    const productPath = textValue(row.permalink) || wooProductPath(row)

    deals.push(dealFromDiscount(
      title,
      { current, previous },
      sameOriginUrl(productPath, origin),
      publicUrl(firstImage ? textValue(firstImage.src) : '', origin),
    ))
  }

  return deals
}

export function parseMagentoDeals(
  payload: unknown,
  verifiedStoreOrigin: string,
  limit = MAX_COMMON_COMMERCE_DEALS,
): PlatformDeal[] {
  const origin = storeOrigin(verifiedStoreOrigin)
  const data = isRecord(payload) && isRecord(payload.data) ? payload.data : undefined
  const products = data && isRecord(data.products) ? data.products : undefined
  const rows = products && Array.isArray(products.items) ? products.items : []
  if (!origin) {
    return []
  }

  const deals: PlatformDeal[] = []
  const maximum = boundedOutputLimit(limit)

  for (const row of rows) {
    if (deals.length >= maximum || !isRecord(row)) {
      continue
    }

    const title = textValue(row.name)
    const prices = magentoDiscount(row)
    if (!title || !prices) {
      continue
    }

    const image = isRecord(row.small_image)
      ? textValue(row.small_image.url)
      : isRecord(row.thumbnail)
        ? textValue(row.thumbnail.url)
        : ''

    deals.push(dealFromDiscount(
      title,
      prices,
      sameOriginUrl(magentoProductPath(row), origin),
      publicUrl(image, origin),
    ))
  }

  return deals
}

interface DiscountPrices {
  current: number
  previous: number
}

function getDescriptor(
  platform: CommonCommercePlatform,
  url: string,
): CommonCommerceRequestDescriptor {
  return {
    init: { headers: { accept: 'application/json' }, method: 'GET' },
    platform,
    scope: COMMON_COMMERCE_DEAL_SCOPE,
    url,
  }
}

function shopifyDiscount(product: Record<string, unknown>): DiscountPrices | undefined {
  const variants = Array.isArray(product.variants) ? product.variants : []
  const candidates = variants.length > 0 ? variants : [product]

  for (const candidate of candidates) {
    if (!isRecord(candidate)) {
      continue
    }
    const current = decimalMoneyToCents(
      nonEmptyValue(candidate.price) ?? candidate.sale_price,
    )
    const previous = decimalMoneyToCents(
      nonEmptyValue(candidate.compare_at_price) ?? candidate.regular_price,
    )
    if (current !== undefined && previous !== undefined && previous > current) {
      return { current, previous }
    }
  }

  return undefined
}

function magentoDiscount(product: Record<string, unknown>): DiscountPrices | undefined {
  const range = isRecord(product.price_range) ? product.price_range : undefined
  const minimum = range && isRecord(range.minimum_price) ? range.minimum_price : undefined
  const current = decimalMoneyToCents(
    minimum && isRecord(minimum.final_price)
      ? minimum.final_price.value
      : nonEmptyValue(product.special_price) ?? product.final_price,
  )
  const previous = decimalMoneyToCents(
    minimum && isRecord(minimum.regular_price)
      ? minimum.regular_price.value
      : product.regular_price,
  )

  return current !== undefined && previous !== undefined && previous > current
    ? { current, previous }
    : undefined
}

function dealFromDiscount(
  title: string,
  prices: DiscountPrices,
  productUrl: string | undefined,
  imageUrl: string | undefined,
): PlatformDeal {
  return {
    imageUrl,
    previousPriceCents: prices.previous,
    priceCents: prices.current,
    productUrl,
    title,
  }
}

function shopifyImage(product: Record<string, unknown>): string {
  const primary = product.image
  if (typeof primary === 'string') {
    return primary.trim()
  }
  if (isRecord(primary)) {
    return textValue(primary.src) || textValue(primary.url)
  }

  const featured = product.featured_image
  if (typeof featured === 'string') {
    return featured.trim()
  }
  if (isRecord(featured)) {
    return textValue(featured.src) || textValue(featured.url)
  }

  const images = Array.isArray(product.images) ? product.images : []
  const first = images.find(isRecord)
  return first ? textValue(first.src) || textValue(first.url) : ''
}

function wooProductPath(product: Record<string, unknown>): string {
  const slug = textValue(product.slug)
  return slug ? `/product/${encodeURIComponent(slug)}/` : ''
}

function magentoProductPath(product: Record<string, unknown>): string {
  const canonical = textValue(product.canonical_url) || textValue(product.url)
  if (canonical) {
    return canonical
  }

  const key = textValue(product.url_key)
  if (!key) {
    return ''
  }
  const suffix = textValue(product.url_suffix) || '.html'
  return `/${encodeURIComponent(key)}${suffix.startsWith('.') ? suffix : `.${suffix}`}`
}

function boundedPageSize(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_COMMON_COMMERCE_PAGE_SIZE
  }
  return Math.min(MAX_COMMON_COMMERCE_PAGE_SIZE, Math.max(1, Math.floor(value)))
}

function boundedPage(value: number): number {
  if (!Number.isFinite(value)) {
    return 1
  }
  return Math.min(MAX_COMMON_COMMERCE_PAGES, Math.max(1, Math.floor(value)))
}

function boundedOutputLimit(value: number): number {
  if (!Number.isFinite(value)) {
    return MAX_COMMON_COMMERCE_DEALS
  }
  return Math.min(MAX_COMMON_COMMERCE_DEALS, Math.max(0, Math.floor(value)))
}

function storeOrigin(value: string): string | undefined {
  try {
    const url = new URL(value)
    if (
      (url.protocol !== 'https:' && url.protocol !== 'http:') ||
      url.username ||
      url.password
    ) {
      return undefined
    }
    return url.origin
  } catch {
    return undefined
  }
}

function sameOriginUrl(value: string, origin: string): string | undefined {
  const resolved = publicUrl(value, origin)
  if (!resolved) {
    return undefined
  }
  return new URL(resolved).origin === origin ? resolved : undefined
}

function publicUrl(value: string, origin: string): string | undefined {
  if (!value) {
    return undefined
  }
  try {
    const url = new URL(value, `${origin}/`)
    if (
      (url.protocol !== 'https:' && url.protocol !== 'http:') ||
      url.username ||
      url.password
    ) {
      return undefined
    }
    return url.toString()
  } catch {
    return undefined
  }
}

function currencyMinorUnit(value: unknown): number {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string' && /^\d+$/.test(value.trim())
      ? Number(value)
      : 2
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 6 ? parsed : 2
}

function minorMoneyToCents(value: unknown, minorUnit: number): number | undefined {
  const scalar = moneyScalar(value)
  const amount = typeof scalar === 'number'
    ? scalar
    : typeof scalar === 'string' && /^\d+$/.test(scalar.trim())
      ? Number(scalar)
      : Number.NaN
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) {
    return undefined
  }

  const cents = Math.round(amount * (10 ** (2 - minorUnit)))
  return Number.isSafeInteger(cents) && cents > 0 ? cents : undefined
}

function decimalMoneyToCents(value: unknown): number | undefined {
  const scalar = moneyScalar(value)
  if (typeof scalar === 'number') {
    const cents = Math.round(scalar * 100)
    return Number.isFinite(scalar) && scalar > 0 && Number.isSafeInteger(cents)
      ? cents
      : undefined
  }
  if (typeof scalar !== 'string') {
    return undefined
  }

  const raw = scalar.trim()
  if (!raw || raw.includes('-') || raw.includes('(') || raw.includes(')')) {
    return undefined
  }

  const cleaned = raw
    .replace(/\b(?:ZAR|USD|EUR|GBP)\b/gi, '')
    .replace(/[R$€£]/gi, '')
    .replace(/[\s\u00a0\u202f'’]/g, '')

  if (!/^\d+(?:[.,]\d+)*$/.test(cleaned)) {
    return undefined
  }

  const normalized = normalizedMoneyNumber(cleaned)
  if (!normalized) {
    return undefined
  }
  const amount = Number(normalized)
  const cents = Math.round(amount * 100)
  return Number.isFinite(amount) && amount > 0 && Number.isSafeInteger(cents)
    ? cents
    : undefined
}

function normalizedMoneyNumber(value: string): string | undefined {
  const lastDot = value.lastIndexOf('.')
  const lastComma = value.lastIndexOf(',')

  if (lastDot >= 0 && lastComma >= 0) {
    const decimalSeparator = lastDot > lastComma ? '.' : ','
    const groupSeparator = decimalSeparator === '.' ? ',' : '.'
    const decimalIndex = value.lastIndexOf(decimalSeparator)
    const whole = value.slice(0, decimalIndex)
    const fraction = value.slice(decimalIndex + 1)
    if (!/^\d{1,2}$/.test(fraction) || !validGroupedWhole(whole, groupSeparator)) {
      return undefined
    }
    return `${whole.split(groupSeparator).join('')}.${fraction}`
  }

  const separator = lastDot >= 0 ? '.' : lastComma >= 0 ? ',' : undefined
  if (!separator) {
    return value
  }
  const parts = value.split(separator)
  if (parts.some((part) => !/^\d+$/.test(part))) {
    return undefined
  }
  if (parts.length === 2 && parts[1].length <= 2) {
    return `${parts[0]}.${parts[1]}`
  }
  if (parts.slice(1).every((part) => part.length === 3)) {
    return parts.join('')
  }
  return undefined
}

function validGroupedWhole(value: string, separator: string): boolean {
  const parts = value.split(separator)
  return parts.length === 1
    ? /^\d+$/.test(parts[0])
    : /^\d+$/.test(parts[0]) && parts.slice(1).every((part) => /^\d{3}$/.test(part))
}

function moneyScalar(value: unknown): unknown {
  if (!isRecord(value)) {
    return value
  }
  return value.amount ?? value.value
}

function nonEmptyValue(value: unknown): unknown {
  return typeof value === 'string' && value.trim() === '' ? undefined : value
}

function textValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
