import type { DealReport, DealReportDraft, DealReportReason, DealReportStatus } from '../../src/types'
import type { TrolleyScoutEnv } from './env'

const reasons = new Set<DealReportReason>([
  'price_wrong',
  'expired',
  'unavailable',
  'wrong_item',
  'other',
])
const statuses = new Set<DealReportStatus>(['pending', 'confirmed', 'dismissed', 'resolved'])

interface DealReportRow {
  account_id: string
  country_code: string
  created_at: string
  deal_id: string
  id: string
  note: string | null
  product_url: string | null
  reason: string
  retailer_id: string
  retailer_name: string
  source_url: string
  status: string
  title: string
  updated_at: string
}

export async function submitDealReport(
  env: TrolleyScoutEnv,
  accountId: string,
  countryCode: string,
  draft: DealReportDraft,
): Promise<{ issues?: string[]; report?: DealReport }> {
  if (!env.DB) return { issues: ['Deal reporting is unavailable right now.'] }

  const input = validateDraft(draft)
  if (input.issues) return { issues: input.issues }

  const id = `deal-report-${crypto.randomUUID()}`
  const timestamp = new Date().toISOString()
  await env.DB.prepare(
    `INSERT INTO deal_reports (
      id, deal_id, account_id, country_code, retailer_id, retailer_name,
      title, source_url, product_url, reason, note, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    ON CONFLICT (account_id, deal_id) DO UPDATE SET
      country_code = excluded.country_code,
      retailer_id = excluded.retailer_id,
      retailer_name = excluded.retailer_name,
      title = excluded.title,
      source_url = excluded.source_url,
      product_url = excluded.product_url,
      reason = excluded.reason,
      note = excluded.note,
      status = 'pending',
      updated_at = excluded.updated_at`,
  ).bind(
    id,
    input.value.dealId,
    accountId,
    countryCode,
    input.value.retailerId,
    input.value.retailerName,
    input.value.title,
    input.value.sourceUrl,
    input.value.productUrl ?? null,
    input.value.reason,
    input.value.note ?? null,
    timestamp,
    timestamp,
  ).run()

  const row = await env.DB.prepare(
    `SELECT id, deal_id, account_id, country_code, retailer_id, retailer_name,
      title, source_url, product_url, reason, note, status, created_at, updated_at
     FROM deal_reports WHERE account_id = ? AND deal_id = ?`,
  ).bind(accountId, input.value.dealId).first<DealReportRow>()

  return row ? { report: fromRow(row) } : { issues: ['The report could not be saved.'] }
}

export async function listDealReports(
  env: TrolleyScoutEnv,
  status: DealReportStatus | 'all' = 'pending',
): Promise<DealReport[]> {
  if (!env.DB) return []
  const filter = status === 'all' ? '' : 'WHERE status = ?'
  const statement = env.DB.prepare(
    `SELECT id, deal_id, account_id, country_code, retailer_id, retailer_name,
      title, source_url, product_url, reason, note, status, created_at, updated_at
     FROM deal_reports ${filter}
     ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, created_at DESC
     LIMIT 200`,
  )
  const result = status === 'all'
    ? await statement.all<DealReportRow>()
    : await statement.bind(status).all<DealReportRow>()
  return result.results.map(fromRow)
}

export async function moderateDealReport(
  env: TrolleyScoutEnv,
  id: string,
  status: DealReportStatus,
): Promise<{ changed: boolean; issues?: string[] }> {
  if (!env.DB) return { changed: false, issues: ['Deal reporting is unavailable right now.'] }
  if (!id.trim() || !statuses.has(status) || status === 'pending') {
    return { changed: false, issues: ['Choose a report and a review outcome.'] }
  }
  const result = await env.DB.prepare(
    `UPDATE deal_reports SET status = ?, updated_at = ? WHERE id = ?`,
  ).bind(status, new Date().toISOString(), id.trim()).run()
  return { changed: (result.meta.changes ?? 0) > 0 }
}

function validateDraft(draft: DealReportDraft):
  | { issues: string[]; value?: never }
  | { issues?: never; value: DealReportDraft } {
  const dealId = text(draft.dealId, 180)
  const retailerId = text(draft.retailerId, 80).toLowerCase()
  const retailerName = text(draft.retailerName, 120)
  const title = text(draft.title, 200)
  const sourceUrl = safeUrl(draft.sourceUrl)
  const productUrl = draft.productUrl ? safeUrl(draft.productUrl) : undefined
  const note = optionalText(draft.note, 500)

  if (!dealId || !retailerId || !retailerName || !title || !sourceUrl || !reasons.has(draft.reason)) {
    return { issues: ['Choose a reason and include the deal source details.'] }
  }
  if (draft.productUrl && !productUrl) return { issues: ['The product link is invalid.'] }
  if (draft.reason === 'other' && !note) return { issues: ['Add a short note for this report.'] }

  return {
    value: {
      dealId,
      note,
      productUrl,
      reason: draft.reason,
      retailerId,
      retailerName,
      sourceUrl,
      title,
    },
  }
}

function fromRow(row: DealReportRow): DealReport {
  return {
    accountId: row.account_id,
    countryCode: row.country_code,
    createdAt: row.created_at,
    dealId: row.deal_id,
    id: row.id,
    note: row.note ?? undefined,
    productUrl: row.product_url ?? undefined,
    reason: reasons.has(row.reason as DealReportReason)
      ? row.reason as DealReportReason
      : 'other',
    retailerId: row.retailer_id,
    retailerName: row.retailer_name,
    sourceUrl: row.source_url,
    status: statuses.has(row.status as DealReportStatus)
      ? row.status as DealReportStatus
      : 'pending',
    title: row.title,
    updatedAt: row.updated_at,
  }
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : ''
}

function optionalText(value: unknown, max: number): string | undefined {
  return text(value, max) || undefined
}

function safeUrl(value: unknown): string | undefined {
  const candidate = text(value, 2_000)
  try {
    const url = new URL(candidate)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}
