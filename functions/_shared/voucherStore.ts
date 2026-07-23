import type { Voucher, VoucherCandidate } from '../../src/services/vouchers/types'
import type { FeedCursor } from '../../src/services/retailerFeeds/types'
import { hasTrolleyScoutDatabase, type TrolleyScoutD1Env, type TrolleyScoutEnv } from './env'

export const UNDATED_VOUCHER_TTL_MS = 12 * 60 * 60 * 1_000

const MAX_BATCH_SIZE = 100
const MAX_LIST_LIMIT = 200
const OFFICIAL_VOUCHER_HOSTS: Record<string, readonly string[]> = {
  'amazon-za': ['amazon.co.za'],
  boxer: ['boxer.co.za'],
  builders: ['builders.co.za'],
  woolworths: ['woolworths.co.za'],
}

interface VoucherRow {
  account_required: number
  benefit_text: string
  captured_at: string
  claimed: number
  created_at: string
  evidence_text: string
  expires_at: string
  external_voucher_id: string
  id: string
  image_url: string | null
  last_seen_at: string
  product_id: string | null
  product_title: string | null
  public_code: string | null
  public_reusable: number
  redemption_mode: Voucher['redemptionMode']
  redemption_url: string
  retailer_id: string
  source_url: string
  status: Voucher['status']
  terms_text: string | null
  title: string
  updated_at: string
  valid_from: string | null
  valid_to: string | null
  voucher_kind: Voucher['voucherKind']
}

interface NormalizedVoucher {
  accountRequired: boolean
  benefitText: string
  capturedAt: string
  code: string | null
  codeHash: string | null
  contentFingerprint: string
  evidenceText: string
  expiresAt: string
  externalId: string
  identityKey: string
  imageUrl: string | null
  productId: string | null
  productTitle: string | null
  publicReusable: boolean
  redemptionMode: Voucher['redemptionMode']
  redemptionUrl: string
  retailerId: string
  sourceUrl: string
  termsText: string | null
  title: string
  validFrom: string | null
  validTo: string | null
  voucherKind: Voucher['voucherKind']
}

export async function upsertVouchers(env: TrolleyScoutEnv, input: {
  candidates: readonly VoucherCandidate[]
  errorText?: string
  retailerId: string
  sourceKey: string
  status?: 'failed' | 'partial' | 'success'
}) {
  const db = requireDatabase(env)
  const sourceKey = requiredText(input.sourceKey, 'sourceKey', 300)
  const retailerId = requiredSlug(input.retailerId, 'retailerId')
  const status = input.status ?? 'success'

  if (input.candidates.length > MAX_BATCH_SIZE) {
    throw new RangeError(`candidates cannot exceed ${MAX_BATCH_SIZE} rows per call`)
  }
  if (!['failed', 'partial', 'success'].includes(status)) {
    throw new TypeError('status is invalid')
  }
  if (status === 'failed' && input.candidates.length > 0) {
    throw new TypeError('A failed run cannot write voucher candidates')
  }

  const now = new Date().toISOString()
  const normalized = deduplicate(await Promise.all(input.candidates.map((candidate, index) =>
    normalizeVoucher(candidate, retailerId, index),
  )))
  const runId = `voucher_run_${crypto.randomUUID()}`

  const audit = db.prepare(
    `INSERT INTO voucher_source_runs (
      id, source_key, retailer_id, status, candidate_count, written_count,
      error_text, started_at, finished_at, created_at
    ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
  ).bind(
    runId,
    sourceKey,
    retailerId,
    status,
    input.candidates.length,
    optionalText(input.errorText, 'errorText', 2_000),
    now,
    now,
    now,
  )

  const statement = db.prepare(
    `INSERT INTO vouchers (
      id, identity_key, last_run_id, retailer_id, source_key, external_voucher_id,
      product_id, product_title, title, benefit_text, terms_text, evidence_text,
      voucher_kind, redemption_mode, redemption_url, source_url, image_url,
      public_reusable, public_code, code_hash, account_required, captured_at,
      valid_from, valid_to, expires_at, content_fingerprint, status,
      created_at, updated_at, last_seen_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      'active', ?, ?, ?
    )
    ON CONFLICT (identity_key) DO UPDATE SET
      last_run_id = excluded.last_run_id,
      source_key = excluded.source_key,
      product_title = excluded.product_title,
      title = excluded.title,
      benefit_text = excluded.benefit_text,
      terms_text = excluded.terms_text,
      evidence_text = excluded.evidence_text,
      voucher_kind = excluded.voucher_kind,
      redemption_mode = excluded.redemption_mode,
      redemption_url = excluded.redemption_url,
      source_url = excluded.source_url,
      image_url = excluded.image_url,
      public_reusable = excluded.public_reusable,
      public_code = excluded.public_code,
      code_hash = excluded.code_hash,
      account_required = excluded.account_required,
      captured_at = excluded.captured_at,
      valid_from = excluded.valid_from,
      valid_to = excluded.valid_to,
      expires_at = excluded.expires_at,
      content_fingerprint = excluded.content_fingerprint,
      status = 'active',
      updated_at = CASE
        WHEN vouchers.content_fingerprint <> excluded.content_fingerprint THEN excluded.updated_at
        ELSE vouchers.updated_at
      END,
      last_seen_at = CASE
        WHEN vouchers.last_seen_at < excluded.last_seen_at THEN excluded.last_seen_at
        ELSE vouchers.last_seen_at
      END
    WHERE excluded.captured_at >= vouchers.captured_at`,
  )

  const writes = normalized.map((voucher) => statement.bind(
    `voucher_${voucher.identityKey}`,
    voucher.identityKey,
    runId,
    voucher.retailerId,
    sourceKey,
    voucher.externalId,
    voucher.productId,
    voucher.productTitle,
    voucher.title,
    voucher.benefitText,
    voucher.termsText,
    voucher.evidenceText,
    voucher.voucherKind,
    voucher.redemptionMode,
    voucher.redemptionUrl,
    voucher.sourceUrl,
    voucher.imageUrl,
    voucher.publicReusable ? 1 : 0,
    voucher.code,
    voucher.codeHash,
    voucher.accountRequired ? 1 : 0,
    voucher.capturedAt,
    voucher.validFrom,
    voucher.validTo,
    voucher.expiresAt,
    voucher.contentFingerprint,
    now,
    now,
    voucher.capturedAt,
  ))

  const results = await db.batch([audit, ...writes])
  const written = normalized.filter((_, index) => results[index + 1]?.meta.changes > 0)

  return {
    processed: written.length,
    rowIds: written.map((voucher) => `voucher_${voucher.identityKey}`),
    runId,
  }
}

export async function listActiveVouchers(env: TrolleyScoutEnv, options: {
  accountId?: string
  limit?: number
  now?: string
  offset?: number
  retailerId?: string
} = {}): Promise<Voucher[]> {
  const db = requireDatabase(env)
  const now = strictInstant(options.now ?? new Date().toISOString(), 'now')
  const limit = boundedInteger(options.limit ?? 100, 'limit', 1, MAX_LIST_LIMIT)
  const offset = boundedInteger(options.offset ?? 0, 'offset', 0, 10_000)
  const retailerId = options.retailerId ? requiredSlug(options.retailerId, 'retailerId') : undefined
  const accountId = options.accountId?.trim() || ''
  const where = [
    "vouchers.status = 'active'",
    'vouchers.expires_at > ?',
    '(vouchers.valid_from IS NULL OR vouchers.valid_from <= ?)',
  ]
  const bindings: Array<number | string> = [accountId, now, now]

  if (retailerId) {
    where.push('vouchers.retailer_id = ?')
    bindings.push(retailerId)
  }
  bindings.push(limit, offset)

  // Name every column the mapper reads instead of `vouchers.*` so code_hash —
  // an internal value that must never leave the DB layer — can never leak
  // into the API response, even if a future column is added to the table.
  const rows = await db.prepare(
    `SELECT
      vouchers.id, vouchers.retailer_id, vouchers.external_voucher_id, vouchers.product_id,
      vouchers.product_title, vouchers.title, vouchers.benefit_text, vouchers.terms_text,
      vouchers.evidence_text, vouchers.voucher_kind, vouchers.redemption_mode,
      vouchers.redemption_url, vouchers.source_url, vouchers.image_url, vouchers.public_reusable,
      vouchers.public_code, vouchers.account_required, vouchers.captured_at, vouchers.valid_from,
      vouchers.valid_to, vouchers.expires_at, vouchers.status, vouchers.created_at,
      vouchers.updated_at, vouchers.last_seen_at,
      CASE WHEN member_voucher_claims.id IS NULL THEN 0 ELSE 1 END AS claimed
      FROM vouchers
      LEFT JOIN member_voucher_claims
        ON member_voucher_claims.voucher_id = vouchers.id
        AND member_voucher_claims.account_id = ?
      WHERE ${where.join(' AND ')}
      ORDER BY vouchers.retailer_id, vouchers.external_voucher_id, vouchers.id
      LIMIT ? OFFSET ?`,
  ).bind(...bindings).all<VoucherRow>()

  return rows.results.map(mapVoucherRow)
}

export async function claimVoucher(
  env: TrolleyScoutEnv,
  accountId: string | undefined,
  voucherId: string,
) {
  const db = requireDatabase(env)
  if (!accountId?.trim()) {
    return { claimed: false, issue: 'Sign in before saving a voucher.' }
  }
  const normalizedId = requiredText(voucherId, 'voucherId', 200)
  const now = new Date().toISOString()
  const voucher = await db.prepare(
    `SELECT id FROM vouchers
      WHERE id = ?
        AND status = 'active'
        AND expires_at > ?
        AND (valid_from IS NULL OR valid_from <= ?)`,
  ).bind(normalizedId, now, now).first<{ id: string }>()
  if (!voucher) {
    return { claimed: false, issue: 'Voucher is no longer active.' }
  }

  await db.prepare(
    `INSERT INTO member_voucher_claims (id, account_id, voucher_id, claimed_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT (account_id, voucher_id) DO NOTHING`,
  ).bind(`claim_${await sha256Hex(`${accountId}:${normalizedId}`)}`, accountId, normalizedId, now).run()

  return { claimed: true, voucherId: normalizedId }
}

export async function countActiveVouchers(
  env: TrolleyScoutEnv,
  nowInput = new Date().toISOString(),
) {
  const db = requireDatabase(env)
  const now = strictInstant(nowInput, 'now')
  const row = await db.prepare(
    `SELECT COUNT(*) AS total FROM vouchers
      WHERE status = 'active'
        AND expires_at > ?
        AND (valid_from IS NULL OR valid_from <= ?)`,
  ).bind(now, now).first<{ total: number }>()
  return Number(row?.total ?? 0)
}

export async function unclaimVoucher(
  env: TrolleyScoutEnv,
  accountId: string | undefined,
  voucherId: string,
) {
  const db = requireDatabase(env)
  if (!accountId?.trim()) {
    return false
  }
  const result = await db.prepare(
    'DELETE FROM member_voucher_claims WHERE account_id = ? AND voucher_id = ?',
  ).bind(accountId, requiredText(voucherId, 'voucherId', 200)).run()
  return result.meta.changes > 0
}

export async function expireVouchers(env: TrolleyScoutEnv, nowInput = new Date().toISOString()) {
  const db = requireDatabase(env)
  const now = strictInstant(nowInput, 'now')
  const result = await db.prepare(
    "UPDATE vouchers SET status = 'expired', updated_at = ? WHERE status = 'active' AND expires_at <= ?",
  ).bind(now, now).run()
  return result.meta.changes
}

export async function readVoucherSourceCursor(
  env: TrolleyScoutEnv,
  sourceKeyInput: string,
): Promise<FeedCursor | undefined> {
  const db = requireDatabase(env)
  const sourceKey = requiredText(sourceKeyInput, 'sourceKey', 300)
  const row = await db.prepare(
    'SELECT cursor_kind, cursor_value FROM voucher_source_cursors WHERE source_key = ?',
  ).bind(sourceKey).first<{ cursor_kind: FeedCursor['kind']; cursor_value: string }>()

  if (!row) {
    return undefined
  }
  if (row.cursor_kind === 'token') {
    return { kind: 'token', token: requiredText(row.cursor_value, 'stored cursor token', 4_000) }
  }
  const value = Number(row.cursor_value)
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Stored voucher cursor for ${sourceKey} is malformed`)
  }
  return row.cursor_kind === 'offset'
    ? { kind: 'offset', offset: value }
    : { kind: 'page', page: value }
}

export async function writeVoucherSourceCursor(
  env: TrolleyScoutEnv,
  sourceKeyInput: string,
  cursor: FeedCursor,
  updatedAtInput = new Date().toISOString(),
) {
  const db = requireDatabase(env)
  const sourceKey = requiredText(sourceKeyInput, 'sourceKey', 300)
  const updatedAt = strictInstant(updatedAtInput, 'updatedAt')
  const value = cursor.kind === 'token'
    ? requiredText(cursor.token, 'cursor.token', 4_000)
    : String(cursor.kind === 'offset'
      ? boundedInteger(cursor.offset, 'cursor.offset', 0, 1_000_000)
      : boundedInteger(cursor.page, 'cursor.page', 0, 1_000_000))

  await db.prepare(
    `INSERT INTO voucher_source_cursors (source_key, cursor_kind, cursor_value, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT (source_key) DO UPDATE SET
        cursor_kind = excluded.cursor_kind,
        cursor_value = excluded.cursor_value,
        updated_at = excluded.updated_at
      WHERE excluded.updated_at >= voucher_source_cursors.updated_at`,
  ).bind(sourceKey, cursor.kind, value, updatedAt).run()
}

function requireDatabase(env: TrolleyScoutEnv): TrolleyScoutD1Env['DB'] {
  if (!hasTrolleyScoutDatabase(env)) {
    throw new Error('Voucher storage requires a D1 database binding')
  }
  return env.DB
}

async function normalizeVoucher(
  candidate: VoucherCandidate,
  expectedRetailerId: string,
  index: number,
): Promise<NormalizedVoucher> {
  const field = (name: string) => `candidates[${index}].${name}`
  const retailerId = requiredSlug(candidate.retailerId, field('retailerId'))
  if (retailerId !== expectedRetailerId) {
    throw new TypeError(`${field('retailerId')} does not match retailerId`)
  }
  const externalId = requiredText(candidate.externalId, field('externalId'), 300)
  const productId = optionalText(candidate.productId, field('productId'), 300)
  const title = requiredText(candidate.title, field('title'), 500)
  const productTitle = optionalText(candidate.productTitle, field('productTitle'), 500)
  const benefitText = requiredText(candidate.benefitText, field('benefitText'), 1_000)
  const termsText = optionalText(candidate.termsText, field('termsText'), 4_000)
  const evidenceText = requiredText(candidate.evidenceText, field('evidenceText'), 4_000)
  const capturedAt = strictInstant(candidate.capturedAt, field('capturedAt'))
  const validFrom = windowBoundary(candidate.validFrom, 'start', field('validFrom'))
  const validTo = windowBoundary(candidate.validTo, 'end', field('validTo'))
  const expiresAt = validTo ?? new Date(Date.parse(capturedAt) + UNDATED_VOUCHER_TTL_MS).toISOString()
  const redemptionUrl = officialRetailerUrl(
    candidate.redemptionUrl,
    retailerId,
    field('redemptionUrl'),
  )
  const sourceUrl = officialRetailerUrl(candidate.sourceUrl, retailerId, field('sourceUrl'))
  const imageUrl = candidate.imageUrl ? publicUrl(candidate.imageUrl, field('imageUrl')) : null

  if (Date.parse(expiresAt) < Date.parse(capturedAt)) {
    throw new TypeError(`${field('validTo')} is earlier than capturedAt`)
  }
  if (validFrom && validTo && Date.parse(validFrom) > Date.parse(validTo)) {
    throw new TypeError(`${field('validFrom')} cannot be later than ${field('validTo')}`)
  }
  if (!['loyalty_offer', 'product_coupon', 'public_code'].includes(candidate.voucherKind)) {
    throw new TypeError(`${field('voucherKind')} is invalid`)
  }
  if (!['automatic', 'clip', 'code', 'loyalty'].includes(candidate.redemptionMode)) {
    throw new TypeError(`${field('redemptionMode')} is invalid`)
  }

  const publicReusable = candidate.publicReusable === true
  if (publicReusable && !candidate.code) {
    throw new TypeError(`${field('code')} is required for a reusable public voucher`)
  }
  if (candidate.voucherKind === 'public_code' && !publicReusable) {
    throw new TypeError(`${field('publicReusable')} is required for public_code vouchers`)
  }
  const code = publicReusable ? requiredText(candidate.code, field('code'), 100) : null
  const codeHash = code ? await sha256Hex(code.toUpperCase()) : null
  const identityKey = await sha256Hex(JSON.stringify({ externalId, productId, retailerId }))
  const contentFingerprint = await sha256Hex(JSON.stringify({
    accountRequired: candidate.accountRequired === true,
    benefitText,
    codeHash,
    evidenceText,
    expiresAt,
    imageUrl,
    productTitle,
    publicReusable,
    redemptionMode: candidate.redemptionMode,
    redemptionUrl,
    sourceUrl,
    termsText,
    title,
    validFrom,
    validTo,
    voucherKind: candidate.voucherKind,
  }))

  return {
    accountRequired: candidate.accountRequired === true,
    benefitText,
    capturedAt,
    code,
    codeHash,
    contentFingerprint,
    evidenceText,
    expiresAt,
    externalId,
    identityKey,
    imageUrl,
    productId,
    productTitle,
    publicReusable,
    redemptionMode: candidate.redemptionMode,
    redemptionUrl,
    retailerId,
    sourceUrl,
    termsText,
    title,
    validFrom,
    validTo,
    voucherKind: candidate.voucherKind,
  }
}

function deduplicate(vouchers: NormalizedVoucher[]) {
  const unique = new Map<string, NormalizedVoucher>()
  for (const voucher of vouchers) {
    const current = unique.get(voucher.identityKey)
    if (!current || voucher.capturedAt >= current.capturedAt) {
      unique.set(voucher.identityKey, voucher)
    }
  }
  return [...unique.values()].sort((left, right) => left.identityKey.localeCompare(right.identityKey))
}

function mapVoucherRow(row: VoucherRow): Voucher {
  return {
    accountRequired: row.account_required === 1,
    benefitText: row.benefit_text,
    capturedAt: row.captured_at,
    claimed: row.claimed === 1,
    code: row.public_code ?? undefined,
    createdAt: row.created_at,
    evidenceText: row.evidence_text,
    expiresAt: row.expires_at,
    externalId: row.external_voucher_id,
    id: row.id,
    imageUrl: row.image_url ?? undefined,
    lastSeenAt: row.last_seen_at,
    productId: row.product_id ?? undefined,
    productTitle: row.product_title ?? undefined,
    publicReusable: row.public_reusable === 1,
    redemptionMode: row.redemption_mode,
    redemptionUrl: row.redemption_url,
    retailerId: row.retailer_id,
    sourceUrl: row.source_url,
    status: row.status,
    termsText: row.terms_text ?? undefined,
    title: row.title,
    updatedAt: row.updated_at,
    validFrom: row.valid_from ?? undefined,
    validTo: row.valid_to ?? undefined,
    voucherKind: row.voucher_kind,
  }
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

function optionalText(value: unknown, field: string, maxLength: number) {
  return value === undefined || value === null ? null : requiredText(value, field, maxLength)
}

function requiredSlug(value: unknown, field: string) {
  const slug = requiredText(value, field, 100)
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new TypeError(`${field} must be a lowercase slug`)
  }
  return slug
}

function publicUrl(value: unknown, field: string) {
  const text = requiredText(value, field, 2_048)
  let url: URL
  try {
    url = new URL(text)
  } catch {
    throw new TypeError(`${field} must be an absolute public URL`)
  }
  if (url.protocol !== 'https:') {
    throw new TypeError(`${field} must use HTTPS`)
  }
  if (url.username || url.password || !isPublicHostname(url.hostname)) {
    throw new TypeError(`${field} must use a public HTTPS URL`)
  }
  return url.toString()
}

function officialRetailerUrl(value: unknown, retailerId: string, field: string) {
  const safeUrl = publicUrl(value, field)
  const officialHosts = OFFICIAL_VOUCHER_HOSTS[retailerId]
  if (!officialHosts) {
    return safeUrl
  }
  const hostname = new URL(safeUrl).hostname.toLowerCase()
  if (!officialHosts.some((root) => hostname === root || hostname.endsWith(`.${root}`))) {
    throw new TypeError(`${field} must use an official retailer URL`)
  }
  return safeUrl
}

function isPublicHostname(value: string) {
  const hostname = value.toLowerCase().replace(/^\[|\]$/g, '')
  return hostname.includes('.') &&
    !hostname.includes(':') &&
    !/^[\d.]+$/.test(hostname) &&
    hostname !== 'localhost' &&
    !hostname.endsWith('.localhost') &&
    !hostname.endsWith('.local') &&
    !hostname.endsWith('.internal') &&
    !hostname.endsWith('.lan')
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

function windowBoundary(value: string | undefined, edge: 'end' | 'start', field: string) {
  if (!value) {
    return null
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    if (!isCalendarDate(value)) {
      throw new TypeError(`${field} must be a valid date`)
    }
    const time = edge === 'start' ? '00:00:00.000' : '23:59:59.999'
    const parsed = Date.parse(`${value}T${time}+02:00`)
    if (!Number.isFinite(parsed)) {
      throw new TypeError(`${field} must be a valid date`)
    }
    return new Date(parsed).toISOString()
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
