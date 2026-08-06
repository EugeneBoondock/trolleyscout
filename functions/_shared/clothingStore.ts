import type { TrolleyScoutEnv } from './env'
import type { ClothingProduct } from '../../src/services/clothingCatalogue'
import {
  audienceFor,
  garmentTypeFor,
  isNonApparel,
  type ClothingAudience,
  type GarmentType,
} from '../../src/services/clothingTaxonomy'

export interface ClothingItem {
  audience: ClothingAudience
  garmentType: GarmentType
  id: string
  imageUrl: string
  inStock: boolean
  previousPriceCents: number | null
  priceCents: number
  productUrl: string
  retailerId: string
  retailerName: string
  title: string
}

export interface ClothingQuery {
  audience?: string
  countryCode?: string
  garmentType?: string
  limit?: number
  offset?: number
  /// What the shopper typed: matched against the garment's own words.
  query?: string
  retailerId?: string
  /// Only garments a try-on can dress a body in.
  tryOnableOnly?: boolean
}

const MAX_LIMIT = 120
const TRY_ONABLE_TYPES = ['tops', 'bottoms', 'dresses', 'outerwear']

interface ClothingRow {
  audience: string
  garment_type: string
  id: string
  image_url: string
  in_stock: number
  previous_price_cents: number | null
  price_cents: number
  product_url: string
  retailer_id: string
  retailer_name: string
  title: string
}

export async function saveClothingItems(
  env: TrolleyScoutEnv,
  retailerId: string,
  retailerName: string,
  products: ClothingProduct[],
  now: Date = new Date(),
  assumeType?: GarmentType,
): Promise<number> {
  if (!env.DB || products.length === 0) return 0
  const stamp = now.toISOString()
  const statements = []

  for (const product of products) {
    const text = `${product.title} ${product.categoryText}`
    // Fashion shops sell candles and mugs too, so homeware is turned away
    // first. What remains needs a garment shape: read from the title, or —
    // for a shop that sells one thing only — assumed, because a Bathu
    // "Journey 2.0" is a shoe even though the name never says so.
    if (isNonApparel(text)) continue
    const readType = garmentTypeFor(text)
    const garmentType = readType === 'any' ? (assumeType ?? 'any') : readType
    if (garmentType === 'any') continue
    statements.push(
      env.DB.prepare(
        `INSERT INTO clothing_items (
          id, retailer_id, retailer_name, external_id, title, price_cents,
          previous_price_cents, image_url, product_url, in_stock, audience,
          garment_type, country_code, currency_code, captured_at, last_seen_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ZA', 'ZAR', ?, ?)
        ON CONFLICT (retailer_id, external_id) DO UPDATE SET
          title = excluded.title,
          price_cents = excluded.price_cents,
          previous_price_cents = excluded.previous_price_cents,
          image_url = excluded.image_url,
          product_url = excluded.product_url,
          in_stock = excluded.in_stock,
          audience = excluded.audience,
          garment_type = excluded.garment_type,
          last_seen_at = excluded.last_seen_at`,
      ).bind(
        `${retailerId}:${product.externalId}`,
        retailerId,
        retailerName,
        product.externalId,
        product.title.slice(0, 200),
        product.priceCents,
        product.previousPriceCents ?? null,
        product.imageUrl,
        product.productUrl,
        product.inStock ? 1 : 0,
        audienceFor(text),
        garmentType,
        stamp,
        stamp,
      ),
    )
  }

  if (statements.length === 0) return 0
  await env.DB.batch(statements)
  return statements.length
}

export async function recordClothingRun(
  env: TrolleyScoutEnv,
  retailerId: string,
  status: 'success' | 'empty' | 'failed',
  productCount: number,
  errorText?: string,
  now: Date = new Date(),
): Promise<void> {
  if (!env.DB) return
  try {
    await env.DB.prepare(
      `INSERT INTO clothing_source_runs
        (id, retailer_id, status, product_count, error_text, finished_at)
        VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        `${retailerId}-${now.getTime()}`,
        retailerId,
        status,
        productCount,
        errorText?.slice(0, 300) ?? null,
        now.toISOString(),
      )
      .run()
  } catch {
    // The audit trail must never sink a good sweep.
  }
}

export async function listClothingItems(
  env: TrolleyScoutEnv,
  query: ClothingQuery = {},
): Promise<ClothingItem[]> {
  if (!env.DB) return []
  const conditions = ['country_code = ?', 'in_stock = 1']
  const bindings: unknown[] = [(query.countryCode ?? 'ZA').toUpperCase()]

  if (query.retailerId && query.retailerId !== 'all') {
    conditions.push('retailer_id = ?')
    bindings.push(query.retailerId)
  }
  if (query.audience && query.audience !== 'any') {
    conditions.push('audience = ?')
    bindings.push(query.audience)
  }
  if (query.garmentType && query.garmentType !== 'any') {
    conditions.push('garment_type = ?')
    bindings.push(query.garmentType)
  }
  if (query.tryOnableOnly) {
    conditions.push(
      `garment_type IN (${TRY_ONABLE_TYPES.map(() => '?').join(', ')})`,
    )
    bindings.push(...TRY_ONABLE_TYPES)
  }
  // Every typed word must appear somewhere in the title or the shop's name,
  // so "black nike" narrows rather than widens.
  const words = (query.query ?? '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 1)
    .slice(0, 5)
  for (const word of words) {
    conditions.push('(LOWER(title) LIKE ? OR LOWER(retailer_name) LIKE ?)')
    const like = `%${word.replace(/[%_]/g, '')}%`
    bindings.push(like, like)
  }

  const limit = Math.min(Math.max(1, query.limit ?? 60), MAX_LIMIT)
  const offset = Math.max(0, query.offset ?? 0)
  bindings.push(limit, offset)

  try {
    const result = await env.DB.prepare(
      `SELECT id, retailer_id, retailer_name, title, price_cents,
        previous_price_cents, image_url, product_url, in_stock, audience,
        garment_type
        FROM clothing_items
        WHERE ${conditions.join(' AND ')}
        ORDER BY last_seen_at DESC, price_cents ASC
        LIMIT ? OFFSET ?`,
    )
      .bind(...bindings)
      .all<ClothingRow>()

    return (result.results ?? []).map(rowToItem)
  } catch {
    return []
  }
}

export async function listClothingRetailers(
  env: TrolleyScoutEnv,
  countryCode = 'ZA',
): Promise<Array<{ id: string; name: string; count: number }>> {
  if (!env.DB) return []
  try {
    const result = await env.DB.prepare(
      `SELECT retailer_id AS id, retailer_name AS name, COUNT(*) AS count
        FROM clothing_items
        WHERE country_code = ? AND in_stock = 1
        GROUP BY retailer_id, retailer_name
        ORDER BY count DESC`,
    )
      .bind(countryCode.toUpperCase())
      .all<{ count: number; id: string; name: string }>()
    return result.results ?? []
  } catch {
    return []
  }
}

/// Garments nobody has seen for a fortnight are gone from the shop floor.
export async function pruneStaleClothing(
  env: TrolleyScoutEnv,
  now: Date = new Date(),
): Promise<void> {
  if (!env.DB) return
  const cutoff = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)
  try {
    await env.DB.prepare('DELETE FROM clothing_items WHERE last_seen_at < ?')
      .bind(cutoff.toISOString())
      .run()
  } catch {
    // Pruning is housekeeping, never a reason to fail a sweep.
  }
}

function rowToItem(row: ClothingRow): ClothingItem {
  return {
    audience: row.audience as ClothingAudience,
    garmentType: row.garment_type as GarmentType,
    id: row.id,
    imageUrl: row.image_url,
    inStock: row.in_stock === 1,
    previousPriceCents: row.previous_price_cents,
    priceCents: row.price_cents,
    productUrl: row.product_url,
    retailerId: row.retailer_id,
    retailerName: row.retailer_name,
    title: row.title,
  }
}
