import type {
  FeedCursor,
  RetailerDealCandidate,
  RetailerDealScope,
  RetailerPriceScope,
} from '../../src/services/retailerFeeds/types'
import { parseRetailerSlug } from '../../src/services/retailerFeeds/types'
import {
  hasTrolleyScoutDatabase,
  type TrolleyScoutD1Env,
  type TrolleyScoutEnv,
} from './env'

// Structured feeds are revisited every few hours. An undated observation gets
// twelve hours to be seen again before it falls out of active responses.
export const MISSING_VALID_TO_TTL_MS = 12 * 60 * 60 * 1_000

const MAX_UPSERT_ITEMS = 100
const MAX_FILTER_VALUES = 50
const MAX_LIST_LIMIT = 200

export type DealItemStatus = 'active' | 'expired' | 'inactive'
export type DealSourceRunStatus = 'failed' | 'partial' | 'success'

export interface StoredDealItem {
  capturedAt: string
  contentFingerprint: string
  createdAt: string
  evidenceText: string
  expiresAt: string
  id: string
  imageUrl?: string
  lastSeenAt: string
  priceCents: number
  previousPriceCents?: number
  productId: string
  productUrl: string
  promotionId: string
  retailerId: string
  savingText?: string
  scope: RetailerDealScope
  sourceKey: string
  sourceKind: RetailerDealCandidate['sourceKind']
  sourceUrl: string
  status: DealItemStatus
  termsText?: string
  title: string
  unitText?: string
  updatedAt: string
  validFrom?: string
  validTo?: string
}

export interface DealSourceRunInput {
  errorText?: string
  finishedAt?: string
  id?: string
  startedAt?: string
  status?: DealSourceRunStatus
}

export interface UpsertDealItemsOptions {
  candidates: readonly RetailerDealCandidate[]
  retailerId: string
  run?: DealSourceRunInput
  sourceKey: string
}

export interface UpsertDealItemsResult {
  processed: number
  rowIds: string[]
  runId: string
}

export type DealItemScopeFilter =
  | { type: 'national' }
  | { type: 'online' }
  | { regionIds: readonly string[]; type: 'province' }
  | { storeIds: readonly string[]; type: 'store' }

export interface ListActiveDealItemsOptions {
  limit?: number
  now?: string
  offset?: number
  retailerIds?: readonly string[]
  scope?: DealItemScopeFilter
  sourceKeys?: readonly string[]
}

export interface ExpireDealItemsOptions {
  now?: string
  retailerIds?: readonly string[]
  sourceKeys?: readonly string[]
}

export interface WriteSourceCursorOptions {
  cursor: FeedCursor
  sourceKey: string
  updatedAt?: string
}

interface NormalizedDealItem {
  capturedAt: string
  contentFingerprint: string
  evidenceText: string
  excludedStoreIds: string[]
  expiresAt: string
  id: string
  imageUrl: string | null
  priceCents: number
  previousPriceCents: number | null
  productId: string
  productUrl: string
  promotionId: string
  retailerId: string
  savingText: string | null
  scopeKey: string
  scopeRegionIds: string[]
  scopeStoreIds: string[]
  scopeType: RetailerPriceScope
  sourceKind: RetailerDealCandidate['sourceKind']
  sourceUrl: string
  termsText: string | null
  title: string
  unitText: string | null
  validFrom: string | null
  validTo: string | null
}

interface DealItemRow {
  captured_at: string
  content_fingerprint: string
  created_at: string
  evidence_text: string
  excluded_store_ids: string
  expires_at: string
  id: string
  image_url: string | null
  last_seen_at: string
  current_price_cents: number
  previous_price_cents: number | null
  source_product_id: string
  product_url: string
  promotion_id: string
  retailer_id: string
  saving_text: string | null
  scope_region_ids: string
  scope_store_ids: string
  scope_type: RetailerPriceScope
  source_key: string
  source_kind: RetailerDealCandidate['sourceKind']
  source_url: string
  status: DealItemStatus
  terms_text: string | null
  title: string
  unit_text: string | null
  updated_at: string
  valid_from: string | null
  valid_to: string | null
}

interface SourceCursorRow {
  cursor_kind: FeedCursor['kind']
  cursor_value: string
}

export async function upsertDealItems(
  env: TrolleyScoutEnv,
  options: UpsertDealItemsOptions,
): Promise<UpsertDealItemsResult> {
  const db = requireDatabase(env)
  const sourceKey = requiredText(options.sourceKey, 'sourceKey', 300)
  const retailerId = requiredRetailerId(options.retailerId)

  if (options.candidates.length > MAX_UPSERT_ITEMS) {
    throw new RangeError(`candidates cannot exceed ${MAX_UPSERT_ITEMS} rows per call`)
  }

  const runStatus = options.run?.status ?? 'success'
  if (!isRunStatus(runStatus)) {
    throw new TypeError('run.status is invalid')
  }
  if (runStatus === 'failed' && options.candidates.length > 0) {
    throw new TypeError('A failed source run cannot write deal candidates')
  }

  const now = new Date().toISOString()
  const startedAt = strictInstant(options.run?.startedAt ?? now, 'run.startedAt')
  const finishedAt = strictInstant(options.run?.finishedAt ?? now, 'run.finishedAt')
  if (Date.parse(startedAt) > Date.parse(finishedAt)) {
    throw new TypeError('run.startedAt cannot be later than run.finishedAt')
  }
  const errorText = optionalText(options.run?.errorText, 'run.errorText', 2_000)
  const runId = options.run?.id
    ? requiredText(options.run.id, 'run.id', 200)
    : `run_${crypto.randomUUID()}`

  // Validate and normalize the full batch before preparing any write.
  const normalizedCandidates = await Promise.all(options.candidates.map(async (candidate, index) => {
    if (candidate.retailerId !== retailerId) {
      throw new TypeError(`candidates[${index}].retailerId does not match retailerId`)
    }
    return normalizeDealCandidate(candidate, index)
  }))
  const normalized = deduplicateDealItems(normalizedCandidates)

  const upsert = db.prepare(
    `INSERT INTO deal_items (
      id, retailer_id, source_key, last_run_id, source_product_id, promotion_id, title,
      current_price_cents, previous_price_cents, image_url, saving_text,
      terms_text, unit_text, evidence_text, product_url, source_url, source_kind,
      captured_at, valid_from, valid_to, expires_at, scope_type, scope_store_ids,
      scope_region_ids, excluded_store_ids, scope_key, content_fingerprint,
      status, created_at, updated_at, last_seen_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, 'active', ?, ?, ?
    )
    ON CONFLICT (id) DO UPDATE SET
      source_key = excluded.source_key,
      last_run_id = excluded.last_run_id,
      title = excluded.title,
      current_price_cents = excluded.current_price_cents,
      previous_price_cents = excluded.previous_price_cents,
      image_url = excluded.image_url,
      saving_text = excluded.saving_text,
      terms_text = excluded.terms_text,
      unit_text = excluded.unit_text,
      evidence_text = excluded.evidence_text,
      product_url = excluded.product_url,
      source_url = excluded.source_url,
      source_kind = excluded.source_kind,
      captured_at = excluded.captured_at,
      valid_from = excluded.valid_from,
      valid_to = excluded.valid_to,
      expires_at = excluded.expires_at,
      scope_store_ids = excluded.scope_store_ids,
      scope_region_ids = excluded.scope_region_ids,
      excluded_store_ids = excluded.excluded_store_ids,
      content_fingerprint = excluded.content_fingerprint,
      status = 'active',
      updated_at = CASE
        WHEN deal_items.content_fingerprint <> excluded.content_fingerprint
          THEN excluded.updated_at
        ELSE deal_items.updated_at
      END,
      last_seen_at = CASE
        WHEN deal_items.last_seen_at < excluded.last_seen_at
          THEN excluded.last_seen_at
        ELSE deal_items.last_seen_at
      END
    WHERE excluded.captured_at >= deal_items.captured_at`,
  )

  const audit = db.prepare(
    `INSERT INTO deal_source_runs (
      id, source_key, retailer_id, status, started_at, finished_at,
      candidate_count, written_count, error_text, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
  ).bind(
    runId,
    sourceKey,
    retailerId,
    runStatus,
    startedAt,
    finishedAt,
    options.candidates.length,
    errorText,
    finishedAt,
  )

  const upserts = normalized.map((item) => upsert.bind(
    item.id,
    item.retailerId,
    sourceKey,
    runId,
    item.productId,
    item.promotionId,
    item.title,
    item.priceCents,
    item.previousPriceCents,
    item.imageUrl,
    item.savingText,
    item.termsText,
    item.unitText,
    item.evidenceText,
    item.productUrl,
    item.sourceUrl,
    item.sourceKind,
    item.capturedAt,
    item.validFrom,
    item.validTo,
    item.expiresAt,
    item.scopeType,
    JSON.stringify(item.scopeStoreIds),
    JSON.stringify(item.scopeRegionIds),
    JSON.stringify(item.excludedStoreIds),
    item.scopeKey,
    item.contentFingerprint,
    finishedAt,
    finishedAt,
    item.capturedAt,
  ))

  const batchResults = await db.batch([audit, ...upserts])
  const writeResults = batchResults.slice(1)
  const writtenItems = normalized.filter((_, index) => writeResults[index]?.meta.changes > 0)

  return {
    processed: writtenItems.length,
    rowIds: writtenItems.map((item) => item.id),
    runId,
  }
}

export async function listActiveDealItems(
  env: TrolleyScoutEnv,
  options: ListActiveDealItemsOptions = {},
): Promise<StoredDealItem[]> {
  const db = requireDatabase(env)
  const now = strictInstant(options.now ?? new Date().toISOString(), 'now')
  const limit = boundedInteger(options.limit ?? 100, 'limit', 1, MAX_LIST_LIMIT)
  const offset = boundedInteger(options.offset ?? 0, 'offset', 0, 10_000)
  const where = ["status = 'active'", 'expires_at > ?']
  const bindings: Array<number | string> = [now]

  addInFilter(where, bindings, 'retailer_id', options.retailerIds, 'retailerIds')
  addInFilter(where, bindings, 'source_key', options.sourceKeys, 'sourceKeys')

  if (options.scope) {
    where.push('scope_type = ?')
    bindings.push(options.scope.type)

    if (options.scope.type === 'store') {
      const ids = filterValues(options.scope.storeIds, 'scope.storeIds')
      where.push(
        `EXISTS (
          SELECT 1 FROM json_each(deal_items.scope_store_ids) AS stored_scope
          WHERE CAST(stored_scope.value AS TEXT) IN (${placeholders(ids.length)})
        )`,
      )
      bindings.push(...ids)
    } else if (options.scope.type === 'province') {
      const ids = filterValues(options.scope.regionIds, 'scope.regionIds')
      where.push(
        `EXISTS (
          SELECT 1 FROM json_each(deal_items.scope_region_ids) AS stored_scope
          WHERE CAST(stored_scope.value AS TEXT) IN (${placeholders(ids.length)})
        )`,
      )
      bindings.push(...ids)
    }
  }

  bindings.push(limit, offset)
  const result = await db.prepare(
    `SELECT
      id, retailer_id, source_key, source_product_id, promotion_id, title,
      current_price_cents, previous_price_cents, image_url, saving_text,
      terms_text, unit_text, evidence_text, product_url, source_url, source_kind,
      captured_at, valid_from, valid_to, expires_at, scope_type, scope_store_ids,
      scope_region_ids, excluded_store_ids, content_fingerprint, status,
      created_at, updated_at, last_seen_at
    FROM deal_items
    WHERE ${where.join(' AND ')}
    ORDER BY expires_at ASC, retailer_id ASC, title ASC, id ASC
    LIMIT ? OFFSET ?`,
  ).bind(...bindings).all<DealItemRow>()

  return result.results.map(mapDealItemRow)
}

export async function expireDealItems(
  env: TrolleyScoutEnv,
  options: ExpireDealItemsOptions = {},
): Promise<number> {
  const db = requireDatabase(env)
  const now = strictInstant(options.now ?? new Date().toISOString(), 'now')
  const where = ["status = 'active'", 'expires_at <= ?']
  const bindings: Array<number | string> = [now, now]

  addInFilter(where, bindings, 'retailer_id', options.retailerIds, 'retailerIds')
  addInFilter(where, bindings, 'source_key', options.sourceKeys, 'sourceKeys')

  const result = await db.prepare(
    `UPDATE deal_items
      SET status = 'expired', updated_at = ?
      WHERE ${where.join(' AND ')}`,
  ).bind(...bindings).run()

  return result.meta.changes
}

export async function readSourceCursor(
  env: TrolleyScoutEnv,
  sourceKeyInput: string,
): Promise<FeedCursor | undefined> {
  const db = requireDatabase(env)
  const sourceKey = requiredText(sourceKeyInput, 'sourceKey', 300)
  const row = await db.prepare(
    'SELECT cursor_kind, cursor_value FROM deal_source_cursors WHERE source_key = ?',
  ).bind(sourceKey).first<SourceCursorRow>()

  if (!row) {
    return undefined
  }
  if (row.cursor_kind === 'token') {
    if (row.cursor_value.length === 0) {
      throw new Error(`Stored cursor for ${sourceKey} has an empty token`)
    }
    return { kind: 'token', token: row.cursor_value }
  }

  const value = Number(row.cursor_value)
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Stored cursor for ${sourceKey} is malformed`)
  }
  return row.cursor_kind === 'offset'
    ? { kind: 'offset', offset: value }
    : { kind: 'page', page: value }
}

export async function writeSourceCursor(
  env: TrolleyScoutEnv,
  options: WriteSourceCursorOptions,
): Promise<void> {
  const db = requireDatabase(env)
  const sourceKey = requiredText(options.sourceKey, 'sourceKey', 300)
  const updatedAt = strictInstant(options.updatedAt ?? new Date().toISOString(), 'updatedAt')
  const value = cursorValue(options.cursor)

  await db.prepare(
    `INSERT INTO deal_source_cursors (source_key, cursor_kind, cursor_value, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT (source_key) DO UPDATE SET
        cursor_kind = excluded.cursor_kind,
        cursor_value = excluded.cursor_value,
        updated_at = excluded.updated_at
      WHERE excluded.updated_at >= deal_source_cursors.updated_at`,
  ).bind(sourceKey, options.cursor.kind, value, updatedAt).run()
}

function requireDatabase(env: TrolleyScoutEnv): TrolleyScoutD1Env['DB'] {
  if (!hasTrolleyScoutDatabase(env)) {
    throw new Error('The deal item store requires a D1 database binding')
  }
  return env.DB
}

async function normalizeDealCandidate(
  candidate: RetailerDealCandidate,
  index: number,
): Promise<NormalizedDealItem> {
  const field = (name: string) => `candidates[${index}].${name}`
  const retailerId = requiredRetailerId(candidate.retailerId)
  const productId = requiredText(candidate.productId, field('productId'), 300)
  const promotionId = requiredText(candidate.promotionId, field('promotionId'), 300)
  const title = requiredText(candidate.title, field('title'), 500)
  const evidenceText = requiredText(candidate.evidenceText, field('evidenceText'), 4_000)
  const productUrl = publicUrl(candidate.productUrl, field('productUrl'))
  const sourceUrl = publicUrl(candidate.sourceUrl, field('sourceUrl'))
  const imageUrl = optionalPublicUrl(candidate.imageUrl, field('imageUrl'))
  const savingText = optionalText(candidate.savingText, field('savingText'), 500)
  const termsText = optionalText(candidate.termsText, field('termsText'), 2_000)
  const unitText = optionalText(candidate.unitText, field('unitText'), 200)
  const capturedAt = strictInstant(candidate.capturedAt, field('capturedAt'))
  const validFrom = optionalWindowBoundary(candidate.validFrom, 'start', field('validFrom'))
  const validTo = optionalWindowBoundary(candidate.validTo, 'end', field('validTo'))
  const capturedMs = Date.parse(capturedAt)
  const expiresAt = validTo ?? new Date(capturedMs + MISSING_VALID_TO_TTL_MS).toISOString()

  if (validFrom && Date.parse(validFrom) > capturedMs) {
    throw new TypeError(`${field('validFrom')} is later than capturedAt`)
  }
  if (Date.parse(expiresAt) < capturedMs) {
    throw new TypeError(`${field('validTo')} is earlier than capturedAt`)
  }
  if (validFrom && Date.parse(validFrom) > Date.parse(expiresAt)) {
    throw new TypeError(`${field('validFrom')} is later than validTo`)
  }
  if (!Number.isSafeInteger(candidate.priceCents) || candidate.priceCents < 0) {
    throw new TypeError(`${field('priceCents')} must be a non-negative integer`)
  }
  if (
    candidate.previousPriceCents !== undefined &&
    (!Number.isSafeInteger(candidate.previousPriceCents) || candidate.previousPriceCents < 0)
  ) {
    throw new TypeError(`${field('previousPriceCents')} must be a non-negative integer`)
  }
  if (candidate.sourceKind !== 'structured' && candidate.sourceKind !== 'catalogue') {
    throw new TypeError(`${field('sourceKind')} is invalid`)
  }

  const scope = normalizeScope(candidate.scope, field('scope'))
  const scopeKey = buildScopeKey(scope)
  const identity = JSON.stringify({
    productId,
    promotionId,
    retailerId,
    scopeKey,
  })
  const fingerprintInput = JSON.stringify({
    evidenceText,
    imageUrl,
    priceCents: candidate.priceCents,
    previousPriceCents: candidate.previousPriceCents ?? null,
    productUrl,
    savingText,
    scopeKey,
    sourceKind: candidate.sourceKind,
    sourceUrl,
    termsText,
    title,
    unitText,
    validFrom,
    validTo,
  })
  const [identityHash, contentFingerprint] = await Promise.all([
    sha256Hex(identity),
    sha256Hex(fingerprintInput),
  ])

  return {
    capturedAt,
    contentFingerprint,
    evidenceText,
    excludedStoreIds: scope.excludedStoreIds,
    expiresAt,
    id: `deal_${identityHash}`,
    imageUrl,
    priceCents: candidate.priceCents,
    previousPriceCents: candidate.previousPriceCents ?? null,
    productId,
    productUrl,
    promotionId,
    retailerId,
    savingText,
    scopeKey,
    scopeRegionIds: scope.regionIds,
    scopeStoreIds: scope.storeIds,
    scopeType: scope.type,
    sourceKind: candidate.sourceKind,
    sourceUrl,
    termsText,
    title,
    unitText,
    validFrom,
    validTo,
  }
}

function deduplicateDealItems(items: readonly NormalizedDealItem[]) {
  const unique = new Map<string, NormalizedDealItem>()

  for (const item of items) {
    const current = unique.get(item.id)
    if (!current || compareDealFreshness(item, current) > 0) {
      unique.set(item.id, item)
    }
  }

  return [...unique.values()].sort((left, right) => left.id.localeCompare(right.id))
}

function compareDealFreshness(left: NormalizedDealItem, right: NormalizedDealItem) {
  const capturedDifference = Date.parse(left.capturedAt) - Date.parse(right.capturedAt)
  if (capturedDifference !== 0) {
    return capturedDifference
  }

  // Equal capture times use the fingerprint as a stable tie-breaker, so input
  // ordering cannot decide which source representation reaches D1.
  return left.contentFingerprint.localeCompare(right.contentFingerprint)
}

function mapDealItemRow(row: DealItemRow): StoredDealItem {
  const storeIds = storedStringArray(row.scope_store_ids, 'scope_store_ids')
  const regionIds = storedStringArray(row.scope_region_ids, 'scope_region_ids')
  const excludedStoreIds = storedStringArray(row.excluded_store_ids, 'excluded_store_ids')
  const scope = storedScope(row.scope_type, storeIds, regionIds, excludedStoreIds)

  return {
    capturedAt: row.captured_at,
    contentFingerprint: row.content_fingerprint,
    createdAt: row.created_at,
    evidenceText: row.evidence_text,
    expiresAt: row.expires_at,
    id: row.id,
    imageUrl: row.image_url ?? undefined,
    lastSeenAt: row.last_seen_at,
    priceCents: row.current_price_cents,
    previousPriceCents: row.previous_price_cents ?? undefined,
    productId: row.source_product_id,
    productUrl: row.product_url,
    promotionId: row.promotion_id,
    retailerId: row.retailer_id,
    savingText: row.saving_text ?? undefined,
    scope,
    sourceKey: row.source_key,
    sourceKind: row.source_kind,
    sourceUrl: row.source_url,
    status: row.status,
    termsText: row.terms_text ?? undefined,
    title: row.title,
    unitText: row.unit_text ?? undefined,
    updatedAt: row.updated_at,
    validFrom: row.valid_from ?? undefined,
    validTo: row.valid_to ?? undefined,
  }
}

function storedScope(
  type: RetailerPriceScope,
  storeIds: string[],
  regionIds: string[],
  excludedStoreIds: string[],
): RetailerDealScope {
  const exclusions = excludedStoreIds.length > 0
    ? { excludedStoreIds: excludedStoreIds as [string, ...string[]] }
    : {}

  if (type === 'national') {
    return { type, ...exclusions }
  }
  if (type === 'online') {
    return { type }
  }
  if (type === 'province' && regionIds.length > 0) {
    return { type, regionIds: regionIds as [string, ...string[]], ...exclusions }
  }
  if (type === 'store' && storeIds.length > 0) {
    return { type, storeIds: storeIds as [string, ...string[]], ...exclusions }
  }
  throw new Error(`Stored ${type} deal has invalid scope identifiers`)
}

function normalizeScope(scope: RetailerDealScope, field: string) {
  const excludedStoreIds = scope.type === 'online'
    ? []
    : normalizeIdentifierArray(scope.excludedStoreIds ?? [], `${field}.excludedStoreIds`, true)

  if (scope.type === 'national' || scope.type === 'online') {
    return { excludedStoreIds, regionIds: [], storeIds: [], type: scope.type }
  }
  if (scope.type === 'province') {
    return {
      excludedStoreIds,
      regionIds: normalizeIdentifierArray(scope.regionIds, `${field}.regionIds`),
      storeIds: [],
      type: scope.type,
    }
  }
  if (scope.type === 'store') {
    return {
      excludedStoreIds,
      regionIds: [],
      storeIds: normalizeIdentifierArray(scope.storeIds, `${field}.storeIds`),
      type: scope.type,
    }
  }
  throw new TypeError(`${field}.type is invalid`)
}

function buildScopeKey(scope: ReturnType<typeof normalizeScope>) {
  return JSON.stringify({
    excludedStoreIds: scope.excludedStoreIds,
    regionIds: scope.regionIds,
    storeIds: scope.storeIds,
    type: scope.type,
  })
}

function normalizeIdentifierArray(
  values: readonly string[],
  field: string,
  allowEmpty = false,
) {
  if (!Array.isArray(values) || (!allowEmpty && values.length === 0)) {
    throw new TypeError(`${field} must contain at least one identifier`)
  }
  if (values.length > MAX_FILTER_VALUES) {
    throw new RangeError(`${field} cannot exceed ${MAX_FILTER_VALUES} identifiers`)
  }
  const normalized = [...new Set(values.map((value, index) =>
    requiredText(value, `${field}[${index}]`, 300),
  ))].sort()
  if (!allowEmpty && normalized.length === 0) {
    throw new TypeError(`${field} must contain at least one identifier`)
  }
  return normalized
}

function storedStringArray(value: string, field: string): string[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error(`Stored ${field} is malformed`)
  }
  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'string')) {
    throw new Error(`Stored ${field} is malformed`)
  }
  return parsed
}

function addInFilter(
  where: string[],
  bindings: Array<number | string>,
  column: string,
  values: readonly string[] | undefined,
  field: string,
) {
  if (values === undefined) {
    return
  }
  const normalized = filterValues(values, field)
  where.push(`${column} IN (${placeholders(normalized.length)})`)
  bindings.push(...normalized)
}

function filterValues(values: readonly string[], field: string) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new TypeError(`${field} must contain at least one value`)
  }
  if (values.length > MAX_FILTER_VALUES) {
    throw new RangeError(`${field} cannot exceed ${MAX_FILTER_VALUES} values`)
  }
  return [...new Set(values.map((value, index) =>
    requiredText(value, `${field}[${index}]`, 300),
  ))]
}

function placeholders(length: number) {
  return Array.from({ length }, () => '?').join(', ')
}

function cursorValue(cursor: FeedCursor) {
  if (cursor.kind === 'token') {
    return requiredText(cursor.token, 'cursor.token', 2_000)
  }
  const value = cursor.kind === 'offset' ? cursor.offset : cursor.page
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`cursor.${cursor.kind} must be a non-negative integer`)
  }
  return String(value)
}

function isRunStatus(value: string): value is DealSourceRunStatus {
  return value === 'success' || value === 'partial' || value === 'failed'
}

function requiredRetailerId(value: string) {
  const parsed = parseRetailerSlug(value)
  if (!parsed) {
    throw new TypeError('retailerId must be a lowercase retailer slug')
  }
  return parsed
}

function requiredText(value: unknown, field: string, maxLength: number) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${field} must be a non-empty string`)
  }
  const normalized = value.trim()
  if (normalized.length > maxLength) {
    throw new RangeError(`${field} cannot exceed ${maxLength} characters`)
  }
  return normalized
}

function optionalText(value: unknown, field: string, maxLength: number): string | null {
  return value === undefined || value === null
    ? null
    : requiredText(value, field, maxLength)
}

function publicUrl(value: unknown, field: string) {
  const normalized = requiredText(value, field, 2_048)
  let parsed: URL
  try {
    parsed = new URL(normalized)
  } catch {
    throw new TypeError(`${field} must be an absolute public URL`)
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new TypeError(`${field} must use HTTP or HTTPS`)
  }
  return parsed.toString()
}

function optionalPublicUrl(value: unknown, field: string): string | null {
  return value === undefined || value === null ? null : publicUrl(value, field)
}

function strictInstant(value: string, field: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new TypeError(`${field} must be an ISO timestamp with a timezone`)
  }
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) {
    throw new TypeError(`${field} must be a valid ISO timestamp`)
  }
  return new Date(parsed).toISOString()
}

function optionalWindowBoundary(
  value: string | undefined,
  boundary: 'end' | 'start',
  field: string,
): string | null {
  if (value === undefined) {
    return null
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    if (!isCalendarDate(value)) {
      throw new TypeError(`${field} must be a valid calendar date`)
    }
    const localTime = boundary === 'start' ? '00:00:00.000' : '23:59:59.999'
    return new Date(Date.parse(`${value}T${localTime}+02:00`)).toISOString()
  }
  return strictInstant(value, field)
}

function isCalendarDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
}

function boundedInteger(value: number, field: string, minimum: number, maximum: number) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${field} must be between ${minimum} and ${maximum}`)
  }
  return value
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
