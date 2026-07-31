/**
 * Usage counters and per-member limits for the admin console.
 *
 * "Deals viewed" showed zero for every member because it was read off
 * member_deal_activity - the personalisation signal store, which only records
 * for members who opted into deal learning, and which nothing ever wrote a
 * `deal_opened` row to in the first place.
 *
 * These counters are deliberately thin: a number, a first sighting and a last
 * sighting. No titles, no search terms, no product ids. Someone who wants no
 * personalisation is still counted, because how much of the app a member uses
 * is an operational figure rather than a profile of their shopping.
 */

import { hasTrolleyScoutDatabase, type TrolleyScoutEnv } from './env'

export const USAGE_METRICS = [
  'deal_view',
  'property_view',
  'voucher_view',
  'window_shopping_seconds',
] as const

export type UsageMetric = (typeof USAGE_METRICS)[number]

/** One burst of window-shopping time can never add more than this. */
const MAX_SECONDS_PER_REPORT = 30 * 60

export interface MemberUsageCounts {
  dealViewCount: number
  propertyViewCount: number
  voucherViewCount: number
  windowShoppingSeconds: number
}

export interface MemberLimitOverrides {
  compareBlocked: boolean
  note?: string
  scoutChatBlocked: boolean
  scoutMessagesPerDay?: number
  updatedAt?: string
  visibleCatalogues?: number
  visibleDeals?: number
}

export const EMPTY_USAGE: MemberUsageCounts = {
  dealViewCount: 0,
  propertyViewCount: 0,
  voucherViewCount: 0,
  windowShoppingSeconds: 0,
}

export function isUsageMetric(value: unknown): value is UsageMetric {
  return typeof value === 'string' && (USAGE_METRICS as readonly string[]).includes(value)
}

/**
 * Adds to a counter. Counting views is never worth failing a request over, so
 * callers treat a rejection as "not counted" rather than an error.
 */
export async function recordMemberUsage(
  env: TrolleyScoutEnv,
  accountId: string,
  metric: UsageMetric,
  amount = 1,
  now = new Date(),
): Promise<boolean> {
  if (!hasTrolleyScoutDatabase(env) || !accountId) return false

  const bounded = metric === 'window_shopping_seconds'
    ? Math.min(MAX_SECONDS_PER_REPORT, Math.max(1, Math.trunc(amount)))
    : Math.min(50, Math.max(1, Math.trunc(amount)))
  if (!Number.isFinite(bounded)) return false

  const at = now.toISOString()
  await env.DB.prepare(
    `INSERT INTO member_usage_counters (account_id, metric, value, first_at, last_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (account_id, metric) DO UPDATE SET
        value = member_usage_counters.value + excluded.value,
        last_at = excluded.last_at`,
  )
    .bind(accountId, metric, bounded, at, at)
    .run()

  return true
}

export async function readMemberUsage(
  env: TrolleyScoutEnv,
  accountId: string,
): Promise<MemberUsageCounts> {
  if (!hasTrolleyScoutDatabase(env)) return { ...EMPTY_USAGE }

  const rows = await env.DB.prepare(
    'SELECT metric, value FROM member_usage_counters WHERE account_id = ?',
  )
    .bind(accountId)
    .all<{ metric: string; value: number }>()

  return usageFromRows(rows.results)
}

/** Counters for many members at once, so the console avoids an N+1. */
export async function readUsageForAccounts(
  env: TrolleyScoutEnv,
  accountIds: readonly string[],
): Promise<Map<string, MemberUsageCounts>> {
  const usage = new Map<string, MemberUsageCounts>()
  if (!hasTrolleyScoutDatabase(env) || accountIds.length === 0) return usage

  const placeholders = accountIds.map(() => '?').join(',')
  const rows = await env.DB.prepare(
    `SELECT account_id, metric, value FROM member_usage_counters
      WHERE account_id IN (${placeholders})`,
  )
    .bind(...accountIds)
    .all<{ account_id: string; metric: string; value: number }>()

  for (const row of rows.results) {
    const current = usage.get(row.account_id) ?? { ...EMPTY_USAGE }
    applyMetric(current, row.metric, Number(row.value))
    usage.set(row.account_id, current)
  }

  return usage
}

export async function readMemberLimits(
  env: TrolleyScoutEnv,
  accountId: string,
): Promise<MemberLimitOverrides> {
  const empty: MemberLimitOverrides = { compareBlocked: false, scoutChatBlocked: false }
  if (!hasTrolleyScoutDatabase(env)) return empty

  const row = await env.DB.prepare(
    `SELECT visible_deals, visible_catalogues, scout_messages_per_day,
      scout_chat_blocked, compare_blocked, note, updated_at
      FROM member_limit_overrides WHERE account_id = ?`,
  )
    .bind(accountId)
    .first<{
      compare_blocked: number
      note: string | null
      scout_chat_blocked: number
      scout_messages_per_day: number | null
      updated_at: string | null
      visible_catalogues: number | null
      visible_deals: number | null
    }>()

  if (!row) return empty

  return {
    compareBlocked: row.compare_blocked === 1,
    scoutChatBlocked: row.scout_chat_blocked === 1,
    ...(row.note ? { note: row.note } : {}),
    ...(row.scout_messages_per_day === null
      ? {}
      : { scoutMessagesPerDay: Number(row.scout_messages_per_day) }),
    ...(row.updated_at ? { updatedAt: row.updated_at } : {}),
    ...(row.visible_catalogues === null
      ? {}
      : { visibleCatalogues: Number(row.visible_catalogues) }),
    ...(row.visible_deals === null ? {} : { visibleDeals: Number(row.visible_deals) }),
  }
}

export async function setMemberLimits(
  env: TrolleyScoutEnv,
  accountId: string,
  limits: MemberLimitOverrides,
  updatedBy: string,
): Promise<MemberLimitOverrides> {
  if (!hasTrolleyScoutDatabase(env)) {
    return { compareBlocked: false, scoutChatBlocked: false }
  }

  await env.DB.prepare(
    `INSERT INTO member_limit_overrides (
      account_id, visible_deals, visible_catalogues, scout_messages_per_day,
      scout_chat_blocked, compare_blocked, note, updated_at, updated_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
    ON CONFLICT (account_id) DO UPDATE SET
      visible_deals = excluded.visible_deals,
      visible_catalogues = excluded.visible_catalogues,
      scout_messages_per_day = excluded.scout_messages_per_day,
      scout_chat_blocked = excluded.scout_chat_blocked,
      compare_blocked = excluded.compare_blocked,
      note = excluded.note,
      updated_at = CURRENT_TIMESTAMP,
      updated_by = excluded.updated_by`,
  )
    .bind(
      accountId,
      boundedLimit(limits.visibleDeals),
      boundedLimit(limits.visibleCatalogues),
      boundedLimit(limits.scoutMessagesPerDay),
      limits.scoutChatBlocked ? 1 : 0,
      limits.compareBlocked ? 1 : 0,
      limits.note?.trim().slice(0, 400) || null,
      updatedBy,
    )
    .run()

  return readMemberLimits(env, accountId)
}

/** A ceiling is either a sensible positive number or absent — never zero. */
function boundedLimit(value: number | undefined): number | null {
  if (value === undefined || !Number.isFinite(value)) return null
  const whole = Math.trunc(value)
  return whole > 0 ? Math.min(1_000_000, whole) : null
}

function usageFromRows(
  rows: ReadonlyArray<{ metric: string; value: number }>,
): MemberUsageCounts {
  const counts = { ...EMPTY_USAGE }
  for (const row of rows) applyMetric(counts, row.metric, Number(row.value))
  return counts
}

function applyMetric(counts: MemberUsageCounts, metric: string, value: number): void {
  if (!Number.isFinite(value)) return
  if (metric === 'deal_view') counts.dealViewCount = value
  if (metric === 'property_view') counts.propertyViewCount = value
  if (metric === 'voucher_view') counts.voucherViewCount = value
  if (metric === 'window_shopping_seconds') counts.windowShoppingSeconds = value
}
