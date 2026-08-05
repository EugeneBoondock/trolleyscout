import type { TrolleyScoutEnv } from './env'

export interface SavedDealPriceDrop {
  currentPriceCents: number
  id: string
  retailerName: string
  savedPriceCents: number
  title: string
}

/** A drop must be worth interrupting someone for: at least 5% or R5 below
 * what the product cost when they saved it. */
const MINIMUM_DROP_RATIO = 0.05
const MINIMUM_DROP_CENTS = 500

interface PriceDropRow {
  current_price_cents: number
  id: string
  price_text: string | null
  retailer_name: string | null
  title: string
}

/** Saved deals whose live marketplace price is now meaningfully below the
 * price the shopper saved them at. Matched by product_url — the one identity
 * both tables share — against active, unexpired deal rows only. */
export async function listSavedDealPriceDrops(
  env: TrolleyScoutEnv,
  accountId: string,
): Promise<SavedDealPriceDrop[]> {
  if (!env.DB) return []
  const result = await env.DB.prepare(
    `SELECT
      member_saved_deals.id AS id,
      member_saved_deals.title AS title,
      member_saved_deals.price_text AS price_text,
      deal_items.current_price_cents AS current_price_cents,
      deal_items.retailer_id AS retailer_name
      FROM member_saved_deals
      INNER JOIN deal_items
        ON deal_items.product_url = member_saved_deals.product_url
        AND deal_items.retailer_id = member_saved_deals.retailer_id
      WHERE member_saved_deals.account_id = ?
        AND member_saved_deals.product_url IS NOT NULL
        AND member_saved_deals.product_url != ''
        AND deal_items.status = 'active'
        AND deal_items.expires_at > ?
        AND deal_items.current_price_cents > 0`,
  )
    .bind(accountId, new Date().toISOString())
    .all<PriceDropRow>()

  const drops: SavedDealPriceDrop[] = []
  for (const row of result.results ?? []) {
    const savedCents = parsePriceCents(row.price_text)
    if (savedCents === null) continue
    const dropCents = savedCents - row.current_price_cents
    if (dropCents < MINIMUM_DROP_CENTS &&
        dropCents < savedCents * MINIMUM_DROP_RATIO) {
      continue
    }
    if (dropCents <= 0) continue
    drops.push({
      currentPriceCents: row.current_price_cents,
      id: row.id,
      retailerName: row.retailer_name ?? '',
      savedPriceCents: savedCents,
      title: row.title,
    })
  }
  return drops.sort((left, right) => (
    (right.savedPriceCents - right.currentPriceCents) -
    (left.savedPriceCents - left.currentPriceCents)
  ))
}

/** "R 123,45", "R123.45", "USD 12.50", "1 299.00" → cents; null when the text
 * holds no single parseable amount. */
export function parsePriceCents(text: string | null | undefined): number | null {
  if (!text) return null
  const match = text.replace(/ /g, ' ')
    .match(/(\d{1,3}(?:[ ,.]\d{3})*|\d+)(?:[.,](\d{1,2}))?(?!\d)/)
  if (!match) return null
  const whole = Number(match[1].replace(/[ ,.]/g, ''))
  if (!Number.isFinite(whole)) return null
  const fraction = match[2] ?? '0'
  const cents = whole * 100 + Number(fraction.padEnd(2, '0'))
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null
}
