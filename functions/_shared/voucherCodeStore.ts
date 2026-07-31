/**
 * Checkout codes — the thing a shopper pastes into a promo-code box.
 *
 * Ranked the way Honey ranks them, because there is no honest alternative:
 * by whether the code actually worked for the people who tried it. We cannot
 * test a code at a retailer's checkout, so we never claim a code is verified.
 * We show how many shoppers it worked for, how recently, and where it came
 * from, and let that speak.
 */

import { hasTrolleyScoutDatabase, type TrolleyScoutEnv } from './env'

const MAX_LIST = 100
/** Failures with nothing to offset them before a code is retired. */
const FAILURE_RETIRE_THRESHOLD = 3
/** Once this many people have voted, a mostly-failing code is retired. */
const RETIRE_MIN_VOTES = 5
const RETIRE_FAILURE_RATIO = 0.7

export interface VoucherCode {
  benefitText: string
  code: string
  createdAt: string
  failedCount: number
  id: string
  lastWorkedAt?: string
  minimumSpendText?: string
  retailerId: string
  source: string
  sourceUrl?: string
  termsText?: string
  validTo?: string
  workedCount: number
  /** This shopper's own verdict, when they have given one. */
  yourVote?: 'failed' | 'worked'
}

export interface VoucherCodeDraft {
  benefitText: string
  code: string
  minimumSpendText?: string
  retailerId: string
  source?: string
  sourceUrl?: string
  termsText?: string
  validTo?: string
}

/**
 * A code is a short alphanumeric token. Anything with spaces or punctuation is
 * someone pasting a sentence, and anything long is usually a personal
 * single-use code that will not work for anybody else.
 */
export function normalizeCode(value: string): string | undefined {
  const code = value.trim().toUpperCase().replace(/\s+/g, '')
  return /^[A-Z0-9][A-Z0-9-]{2,24}$/.test(code) ? code : undefined
}

export async function submitVoucherCode(
  env: TrolleyScoutEnv,
  draft: VoucherCodeDraft,
  accountId?: string,
): Promise<{ issues?: string[]; voucherCode?: VoucherCode }> {
  if (!hasTrolleyScoutDatabase(env)) {
    return { issues: ['Voucher codes are unavailable right now.'] }
  }

  const code = normalizeCode(draft.code)
  if (!code) {
    return { issues: ['Enter the code exactly as the shop shows it.'] }
  }

  const retailerId = draft.retailerId.trim().toLowerCase()
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(retailerId)) {
    return { issues: ['Choose the shop this code is for.'] }
  }

  const benefitText = draft.benefitText.trim().slice(0, 160)
  if (benefitText.length < 3) {
    return { issues: ['Say what the code gives you, like "10% off".'] }
  }

  const id = crypto.randomUUID()
  await env.DB.prepare(
    `INSERT INTO voucher_codes (
      id, retailer_id, code, benefit_text, terms_text, minimum_spend_text,
      valid_to, source, source_url, submitted_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (retailer_id, code) DO UPDATE SET
      benefit_text = excluded.benefit_text,
      terms_text = COALESCE(excluded.terms_text, voucher_codes.terms_text),
      minimum_spend_text =
        COALESCE(excluded.minimum_spend_text, voucher_codes.minimum_spend_text),
      valid_to = COALESCE(excluded.valid_to, voucher_codes.valid_to),
      -- Re-submitting a retired code gives it another chance: somebody has
      -- just seen it work.
      status = 'active',
      updated_at = CURRENT_TIMESTAMP`,
  )
    .bind(
      id,
      retailerId,
      code,
      benefitText,
      draft.termsText?.trim().slice(0, 400) || null,
      draft.minimumSpendText?.trim().slice(0, 80) || null,
      isoDate(draft.validTo),
      draft.source?.trim().slice(0, 40) || 'member',
      draft.sourceUrl?.trim().slice(0, 500) || null,
      accountId ?? null,
    )
    .run()

  const stored = await readVoucherCode(env, retailerId, code, accountId)
  return stored ? { voucherCode: stored } : { issues: ['Could not save that code.'] }
}

export async function listVoucherCodes(
  env: TrolleyScoutEnv,
  options: { accountId?: string; limit?: number; retailerId?: string } = {},
): Promise<VoucherCode[]> {
  if (!hasTrolleyScoutDatabase(env)) return []

  const limit = Math.min(MAX_LIST, Math.max(1, options.limit ?? 60))
  const today = new Date().toISOString().slice(0, 10)
  const filters = ["status = 'active'", '(valid_to IS NULL OR substr(valid_to, 1, 10) >= ?)']
  const bindings: unknown[] = [today]

  if (options.retailerId && options.retailerId !== 'all') {
    filters.push('retailer_id = ?')
    bindings.push(options.retailerId)
  }

  const rows = await env.DB.prepare(
    `SELECT * FROM voucher_codes
      WHERE ${filters.join(' AND ')}
      ORDER BY
        -- What worked most recently, for the most people, first. A brand new
        -- code with no votes still gets a place near the top so it can be
        -- tried at all, rather than being buried forever by older ones.
        (worked_count - failed_count) DESC,
        last_worked_at DESC,
        created_at DESC
      LIMIT ${limit}`,
  )
    .bind(...bindings)
    .all<VoucherCodeRow>()

  const votes = await readVotes(env, options.accountId, rows.results.map((row) => row.id))
  return rows.results.map((row) => rowToVoucherCode(row, votes.get(row.id)))
}

/**
 * Records whether a code worked. This is the whole ranking signal, so a
 * shopper gets one verdict per code and may change it.
 */
export async function voteVoucherCode(
  env: TrolleyScoutEnv,
  voucherCodeId: string,
  accountId: string,
  worked: boolean,
): Promise<{ issues?: string[]; voucherCode?: VoucherCode }> {
  if (!hasTrolleyScoutDatabase(env)) {
    return { issues: ['Voucher codes are unavailable right now.'] }
  }

  const existing = await env.DB.prepare(
    'SELECT worked FROM voucher_code_votes WHERE voucher_code_id = ? AND account_id = ?',
  )
    .bind(voucherCodeId, accountId)
    .first<{ worked: number }>()

  if (existing && (existing.worked === 1) === worked) {
    const unchanged = await readVoucherCodeById(env, voucherCodeId, accountId)
    return unchanged ? { voucherCode: unchanged } : { issues: ['That code is gone.'] }
  }

  await env.DB.prepare(
    `INSERT INTO voucher_code_votes (voucher_code_id, account_id, worked)
      VALUES (?, ?, ?)
      ON CONFLICT (voucher_code_id, account_id) DO UPDATE SET
        worked = excluded.worked,
        updated_at = CURRENT_TIMESTAMP`,
  )
    .bind(voucherCodeId, accountId, worked ? 1 : 0)
    .run()

  // Counts are recomputed from the votes rather than incremented, so changing
  // a verdict can never leave the totals drifting from the truth.
  await env.DB.prepare(
    `UPDATE voucher_codes SET
      worked_count = (SELECT COUNT(*) FROM voucher_code_votes
        WHERE voucher_code_id = voucher_codes.id AND worked = 1),
      failed_count = (SELECT COUNT(*) FROM voucher_code_votes
        WHERE voucher_code_id = voucher_codes.id AND worked = 0),
      last_worked_at = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE last_worked_at END,
      updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
  )
    .bind(worked ? 1 : 0, voucherCodeId)
    .run()

  await retireIfSpent(env, voucherCodeId)

  const updated = await readVoucherCodeById(env, voucherCodeId, accountId)
  return updated ? { voucherCode: updated } : { issues: ['That code is gone.'] }
}

/**
 * Retires a code the shoppers have given up on: a few failures with nothing
 * to show, or a clear majority saying it does not work.
 */
async function retireIfSpent(env: TrolleyScoutEnv, voucherCodeId: string): Promise<void> {
  if (!env.DB) return

  await env.DB.prepare(
    `UPDATE voucher_codes SET status = 'retired', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      AND status = 'active'
      AND (
        (worked_count = 0 AND failed_count >= ?)
        OR (
          worked_count + failed_count >= ?
          AND CAST(failed_count AS REAL) / (worked_count + failed_count) >= ?
        )
      )`,
  )
    .bind(voucherCodeId, FAILURE_RETIRE_THRESHOLD, RETIRE_MIN_VOTES, RETIRE_FAILURE_RATIO)
    .run()
}

async function readVoucherCode(
  env: TrolleyScoutEnv,
  retailerId: string,
  code: string,
  accountId?: string,
): Promise<VoucherCode | undefined> {
  if (!env.DB) return undefined
  const row = await env.DB.prepare(
    'SELECT * FROM voucher_codes WHERE retailer_id = ? AND code = ?',
  )
    .bind(retailerId, code)
    .first<VoucherCodeRow>()
  if (!row) return undefined
  const votes = await readVotes(env, accountId, [row.id])
  return rowToVoucherCode(row, votes.get(row.id))
}

async function readVoucherCodeById(
  env: TrolleyScoutEnv,
  id: string,
  accountId?: string,
): Promise<VoucherCode | undefined> {
  if (!env.DB) return undefined
  const row = await env.DB.prepare('SELECT * FROM voucher_codes WHERE id = ?')
    .bind(id)
    .first<VoucherCodeRow>()
  if (!row) return undefined
  const votes = await readVotes(env, accountId, [row.id])
  return rowToVoucherCode(row, votes.get(row.id))
}

async function readVotes(
  env: TrolleyScoutEnv,
  accountId: string | undefined,
  ids: readonly string[],
): Promise<Map<string, boolean>> {
  const votes = new Map<string, boolean>()
  if (!env.DB || !accountId || ids.length === 0) return votes

  try {
    const rows = await env.DB.prepare(
      `SELECT voucher_code_id, worked FROM voucher_code_votes
        WHERE account_id = ? AND voucher_code_id IN (${ids.map(() => '?').join(',')})`,
    )
      .bind(accountId, ...ids)
      .all<{ voucher_code_id: string; worked: number }>()
    for (const row of rows.results) votes.set(row.voucher_code_id, row.worked === 1)
  } catch {
    // A missing vote simply means no verdict is shown.
  }
  return votes
}

interface VoucherCodeRow {
  benefit_text: string
  code: string
  created_at: string
  failed_count: number
  id: string
  last_worked_at: string | null
  minimum_spend_text: string | null
  retailer_id: string
  source: string
  source_url: string | null
  terms_text: string | null
  valid_to: string | null
  worked_count: number
}

function rowToVoucherCode(row: VoucherCodeRow, vote?: boolean): VoucherCode {
  return {
    benefitText: row.benefit_text,
    code: row.code,
    createdAt: row.created_at,
    failedCount: Number(row.failed_count),
    id: row.id,
    retailerId: row.retailer_id,
    source: row.source,
    workedCount: Number(row.worked_count),
    ...(row.last_worked_at ? { lastWorkedAt: row.last_worked_at } : {}),
    ...(row.minimum_spend_text ? { minimumSpendText: row.minimum_spend_text } : {}),
    ...(row.source_url ? { sourceUrl: row.source_url } : {}),
    ...(row.terms_text ? { termsText: row.terms_text } : {}),
    ...(row.valid_to ? { validTo: row.valid_to } : {}),
    ...(vote === undefined ? {} : { yourVote: vote ? 'worked' : 'failed' }),
  }
}

function isoDate(value?: string): string | null {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null
}
