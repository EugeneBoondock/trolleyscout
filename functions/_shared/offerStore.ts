import type { SourceSummary } from '../../src/api/contracts'
import { buildSourceSummary } from '../../src/api/staticData'
import { validateOfferDraft } from '../../src/services/offerValidation'
import type { OfferDraft, VerifiedOffer } from '../../src/types'
import type { TrolleyScoutEnv } from './env'

interface OfferRow {
  captured_at: string
  created_at: string
  id: string
  image_url: string | null
  price_text: string
  retailer_id: VerifiedOffer['retailerId']
  saving_text: string | null
  source_url: string
  terms_text: string
  title: string
  updated_at: string
  valid_from: string
  valid_to: string
}

export function hasOfferStore(env: TrolleyScoutEnv): env is TrolleyScoutEnv & { DB: D1Database } {
  return Boolean(env.DB)
}

export async function listStoredOffers(env: TrolleyScoutEnv) {
  if (!hasOfferStore(env)) {
    return []
  }

  const result = await env.DB.prepare(
    `SELECT id, retailer_id, title, source_url, captured_at, valid_from, valid_to,
      price_text, saving_text, terms_text, image_url, created_at, updated_at
      FROM verified_offers
      ORDER BY updated_at DESC, created_at DESC`,
  ).all<OfferRow>()

  return result.results.map(rowToOffer)
}

export async function getStoredOffer(env: TrolleyScoutEnv, id: string) {
  if (!hasOfferStore(env)) {
    return undefined
  }

  const row = await env.DB.prepare(
    `SELECT id, retailer_id, title, source_url, captured_at, valid_from, valid_to,
      price_text, saving_text, terms_text, image_url, created_at, updated_at
      FROM verified_offers
      WHERE id = ?`,
  )
    .bind(id)
    .first<OfferRow>()

  return row ? rowToOffer(row) : undefined
}

export async function countStoredOffers(env: TrolleyScoutEnv) {
  if (!hasOfferStore(env)) {
    return 0
  }

  const result = await env.DB.prepare('SELECT COUNT(*) AS count FROM verified_offers').first<{
    count: number
  }>()

  return result?.count ?? 0
}

export async function saveOfferDraft(env: TrolleyScoutEnv, draft: OfferDraft) {
  if (!hasOfferStore(env)) {
    return {
      result: validateOfferDraft(draft),
      saved: false,
      storageReady: false,
    }
  }

  const result = validateOfferDraft(draft)

  if (!result.accepted || !result.normalizedOffer) {
    return {
      result,
      saved: false,
      storageReady: true,
    }
  }

  const offer = result.normalizedOffer
  const timestamp = new Date().toISOString()

  await env.DB.prepare(
    `INSERT INTO verified_offers (
      id, retailer_id, title, source_url, captured_at, valid_from, valid_to,
      price_text, saving_text, terms_text, image_url, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      retailer_id = excluded.retailer_id,
      title = excluded.title,
      source_url = excluded.source_url,
      captured_at = excluded.captured_at,
      valid_from = excluded.valid_from,
      valid_to = excluded.valid_to,
      price_text = excluded.price_text,
      saving_text = excluded.saving_text,
      terms_text = excluded.terms_text,
      image_url = COALESCE(excluded.image_url, verified_offers.image_url),
      updated_at = excluded.updated_at`,
  )
    .bind(
      offer.id,
      offer.retailerId,
      offer.title,
      offer.sourceUrl,
      offer.capturedAt,
      offer.validFrom ?? '',
      offer.validTo ?? '',
      offer.priceText ?? '',
      offer.savingText ?? null,
      offer.termsText ?? '',
      offer.imageUrl ?? null,
      timestamp,
      timestamp,
    )
    .run()

  return {
    result: {
      ...result,
      normalizedOffer: await getStoredOffer(env, offer.id),
    },
    saved: true,
    storageReady: true,
  }
}

export async function deleteStoredOffer(env: TrolleyScoutEnv, id: string) {
  if (!hasOfferStore(env)) {
    return false
  }

  const result = await env.DB.prepare('DELETE FROM verified_offers WHERE id = ?').bind(id).run()

  return result.meta.changes > 0
}

export async function buildStoredSummary(env: TrolleyScoutEnv): Promise<SourceSummary> {
  return {
    ...buildSourceSummary(),
    verifiedOfferCount: await countStoredOffers(env),
  }
}

function rowToOffer(row: OfferRow): VerifiedOffer {
  return {
    capturedAt: row.captured_at,
    createdAt: row.created_at,
    id: row.id,
    imageUrl: row.image_url ?? undefined,
    priceText: row.price_text,
    retailerId: row.retailer_id,
    savingText: row.saving_text ?? undefined,
    sourceUrl: row.source_url,
    termsText: row.terms_text,
    title: row.title,
    updatedAt: row.updated_at,
    validFrom: row.valid_from,
    validTo: row.valid_to,
  }
}
