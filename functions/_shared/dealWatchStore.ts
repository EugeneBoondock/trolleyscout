// Deal watches: items members searched for that had no deal yet. Every scout
// lane calls matchPendingWatches after landing new deals, so the moment any
// shopper's activity surfaces a matching item, the watcher has an alert
// waiting. This is the "the platform remembers what you need" feature.

import {
  findWatchMatches,
  isWatchQueryValid,
  normalizeWatchQuery,
  type DealWatchMatch,
  type WatchableDeal,
} from '../../src/services/dealWatch'
import { listActiveDealItems } from './dealItemStore'
import { readDealSnapshots } from './dealSnapshotStore'
import { hasTrolleyScoutDatabase, type TrolleyScoutEnv } from './env'
import { readAllStorePromotions } from './locationStore'

export interface DealWatch {
  id: string
  queryText: string
  createdAt: string
  matchedAt?: string
  seenAt?: string
  matches: DealWatchMatch[]
}

interface DealWatchRow {
  id: string
  query_text: string
  normalized_query: string
  created_at: string
  matched_at: string | null
  matched_deals_json: string | null
  seen_at: string | null
}

const MAX_WATCHES_PER_ACCOUNT = 20
const MAX_PENDING_PER_SWEEP = 500

export async function listDealWatches(
  env: TrolleyScoutEnv,
  accountId: string,
): Promise<DealWatch[]> {
  if (!hasTrolleyScoutDatabase(env)) {
    return []
  }

  try {
    const result = await env.DB.prepare(
      `SELECT id, query_text, normalized_query, created_at, matched_at, matched_deals_json, seen_at
        FROM deal_watches
        WHERE account_id = ?
        ORDER BY created_at DESC
        LIMIT ?`,
    )
      .bind(accountId, MAX_WATCHES_PER_ACCOUNT * 2)
      .all<DealWatchRow>()

    return result.results.map(rowToWatch)
  } catch {
    return []
  }
}

export async function createDealWatch(
  env: TrolleyScoutEnv,
  accountId: string,
  queryText: string,
): Promise<{ watch?: DealWatch; issue?: string }> {
  if (!hasTrolleyScoutDatabase(env)) {
    return { issue: 'Watches are not available right now.' }
  }

  const normalized = normalizeWatchQuery(queryText)

  if (!isWatchQueryValid(normalized)) {
    return { issue: 'Type the item you are looking for, like "peanut butter".' }
  }

  const existing = await listDealWatches(env, accountId)

  if (existing.length >= MAX_WATCHES_PER_ACCOUNT) {
    return { issue: `You can watch up to ${MAX_WATCHES_PER_ACCOUNT} items. Remove one first.` }
  }

  const nowIso = new Date().toISOString()
  const watch: DealWatch = {
    createdAt: nowIso,
    id: `watch-${crypto.randomUUID()}`,
    matches: [],
    queryText: queryText.trim().slice(0, 120),
  }

  try {
    await env.DB.prepare(
      `INSERT INTO deal_watches (id, account_id, query_text, normalized_query, created_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (account_id, normalized_query) DO NOTHING`,
    )
      .bind(watch.id, accountId, watch.queryText, normalized, nowIso)
      .run()

    // Already watching the same item: hand back the existing watch instead.
    const stored = (await listDealWatches(env, accountId)).find(
      (candidate) => normalizeWatchQuery(candidate.queryText) === normalized,
    )

    return { watch: stored ?? watch }
  } catch {
    return { issue: 'Could not save the watch. Try again.' }
  }
}

export async function deleteDealWatch(
  env: TrolleyScoutEnv,
  accountId: string,
  id: string,
): Promise<boolean> {
  if (!hasTrolleyScoutDatabase(env)) {
    return false
  }

  try {
    const result = await env.DB.prepare(
      'DELETE FROM deal_watches WHERE id = ? AND account_id = ?',
    )
      .bind(id, accountId)
      .run()

    return result.meta.changes > 0
  } catch {
    return false
  }
}

export async function markDealWatchSeen(
  env: TrolleyScoutEnv,
  accountId: string,
  id: string,
): Promise<boolean> {
  if (!hasTrolleyScoutDatabase(env)) {
    return false
  }

  try {
    const result = await env.DB.prepare(
      'UPDATE deal_watches SET seen_at = ? WHERE id = ? AND account_id = ? AND matched_at IS NOT NULL',
    )
      .bind(new Date().toISOString(), id, accountId)
      .run()

    return result.meta.changes > 0
  } catch {
    return false
  }
}

// Everything currently known to have a live deal, across every lane: retailer
// snapshots, structured feed items, and location-scouted promotions.
export async function loadWatchCorpus(env: TrolleyScoutEnv): Promise<WatchableDeal[]> {
  const nowIso = new Date().toISOString()
  const corpus: WatchableDeal[] = []

  try {
    const snapshots = await readDealSnapshots(env)

    for (const snapshot of snapshots.values()) {
      for (const deal of snapshot.deals) {
        corpus.push({
          imageUrl: deal.imageUrl,
          priceText: deal.priceText,
          productUrl: deal.productUrl,
          retailerName: deal.retailerName,
          sourceUrl: deal.sourceUrl,
          title: deal.title,
        })
      }
    }
  } catch {
    // Other corpus lanes still apply.
  }

  try {
    if (hasTrolleyScoutDatabase(env)) {
      const items = await listActiveDealItems(env, { limit: 200 })

      for (const item of items) {
        corpus.push({
          imageUrl: item.imageUrl,
          priceText: `R${(item.priceCents / 100).toFixed(2)}`,
          productUrl: item.productUrl,
          retailerName: item.retailerId,
          sourceUrl: item.sourceUrl,
          title: item.title,
        })
      }
    }
  } catch {
    // Ignore: feed items are one of three corpus lanes.
  }

  try {
    const promotions = await readAllStorePromotions(env, nowIso)

    for (const promotion of promotions) {
      if (promotion.kind === 'deal') {
        corpus.push({
          imageUrl: promotion.imageUrl,
          priceText: promotion.priceText,
          productUrl: promotion.productUrl,
          retailerName: promotion.storeName,
          sourceUrl: promotion.sourceUrl,
          title: promotion.title,
        })
      }
    }
  } catch {
    // Ignore: promotions are one of three corpus lanes.
  }

  return corpus
}

// Matches every pending watch against the current corpus. Called after scout
// lanes land new deals; cheap when nothing is pending.
export async function matchPendingWatches(env: TrolleyScoutEnv): Promise<number> {
  if (!hasTrolleyScoutDatabase(env)) {
    return 0
  }

  let pending: DealWatchRow[]

  try {
    const result = await env.DB.prepare(
      `SELECT id, query_text, normalized_query, created_at, matched_at, matched_deals_json, seen_at
        FROM deal_watches
        WHERE matched_at IS NULL
        LIMIT ?`,
    )
      .bind(MAX_PENDING_PER_SWEEP)
      .all<DealWatchRow>()
    pending = result.results
  } catch {
    return 0
  }

  if (pending.length === 0) {
    return 0
  }

  const corpus = await loadWatchCorpus(env)

  if (corpus.length === 0) {
    return 0
  }

  const nowIso = new Date().toISOString()
  let matched = 0

  for (const row of pending) {
    const matches = findWatchMatches(row.normalized_query, corpus)

    if (matches.length === 0) {
      continue
    }

    try {
      await env.DB.prepare(
        'UPDATE deal_watches SET matched_at = ?, matched_deals_json = ? WHERE id = ? AND matched_at IS NULL',
      )
        .bind(nowIso, JSON.stringify(matches), row.id)
        .run()
      matched += 1
    } catch {
      // Best-effort; the next sweep retries.
    }
  }

  return matched
}

function rowToWatch(row: DealWatchRow): DealWatch {
  let matches: DealWatchMatch[] = []

  if (row.matched_deals_json) {
    try {
      const parsed = JSON.parse(row.matched_deals_json)
      matches = Array.isArray(parsed) ? (parsed as DealWatchMatch[]) : []
    } catch {
      matches = []
    }
  }

  return {
    createdAt: row.created_at,
    id: row.id,
    matchedAt: row.matched_at ?? undefined,
    matches,
    queryText: row.query_text,
    seenAt: row.seen_at ?? undefined,
  }
}
