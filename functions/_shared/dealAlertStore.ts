import type { WatchableDeal } from '../../src/services/dealWatch'
import { readDealSiteFeedStrict, type DealSiteFeed } from './dealSiteScout'
import {
  readDealSnapshotsStrict,
  type DealSnapshot,
} from './dealSnapshotStore'
import { hasTrolleyScoutDatabase, type TrolleyScoutEnv } from './env'
import {
  readActiveStoreDealPromotionsStrict,
  type StorePromotion,
} from './locationStore'

export const MAX_DEAL_ALERT_BATCH_KEYS = 5_000
export const MAX_DEAL_ALERT_SNAPSHOT_KEYS = 20_000
export const MAX_DEAL_ALERT_RESPONSE_COUNT = 9_999
const MAX_STABLE_KEY_LENGTH = 200
// OFFSET paging reads O(pages²/2) rows per pass on D1, so larger pages cut
// billed row reads roughly linearly (200 → 1000 is ~5x cheaper per snapshot).
const SNAPSHOT_PAGE_SIZE = 1_000

type AlertIdentityDeal = WatchableDeal & {
  retailerName: string
  sourceUrl: string
  title: string
}

export interface DealAlertSnapshotDependencies {
  nowMs: () => number
  readDealSites: (env: TrolleyScoutEnv, nowMs?: number) => Promise<DealSiteFeed>
  readNormalizedDealsPage: (
    env: TrolleyScoutEnv,
    nowIso: string,
    limit: number,
    offset: number,
  ) => Promise<AlertIdentityDeal[]>
  readPromotionsPage: (
    env: TrolleyScoutEnv,
    nowIso: string,
    limit: number,
    offset: number,
  ) => Promise<StorePromotion[]>
  readSnapshots: (env: TrolleyScoutEnv) => Promise<Map<string, DealSnapshot>>
}

export interface DealAlertBatchResult {
  inserted: boolean
  newDealCount: number
  cursor?: number
}

export interface DealAlertSummary {
  countCapped: boolean
  latestCursor: number
  totalNewDealCount: number
}

export interface DealAlertCaptureDependencies {
  recordBatch: typeof recordGlobalDealAlertBatch
  snapshotKeys: typeof snapshotDealAlertKeys
}

export interface DealAlertCapture {
  beforeKeys?: string[]
  beforeSnapshotCount: number
  snapshotFailed: boolean
}

export interface DealAlertCaptureResult {
  afterSnapshotCount: number
  batchFailed: boolean
  batchInserted: boolean
  beforeSnapshotCount: number
  newDealCount: number
  snapshotFailed: boolean
}

export interface DealRefreshAlertDependencies extends Partial<DealAlertCaptureDependencies> {
  createdAt?: () => string
}

export async function beginDealAlertCapture(
  env: TrolleyScoutEnv,
  dependencies: Pick<Partial<DealAlertCaptureDependencies>, 'snapshotKeys'> = {},
): Promise<DealAlertCapture> {
  if (!hasTrolleyScoutDatabase(env)) {
    return { beforeSnapshotCount: 0, snapshotFailed: false }
  }

  try {
    const beforeKeys = await (dependencies.snapshotKeys ?? snapshotDealAlertKeys)(env)
    return {
      beforeKeys,
      beforeSnapshotCount: beforeKeys.length,
      snapshotFailed: false,
    }
  } catch {
    return { beforeSnapshotCount: 0, snapshotFailed: true }
  }
}

export async function finishDealAlertCapture(
  env: TrolleyScoutEnv,
  capture: DealAlertCapture,
  createdAt: string,
  dependencies: Partial<DealAlertCaptureDependencies> = {},
): Promise<DealAlertCaptureResult> {
  const result: DealAlertCaptureResult = {
    afterSnapshotCount: 0,
    batchFailed: false,
    batchInserted: false,
    beforeSnapshotCount: capture.beforeSnapshotCount,
    newDealCount: 0,
    snapshotFailed: capture.snapshotFailed,
  }
  if (!hasTrolleyScoutDatabase(env) || !capture.beforeKeys) {
    return result
  }

  let afterKeys: string[]
  try {
    afterKeys = await (dependencies.snapshotKeys ?? snapshotDealAlertKeys)(env)
    result.afterSnapshotCount = afterKeys.length
  } catch {
    result.snapshotFailed = true
    return result
  }

  try {
    const batch = await (
      dependencies.recordBatch ?? recordGlobalDealAlertBatch
    )(env, capture.beforeKeys, afterKeys, createdAt)
    result.batchInserted = batch.inserted
    result.newDealCount = batch.newDealCount
  } catch {
    result.batchFailed = true
  }
  return result
}

export async function runDealRefreshWithAlerts<T>(
  env: TrolleyScoutEnv,
  refresh: () => Promise<T>,
  dependencies: DealRefreshAlertDependencies = {},
): Promise<{ alerts: DealAlertCaptureResult; value: T }> {
  const capture = await beginDealAlertCapture(env, dependencies)
  let value: T | undefined
  let refreshError: unknown
  let refreshFailed = false
  try {
    value = await refresh()
  } catch (error) {
    refreshFailed = true
    refreshError = error
  }
  const alerts = await finishDealAlertCapture(
    env,
    capture,
    (dependencies.createdAt ?? (() => new Date().toISOString()))(),
    dependencies,
  )
  if (refreshFailed) {
    throw refreshError
  }
  return { alerts, value: value as T }
}

export async function snapshotDealAlertKeys(
  env: TrolleyScoutEnv,
  dependencies: Partial<DealAlertSnapshotDependencies> = {},
): Promise<string[]> {
  requireDatabase(env)
  const nowMs = (dependencies.nowMs ?? Date.now)()
  if (!Number.isFinite(nowMs)) {
    throw new TypeError('nowMs must return a finite timestamp.')
  }
  const nowIso = new Date(nowMs).toISOString()
  const [snapshots, normalizedDeals, promotions, siteFeed] = await Promise.all([
    (dependencies.readSnapshots ?? readDealSnapshotsStrict)(env),
    readEveryPage(
      env,
      nowIso,
      dependencies.readNormalizedDealsPage ?? readNormalizedDealsPageStrict,
    ),
    readEveryPage(
      env,
      nowIso,
      dependencies.readPromotionsPage ?? readActiveStoreDealPromotionsStrict,
    ),
    (dependencies.readDealSites ?? readDealSiteFeedStrict)(env, nowMs),
  ])
  const snapshotDeals = [...snapshots.values()].flatMap((snapshot) => snapshot.deals)
  const dealPromotions = promotions.filter((promotion) => promotion.kind === 'deal')

  const identities = [
    ...snapshotDeals.map(corpusDealIdentity),
    ...normalizedDeals.map(corpusDealIdentity),
    ...dealPromotions.map((promotion) => corpusDealIdentity({
      productUrl: promotion.productUrl,
      retailerName: promotion.storeName,
      sourceUrl: promotion.sourceUrl,
      title: promotion.title,
    })),
    ...siteFeed.deals.map((deal) => `site:${deal.source}:${deal.id.trim()}`),
  ]
  const keys = await Promise.all(identities.map(stableKey))
  // Cap by truncating the SORTED key set rather than throwing: hashed keys
  // sort stably, so before/after snapshots share the same cut-off boundary and
  // the new-deal diff stays consistent. Alerts degrade above the cap instead
  // of silently stopping (the old RangeError was swallowed by callers).
  return [...new Set(keys)].sort().slice(0, MAX_DEAL_ALERT_SNAPSHOT_KEYS)
}

export async function recordGlobalDealAlertBatch(
  env: TrolleyScoutEnv,
  beforeKeys: readonly string[],
  afterKeys: readonly string[],
  createdAt = new Date().toISOString(),
): Promise<DealAlertBatchResult> {
  requireDatabase(env)
  if (beforeKeys.length > MAX_DEAL_ALERT_SNAPSHOT_KEYS ||
      afterKeys.length > MAX_DEAL_ALERT_SNAPSHOT_KEYS) {
    throw new RangeError(
      `A deal alert snapshot cannot exceed ${MAX_DEAL_ALERT_SNAPSHOT_KEYS} rows.`,
    )
  }

  const before = new Set(normalizeKeys(beforeKeys))
  const added = normalizeKeys(afterKeys).filter((key) => !before.has(key))
  if (added.length === 0) {
    return { inserted: false, newDealCount: 0 }
  }
  if (added.length > MAX_DEAL_ALERT_BATCH_KEYS) {
    throw new RangeError(
      `A deal alert batch cannot exceed ${MAX_DEAL_ALERT_BATCH_KEYS} keys.`,
    )
  }
  if (!validInstant(createdAt)) {
    throw new TypeError('createdAt must be a valid ISO timestamp.')
  }

  const fingerprint = await sha256Hex(JSON.stringify(added))
  const result = await env.DB.prepare(
    `INSERT OR IGNORE INTO deal_alert_batches (
      batch_fingerprint, deal_count, deal_keys_json, created_at
    ) VALUES (?, ?, ?, ?)`,
  )
    .bind(fingerprint, added.length, JSON.stringify(added), createdAt)
    .run()
  const row = await env.DB.prepare(
    'SELECT cursor FROM deal_alert_batches WHERE batch_fingerprint = ?',
  )
    .bind(fingerprint)
    .first<{ cursor: number }>()

  return {
    cursor: row?.cursor,
    inserted: result.meta.changes > 0,
    newDealCount: added.length,
  }
}

export async function readDealAlertSummary(
  env: TrolleyScoutEnv,
  after?: number,
): Promise<DealAlertSummary> {
  requireDatabase(env)
  if (after !== undefined && (!Number.isSafeInteger(after) || after < 0)) {
    throw new RangeError('after must be a non-negative safe integer.')
  }

  const aggregate = await env.DB.prepare(
    `SELECT
      COALESCE(MAX(cursor), 0) AS latest_cursor,
      COALESCE(SUM(CASE WHEN cursor > ? THEN deal_count ELSE 0 END), 0) AS total
      FROM deal_alert_batches`,
  )
    .bind(after ?? Number.MAX_SAFE_INTEGER)
    .first<{ latest_cursor: number; total: number }>()
  const latestCursor = safeStoredInteger(aggregate?.latest_cursor)
  const total = after === undefined ? 0 : safeStoredInteger(aggregate?.total)

  return {
    countCapped: total > MAX_DEAL_ALERT_RESPONSE_COUNT,
    latestCursor,
    totalNewDealCount: Math.min(total, MAX_DEAL_ALERT_RESPONSE_COUNT),
  }
}

async function readEveryPage<T>(
  env: TrolleyScoutEnv,
  nowIso: string,
  reader: (
    env: TrolleyScoutEnv,
    nowIso: string,
    limit: number,
    offset: number,
  ) => Promise<T[]>,
): Promise<T[]> {
  const rows: T[] = []

  for (let offset = 0; ; offset += SNAPSHOT_PAGE_SIZE) {
    const page = await reader(env, nowIso, SNAPSHOT_PAGE_SIZE, offset)
    if (!Array.isArray(page) || page.length > SNAPSHOT_PAGE_SIZE) {
      throw new Error('A strict alert snapshot page returned an invalid row set.')
    }
    rows.push(...page)
    // At the cap, stop paging and work with what we have — reading further
    // costs O(offset) billed rows per page, and the snapshot itself truncates
    // deterministically. Throwing here used to kill alerts entirely.
    if (rows.length >= MAX_DEAL_ALERT_SNAPSHOT_KEYS) {
      return rows.slice(0, MAX_DEAL_ALERT_SNAPSHOT_KEYS)
    }
    if (page.length < SNAPSHOT_PAGE_SIZE) {
      return rows
    }
  }
}

async function readNormalizedDealsPageStrict(
  env: TrolleyScoutEnv,
  nowIso: string,
  limit: number,
  offset: number,
): Promise<AlertIdentityDeal[]> {
  requireDatabase(env)
  const result = await env.DB.prepare(
    `SELECT retailer_id, title, product_url, source_url
      FROM deal_items
      WHERE status = 'active' AND expires_at > ?
      ORDER BY expires_at ASC, retailer_id ASC, title ASC, id ASC
      LIMIT ? OFFSET ?`,
  )
    .bind(nowIso, limit, offset)
    .all<{
      product_url: string
      retailer_id: string
      source_url: string
      title: string
    }>()

  return result.results.map((row) => {
    if (!row.retailer_id || !row.title || !row.product_url || !row.source_url) {
      throw new Error('An active normalized deal row is missing identity fields.')
    }
    return {
      productUrl: row.product_url,
      retailerName: row.retailer_id,
      sourceUrl: row.source_url,
      title: row.title,
    }
  })
}

function corpusDealIdentity(deal: WatchableDeal) {
  return JSON.stringify({
    retailer: normalizedText(deal.retailerName),
    title: normalizedText(deal.title),
    url: canonicalUrl(deal.productUrl ?? deal.sourceUrl),
  })
}

function canonicalUrl(value: string | undefined) {
  if (!value) return ''
  try {
    const url = new URL(value)
    url.hash = ''
    for (const key of [...url.searchParams.keys()]) {
      const normalized = key.toLowerCase()
      if (
        normalized === 'ref' ||
        normalized === 'source' ||
        normalized === 'gclid' ||
        normalized === 'fbclid' ||
        normalized.startsWith('utm_')
      ) {
        url.searchParams.delete(key)
      }
    }
    url.searchParams.sort()
    return url.toString()
  } catch {
    return value.trim()
  }
}

function normalizedText(value: string | undefined) {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

async function stableKey(identity: string) {
  return `deal_${await sha256Hex(identity)}`
}

function normalizeKeys(values: readonly string[]) {
  const keys = values.map((value, index) => {
    const key = value.trim()
    if (!key || key.length > MAX_STABLE_KEY_LENGTH) {
      throw new TypeError(`keys[${index}] must be between 1 and ${MAX_STABLE_KEY_LENGTH} characters.`)
    }
    return key
  })
  return [...new Set(keys)].sort()
}

function requireDatabase(
  env: TrolleyScoutEnv,
): asserts env is TrolleyScoutEnv & { DB: D1Database } {
  if (!hasTrolleyScoutDatabase(env)) {
    throw new Error('Deal alerts require a database binding.')
  }
}

function validInstant(value: string) {
  return /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value))
}

function safeStoredInteger(value: number | undefined) {
  return Number.isSafeInteger(value) && (value ?? 0) >= 0 ? value! : 0
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
