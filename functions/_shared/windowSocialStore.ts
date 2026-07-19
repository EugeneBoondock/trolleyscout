// Storage for Window Shopping social features and cross-device account data:
//  - member_state: opaque per-account JSON blobs (near-me history, saved
//    addresses, taste profile) so a shopper's data survives logout/reinstall.
//  - window_saves: DB-backed saves with a global count; a save is pruned once
//    its deal leaves the live deal-site feed (auto-subtract).
//  - deal_comments: comments tied to a deal id, pruned with the deal.

import { hasTrolleyScoutDatabase, type TrolleyScoutEnv } from './env'
import { readDealSiteFeed } from './dealSiteScout'

// Sources whose deals rotate out; a save/comment is stale once the id is gone.
const DEAL_SITE_SOURCES = new Set(['onedayonly', 'hyperli', 'daddysdeals', 'myrunway'])

interface SaveRow {
  id: string
  deal_id: string
  source: string | null
  deal_json: string
  created_at: string
}

interface CommentRow {
  id: string
  deal_id: string
  account_id: string
  author: string
  body: string
  created_at: string
}

// ---------------------------------------------------------------------------
// member_state — generic per-account key/value
// ---------------------------------------------------------------------------

export async function getMemberState(
  env: TrolleyScoutEnv,
  accountId: string,
  key: string,
): Promise<unknown> {
  if (!hasTrolleyScoutDatabase(env)) return undefined
  try {
    const row = await env.DB.prepare(
      'SELECT value_json FROM member_state WHERE account_id = ? AND state_key = ?',
    )
      .bind(accountId, key)
      .first<{ value_json: string }>()
    if (!row) return undefined
    return JSON.parse(row.value_json)
  } catch {
    return undefined
  }
}

export async function setMemberState(
  env: TrolleyScoutEnv,
  accountId: string,
  key: string,
  value: unknown,
): Promise<boolean> {
  if (!hasTrolleyScoutDatabase(env)) return false
  try {
    await env.DB.prepare(
      `INSERT INTO member_state (account_id, state_key, value_json, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT (account_id, state_key) DO UPDATE SET
          value_json = excluded.value_json,
          updated_at = excluded.updated_at`,
    )
      .bind(accountId, key, JSON.stringify(value ?? null), new Date().toISOString())
      .run()
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// window_saves — DB-backed saves + global counts
// ---------------------------------------------------------------------------

async function liveDealSiteIds(env: TrolleyScoutEnv): Promise<Set<string>> {
  try {
    const feed = await readDealSiteFeed(env)
    return new Set(feed.deals.map((deal) => deal.id).filter(Boolean))
  } catch {
    return new Set()
  }
}

function isStale(row: SaveRow, liveIds: Set<string>): boolean {
  // Only prune rotating deal-site deals we can prove are gone; never blank a
  // list just because the live feed failed to load.
  if (liveIds.size === 0) return false
  return DEAL_SITE_SOURCES.has(row.source ?? '') && !liveIds.has(row.deal_id)
}

export async function listWindowSaves(
  env: TrolleyScoutEnv,
  accountId: string,
): Promise<Array<Record<string, unknown>>> {
  if (!hasTrolleyScoutDatabase(env)) return []
  try {
    const result = await env.DB.prepare(
      'SELECT id, deal_id, source, deal_json, created_at FROM window_saves WHERE account_id = ? ORDER BY created_at DESC',
    )
      .bind(accountId)
      .all<SaveRow>()
    const liveIds = await liveDealSiteIds(env)
    const kept: Array<Record<string, unknown>> = []
    const staleIds: string[] = []
    for (const row of result.results) {
      if (isStale(row, liveIds)) {
        staleIds.push(row.id)
        continue
      }
      try {
        kept.push(JSON.parse(row.deal_json))
      } catch {
        staleIds.push(row.id)
      }
    }
    if (staleIds.length > 0) {
      await deleteRowsById(env, 'window_saves', staleIds)
    }
    return kept
  } catch {
    return []
  }
}

export async function saveWindowDeal(
  env: TrolleyScoutEnv,
  accountId: string,
  deal: Record<string, unknown>,
): Promise<{ count: number; saved: boolean }> {
  const dealId = String(deal.id ?? '')
  if (!hasTrolleyScoutDatabase(env) || !dealId) return { count: 0, saved: false }
  try {
    await env.DB.prepare(
      `INSERT INTO window_saves (id, account_id, deal_id, source, deal_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT (account_id, deal_id) DO NOTHING`,
    )
      .bind(
        crypto.randomUUID(),
        accountId,
        dealId,
        typeof deal.source === 'string' ? deal.source : null,
        JSON.stringify(deal),
        new Date().toISOString(),
      )
      .run()
    return { count: await countForDeal(env, dealId), saved: true }
  } catch {
    return { count: 0, saved: false }
  }
}

export async function unsaveWindowDeal(
  env: TrolleyScoutEnv,
  accountId: string,
  dealId: string,
): Promise<{ count: number; saved: boolean }> {
  if (!hasTrolleyScoutDatabase(env) || !dealId) return { count: 0, saved: false }
  try {
    await env.DB.prepare('DELETE FROM window_saves WHERE account_id = ? AND deal_id = ?')
      .bind(accountId, dealId)
      .run()
    return { count: await countForDeal(env, dealId), saved: false }
  } catch {
    return { count: 0, saved: false }
  }
}

async function countForDeal(env: TrolleyScoutEnv, dealId: string): Promise<number> {
  if (!hasTrolleyScoutDatabase(env)) return 0
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM window_saves WHERE deal_id = ?')
    .bind(dealId)
    .first<{ n: number }>()
  return row?.n ?? 0
}

// Save counts + whether this account saved each, for a batch of deal ids.
export async function getWindowSaveCounts(
  env: TrolleyScoutEnv,
  accountId: string,
  dealIds: string[],
): Promise<Record<string, { count: number; saved: boolean }>> {
  const out: Record<string, { count: number; saved: boolean }> = {}
  const ids = dealIds.filter(Boolean).slice(0, 200)
  if (!hasTrolleyScoutDatabase(env) || ids.length === 0) return out
  try {
    const placeholders = ids.map(() => '?').join(',')
    const counts = await env.DB.prepare(
      `SELECT deal_id, COUNT(*) AS n FROM window_saves WHERE deal_id IN (${placeholders}) GROUP BY deal_id`,
    )
      .bind(...ids)
      .all<{ deal_id: string; n: number }>()
    const mine = await env.DB.prepare(
      `SELECT deal_id FROM window_saves WHERE account_id = ? AND deal_id IN (${placeholders})`,
    )
      .bind(accountId, ...ids)
      .all<{ deal_id: string }>()
    const mineSet = new Set(mine.results.map((r) => r.deal_id))
    for (const id of ids) out[id] = { count: 0, saved: mineSet.has(id) }
    for (const row of counts.results) {
      out[row.deal_id] = { count: row.n, saved: mineSet.has(row.deal_id) }
    }
    return out
  } catch {
    return out
  }
}

// ---------------------------------------------------------------------------
// deal_comments
// ---------------------------------------------------------------------------

export async function listDealComments(
  env: TrolleyScoutEnv,
  dealId: string,
): Promise<Array<{ id: string; author: string; body: string; createdAt: string }>> {
  if (!hasTrolleyScoutDatabase(env) || !dealId) return []
  try {
    const result = await env.DB.prepare(
      'SELECT id, author, body, created_at FROM deal_comments WHERE deal_id = ? ORDER BY created_at DESC LIMIT 200',
    )
      .bind(dealId)
      .all<CommentRow>()
    return result.results.map((row) => ({
      id: row.id,
      author: row.author,
      body: row.body,
      createdAt: row.created_at,
    }))
  } catch {
    return []
  }
}

export async function addDealComment(
  env: TrolleyScoutEnv,
  accountId: string,
  author: string,
  dealId: string,
  body: string,
): Promise<{ id: string; author: string; body: string; createdAt: string } | undefined> {
  const text = body.trim().slice(0, 500)
  if (!hasTrolleyScoutDatabase(env) || !dealId || text.length === 0) return undefined
  try {
    const id = crypto.randomUUID()
    const createdAt = new Date().toISOString()
    await env.DB.prepare(
      `INSERT INTO deal_comments (id, deal_id, account_id, author, body, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, dealId, accountId, author.slice(0, 60) || 'Shopper', text, createdAt)
      .run()
    return { id, author: author.slice(0, 60) || 'Shopper', body: text, createdAt }
  } catch {
    return undefined
  }
}

async function deleteRowsById(env: TrolleyScoutEnv, table: string, ids: string[]): Promise<void> {
  if (!hasTrolleyScoutDatabase(env) || ids.length === 0) return
  const placeholders = ids.map(() => '?').join(',')
  try {
    await env.DB.prepare(`DELETE FROM ${table} WHERE id IN (${placeholders})`).bind(...ids).run()
  } catch {
    // best-effort
  }
}

// Maintenance: drop saves and comments for deal-site deals no longer live, so
// counts fall as stores pull deals. Safe to call from the scheduled scout.
export async function pruneWindowSocial(env: TrolleyScoutEnv): Promise<void> {
  if (!hasTrolleyScoutDatabase(env)) return
  const liveIds = await liveDealSiteIds(env)
  if (liveIds.size === 0) return
  try {
    const saves = await env.DB.prepare(
      'SELECT id, deal_id, source, deal_json, created_at FROM window_saves',
    ).all<SaveRow>()
    const staleSaveIds = saves.results.filter((r) => isStale(r, liveIds)).map((r) => r.id)
    await deleteRowsById(env, 'window_saves', staleSaveIds)

    // Comments only exist for deal-site/discovery deals; prune those whose deal
    // is a known-gone deal-site id.
    const comments = await env.DB.prepare(
      'SELECT DISTINCT deal_id FROM deal_comments',
    ).all<{ deal_id: string }>()
    const staleDealIds = comments.results
      .map((r) => r.deal_id)
      .filter((id) => id.includes(':') && DEAL_SITE_SOURCES.has(id.split(':')[0]) && !liveIds.has(id))
    for (const dealId of staleDealIds) {
      await env.DB.prepare('DELETE FROM deal_comments WHERE deal_id = ?').bind(dealId).run()
    }
  } catch {
    // best-effort
  }
}
