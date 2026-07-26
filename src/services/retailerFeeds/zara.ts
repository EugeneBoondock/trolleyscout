import { buildRetailerEvidence, retailerSlug } from './types'
import type {
  RetailerDealCandidate,
  RetailerFeedContext,
  RetailerFeedPage,
} from './types'
import {
  arrayValue,
  integerValue,
  isRecord,
  percentOffText,
  recordValue,
  textValue,
} from './values'

export const ZARA_ORIGIN = 'https://www.zara.com'
export const ZARA_SALE_URL = `${ZARA_ORIGIN}/za/en/sale-l1314.html`
const ZARA_CATEGORIES_URL = `${ZARA_ORIGIN}/za/en/categories`
const MAX_ZARA_CATEGORY_COUNT = 40
const zaraRetailerId = retailerSlug('zara')
const zaraScope = { type: 'online' } as const

export interface ZaraCursor {
  categoryIds: number[]
  index: number
}

export function buildZaraCategoriesUrl(): string {
  return ZARA_CATEGORIES_URL
}

export function buildZaraProductsUrl(categoryId: number): string {
  if (!Number.isSafeInteger(categoryId) || categoryId <= 0) {
    throw new RangeError('Zara category id must be a positive integer')
  }

  return `${ZARA_ORIGIN}/za/en/category/${categoryId}/products`
}

export function encodeZaraCursor(cursor: ZaraCursor): string {
  if (
    !Number.isSafeInteger(cursor.index) ||
    cursor.index < 0 ||
    cursor.index >= cursor.categoryIds.length ||
    cursor.categoryIds.length > MAX_ZARA_CATEGORY_COUNT ||
    cursor.categoryIds.some((id) => !Number.isSafeInteger(id) || id <= 0)
  ) {
    throw new RangeError('Invalid Zara cursor')
  }

  return JSON.stringify(cursor)
}

export function decodeZaraCursor(value: string | undefined): ZaraCursor | undefined {
  try {
    const parsed: unknown = JSON.parse(value ?? '')

    if (!isRecord(parsed) || !Array.isArray(parsed.categoryIds)) {
      return undefined
    }

    const categoryIds = parsed.categoryIds.map(Number)
    const index = Number(parsed.index)

    return (
      categoryIds.length > 0 &&
      categoryIds.length <= MAX_ZARA_CATEGORY_COUNT &&
      categoryIds.every((id) => Number.isSafeInteger(id) && id > 0) &&
      Number.isSafeInteger(index) &&
      index >= 0 &&
      index < categoryIds.length
    )
      ? { categoryIds, index }
      : undefined
  } catch {
    return undefined
  }
}

export function parseZaraSaleCategories(payload: unknown): number[] {
  const categories = arrayValue(payload, 'categories')
  const saleNodes: Record<string, unknown>[] = []
  collectNamedSaleNodes(categories, saleNodes)
  const categoryIds: number[] = []

  for (const sale of saleNodes) {
    const children = arrayValue(sale, 'subcategories')

    if (children.length === 0) {
      addCategoryId(categoryIds, categoryTarget(sale))
      continue
    }

    for (const child of children) {
      const name = textValue(child, 'name')

      if (name === '-' || isDivider(child)) {
        continue
      }

      if (!name) {
        for (const section of arrayValue(child, 'subcategories')) {
          addCategoryId(categoryIds, firstViewAllTarget(section))
        }
        continue
      }

      addCategoryId(categoryIds, categoryTarget(child))
    }
  }

  if (categoryIds.length === 0) {
    throw new TypeError('Invalid Zara sale categories')
  }

  return categoryIds.slice(0, MAX_ZARA_CATEGORY_COUNT)
}

export function parseZaraSaleFeed(
  payload: unknown,
  context: RetailerFeedContext,
): RetailerFeedPage {
  const groups = arrayValue(payload, 'productGroups')

  if (groups.length === 0) {
    throw new TypeError('Invalid Zara sale response')
  }

  const products: unknown[] = []
  collectCommercialComponents(groups, products)
  const candidates: RetailerDealCandidate[] = []
  const seen = new Set<string>()

  for (const product of products) {
    const productId = textValue(product, 'id')
    const title = textValue(product, 'name')
    const priceCents = integerValue(product, 'price')
    const previousPriceCents = integerValue(product, 'oldPrice')
    const productUrl = zaraProductUrl(product, productId)

    if (
      !productId ||
      !title ||
      priceCents === undefined ||
      previousPriceCents === undefined ||
      previousPriceCents <= priceCents ||
      !productUrl ||
      seen.has(productId)
    ) {
      continue
    }

    seen.add(productId)
    candidates.push({
      capturedAt: context.capturedAt,
      evidenceText: buildRetailerEvidence({
        priceCents,
        previousPriceCents,
        promotionMarker: 'zara-sale',
        scope: zaraScope,
        sourceId: productId,
      }),
      imageUrl: zaraImage(product),
      previousPriceCents,
      priceCents,
      productId,
      productUrl,
      promotionId: 'zara-sale',
      retailerId: zaraRetailerId,
      savingText: percentOffText(priceCents, previousPriceCents),
      scope: zaraScope,
      sourceKind: 'structured',
      sourceUrl: context.sourceUrl,
      title,
    })
  }

  return { candidates, catalogues: [], totalCount: products.length }
}

function collectNamedSaleNodes(
  values: unknown[],
  result: Record<string, unknown>[],
): void {
  for (const value of values) {
    if (!isRecord(value)) {
      continue
    }

    if (textValue(value, 'name').toUpperCase() === 'SALE') {
      result.push(value)
      continue
    }

    collectNamedSaleNodes(arrayValue(value, 'subcategories'), result)
  }
}

function categoryTarget(value: unknown): number | undefined {
  return integerValue(value, 'redirectCategoryId') ?? integerValue(value, 'id')
}

function firstViewAllTarget(value: unknown): number | undefined {
  const queue = [value]

  while (queue.length > 0) {
    const current = queue.shift()

    if (
      isRecord(current) &&
      textValue(current, 'name').toUpperCase() === 'VIEW ALL'
    ) {
      return categoryTarget(current)
    }

    queue.push(...arrayValue(current, 'subcategories'))
  }

  return categoryTarget(value)
}

function addCategoryId(categoryIds: number[], value: number | undefined): void {
  if (value !== undefined && !categoryIds.includes(value)) {
    categoryIds.push(value)
  }
}

function isDivider(value: unknown): boolean {
  return isRecord(value) &&
    isRecord(value.attributes) &&
    value.attributes.isDivider === true
}

function collectCommercialComponents(values: unknown[], products: unknown[]): void {
  for (const value of values) {
    if (!isRecord(value)) {
      continue
    }

    const components = arrayValue(value, 'commercialComponents')

    if (components.length > 0) {
      products.push(...components.filter((component) =>
        textValue(component, 'type') === 'Product'
      ))
    }

    for (const child of Object.values(value)) {
      if (Array.isArray(child) && child !== components) {
        collectCommercialComponents(child, products)
      }
    }
  }
}

function zaraProductUrl(product: unknown, productId: string): string | undefined {
  const seo = recordValue(product, 'seo')
  const keyword = textValue(seo, 'keyword')
  const seoProductId = textValue(seo, 'seoProductId')

  if (
    !keyword ||
    !seoProductId ||
    !/^[a-z0-9-]+$/i.test(keyword) ||
    !/^\d+$/.test(seoProductId) ||
    !/^\d+$/.test(productId)
  ) {
    return undefined
  }

  return `${ZARA_ORIGIN}/za/en/${keyword}-p${seoProductId}.html?v1=${productId}`
}

function zaraImage(product: unknown): string | undefined {
  const detail = recordValue(product, 'detail')

  for (const color of arrayValue(detail, 'colors')) {
    for (const media of arrayValue(color, 'xmedia')) {
      const value = textValue(media, 'url').replace('{width}', '750')

      try {
        const url = new URL(value)

        if (
          url.protocol === 'https:' &&
          url.hostname === 'static.zara.net' &&
          /\.(?:avif|jpe?g|png|webp)$/i.test(url.pathname)
        ) {
          return url.toString()
        }
      } catch {
        // Try the next official product image.
      }
    }
  }

  return undefined
}
